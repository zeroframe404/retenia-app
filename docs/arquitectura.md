# Arquitectura de Retenia

Versión 1 (Fase 01, 13/10/2026). Este documento fija cómo se arma Retenia por dentro para que las fases siguientes solo construyan. Las versiones exactas están en `docs/versiones.md`; el modelo de datos, en `docs/modelo-de-datos.md`; cómo se comprueba cada criterio, en `docs/plan-de-pruebas.md`. Los nombres de pantalla son los de `docs/especificacion/pantallas.md`.

Cuatro principios mandan sobre todo lo demás:

1. **Tecnología aburrida.** Electron, TypeScript, React, SQLite. Cada pieza existe hace años, tiene una sola forma de usarse y se prueba sola.
2. **Capas con una sola dirección.** La ventana solo habla con el puente; las reglas puras no conocen ni pantalla ni base; solo una carpeta toca SQLite. Lo vigila una herramienta, no la buena voluntad.
3. **La ventana no tiene poder.** Sin Node, aislada, con cada mensaje validado. Un error en la pantalla no puede tocar el disco ni la clave.
4. **El contenido es dato.** Lo que hay en un PDF, una página web, una fórmula, una respuesta de la IA o un comprimido se muestra o se guarda; nunca se ejecuta ni cambia un estado por su cuenta.

## 1. Procesos

Retenia corre como cinco procesos del sistema operativo, más uno lógico (el supervisor) que vive dentro del principal.

| Proceso | Qué es | Qué hace | Qué no hace |
|---|---|---|---|
| **Principal** (`src/main`) | El proceso de Electron que arranca primero. Node completo. | Ciclo de vida, ventana única (`requestSingleInstanceLock`, CA-014), registro de los canales del puente, base de datos (abre `retenia.db` y corre las migraciones), reglas de negocio llamando a `core`, compuerta de IA, actualizaciones, avisos de Windows, bandeja del sistema, copias, reloj, supervisor de procesos de trabajo. | Trabajo pesado (lo delega), render de pantalla. |
| **Puente** (`src/preload`) | El script de precarga de la ventana. Corre aislado, con acceso a `ipcRenderer` y nada más. | Expone `window.retenia`, una API tipada construida desde el contrato (sección 3), y un canal de eventos. Valida cada respuesta antes de entregarla a la ventana. | Lógica de negocio; acceso a disco; conocer la base. |
| **Ventana** (`src/renderer`) | Chromium con React. Sin Node, con `sandbox` y `contextIsolation`. | Pantallas, teclado, foco, estados vacíos y de error, editor de apuntes (TipTap), visor de PDF (pdf.js render), reproducción de audio y grabación con el micrófono. Solo llama a `window.retenia`. | Importar nada de `main`, `data`, `core`, `ai`, `ingest`; `fetch` a internet; ejecutar contenido. |
| **Trabajo de materiales** (`materials-worker`, `src/main/workers/materials.ts`) | Un `utilityProcess` de Electron (Node, sin ventana). | Extraer texto de PDF (pdf.js, compilación `legacy`), Word (mammoth), páginas web (readability + jsdom + DOMPurify), reconocimiento de escaneos (tesseract.js), detección de secciones, importaciones (Anki, RemNote, exportación propia) y exportación completa. Abre su propia conexión a la base solo para leer y escribe resultados por mensajes al principal, que es el único que escribe. | IA, voz, acceso a la clave. |
| **Trabajo de voz** (`voice-worker`, `src/main/workers/voice.ts`) | Un `utilityProcess` que carga sherpa-onnx una sola vez. | Decir en voz alta (Kokoro), transcribir (Whisper int8 con el detector de voz Silero para cortar en segmentos de menos de 30 segundos), «Grabarme y comparar». Recibe texto o audio PCM por `ArrayBuffer` y devuelve audio WAV o texto. | Tocar la base; red. |
| **Supervisor** (dentro del principal, `src/main/supervisor.ts`) | Código, no proceso. | Lanza y vigila los dos procesos de trabajo: cola de tareas con tiempo límite por tipo (voz 60 s; texto de una página de PDF 30 s; reconocimiento de una página 120 s; importación 10 min; exportación 10 min), reinicio del proceso al vencer el límite o al morir (`exit` inesperado), reintento una sola vez, y después la tarea queda «Requiere revisión» (CA-359). Emite `worker.restarted` a la ventana. | Decidir nada de negocio. |

Comunicación: la ventana y el principal hablan por `ipcRenderer.invoke` / `ipcMain.handle` a través del puente; el principal y los procesos de trabajo, por `MessagePort` con mensajes validados con los mismos esquemas Zod. Los binarios grandes (PDF para renderizar, imágenes, audio) no viajan por el puente: la ventana los pide por los esquemas de protocolo `retenia-original://` y `retenia-image://`, que sirven archivos de la carpeta de datos previa validación de ruta; el audio generado viaja como `ArrayBuffer` transferido.

Arranque (para cumplir «arranque en menos de 3 segundos»): el principal abre la base, corre migraciones, carga las proyecciones necesarias para Estudiar y abre la ventana; los procesos de trabajo se lanzan recién cuando hace falta la primera tarea (el de voz, al tocar algo de voz; el de materiales, al agregar o procesar un material) y se apagan tras 5 minutos sin tareas.

## 2. Carpetas y regla de capas

```
src/
  main/        proceso principal: arranque, ventana, canales, supervisor, workers/
  preload/     puente; preload/contract/ es el contrato compartido (esquemas Zod y tipos)
  renderer/    la ventana: pantallas, componentes, estilos, editor, visor
  core/        reglas puras: memoria (ts-fsrs), carga, dominio, planificador, regreso, medidas, texto
  data/        SQLite: esquema Drizzle, migraciones, repositorios, proyecciones, búsqueda, copias
  ai/          compuerta de IA: SDK, prompts y rúbricas versionadas, costo, verificadores
  ingest/      transformaciones de materiales: PDF, Word, web, escaneos, Anki, RemNote, exportación
tests/         pruebas por capa (ver docs/plan-de-pruebas.md)
tools/         scripts en Node: verificar, tablero, preparar (baja Opengrep con su huella), datos
docs/          documentación
datos-de-ejemplo/  el elenco y los archivos de prueba; entra solo en la variante de prueba
```

Reglas de capas, cada una convertida en una regla de dependency-cruiser que pone la red en rojo con la palabra «capas» en el mensaje (CA-006):

| Regla | Quién | Puede importar de | Nunca de |
|---|---|---|---|
| R1 | `renderer` | `renderer`, `preload/contract` | `main`, `data`, `core`, `ai`, `ingest`, `electron`, `node:*`, `better-sqlite3`, `drizzle-orm`, `@anthropic-ai/sdk`, `sherpa-onnx-node`, `pdfjs-dist` (solo la parte de render, que se importa desde `renderer/visor` con una excepción explícita) |
| R2 | `preload` | `preload` | todo lo demás salvo `electron` (`contextBridge`, `ipcRenderer`) y `zod` |
| R3 | `core` | `core` | cualquier otra carpeta de `src`, `electron`, `node:*` y todo paquete con acceso a disco o red (lista explícita: `better-sqlite3`, `drizzle-orm`, `@anthropic-ai/sdk`, `sherpa-onnx-node`, `pdfjs-dist`, `tesseract.js`, `mammoth`, `jsdom`, `yauzl`, `yazl`). Puede importar `ts-fsrs` y `zod`. |
| R4 | `data` | `data`, `core`, `preload/contract` | `renderer`, `main`, `ai`, `ingest` |
| R5 | `ai` | `ai`, `core`, `preload/contract` | `renderer`, `data` (recibe lo que necesita por parámetros), `main` |
| R6 | `ingest` | `ingest`, `core`, `preload/contract` | `renderer`, `main`, `data`, `ai` |
| R7 | `main` | todo salvo `renderer` | `renderer` |
| R8 | solo `data` | — | nadie fuera de `data` importa `better-sqlite3` ni `drizzle-orm` |
| R9 | solo `ai` | — | nadie fuera de `ai` importa `@anthropic-ai/sdk` |
| R10 | solo `main/workers` e `ingest` | — | nadie más importa `sherpa-onnx-node`, `tesseract.js`, `mammoth`, `jsdom`, `@mozilla/readability`, `dompurify`, `yauzl`, `yazl` |
| R11 | demostración | solo `main/demo` y `renderer/demo` importan `datos-de-ejemplo` | el resto del código nunca |
| R12 | sin ciclos | — | ningún ciclo de importaciones en `src` |

Además: knip falla si hay archivos, exportaciones o dependencias sin uso; Biome formatea y revisa; `tsc --noEmit` con TypeScript 7 en modo estricto. Las cuatro herramientas corren en `verificar` y en el gancho de commit (lefthook) sobre los archivos tocados.

## 3. Contrato del puente

El contrato vive en `src/preload/contract/` como un mapa de canales: por cada canal, un esquema Zod de petición y uno de respuesta, agrupados por archivo (`subjects.ts`, `study.ts`, …) y un índice. El puente construye `window.retenia` recorriendo ese mapa (no hay lista escrita a mano) y valida cada respuesta; el principal registra un manejador por canal y valida cada petición antes de tocar nada. Un mensaje que no cumple el esquema se rechaza con un error neutro y se registra sin su contenido. Los eventos del principal a la ventana van por un solo canal `events`, con un esquema discriminado por `type`. Los nombres son `grupo.accion` en inglés; los textos que viajan son los de `pantallas.md`.

Convenciones de los esquemas: identificadores como UUID v7 en texto; fechas como `YYYY-MM-DD` del día de estudio y instantes en ISO 8601 UTC; minutos y segundos como enteros; textos con tope de largo; nunca rutas absolutas desde la ventana (la ventana pide por identificador y el principal resuelve rutas). Abajo, el contrato resumido; el detalle de cada campo se escribe en la fase que construye el canal, en el mismo archivo del contrato, con su prueba de contrato (capa C).

### `app` y `settings`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `app.info` | — | `{ version, buildDate, variant: 'real' \| 'prueba', dataDir }` | H-03, H-73 |
| `app.connectivity` | — | `{ online }` | H-28, H-41 |
| `app.openExternal` | `{ url }` (solo `https`) | `{}` | H-69 |
| `settings.get` | — | `{ theme, defaultMinutes, activeSubjectId, commitmentDays, reminders, privateMode, aiSettings… }` | H-08, H-51, H-53 |
| `settings.set` | parcial de lo anterior | ajustes completos | H-08, H-51, H-53 |

### `subjects`, `topics`, `notes`, `blocks`, `inbox`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `subjects.list` | — | lista con estado (activa, mantenimiento, pausa, archivada) y contadores | H-09 |
| `subjects.create` / `subjects.rename` / `subjects.setActive` / `subjects.pause` / `subjects.resume` / `subjects.archive` | `{ subjectId?, name? }` | materia | H-09, H-51 |
| `topics.list` / `topics.create` / `topics.rename` | `{ subjectId, topicId?, name }` | tema con `aliases` («Otros nombres») | H-09, H-10 |
| `notes.list` | `{ subjectId, topicId? \| 'none' \| 'archived' }` | lista | H-09, H-10 |
| `notes.create` / `notes.rename` / `notes.move` / `notes.archive` / `notes.unarchive` | `{ noteId?, title?, topicId? }` | nota | H-09, H-10 |
| `notes.get` | `{ noteId }` | nota con sus renglones (árbol) y versiones vigentes | H-10 |
| `notes.suggest` | `{ query }` (lo escrito tras «[[») | hasta 8 notas | H-10 |
| `notes.mentions` | `{ noteId }` | renglones que la enlazan, con nota de origen | H-10 |
| `blocks.save` | `{ noteId, changes: [{ blockId, parentId, position, content, textPlain, cardMarks }] }` | versiones creadas, tarjetas creadas o afectadas | H-10, H-12 |
| `blocks.delete` | `{ blockId, cardDecision?: 'keep' \| 'delete' }` | `{ needsDecision }` o resultado | H-12 |
| `images.store` | `ArrayBuffer` + `{ mime }` | `{ imageId, hash }` | H-10 |
| `inbox.add` / `inbox.list` / `inbox.moveTo` | `{ text?, source?, itemId?, topicId? }` | elementos y contador | H-11, H-26 |

### `cards`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `cards.list` | `{ subjectId, topicId?, filters }` | tarjetas con próximo repaso, marcas (`IA`, «Ejercicio»), estado; contador | H-14 |
| `cards.get` / `cards.history` | `{ cardId }` | ficha vigente, camino («Materia › Tema › Nota»), historial con renglones «Anulado» | H-04, H-12, H-13 |
| `cards.create` | `{ subjectId, topicId?, question, answer }` | tarjeta | H-02 |
| `cards.saveSheet` | `{ cardId, sheet, meaningChanged?: boolean }` | `{ needsMeaningAnswer }` o versión nueva | H-13 |
| `cards.createInverse` / `cards.pause` / `cards.resume` / `cards.markDefective` | `{ cardId }` | tarjeta | H-13, H-14, H-18 |
| `cards.activationEstimate` / `cards.activate` | `{ cardIds }` | `{ minutesMin, minutesMax, weeks }` / tarjetas | H-20, H-44 |
| `cards.whyToday` | `{ cardId }` | `{ daysSince, lastGrade, recallProbability, text }` | H-15 |

Cómo quedó en la Fase 04 (sin materias ni temas todavía): `cards.list` (`{}` → tarjetas con `nextReviewDay`), `cards.create` (`{ question, answer }`), `cards.review` (`{ cardId, grade, attemptId }`: la ventana genera `attemptId` al abrir el repaso y un pedido repetido queda una sola vez), `cards.edit` (`{ cardId, question, answer }`; la Fase 08 trae `cards.saveSheet` con la ficha completa), `cards.delete` (`{ cardId }` → `{ trashEntryId }`) y `cards.history` (`{ cardId }` → `{ question, entries: [{ id, day, result }] }`, con `result` `good` · `hard` · `again` · `adopted`).

### `study`, `goals`, `plan`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `study.proposal` | `{ minutes? }` | propuesta (texto, minutos, repasos, nuevas, «Por qué:»), alternativas (máx. 2 a la vista), aviso de atraso, requisito previo, meta, compromiso, pantalla de regreso si corresponde, «Tu semana» si corresponde, sesión para continuar | H-19 a H-22, H-35, H-48 a H-52, H-67 |
| `study.alternatives` | — | hasta 3, sin cambiar la propuesta | H-22 |
| `study.start` / `study.continue` | `{ minutes?, alternativeId? }` | sesión con sus actividades y posición | H-16 |
| `study.reveal` / `study.grade` / `study.undo` / `study.skip` / `study.pause` | `{ sessionId, activityId, grade? }` | estado de la sesión | H-16, H-18 |
| `study.answer` | `{ sessionId, activityId, answer, unitsCovered?, helpLevel }` | resultado (veredicto, qué revisar, acción siguiente, provisional?) | H-31, H-45 |
| `study.saveDraft` | `{ sessionId, activityId, text }` | `{}` | H-16 |
| `study.hint` | `{ sessionId, activityId }` | pista del nivel siguiente y aviso previo a la solución | H-32, H-47 |
| `study.disagree` | `{ attemptId, reason }` | corrección aplicada o provisional | H-33, H-46 |
| `study.confidence` | `{ attemptId, level }` | `{}` | H-55 |
| `study.finish` / `study.rate` | `{ sessionId, rating? }` | cierre (minutos, resultados, dificultades, próximo paso) | H-17 |
| `study.postpone` | `{ when: 'later' \| 'tomorrow' \| date }` | `{}` | H-22 |
| `study.blocker` | `{ option }` | sugerencia («Solo 5 min») | H-52 |
| `study.declareOutside` | `{ minutes, day }` | `{}` | H-50 |
| `goals.get` / `goals.save` / `goals.why` | `{ what, dueDate?, minutesPerDay, daysPerWeek }` | meta con estado, «N de 10 escenarios», demanda y capacidad, barras, hitos como rangos | H-48 |
| `plan.unavailable` / `plan.difficultWeek` / `plan.commitment` | `{ from, to }` / — / `{ days }` | plan reacomodado | H-49, H-51 |
| `plan.weeklySummary` / `plan.weeklySummary.seen` | — | «Tu semana» (< 150 palabras) | H-49 |

### `search`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `search.query` | `{ text, filters?: { kind?, subject? } }` (acepta `tipo:` y `materia:` dentro del texto) | resultados con tipo, título, fragmento resaltado, destino; «No encontré nada con “…”» y sugerencia si está vacío | H-23, H-24 |

Cómo quedó en la Fase 12: `search.query` (`{ text }`, hasta 300 caracteres; los filtros `tipo:`, `materia:` y `tema:` van dentro del texto) devuelve `{ results, recent }` con hasta 50 resultados (`docId`, `kind`, `group`, `entityId`, `parentId`, materia y tema, `title` y `fragment` en tramos con la coincidencia marcada, `archived`); sin texto devuelve lo abierto hace poco con `recent: true`. `search.opened` (`{ docId }`) anota lo que abriste. `search.rebuild` (`{}` → `{ documents }`) vuelve a armar el índice. La ventana muestra cada tramo como texto, nunca como código. `backups.verifyData` suma las diferencias del índice (`kind: 'search'`, sin tarjeta). La demostración suma `demo.load10k` (`{}` → `{ subjectId, cards }`).

### `materials`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `materials.add` | `{ subjectId, source: file (ruta elegida por el diálogo del principal) \| text \| url }` | material en etapa «Archivo guardado»; o `{ duplicateOf }` para decidir | H-25, H-28 |
| `materials.duplicateDecision` | `{ materialId, decision: 'open' \| 'newVersion' \| 'addAnyway' }` | material | H-25 |
| `materials.list` / `materials.get` / `materials.cancel` | `{ materialId }` | material con etapas, páginas, secciones, cobertura | H-25, H-27 |
| `materials.review` | `{ materialId }` | tres bloques («Listo», «Con problemas», «No extraído») con acciones | H-27 |
| `materials.ocrPage` / `materials.correctText` / `materials.reprocessPage` / `materials.excludePages` | `{ materialId, pageNo, text? }` | página con estado; `{ cardsUsingText }` antes de actualizar | H-27 |
| `materials.addUrl` / `materials.snapshot` | `{ subjectId, address, title? }` / `{ materialId }` | material (queda pendiente sin conexión) / `{ html (saneado), address, savedDay }` | H-28 |
| `materials.resolveProblem` / `materials.updateDerived` / `materials.resolveConflict` / `materials.sourceChange` | `{ materialId, problemId, resolution }` / `{ correctionId, update }` / `{ correctionId, keep }` / `{ cardId }` | la revisión / `{ updated }` / la revisión / `{ changed }` | H-27 |
| `materials.open` | `{ materialId, pageNo?, highlight? }` | `{ url: 'retenia-original://…', pageNo, highlight }` | H-26 |
| `materials.createCard` / `materials.saveExcerpt` | `{ materialId, pageNo, selection }` | tarjeta con cita / elemento de la Bandeja | H-26 |
| `materials.proposeCards` | `{ materialId, sectionId }` | candidatas con objetivo, cita, aviso «Parecida a», defectos; `{ excludedBlocks }` | H-44 |
| `materials.decideCandidate` | `{ candidateId, decision: 'accept' \| 'edit' \| 'discard', edits? }` | tarjeta «Disponible» o nada | H-44 |

Cómo quedó en la Fase 14: `materials.review` devuelve la revisión entera (los tres bloques, los problemas con sus señales y acciones, el mapa de cobertura con su resumen y el estado de cada sección); `materials.ocrPage` y `materials.reprocessPage` ponen la página en la cola otra vez (`{ materialId, unit }`); `materials.excludePages` es `{ materialId, units, excluded }`; `materials.correctText` es `{ materialId, blockId, text }` y devuelve `{ correctionId, cards }` (las tarjetas que usan el texto, para preguntar «¿Actualizarlas?»). Toda salida a internet pasa por una sola puerta (`src/main/net-gate.ts`): «Simular sin conexión» la cierra. Las páginas web las baja el proceso principal y las lee el proceso de materiales, sin red.

Cómo quedó en la Fase 13: `materials.addFiles` (`{ paths, subjectId, title? }`, de 1 a 20 rutas absolutas) vive aparte (`fileChannels`): la ventana no lo tiene, solo el puente de archivos (`window.reteniaArchivos.agregar(files, { subjectId, title })`), que saca cada ruta con `webUtils.getPathForFile` (vacía para un archivo armado por la página, y entonces no se manda nada). Devuelve, por archivo, `{ outcome: 'added', materialId }` o `{ outcome: 'duplicate', pendingId, existing: { materialId, name, day } }`. Los demás: `materials.addText` (`{ subjectId, text, title? }`), `materials.decide` (`{ pendingId, decision: 'open' | 'newVersion' | 'addAnyway' }` → `{ materialId }`), `materials.list` (`{ subjectId }` → resúmenes con estado y etapas), `materials.get` (con unidades y secciones), `materials.cancel`, `materials.resume`, `materials.dismiss`, `materials.page` (`{ materialId, unit }` → bloques con su texto normalizado, sus cajas y las tarjetas que los citan), `materials.open` (`{ materialId, cardId? | blockId? | text?, unit? }` → página, bloque, cajas a resaltar y `notFound`), `materials.createCard` (`{ materialId, selection: { from, to }, question, answer }`; la selección va por bloque y posición, nunca como texto suelto) y `materials.saveExcerpt`. `cards.get` suma `cite` (`{ materialId, reference, quote, status: 'located' | 'pending' | 'relocate' }`) e `inbox.list`, `source` en los extractos. La demostración suma `demo.processing` y `demo.setProcessing` («Procesar despacio»). Avisos: `material.progress`, `material.done` y `material.failed` por el canal `retenia:avisos`, validados en el puente (`window.reteniaAvisos.alRecibir`). El supervisor suma el vigilante de memoria y el corte de la tarea en curso; los reintentos (3 intentos en total, no uno) y el latido son de la cola (`src/main/materials/service.ts`). El proceso de materiales corre en las dos variantes, sin red (`src/main/workers/net-guard.ts`), y no abre la base: devuelve resultados que el principal valida y guarda.

### `objectives`, `progress`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `objectives.list` / `objectives.create` / `objectives.activities` / `objectives.link` | `{ subjectId? }` / `{ objectiveId, subjectId, topicId, text, conditions, kind, cardIds }` / `{ subjectId, topicId? }` / `{ linkId, objectiveId \| null, cardIds }` | los objetivos por tema (el implícito «Recordar: tema» primero) con estado y marca «(por verificar)»; las actividades con su objetivo de ahora (Fase 17) | H-34 |
| `objectives.panel` | `{ objectiveId }` (UUID, `topic:<tema>` o `subject:<materia>`) | columnas «Sin ayuda», «Con ayuda», «Diferido», «Variantes» con conteo y fecha, qué falta, la estimación con su respaldo, actividades, requisitos (Fase 17) | H-34 |
| `objectives.requirements.add` / `.confirm` / `.dismiss` | `{ requirementId, objectiveId, requiresId, kind, status }` / `{ requirementId }` | requisitos (Fase 17); `study.overview` suma `proposal.requirement` («Antes conviene» o «Quizá te ayude repasar») | H-35 |
| `objectives.knowAlready` / `objectives.postpone` / `objectives.resume` | `{ objectiveId }` | «Suficiente (por verificar)» con la comprobación desde el día siguiente; «No quiero esto ahora» y «Retomar» (Fase 17) | H-34 |
| `progress.overview` | — | tres bloques con rótulos «Observado», «Estimado», «Datos insuficientes» y cantidades | H-54 |
| `progress.probe30.start` / `.answer` / `.finish` | `{ cardId, answer }` | resultado «8 de 11 sin ayuda a 30 días (cerca de 73 %) · Evidencia baja», rango de Wilson | H-54 |
| `progress.errors` / `progress.errors.setType` / `progress.createContrastCard` | `{ subjectId? }` / `{ attemptId, type }` / `{ errorIds }` | «Mis errores» por tema y el tipo elegido (Fase 17) / tarjeta de contraste (Fase 18) | H-36, H-38, H-65 |
| `progress.doubts.list` / `.add` / `.resolve` | `{ text, context }` / `{ doubtId, resolution }` | dudas y notas provisionales | H-17, H-46 |
| `progress.improveCard.list` / `.split` | — / `{ splitId, cardId, parts }` | lista «Mejorar la tarjeta» y «Dividir en dos» (Fase 17); «Reformular» y «Agregar una pista» son `cards.edit` con `improve` | H-36 |
| `progress.masteryMap` / `progress.milestones` / `progress.confidence` | — | escalones por tema con evidencia y fecha; hitos con fecha; «Cuando decís “Seguro”, acertás 7 de 10» | H-55, H-56 |

### `ai`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `ai.status` | — | `{ provider ('none' · 'anthropic' · 'simulated'), keySaved, secureStorage, localOnly, capCents, spentMicros, capState ('ok' · 'warning' · 'reached'), percentUsed, functions: [{ id, state }] }`; nunca la clave | H-40 |
| `ai.testConnection` | `{ key? }` (la clave pegada viaja una sola vez, del campo al principal; sin clave se prueba la guardada) | `{ result ('ok' · 'no_key' · 'invalid_key' · 'offline' · 'local_only' · 'model_unavailable' · 'insecure' · 'technical'), retiresOn, status }`; si da `ok`, la clave queda cifrada | H-40 |
| `ai.deleteKey` / `ai.setCap` / `ai.setLocalOnly` / `ai.setFunctionState` | `{}` / `{ capCents }` / `{ on }` / `{ functionId, suspended }` | `status` | H-40, H-41 |
| `ai.sentLog` | `{}` | renglones de «Qué se envió»: `{ id, day, purpose, materialTitle, fragmentCount, costMicros, status }`, sin el pasaje ni la respuesta | H-40 |
| `ai.permissions` / `ai.revokePermission` | `{}` / `{ materialId }` | materiales con permiso guardado: `{ materialId, title, scope ('always' · 'never') }` | H-40 |
| `ai.explain` | `{ materialId, selection, permission? ('once' · 'always' · 'never') }` (el pasaje lo vuelve a leer el principal de la base, no de la pantalla, y solo después de mirar la función suspendida, el «Modo solo local» y que haya IA) | `blocked` (con motivo, lo gastado y el tope) · `needs_permission` · `pending` · `done` (las dos partes, con la ubicación de cada cita, y el costo) · `failed` (formato, error técnico, clave, saldo, rechazo o cancelado, con su motivo: a mano, modo solo local, función suspendida, sin permiso, sin IA u otra IA) | H-40, H-41 |
| `ai.outcome` / `ai.cancel` | `{ requestId }` | el mismo resultado | H-41 |
| `ai.tutor` | `{ sessionId, activityId, action: 'hint' \| 'example' \| 'explain' \| 'solution' \| 'question', text? }` | respuesta con bloques «Según tu material» (citas numeradas) y «Aporte del modelo, no verificado» | H-47 |
| `ai.tutor.disputeQuote` | `{ turnId, quoteId }` | «Me equivoqué» con qué afirmó y qué corresponde; deshace lo registrado | H-47 |
| `ai.confirmCorrection` | `{ evaluationId, agree }` | acuerdo actualizado | H-46 |
| `ai.evalPrompts.estimate` / `ai.evalPrompts.run` | — | costo estimado / informe «N de 60» | H-43 |

Eventos de la Fase 19 (`events`): `ai.pending` y `ai.result` con el `requestId`, para que el panel y el aviso «Llegó la explicación que estaba pendiente.» se enteren sin preguntar. Los canales de abajo (tutor, corrección, prompts) llegan con sus fases.

La evaluación con IA no tiene canal propio: `study.answer` decide, según ajustes y conexión, si evalúa con reglas, con la IA o queda «Pendiente».

### `voice`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `voice.status` | — | `{ modelsReady, downloading, micPermission }` | H-07 |
| `voice.downloadModels` | — | progreso por `events`; «Modelos listos» | H-07 |
| `voice.voices` | — | lista de voces en inglés | H-64 |
| `voice.speak` | `{ text, voiceId, speed }` | `ArrayBuffer` WAV | H-07, H-59, H-61, H-64 |
| `voice.transcribe` | `ArrayBuffer` PCM 16 kHz + `{ language: 'en' }` | `{ text, segments, inaudible }` | H-07, H-61, H-64, H-66 |

### `backups`, `exports`, `imports`, `trash`, `activity`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `backups.list` / `backups.createNow` / `backups.restore` | `{ backupId? }` | copias con fecha, tamaño, «Verificada»; «Última copia comprobada» | H-05, H-72 |
| `backups.verifyData` | — | «Todo en orden · 0 diferencias» o la lista de diferencias | H-04 |
| `exports.all` | — (el principal abre el diálogo de destino) | `{ file, counts }` | H-30 |
| `imports.preview` / `imports.run` / `imports.saveRejected` | `{ file (del diálogo), subjectId }` | vista previa con conteos y rechazadas; resultado | H-29, H-30 |
| `trash.list` / `trash.restore` / `trash.empty` | `{ entryId? }` | entradas con vencimiento | H-06 |
| `activity.recent` / `activity.undo` | `{ versionId }` | lista de cambios; estado anterior restaurado | H-06 |

Cómo quedó en la Fase 15 (importar y exportar; el archivo siempre lo elige el diálogo de Windows del principal, la ventana nunca manda una ruta):

| Canal | Petición | Respuesta |
|---|---|---|
| `imports.choose` | `{ kind ('anki' · 'remnote'), folder? }` | `cancelled`, `problem` (`notAnki` · `notRemnote` · `tooNew` · `damaged` · `unsafe`) o `preview`: `previewId`, conteos (tarjetas y notas nuevas y que ya estaban, repasos, sin historial, rechazadas), rechazadas con motivo, anotadas y si el archivo ya se importó |
| `imports.run` | `{ previewId, destination: { kind: 'subject', subjectId } · { kind: 'new', name } }` | `{ importId, subjectId, subjectName, counts, backupId }` (antes, la copia «Antes de importar») |
| `imports.cancel` / `imports.list` / `imports.saveRejected` | `{ previewId }` / `{}` / `{ importId }` | `{ ok }` / `{ imports }` / `{ saved }` (el principal abre el diálogo de guardar) |
| `exports.all` | `{}` | `cancelled` o `{ fileName, counts }` |
| `exports.canLoad` / `exports.choose` / `exports.load` | `{}` / `{}` / `{ previewId }` | `{ empty }` / `cancelled`, `problem` (`notEmpty` · `notExport` · `damaged` · `tooNew` · `unsafe`) o `{ previewId, counts, exportedAt }` / `{ counts }` |

`imports.run` y `exports.load` son exclusivos en la compuerta y frenan la cola de materiales mientras corren. Los archivos ajenos los lee un proceso aislado propio (`src/main/workers/transfers.ts`: sin red, con tope de memoria y de tiempo), que también escribe el comprimido de «Exportar todo».

Cómo quedó en la Fase 04:

| Canal | Petición | Respuesta |
|---|---|---|
| `backups.list` | `{}` | `{ backups }`: por copia, `id`, `kind` (`auto` · `manual` · `before_restore`), `day`, `time` y `sizeBytes`; un archivo que no se pudo abrir viene como `{ readable: false, sizeBytes }` y no se ofrece para restaurar |
| `backups.createNow` | `{}` | `{ created, backups }` |
| `backups.restore` | `{ backupId }` (el `id` del manifiesto, nunca una ruta) | `{ restoredFrom: { day, time }, backups }` |
| `backups.verifyData` / `backups.repairData` | `{}` | `{ differences }`: por diferencia, `cardId`, `question`, `kind` (`due` · `memory` · `missing` · `extra`), `storedDay`, `expectedDay` |
| `backups.openFolder` | `{}` | `{}` (el principal abre `copias\` con `shell.openPath`) |
| `trash.list` / `trash.restore` / `trash.empty` | `{}` / `{ entryId }` / `{}` | `{ items }` con `deletedDay` y `expiresDay` / `{ restored }` / `{ purged }` |
| `activity.recent` / `activity.undo` | `{}` / `{ operationId }` (una operación, no una versión) | tus últimas 50 operaciones con `canUndo` / `{ undone }` |

Una compuerta en el principal (`src/main/gate.ts`, `gateHandlers`) deja correr juntos los pedidos comunes y hace esperar todo lo demás mientras corre `backups.restore`; el nombre del canal exclusivo sale del tipo del contrato, así que un nombre mal escrito no compila. Los manejadores piden a la carpeta de trabajo (`src/data/workspace.ts`) el almacén vigente en cada pedido, así siguen andando después de que restaurar cambia la base. `backups.list` espera a que termine la copia automática del arranque; `trash.list` no necesita esperar la purga de la Papelera, porque nunca muestra lo vencido.

### `reminders`, `updates`, `diagnostics`, `help`

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `reminders.settings` / `reminders.log` / `reminders.why` | `{ enabled?, time?, privateMode? }` / `{ reminderId }` | ajustes; registro («No se envió: ya estudiaste hoy»); regla que lo disparó | H-53 |
| `updates.check` / `updates.download` / `updates.install` | — | «Estás al día» o «Hay una versión nueva» con cambios; progreso; reinicio tras copia «Antes de actualizar» | H-73 |
| `diagnostics.save` | `{ context }` | `{ file }` sin apuntes, respuestas ni clave | H-72 |
| `help.topics` / `help.search` / `help.get` | `{ query? \| topicId }` | 25 temas o más como tareas | H-74 |

### `languages` (curso de inglés)

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `languages.panel` | — | secciones con «Todavía no disponible» donde corresponda | H-57 |
| `languages.dictionary.lookup` | `{ word }` | nivel estimado, posición por frecuencia, pronunciación, significado, ejemplo, audio | H-57 |
| `languages.placement.start` / `.answer` / `.finish` / `.accept` / `.skip` | `{ itemId, answer }` | 60 palabras (20 inventadas), ítems de gramática que se detienen tras 3 fallos, resultado con «Estimación», aviso de poca confiabilidad | H-58 |
| `languages.vocab.add` / `.learn` / `.knowAlready` / `.counts` | `{ wordId, context? }` | tarjetas «Entender» y «Usar»; 5 palabras de un tema; «Palabras que entendés: 600 · Palabras que usás: 120» | H-59 |
| `languages.read.library` / `.open` / `.wordInfo` / `.finish` / `.addText` / `.questions` / `.timed` | `{ textId, word?, text? }` | textos por nivel con fuente y licencia; marcas por palabra y «94 % de palabras conocidas»; etiqueta «Cómodo», «Adecuado», «Exigente»; 3 preguntas; palabras por minuto | H-60, H-67 |
| `languages.listen.open` / `.dictation` / `.questions` / `.addAudio` | `{ audioId, speed, text? }` | transcripción oculta, «Repetir frase», dictado o preguntas, «[inaudible]» | H-61 |
| `languages.grammar.next` / `.lesson` / `.answer` / `.flag` | `{ pointId, exerciseId, answer, reason? }` | siguiente punto con motivo; lección (explicación, 3 ejemplos, ejercicios); corrección con regla; «Tiene un error» | H-62, H-63 |
| `languages.pronounce.contrast` / `.record` / `.compare` | `{ contrastId, audio? }` | ítems con al menos 4 voces; «ship / sheep: 14 de 20»; «Entendí: “sheep”» | H-64 |
| `languages.write.prompt` / `.submit` / `.selfCheck` | `{ text }` | consigna con largo; corrección por nivel en tres ejes; lista de control sin IA | H-65 |
| `languages.converse.situations` / `.start` / `.turn` / `.end` | `{ situationId, text \| audio }` | objetivo de la situación; respuesta con voz y texto; cierre con 2 o 3 errores priorizados; «Practicar con un diálogo guiado» sin IA | H-66 |
| `languages.level.overview` / `.descriptors` / `.projection` / `.threads` | — | «desempeño compatible con A2 · estimación, 12 evidencias · 15/03/2027»; tablero «Puedo…»; «A este ritmo, desde donde estás: …»; hebras de la semana | H-61, H-66, H-67 |
| `languages.simulacro.start` / `.submit` | `{ level }` | partes del simulacro y resultado con rúbrica de 4 criterios | H-67 |

### `demo` (solo en «Retenia (prueba)»)

| Canal | Petición | Respuesta | Historias |
|---|---|---|---|
| `demo.state` | — | `{ today: '2027-03-15', offlineSimulated, aiSimulated }` | H-03, H-07 |
| `demo.advanceDays` / `demo.resetDate` | `{ days: 1 \| 7 \| 35 }` | estado | H-04, H-50 |
| `demo.offline` / `demo.simulatedAi` | `{ on }` | estado | H-28, H-40 |
| `demo.ai` / `demo.setAi` (Fase 19) | `{}` / `{ simulated?, bad?, slow? }` | `{ simulated, bad, slow }`: «IA simulada», «IA simulada: responder mal» y «IA simulada: tardar 12 segundos» | H-40, H-41 |
| `demo.load10k` | — | progreso | H-24, H-71 |
| `demo.lab.speak` / `demo.lab.record` / `demo.lab.readPdf` / `demo.lab.ocrPage` / `demo.lab.notify` | según la prueba | resultado del Laboratorio | H-07 |
| `demo.perf.marks` | — | marcas de tiempo para la capa de medición | H-71 |

Cómo quedó en la Fase 04: `demo.state`, `demo.advanceDays` (`{ days: 1 | 7 | 35 }`) y `demo.resetDate` (`{}`) devuelven los tres exactamente `{ today }`; los demás llegan con sus fases.

### `events` (del principal a la ventana)

`material.progress`, `material.done`, `material.failed`, `ai.pending`, `ai.result`, `ai.capReached`, `connectivity.changed`, `voice.downloadProgress`, `voice.ready`, `backup.done`, `backup.checked`, `update.available`, `update.downloaded`, `reminder.fired`, `worker.restarted`, `session.changed`, `data.changed` (qué entidad cambió, para refrescar listas). Cada uno con su esquema; la ventana ignora, registrando, cualquier evento que no valide.

## 4. Modelo de seguridad de Electron

| Capa | Qué se fija | Cómo se comprueba |
|---|---|---|
| Ventana | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `allowRunningInsecureContent: false`, `enableRemoteModule` inexistente; `devTools: false` en la versión real; un solo `BrowserWindow`. | Prueba E lee `webPreferences` por el puente de prueba y una prueba N sobre la versión real intenta abrir las herramientas (CA-336, CA-340). |
| Contenido | CSP por cabecera de respuesta en todos los documentos: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` (TipTap y KaTeX inyectan estilos en línea); `img-src 'self' retenia-image: data:` (`data:` solo para íconos propios); `media-src retenia-original: blob:`; `connect-src 'none'`; `frame-src 'self'`; `object-src 'none'`. Sin CDN, sin fuentes externas (KaTeX trae las suyas). | Prueba S lee la CSP; prueba E verifica que una imagen externa no carga. |
| Navegación | `will-navigate` y `setWindowOpenHandler` bloquean todo; los enlaces externos pasan por `app.openExternal`, que acepta solo `https:` y abre el navegador del sistema (CA-336). `permissionRequestHandler` acepta solo `media` (micrófono) para el origen propio; todo lo demás se niega. | Pruebas C y E. |
| Protocolos propios | `retenia-image://<hash>` y `retenia-original://<materialId>/<page?>` registrados con `protocol.handle` y `registerSchemesAsPrivileged` (`standard`, `secure`, `supportFetchAPI`, `stream`). El manejador resuelve el identificador a una ruta dentro de `imagenes/` u `originales/`, comprueba que la ruta real empiece por la carpeta de datos y sirve el archivo con su tipo; nunca acepta rutas. | Prueba C con rutas trampa («../», absolutas, con `%2e%2e`). |
| Puente | Un solo objeto `window.retenia` con funciones generadas desde el contrato; nada de `ipcRenderer` expuesto; cada petición y respuesta validada con Zod; los canales `demo.*` no existen en la versión real. | Pruebas C sobre cada canal con cargas inválidas; prueba N en la versión real. |
| Fuses | Las dos variantes: `runAsNode` apagado, `enableNodeOptionsEnvironmentVariable` apagado, `enableEmbeddedAsarIntegrityValidation` encendido, `onlyLoadAppFromAsar` encendido, `enableCookieEncryption` encendido. Solo la versión real: `enableNodeCliInspectArguments` apagado (la de prueba lo necesita encendido para Playwright). Los fija electron-builder (`electronFuses`) al empaquetar. | Prueba del CI lee los fuses del ejecutable con `@electron/fuses` y compara con la tabla. |
| Materiales | pdf.js 6 (sin `eval`, API que nunca ejecuta JavaScript embebido) en el proceso de trabajo; render solo en la ventana. Páginas web: readability extrae el texto principal, DOMPurify sanea, se guarda solo HTML seguro con la dirección y la fecha, y se muestra en un `iframe` con `sandbox` sin permisos y CSP sin scripts (CA-120). Comprimidos: yauzl, con rechazo de nombres con `..`, absolutos o con barras invertidas, tope de 2.000 entradas y de 2 GB descomprimidos, extracción solo dentro de una carpeta temporal de la carpeta de datos. Fórmulas: KaTeX con `trust: false`, `throwOnError: false`, `maxExpand: 1000`, `maxSize: 500`. Nombres de archivo: se normalizan (NFC) y se reemplazan los caracteres inválidos de Windows; el nombre guardado es la huella, el nombre original es un dato. Tamaño: un material de más de 1 GB se rechaza con «Este archivo es demasiado grande» sin leerlo entero; el espacio en disco se comprueba antes de copiar (CA-356). | Los cinco archivos trampa del elenco en pruebas I y E (CA-337). |
| Clave de IA | `safeStorage.encryptString` al guardarla; el cifrado queda en `clave.bin`, fuera de copias, exportaciones, registros y diagnósticos; se descifra en memoria solo para armar la cabecera del pedido; el campo de la pantalla se vacía al guardar; `isEncryptionAvailable()` falso → «No pude guardar la clave de forma segura en esta PC» y la IA queda apagada. Plan B: `@napi-rs/keyring`. | Prueba I busca la clave en claro en toda la carpeta de datos, copias, exportaciones y registros (CA-168, CA-338). |
| Registros | `registros/retenia.log`, rotado (5 archivos de 1 MB), sin texto de apuntes, respuestas, fragmentos ni clave: los mensajes llevan identificadores y códigos. | Prueba S sobre el catálogo de mensajes de registro. |
| Dependencias | Versiones exactas y lockfile; `npm audit` en `verificar:todo` falla con vulnerabilidades altas o críticas sin tratar; secretlint en el gancho de commit y en `verificar`; Opengrep con reglas propias (sin `eval`, sin `nodeIntegration`, sin `shell: true`, sin rutas armadas con texto del usuario) en `verificar`. | CA-004, CA-339. |
| Procesos de trabajo | No reciben la clave ni la pueden pedir; abren la base en modo solo lectura; escriben solo dentro de carpetas temporales de la carpeta de datos; el supervisor los mata al vencer el tiempo límite. | Pruebas I y C. |

## 5. Carpeta de datos del usuario

Vive en la carpeta de datos de aplicaciones de la cuenta de Windows (`%APPDATA%`, es decir `C:\Users\<usuario>\AppData\Roaming\`), una por variante y sin nada compartido entre ellas (CA-012, CA-365):

```
%APPDATA%\Retenia\                   (la versión de prueba usa %APPDATA%\Retenia (prueba)\)
  retenia.db, retenia.db-wal, retenia.db-shm   base principal (SQLite, WAL, synchronous = FULL)
  ajustes.json                        lo mínimo que hace falta antes de abrir la base: tema, tamaño y posición de la ventana, variante;
                                      desde la Fase 19, lo de la IA que no es un dato tuyo (tope, «Modo solo local»,
                                      funciones suspendidas; en la variante de prueba, los interruptores de la IA simulada)
  clave.bin                           la clave de IA cifrada con safeStorage (nunca en copias ni exportaciones)
  originales\<sha256>.<ext>           los materiales tal como se agregaron; nunca cambian
  imagenes\<sha256>.<ext>             imágenes pegadas en apuntes
  copias\
    AAAA-MM-DD-HHMM[-nombre].retenia-copia     instantánea de la base (VACUUM INTO) comprimida, con manifiesto
    blobs\<sha256>                    originales e imágenes referenciados por alguna copia, guardados una sola vez
  modelos\
    verificados.json                  qué archivos se bajaron y verificaron (tamaño, fecha, huella)
    kokoro\…  whisper\…              (el manifiesto vive en el código: src/main/voice-models)
    .descargas\                       lo que se está bajando; se reanuda desde ahí
  registros\retenia.log, retenia.1.log … retenia.5.log
  diagnosticos\AAAA-MM-DD-HHMM.txt
  tmp\                                trabajo de los procesos (extracciones, importaciones, los idiomas del
                                      reconocimiento de escaneos); se limpia al arrancar
```

Decisiones sobre la carpeta:

- **Una sola base** para todo lo tuyo (`retenia.db`). El contenido del curso de inglés (diccionario, lecciones, textos) no es tuyo: viaja dentro del instalador como `resources/curso-ingles.db`, de solo lectura, y tus marcas sobre él («Revisada», «Tiene un error») sí van a tu base.
- **Copias** (H-05): una copia es una instantánea consistente de la base hecha con `VACUUM INTO` (sin frenar el programa), comprimida, más un manifiesto con las huellas de los originales e imágenes que existían en ese momento. Los archivos binarios no se duplican catorce veces: se guardan una sola vez en `copias\blobs\` y se borran de ahí cuando ninguna copia ni la base los referencia. Automática al abrir si la última tiene más de 24 horas; se conservan 14 automáticas más las de nombre («Antes de importar», «Antes de actualizar», «Antes de restaurar»). «Verificada» significa que la copia se volvió a abrir, pasó `PRAGMA integrity_check` y sus conteos coinciden. Una vez por semana se vuelve a comprobar la última (CA-358).
- **Restaurar** hace primero una copia «Antes de restaurar» del estado actual (CA-020), reemplaza la base con la instantánea y repone los binarios desde `blobs\`.
- **Cómo quedaron las copias en la Fase 04** (todavía no hay originales ni imágenes, así que no hay `blobs\`):
  - Nombre `AAAA-MM-DD-HHMM-<tipo>-<8 caracteres>.retenia-copia`: un gzip con un renglón de manifiesto y la instantánea `VACUUM INTO` (formato en `docs/modelo-de-datos.md`, «Copias»). Sin paquetes nuevos: la compresión y la huella SHA-256 vienen con Node.
  - La lista sale de leer `copias\` y no de la base. Una copia se arma en `tmp\` y en `copias\<nombre>.tmp`, se sincroniza con el disco, se descomprime y se verifica (huella, `integrity_check`, cantidades por tabla) y recién ahí se renombra: toda copia de la lista está verificada. Al listarla se comprueba además que los últimos 4 bytes del gzip (el tamaño de lo comprimido) coinciden con lo que dice su manifiesto: una copia cortada después de hecha aparece como «Una copia que no se puede abrir» y no se ofrece para restaurar. Al arrancar se borran los restos de `tmp\` y los `.retenia-copia.tmp` de `copias\`; lo que Windows tenga tomado queda para la próxima vez y nunca impide abrir, y si `tmp` es un enlace o una unión a otra carpeta se saca el enlace sin entrar.
  - Automática al abrir si ninguna copia es de las últimas 24 horas, es decir, si no hay ninguna o la más nueva tiene **24 horas o más** (no «más de 24»: «+1 día» corre el reloj exactamente 24 horas). Una copia con fecha futura (el reloj volvió atrás con «Restablecer fecha» o una PC que tuvo la hora adelantada) no cuenta. Rotan solo las automáticas: quedan las 14 más nuevas (las de fecha futura cuentan como las más viejas, así la recién hecha nunca es la que se borra); las hechas a mano y las «Antes de restaurar» se quedan. La verificación semanal de CA-358 llega con su fase.
  - Restaurar, sin reiniciar el programa y con la compuerta cerrada: 1) copia «Antes de restaurar» verificada (si falla, no se restaura nada); 2) la elegida se descomprime y se verifica en `tmp\`; 3) se abre aparte, se le corren las migraciones, su secuencia sigue desde el número más alto ya usado y se pasa a `journal_mode = DELETE` para que el archivo sea autosuficiente; 4) se cierra la base viva con un checkpoint completo y se comprueba que no queda un `-wal` con contenido (si queda, se aborta y se reabre la de antes; el `-shm` se borra); 5) un solo renombre reemplaza `retenia.db`, con reintentos si Windows lo tiene tomado; 6) se reabre. Un corte o una falla antes del paso 5 deja todo como estaba y se informa «No pude restaurar esa copia. Tus datos siguen como estaban.»; desde el renombre la restauración está hecha, falle lo que falle después, y si la base no se puede volver a abrir en ese momento, la abre el pedido siguiente. Lo hecho después de la copia elegida queda solo en «Antes de restaurar».
- **Papelera**: nada se borra físicamente antes de 30 días; los binarios que ya nadie referencia se eliminan en el arranque siguiente al vencimiento. Fase 04: el vencimiento corre al arrancar, después de la copia automática; «Vaciar papelera» pide confirmación.
- **La variante de prueba** acepta la variable de entorno `RETENIA_DATOS` para que cada prueba de punta a punta use una carpeta de datos nueva; la versión real la ignora.
- **La clave de la IA (Fase 19)** se cifra con `safeStorage` de Electron (en Windows, con la cuenta del usuario) y se escribe en `clave.bin` de forma atómica; se descifra solo para armar cada pedido y nunca vuelve a la ventana. Las copias son la base y la exportación son tablas: ninguna de las dos la lleva. Si Windows no puede cifrar, no se guarda («No pude guardar la clave de forma segura en esta PC») y la IA queda apagada. Lo de la IA en `ajustes.json` queda fuera de la base para que restaurar una copia no cambie tu tope ni el «Modo solo local».
- **Nunca** se guarda en esta carpeta la clave en claro, texto de apuntes en los registros ni datos de otra cuenta de Windows.

## 6. Modo demostración

«Retenia (prueba)» es una **variante de compilación**, no un interruptor en tiempo de ejecución. electron-vite recibe `RETENIA_VARIANTE=prueba` y define la constante `__VARIANTE__`; electron-builder usa `electron-builder.prueba.yml` (otro `appId`, `productName` «Retenia (prueba)», otro `guid`, otra carpeta de datos, el elenco como `extraResources`). La versión real se compila sin nada de eso.

Qué trae la variante de prueba y dónde vive:

| Función | Dónde | Cómo |
|---|---|---|
| Cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» | `renderer/demo` | En la Fase 02 lee el día de estudio del canal `ping`; desde la Fase 03, de `demo.state`. |
| Fecha fija inyectable | `core/clock` (reloj de demostración, Fase 02) y `main/demo/clock.ts` (días sumados, Fase 04) | `core/clock` es el único lugar que lee la hora del sistema (lo vigila una regla de Biome) y trae el reloj fijo de demostración, lunes 15/03/2027 10:00 de Buenos Aires. El reloj del principal (`Clock`, inyectado en `core` y `data`) devuelve 15/03/2027 más los días sumados con «+1 día», «+7 días», «+35 días»; «Restablecer fecha» vuelve a cero. El desplazamiento se guarda en `ajustes.json` de la variante para que sobreviva al cierre; las pruebas de punta a punta empiezan siempre con una carpeta nueva. Los avisos y las copias automáticas usan el mismo reloj. |
| Elenco | `datos-de-ejemplo/elenco/` (JSON) y `main/demo/seed.ts` | En el primer arranque de la variante, si la base está vacía, se carga el elenco de `elenco.md`: materias, temas, notas, tarjetas con su historial (fechas relativas a la fecha fija), materiales, curso de inglés. «Cargar 10.000 tarjetas» genera tarjetas y repasos con semilla fija. |
| IA simulada | `main/demo/ai.ts` y `src/ai/adapters/recorded.ts` | Ajustes › «Demostración» › «IA simulada», «IA simulada: responder mal» y «IA simulada: tardar 12 segundos» (guardados en `ajustes.json`, como «Procesar despacio»). Contesta con las respuestas grabadas de `datos-de-ejemplo/ia/explicar-fragmento.json`, buscadas por lo que dice el pasaje, y para cualquier otro pasaje con una plantilla que cita su primera oración. Sin clave, sin red y sin costo: no pregunta el permiso, no suma al tope y no figura en «Qué se envió», pero respeta «Simular sin conexión» y el «Modo solo local». Las grabaciones viajan adentro del archivo principal de esta variante (la prueba del paquete real comprueba que no están en la otra). Los 60 casos trampa (Fase 20) usan el mismo adaptador. |
| Servidor de la IA en la PC | `main/demo/ai.ts` (`RETENIA_IA_ORIGEN`) | Solo para la punta a punta y las capturas: la variante de prueba le manda los pedidos «de tu clave» a un servidor de la propia prueba en `http://127.0.0.1:<puerto>` que contesta como la API (`tests/apoyo/servidor-ia.ts`). Otra dirección se ignora; la versión real no lo tiene. |
| Simular sin conexión | `main/demo/connectivity.ts` | El servicio de conectividad del principal (el único que decide si hay red) se fuerza a «sin conexión»; todo lo que depende de red queda «Pendiente» y se reanuda al apagar la simulación. |
| Galería | `renderer/demo/gallery` | Muestra los 18 componentes con sus variantes, el armazón y los seis estados de pantalla, con datos de ejemplo. |
| Laboratorio | `renderer/demo/laboratorio` y `main/demo/lab.ts` | Botones de CA-024 a CA-030; usan los mismos procesos de trabajo y avisos que la versión real. |
| Marcas de rendimiento | `main/demo/perf.ts` | `demo.perf.marks` devuelve `performance.mark` del arranque, siguiente tarjeta, abrir Estudiar y buscar. |
| Carpeta de datos por variable de entorno | `main/demo/paths.ts` | `RETENIA_DATOS`. |

Cómo se garantiza que nada de esto existe en la versión real:

1. Todo el código de demostración está en `src/main/demo/` y `src/renderer/demo/` y se importa en un solo lugar de cada lado, detrás de `if (__VARIANTE__ === 'prueba')`; el empaquetador elimina la rama muerta y knip confirma que no queda referencia.
2. Los canales `demo.*` se registran dentro de esa misma rama: en la versión real no existen y una llamada da el error neutro de canal desconocido.
3. El elenco y las respuestas grabadas viven en `datos-de-ejemplo/`, fuera de `src`, y entran solo en la variante de prueba: el elenco como `extraResources` de su configuración y las respuestas grabadas de la IA adentro de su archivo principal, importadas desde `main/demo/ai.ts` (Fase 19). La regla R11 impide que otro código los importe.
4. Una prueba del CI abre el paquete real (`app.asar` y `resources/`) y busca «15/03/2027», «DEMOSTRACIÓN», «demo.», nombres del elenco («Inferencia — capítulos 1 a 4», «A weekend in Bariloche») y los archivos de `datos-de-ejemplo/`: ninguno puede aparecer (CA-013).
5. Una prueba N sobre la versión real instalada confirma que no hay herramientas de desarrollo ni modo demostración (CA-340), y que su carpeta de datos es distinta de la de la variante de prueba (CA-365).

## 7. Instalador y actualizaciones

| Tema | Decisión |
|---|---|
| Empaquetado | electron-builder 26.17.0, destino NSIS, un ejecutable por variante. `npmRebuild: false` (todos los módulos nativos son Node-API con binarios dentro del paquete). `asarUnpack` para `better-sqlite3`, `sherpa-onnx-node`, `sherpa-onnx-win-x64`, `tesseract.js-core` y `pdfjs-dist/legacy`. `electronFuses` según la sección 4. Instalador comprimido con LZMA. Tope de tamaño: 150 MB, medido en el CI. |
| Identidad | Real: `appId` `io.github.zeroframe404.retenia`, `productName` «Retenia», ejecutable `Retenia.exe`, `guid` fijo. Prueba: `appId` `io.github.zeroframe404.retenia-prueba`, `productName` «Retenia (prueba)», ejecutable `Retenia (prueba).exe`, otro `guid` fijo. Los `guid` se generan una vez en la Fase 03 y quedan en las configuraciones; cambiar el `appId` después rompería las actualizaciones silenciosas. |
| Instalador | Asistido (`oneClick: false`), por usuario (`perMachine: false`, sin permisos de administrador), carpeta de instalación fija por variante, acceso en el menú Inicio con `AppUserModelId` (necesario para los avisos). Primera instalación desde el navegador: Windows muestra el aviso de editor desconocido porque no hay firma de código (fuera de alcance). |
| Desinstalación | Script NSIS propio (`build/instalador.nsh`) con la macro `customUnInstall`: en una desinstalación a mano pregunta «¿Conservar tus datos?»; si decís que sí, la carpeta de datos queda y al reinstalar está todo (CA-364). En una desinstalación silenciosa (la que hace una actualización) nunca borra nada. |
| Actualizaciones | electron-updater 6.8.10 con proveedor GitHub apuntando al repositorio público `retenia-releases` (`owner: zeroframe404`, `repo: retenia-releases`); el código sigue privado. Sin credenciales en el programa. `autoDownload: false`; sin instalar al salir por su cuenta. «Buscar actualizaciones» lee `latest.yml`, muestra «Estás al día» o «Hay una versión nueva» con «Qué cambió» (CA-362); al aceptar, descarga (diferencial por `blockmap` cuando se puede), electron-updater comprueba la huella sha512 contra `latest.yml` y, si no coincide, borra el archivo y Retenia dice «La actualización no coincide con la publicada; no se instaló» (CA-363); antes de instalar se hace la copia «Antes de actualizar» (CA-361); al reiniciar, las migraciones corren y «Verificar datos» da 0 diferencias. La variante de prueba apunta a otro canal del mismo repositorio (`latest-prueba.yml`). |
| Publicación | Un trabajo del CI, a pedido (etiqueta de versión), construye las dos variantes, calcula las huellas, y publica instalador, `blockmap` y `latest.yml` en `retenia-releases`. El token de publicación vive solo en los secretos del CI. Los modelos de voz y de reconocimiento se publican en el mismo repositorio como releases aparte (`modelos-AAAA-MM`), reempaquetados con su licencia, y el manifiesto con sus huellas vive en este repositorio. |
| Aviso de Windows en actualizaciones | Las actualizaciones las baja Retenia (Node), no el navegador, así que no llevan la marca de origen de internet y no deberían disparar el aviso de editor desconocido. Se comprueba a mano en la Fase 40. |

## 8. Avisos de Windows y bandeja del sistema

- Los recordatorios (H-53) usan `Notification` de Electron con `toastXml` propio: título «Tu sesión de las 19:00», cuerpo «Repasos de Estadística básica, unos 25 min.», botones «Empezar» y «Posponer» (acciones de tipo `button`), o solo «Retenia · Tu sesión está lista.» en modo privado. `Notification.handleActivation` recibe el toque aunque Retenia estuviera cerrado y lo traduce a `study.start` o a un aplazamiento único de 30 minutos. Requiere `app.setAppUserModelId` con el mismo identificador que pone el instalador en el acceso del menú Inicio.
- Para que un aviso de las 19:00 salga con la ventana cerrada, Retenia puede quedar en la bandeja del sistema (opcional, apagado por defecto; se activa junto con los recordatorios). El programador de avisos vive en el principal, usa el reloj inyectado y el registro `reminder_log` (una fila por decisión: enviado, no enviado y por qué, pospuesto, tocado), y respeta la ventana de silencio de 22:00 a 08:00, la vigencia de 90 minutos y el máximo de uno por día.
- «Probar aviso» del Laboratorio usa exactamente el mismo camino (CA-030).

## 9. Compuerta de IA

Un solo módulo, `src/ai`, habla con el SDK de Anthropic. Nadie más lo importa (regla R9). Cómo quedó en la Fase 19:

- **Quién escribe qué.** Ningún modelo escribe datos de aprendizaje. La compuerta (`src/ai/gate.ts`) recibe un puerto con operaciones solo sobre sus tablas (`src/core/ai/ports.ts`, que implementa `src/data/ai.ts`): «Qué se envió» (solo se agrega, con disparadores), las trazas técnicas (90 días), lo guardado de cada respuesta, la cola y los permisos que decidís vos. Una prueba estática controla que `src/main/ai` use solo `src/data/ai.ts`, que `src/data/ai.ts` escriba solo tablas `ai_*` y que ningún canal `ai.*` toque tarjetas, repasos ni dominio.
- **Niveles de consecuencia** (`src/core/ai/levels.ts`): exploración (explicar, conversar: se muestra marcado y nunca se guarda como dato de aprendizaje), práctica (tarjetas y ejercicios, Fases 21 y 22: «Propuesta» hasta que vos o una regla fija la aceptan) y dominio (lo que mueve repasos o estados, Fase 22: «Propuesta» que se acepta solo con tu confirmación o con una verificación independiente). En la Fase 19 la única función, «Explicar un fragmento», es de exploración.
- **El camino de un pedido**, en este orden (`src/core/ai/gate-rules.ts`): función suspendida → «Modo solo local» (se corta antes de armar nada) → sin IA conectada → pasaje demasiado largo (unas 600 palabras) → tope (lo gastado más lo máximo que puede costar esta consulta) → lo ya guardado → permiso del material (solo con tu clave) → cola y envío → validación entera con Zod → verificadores → registro, guardado y resultado.
- **Modelo y pedido.** «Explicar un fragmento» usa Opus 5.5 (tu decisión del 26/11/2026), con esfuerzo bajo, `max_tokens` 2000 y `output_config.format` de tipo `json_schema` generado desde el mismo esquema Zod que valida la respuesta, sin los límites que la API no acepta (`src/ai/schema-api.ts`); los topes los controla Zod en la PC. El SDK se arma con la dirección y la clave explícitas (no lee variables de entorno), con el `fetch` de la puerta única de red, sin reintentos propios y con 90 s de espera. Sin respaldo a otro modelo. El prompt de sistema es fijo y versionado (`src/ai/prompts/`, con su huella en `versiones.json`) y prohíbe obedecer al material; el pasaje viaja como dato entre `<fragmento material="…">` y `</fragmento>` (si el texto trae algo con forma de esa marca, se neutraliza). Las claves de corrección nunca salen del texto recuperado. Sin `cache_control` por ahora: el prompt de sistema es más corto que el mínimo que la API guarda; se suma cuando un prompt lo justifique.
- **Salida con esquema.** Si la respuesta no cumple el esquema (texto que no es JSON, un campo de más o de menos, un tipo cambiado, cortada por largo o vacía), se descarta entera, no se guarda nada salvo el renglón de lo enviado y la pantalla dice «No pude completar esto. Reintentá.» (CA-173).
- **Verificadores** (`src/core/ai/citations.ts` y `numbers.ts`). Cada cita de «Según tu material» tiene que estar letra por letra en el pasaje enviado (con NFC y los espacios juntados, al menos 3 palabras) y se ubica en el texto (inicio y fin); cada número de su explicación tiene que estar en el pasaje. Lo que falla pasa a «Aporte del modelo, no verificado» y nunca se muestra como cita (CA-177). Todo resultado lleva la marca «Respuesta de la IA: las citas se comprobaron letra por letra en tu material.» (CA-174).
- **Costo y tope.** El costo se calcula en la PC, en millonésimas de dólar, con los campos `usage` de cada respuesta y la tabla `src/ai/precios.json` (versión y fecha: 26/11/2026). Alimenta «Qué se envió», el contador «Este mes: USD 10,00 de 10» (mes de Buenos Aires) y el tope: aviso desde el 80 % y freno antes de una consulta que lo podría pasar, así que nunca se pasa (CA-169).
  - Lo máximo de una consulta es una unidad por byte de lo que se manda (pedido, prompt y esquema), más 1.000 de las marcas, y toda la salida permitida. Ninguna unidad de texto ocupa menos de un byte.
  - Un pedido que salió y no tuvo respuesta (corte, tiempo vencido, cierre de Retenia en el medio) queda como «sin respuesta» con lo máximo que pudo costar.
  - Tope por defecto: USD 10.
  - Lo que ya preguntaste sale de lo guardado, sin costo. La huella es la función, el proveedor (y su variante), el modelo, la versión del prompt y la de la rúbrica, el material y el pasaje.
  - Restaurar una copia no vuelve atrás «Qué se envió» ni el gasto: la base restaurada recibe los envíos que le faltan.
- **Conexión y errores.**
  - Sin conexión (la puerta de la PC no deja salir nada), el pedido queda «Pendiente: se reanuda cuando haya conexión» en una cola persistente. Sale solo al volver la conexión, al abrir el programa o cada 30 s (CA-176), y nunca frena el estudio.
  - Un error técnico (servidor, ocupado, tiempo, una conexión que se corta con la puerta abierta) se reintenta solo hasta 3 veces y se dice como error técnico. Sin conexión no cuenta como intento.
  - Lo que espera en la cola guarda con qué IA y con qué permiso se pidió (`ai_queue.provider`, `allowed_by`). Antes de salir se vuelve a mirar: modo solo local, función suspendida, sin IA, otra IA o un permiso quitado lo cancelan con su motivo.
  - Lo mismo pedido mientras va en camino espera al primero.
  - «Probar conexión» usa la API de modelos (no gasta) y avisa si el modelo se retira pronto.
- **Modos y permisos.** «Modo solo local» cierra la puerta única de red (`src/main/net-gate.ts`): no sale nada de la PC, ni la IA, ni las páginas web («Pendiente: el modo solo local está activado»), ni las descargas de los modelos de voz, y lo pendiente de la IA se cancela (CA-170). La primera vez que un material va a la IA con tu clave se pregunta «¿Permitir enviar fragmentos de este material a la IA?» con «Solo esta vez» (no se recuerda), «Siempre para este material» y «No» (CA-172); la IA simulada no pregunta. «Solo mis materiales» (CA-209) llega con el tutor.
- **Casos trampa.** 60 casos con respuestas grabadas (`tests/ia-casos/`, Fase 20) correrán en cada `verificar` contra la compuerta con el adaptador simulado; «Evaluar prompts con la IA real» corre los mismos casos con tu clave, mostrando antes el costo estimado (CA-184). En la Fase 19 la trampa es `trampa.md` del elenco (CA-175).

## 10. Voz

- El `voice-worker` carga una vez por proceso, recién cuando hace falta, el modelo de voz (Kokoro 82M int8 v1.0) y el de transcripción (Whisper small int8, multilingüe, con el idioma fijado en inglés), desde `modelos\`; el detector de voz (Silero VAD) llega con CA-288. Si falta algo, la ventana muestra «Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.» (CA-024). sherpa-onnx abre sus archivos con rutas de 8 bits: el proceso le pasa rutas relativas a la carpeta de modelos, así anda aunque la cuenta de Windows tenga tilde (Fase 05).
- Decir en voz alta: texto → WAV 24 kHz; la ventana lo reproduce con `<audio>`. Las voces disponibles son las inglesas del modelo; «Pronunciar» rota al menos 4 (CA-305).
- Transcribir: la ventana graba con `MediaRecorder`, decodifica a PCM mono 16 kHz y lo envía por `ArrayBuffer`; el proceso corta en frases con el detector de voz (Whisper acepta hasta 30 s por pasada), transcribe cada frase y devuelve texto con segmentos; lo que el detector no reconoce como voz queda «[inaudible]» (CA-288). Micrófono bloqueado en Windows: `getUserMedia` falla con permiso denegado y la pantalla dice «Sin acceso al micrófono no podemos escucharte» con «Cómo habilitarlo» (CA-027, CA-308).
- Toda llamada a sherpa-onnx lleva `enableExternalBuffer: false` (obligatorio en Electron). Los dos paquetes de sherpa-onnx quedan fuera del asar.
- Descarga única (Fase 05): baja de los repositorios oficiales de sherpa-onnx en Hugging Face, cada archivo fijado por su revisión, lo que falta según el manifiesto del código (`src/main/voice-models/manifest.ts`); calcula la huella SHA-256 mientras llega y solo si coincide lo mueve a `modelos\`; reanuda una descarga cortada; muestra progreso y termina con «Modelos listos» (CA-024). Hoy la usa el Laboratorio; Ajustes › «Voz» llega en la Fase 28. Los datos de reconocimiento de escaneos ya no se bajan: viajan en el instalador (decisión de la Fase 05).

## 11. Rendimiento

| Tope | Cómo se cumple |
|---|---|
| Arranque < 3 s | Abrir la base y las proyecciones de Estudiar antes de la ventana; nada de procesos de trabajo ni de red en el arranque; sin `require` de pdf.js, tesseract ni sherpa en el principal (viven en los procesos de trabajo). |
| Siguiente tarjeta < 0,1 s | La sesión completa se arma al empezar y vive en memoria en el principal; mostrar la siguiente no toca la base; calificar escribe una observación y actualiza la proyección en la misma transacción, en menos de 10 ms con WAL. |
| Abrir Estudiar < 0,5 s | La propuesta se calcula al arrancar y se recalcula al cambiar datos (`data.changed`), nunca al abrir la pantalla. |
| Buscar < 0,2 s | FTS5 con trigram sobre `search_documents`, consulta con límite 50 y `highlight()`; probado con 10.000 tarjetas en la capa I y en E. |
| PDF de 300 páginas sin trabar | Todo el procesamiento en el `materials-worker`, por páginas, con progreso por eventos. |
| 10.000 tarjetas, 200.000 repasos | Índices en `docs/modelo-de-datos.md`; listas virtualizadas en la ventana. |

## 12. Lo que se descartó y por qué

Tauri (la especificación ya lo descartó: la punta a punta en Windows y el ecosistema npm pesan más); Electron Forge (no tiene creador oficial de NSIS); Vite 8 hoy (electron-vite 5 no lo acepta); `keytar` (archivado) y `@napi-rs/keyring` como primera opción (safeStorage viene con Electron); `electron-log` (un registro propio de 60 líneas se prueba entero y no registra contenido); una biblioteca de fechas (`Intl` alcanza y Buenos Aires no cambia de horario); un enrutador y un gestor de estado para la ventana (seis pantallas y un panel: estado local más eventos del principal); Tailwind (CSS modules con variables de diseño); `fflate` y `adm-zip` (sin validación de nombres o todo en memoria); FSRS-7 (beta); hospedar actualizaciones en un servidor propio (GitHub alcanza y no cuesta).
