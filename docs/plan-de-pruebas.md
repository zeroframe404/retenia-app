# Plan de pruebas

Versión 1 (Fase 01, 13/10/2026). Cómo se comprueba cada uno de los 379 criterios de `docs/especificacion/historias.md`, con qué herramienta, en cuánto tiempo y con qué dobles. Las reglas de la red son las del `CLAUDE.md`: prueba primero en las reglas de negocio, prohibido debilitar, base real en integración, pruebas deterministas, punta a punta como usuario, bug → prueba roja → arreglo, 100 % de los criterios con prueba, `verificar` en menos de 2 minutos y `verificar:todo` en menos de 15.

## 1. Las capas de la red

| Código | Capa | Qué prueba | Herramienta | Dónde vive | Corre en |
|---|---|---|---|---|---|
| **U** | Unitaria | Reglas puras de `src/core`: memoria, carga, dominio, planificador, regreso, medidas, texto, idiomas. Sin base, sin pantalla, con reloj y azar inyectados. | Vitest 5 | `tests/unitarias/` | `verificar` |
| **P** | Propiedades | Las mismas reglas con cientos de casos generados con semilla: invariantes (un fallo nunca lleva a «Sin iniciar»; el recálculo da lo mismo en cualquier orden; la suma de hebras da los minutos de la sesión). | fast-check 4 | `tests/propiedades/` | `verificar` |
| **I** | Integración con base real | `src/data`, `src/ingest` y `src/ai` contra una base SQLite real en un archivo temporal con las migraciones reales, archivos reales del elenco, el modelo de voz real con audio fijo y la compuerta de IA con respuestas grabadas. | Vitest 5 + better-sqlite3 | `tests/integracion/` | `verificar` |
| **C** | Contrato del puente | Cada canal de `src/preload/contract`: esquema de petición y de respuesta, manejador real del principal sin ventana, rechazo de cargas inválidas, rutas trampa en los protocolos propios, envolturas de avisos de Windows. | Vitest 5 | `tests/contrato/` | `verificar` |
| **R** | Componentes de la ventana | Pantallas y componentes de React por rol y texto: estados vacíos, formato de resultados, teclado dentro de un componente, render de fórmulas, textos sin «undefined». | Testing Library + jsdom | `tests/componentes/` | `verificar` |
| **E** | Punta a punta | Retenia (prueba) entero, sin instalar (carpeta `win-unpacked`), con el elenco, la fecha fija, la IA simulada y «Simular sin conexión»; selectores por rol y texto visible, exactamente los de `pantallas.md`. | Playwright 1.64 (`_electron`) | `tests/e2e/` | `verificar:todo` |
| **N** | Programa instalado | El instalador que construye el CI: instalación, menú Inicio, carpetas de datos separadas, segunda instancia, versión real sin herramientas ni demostración, actualización, desinstalación con datos conservados. | WebdriverIO 9.32 + @wdio/electron-service 10.4 | `tests/instalado/` | CI (trabajo «instalador» en cada pull request) |
| **S** | Estática y de infraestructura | Lo que se comprueba sin correr el programa: capas (dependency-cruiser), código sin uso (knip), formato y lint (Biome), tipos (tsc), secretos (secretlint), reglas de seguridad (Opengrep), vulnerabilidades (`npm audit`), catálogo de textos (palabras prohibidas, tuteo, tres líneas de cada resultado), migraciones solo aditivas, contenido del curso (conteos y licencias), formato de la salida de `verificar`, cobertura de criterios y tablero, sabotajes de la red, Stryker, tiempos de la red. | Node (`tools/`) + las herramientas nombradas | `tests/estaticas/`, `tools/` | `verificar` (lo rápido), `verificar:todo` (`npm audit`, sabotajes), `verificar:mutaciones` (Stryker) |
| **D** | Medición de rendimiento | Arranque, siguiente tarjeta, abrir Estudiar, buscar, con 10.000 tarjetas; marcas `performance.mark` leídas por `demo.perf.marks`. | Playwright + Node | `tests/rendimiento/` | `verificar:todo` |
| **M** | Manual | Lo que ninguna capa automática ve: una notificación de Windows en la pantalla, el Narrador, escuchar una voz, una cuenta de Windows nueva, el aviso de editor desconocido, la caza de bugs con personajes. Siempre acompañada de una capa automática que cubre lo demás del criterio. | Vos, con `docs/pruebas-manuales/fase-NN.md` y `docs/especificacion/humo.md` | `docs/pruebas-manuales/` | al cerrar cada fase |

Toda prueba automática de un criterio empieza su título con el identificador entre corchetes (`[CA-002] día de estudio: 16/03/2027 02:30 en Buenos Aires cuenta para lunes 15/03/2027`), en castellano. `tools/trace.mjs` (y la capa de trazabilidad de `tools/verify.mjs`) cruza los títulos con los criterios: un criterio de una fase cerrada sin prueba pone la red en rojo, los de la fase en curso se exigen en `verificar:todo`, y un identificador mal puesto o inexistente también es rojo. El tablero (`npm run tablero`) lo muestra por historia.

## 2. Qué queda afuera y por qué

| Afuera | Por qué | Qué lo reemplaza |
|---|---|---|
| Capturas de píxeles comparadas | Cambian con la máquina, la fuente y el zoom; cada falso rojo tienta a «actualizar la referencia», que el `CLAUDE.md` prohíbe sin aprobación. | Instantáneas de accesibilidad (árbol de roles y textos) y comprobaciones de layout (sin desplazamiento horizontal, sin texto cortado). |
| Llamadas reales a la IA dentro de la red | Cuestan dinero y no son deterministas. | 60 casos trampa con respuestas grabadas (capa I) y el botón «Evaluar prompts con la IA real» a pedido, con costo estimado antes. |
| Otros sistemas operativos y navegadores | Retenia es Windows 11 con el Chromium de Electron. | Nada. |
| Pruebas de carga con varias personas | Un solo usuario. | Volumen con 10.000 tarjetas y 200.000 repasos (capa D). |
| Fuzzing del lector de PDF más allá de los archivos trampa | Lo hace el proyecto pdf.js; duplicarlo no agrega confianza a Retenia. | Los cinco archivos trampa del elenco y un PDF dañado. |
| Calidad perceptiva de la voz y la transcripción | No hay medida automática honesta sin internet. | Se escucha a mano en la Fase 05; la transcripción se prueba con audio fijo y aserciones tolerantes («contiene good morning»). |
| Pruebas de la caza de bugs como código | Son un proceso de personas y agentes (H-70). | Cada hallazgo confirmado termina en una prueba automática (CA-344). |

## 3. Reloj, azar y datos

- **Reloj.** Un `Clock` (`now()`) de `core/clock`, inyectado en `core` y `data`; el día de estudio lo calcula `core/study-day` a partir de un instante. En producción es el reloj real con la zona `America/Argentina/Buenos_Aires`; en la variante de prueba, 15/03/2027 más los días sumados; en las pruebas U, P, I y C, un reloj congelado que cada prueba fija. El corte del día a las 04:00 se calcula con `Intl.DateTimeFormat`; no hay biblioteca de fechas ni dependencia de la zona de la PC.
- **Azar.** Un generador propio con semilla (`core/random`) inyectado donde hace falta elegir (intercalado, variantes, 1 de cada 5 intentos, palabras de la prueba de ubicación). Las pruebas fijan la semilla; fast-check imprime la suya al fallar y se puede repetir con `--seed`.
- **Datos.** Cada prueba I crea su propia base en un archivo temporal con las migraciones reales y la borra al terminar; cada prueba E arranca Retenia con una carpeta de datos nueva (`RETENIA_DATOS`) y el elenco cargado; nada se comparte entre pruebas. Sin esperas fijas: Playwright espera condiciones, Vitest usa `expect.poll`.
- **Orden.** Las pruebas se pueden correr en cualquier orden y en paralelo (3 trabajadores para E, los hilos disponibles para el resto).

## 4. Dobles permitidos

Solo en las fronteras externas. Cada doble está en esta lista, declarado en el código con el mismo nombre, y toda prueba que lo use lo dice en su título con «(simulado)». Nada más se simula: la base es real, los archivos son reales, el reloj es el inyectado.

| Frontera | Doble | Dónde vive | Qué lo reemplaza en una prueba real |
|---|---|---|---|
| IA | Adaptador con respuestas grabadas, indexadas por propósito y huella del pedido; también sirve respuestas malformadas, lentas (más de 8 s) y fallidas. | `src/ai/adapters/recorded.ts`; grabaciones en `tests/ia-casos/` y `datos-de-ejemplo/ia/` | «Evaluar prompts con la IA real» (CA-184) con tu clave, a pedido. |
| Red | Servidor local que sirve páginas web del elenco (`pagina.html`), `latest.yml` e instaladores de prueba, y un servicio de conectividad que se fuerza a «sin conexión». | `tests/apoyo/servidor-local.ts`; `main/connectivity.ts` con «Simular sin conexión» | Nada en la red; la Fase 40 prueba a mano una actualización real desde `retenia-releases`. |
| Reloj | El `Clock` inyectado. | `core/clock.ts` | Nada: el reloj real solo corre en la versión real. |
| Voz y micrófono | Estado de permiso del micrófono simulado (concedido, bloqueado); audio de entrada desde archivos WAV fijos. El modelo de voz es real en I. | `tests/apoyo/microfono.ts` | Se escucha a mano en la Fase 05 (M). |
| Avisos de Windows | Envoltura de `Notification` que registra qué se habría mostrado y simula el toque. | `main/notifications/adapter.ts` | Se ve a mano (CA-030, CA-238). |
| Disco y sistema de archivos | Escritor que devuelve «disco lleno» o «sin permiso»; base dañada a propósito como archivo de prueba. | `tests/apoyo/disco.ts`, `tests/apoyo/base-danada.db` | Nada. |
| Actualizador | electron-updater apuntado al servidor local. | configuración de prueba | Fase 40 a mano. |
| GitHub (`gh`) | Guion que contesta lo que contestaría `gh` (corridas del CI y descarga del adjunto) y una carpeta temporal en lugar del Escritorio. | `tests/integracion/bajar-instalador.test.ts`, con `RETENIA_GH_SCRIPT` y `RETENIA_ESCRITORIO` | «Bajame el instalador de prueba» real, a mano, con el pull request de la fase. |
| Explorador de Windows (Fase 04) | `openFolder`: anota la carpeta pedida en vez de abrirla, o devuelve un error para probar el caso en que Windows no puede abrirla. Las pruebas que lo llaman lo dicen con «(simulado)»; las demás lo reciben solo para armar el puente y nunca lo llaman. | `tests/apoyo/puente.ts` y `tests/contrato/demostracion.test.ts` | «Abrir carpeta de copias» a mano, en las pruebas manuales de la Fase 04. |

## 5. Presupuesto de tiempo

| Orden | Qué corre | Tope | Estimación al final del plan |
|---|---|---|---|
| `npm run verificar` | S rápidas (Biome, tsc, dependency-cruiser, knip, secretlint, Opengrep, catálogo de textos, migraciones aditivas, cobertura de criterios) en paralelo con U + P + I + C + R | 2 min | 25 s de estáticas, 20 s de U + P, 40 s de I, 10 s de C, 25 s de R, en paralelo: cerca de 1 min 30 s |
| `npm run verificar:todo` | `verificar` + compilar la variante de prueba + E + D + `npm audit` + sabotajes de la red | 15 min | compilar 30 s; E unas 190 pruebas a 2,5 s con 3 trabajadores: 3 min; D 1 min; audit y sabotajes 1 min: cerca de 7 min, con margen para el crecimiento |
| CI, trabajo «instalador» (en cada pull request) | construir los dos instaladores, medir tamaño, leer fuses, pruebas N, escaneo del paquete real (CA-013) | 15 min | 5 min de construcción y 5 de pruebas N |
| `npm run verificar:mutaciones` | Stryker sobre `src/core`, modo incremental | sin tope; al cerrar cada fase y una vez por semana | 10 a 30 min la primera vez; minutos después |

Si una orden supera su tope, se divide o se paraleliza; nunca se saltea ni se afloja una prueba. `verificar` mide cada bloque y el tablero muestra los tiempos.

## 6. Topes de rendimiento y cómo se miden

| Qué | Tope en esta PC | Tope en el CI | Cómo se mide |
|---|---|---|---|
| Arranque | 3 s | 9 s | Desde el lanzamiento del proceso hasta la primera pantalla pintada (`performance.mark('primera-pantalla')` en la ventana, leído por `demo.perf.marks`), con 10.000 tarjetas cargadas. |
| Siguiente tarjeta | 0,1 s | 0,3 s | Entre la calificación y la pregunta siguiente visible, marcas en la ventana; mediana de 50 tarjetas. |
| Abrir Estudiar | 0,5 s | 1,5 s | Entre el clic en el riel y la propuesta visible. |
| Buscar | 0,2 s | 0,6 s | En I: consulta FTS5 con 10.000 tarjetas, mediana de 20 consultas. En E: entre la tecla y los resultados. |
| PDF de 300 páginas | la ventana responde | igual | Mientras se procesa, una sesión completa en E termina sin esperas mayores a 1 s. |

Los topes de esta PC (la de referencia) son los de la especificación. Los del CI son tres veces mayores porque sus máquinas varían; esto se fija hoy y no se afloja después. Los números se guardan por corrida y el tablero muestra la tendencia.

## 7. Para cada criterio, la capa que lo comprueba

Columna «Capa»: la principal, la que cubre lo que el criterio promete. Columna «También»: una segunda capa que lo refuerza o cubre una parte que la principal no ve (`—` si no hace falta). Los códigos son los de la sección 1.

### Fase 02 · Andamiaje y red de pruebas (H-01)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-001 | S | — | Una prueba corre `npm run verificar` en un proceso hijo, mide el tiempo y comprueba el formato de la última línea y que las cifras coincidan con los informes reales. |
| CA-002 | U | P | `studyDay()` con las 02:30 y las 04:00 del 16/03/2027; propiedad: todo instante entre las 04:00 de un día y las 03:59:59 del siguiente cae en ese día. |
| CA-003 | S | — | Sabotaje guionado: cambia el corte a 00:00, corre la red, exige rojo con «día de estudio», revierte, exige verde. |
| CA-004 | S | — | Sabotaje: escribe una clave con formato real en un archivo, intenta el commit; secretlint en el gancho lo bloquea y la red da rojo con «secreto». |
| CA-005 | S | — | Sabotaje: marca una prueba como salteada; la red da rojo con «1 salteada». |
| CA-006 | S | — | Sabotaje: la ventana importa `src/data`; dependency-cruiser da rojo con «capas». |
| CA-007 | S | — | El freno de cierre (gancho de Claude Code en `tools/`) devuelve el resumen cuando la red está en rojo; se prueba con una red en rojo provocada. |
| CA-008 | S | — | `npm run tablero` genera la página; una prueba la abre, encuentra cada historia y criterio, el estado de sus pruebas y ningún nombre de archivo. |

### Fase 03 · Esqueleto caminante instalable (H-02, H-03)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-009 | E | — | Crea «¿Capital de Francia?», cierra y relanza Retenia con la misma carpeta de datos, la tarjeta está. |
| CA-010 | E | U | «Repasar», «Mostrar respuesta», «La sabía» → «Próximo repaso: miércoles 17/03/2027»; U cubre la regla de repaso con ts-fsrs (2 días para «La sabía», 1 para «Con dudas» y «No la sabía»). |
| CA-011 | R | E | El formulario marca «Escribí la pregunta», conserva la respuesta y no llama al puente. |
| CA-012 | N | — | Instala «Retenia (prueba)» del CI, comprueba el acceso del menú Inicio, la cinta y la carpeta `%APPDATA%\Retenia (prueba)`. |
| CA-013 | S | N | Escaneo del paquete real (`app.asar` y `resources`) sin «15/03/2027», «DEMOSTRACIÓN», «demo.», nombres del elenco ni archivos de `datos-de-ejemplo`. |
| CA-014 | N | — | Lanza el ejecutable instalado dos veces: una sola ventana, la existente pasa al frente. |

Cómo quedó en la Fase 03: la capa R usa Testing Library con jsdom contra el puente real y una base real temporal (`tests/componentes`); la E abre `release/prueba/win-unpacked` (el mismo programa que se instala); la N de «Retenia (prueba)» es el humo del instalador (`tests/instalado`), que corre en el CI con Playwright sobre el programa instalado (la variante de prueba mantiene el fuse de inspección encendido); el escaneo de CA-013 lee los dos paquetes ya armados (`tests/paquete`, en `verificar:todo`). WebdriverIO queda para la versión real endurecida (Fase 36).

### Fase 04 · Libro mayor, copias y deshacer (H-04, H-05, H-06)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-015 | I | E | Dos repasos con el reloj en 15/03 y 22/03; «Historial» tiene dos renglones y el primero es idéntico. |
| CA-016 | I | E | `verifyData()` reconstruye las proyecciones y compara: 0 diferencias; E toca el botón y lee «Todo en orden · 0 diferencias». |
| CA-017 | I | — | Un proceso hijo escribe una calificación y se lo mata a mitad de la transacción; al reabrir, el repaso está completo o no está y `verifyData()` da 0. |
| CA-018 | I | U | La misma observación con la misma clave de idempotencia dos veces: una sola fila. |
| CA-019 | I | E | «Hacer copia ahora» crea el archivo con fecha 15/03/2027, tamaño y «Verificada». |
| CA-020 | E | I | Elimina la tarjeta, vacía la Papelera, restaura: la tarjeta vuelve con historial y existe la copia «Antes de restaurar». |
| CA-021 | I | — | Última copia con 25 horas (reloj) → al abrir se crea una; con 15 copias se conservan 14. |
| CA-022 | I | E | Eliminar manda a `trash_entries` con vencimiento a 30 días; «Restaurar» devuelve la tarjeta con historial. |
| CA-023 | I | E | Editar la pregunta crea una versión; «Deshacer» en «Actividad reciente» crea otra igual a la anterior. |

Cómo quedó en la Fase 04:

- Cada criterio tiene además prueba en la capa E con los pasos de las pruebas manuales (`tests/e2e/libro-mayor.spec.ts`, `copias.spec.ts`, `papelera-deshacer.spec.ts`), incluidos CA-017 (se mata el árbol entero de procesos de Retenia apenas se toca «La sabía», como «Finalizar árbol de procesos») y CA-021 («+1 día», cerrar y abrir: aparece la copia automática del 16/03/2027).
- CA-015 y CA-018 suman propiedades (P): ninguna secuencia al azar de operaciones (alta, editar, eliminar, restaurar, vaciar, repasar, repetir un repaso, deshacer, reparar, correr el reloj) modifica ni borra un evento ya guardado, y guardar dos veces cualquier repaso deja una sola entrada sin gastar número de secuencia. CA-016 suma que los eventos en cualquier orden de entrada dan la misma agenda.
- CA-017 en I (`tests/integracion/corte.test.ts`): un programa hijo armado una vez por corrida con Vite (`src/data` usa `import.meta.glob`) abre una copia de una base preparada y se mata a sí mismo justo antes de cada sentencia de cada escritura (repasar, crear, editar, eliminar, restaurar de la Papelera, deshacer, vaciar) o entre los pasos con archivos de una copia y de una restauración; al reabrir, `integrity_check` da ok, el cambio está entero o no está y «Verificar datos» da 0.
- Fuera de los criterios: contrato (C) de cada canal nuevo, componentes (R) de cada pantalla nueva, el catálogo de textos de la Fase 04 letra por letra, accesibilidad en claro y en oscuro de las pantallas nuevas, y una prueba estática (S) que compara cada migración que alguna vez entró al historial de git con su primer commit.
- «Abrir carpeta de copias» usa el doble del Explorador de Windows (sección 4).
- Un archivo tomado por Windows (como lo dejan el antivirus o el indexador) no es un doble: una prueba de integración lo toma de verdad con un PowerShell que lo abre sin compartirlo (`tests/apoyo/archivo-tomado.ts`).

### Fase 05 · Laboratorio de piezas riesgosas (H-07)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-024 | E | I | Servidor local (simulado) sirve los modelos: barra de progreso, huella verificada, «Modelos listos»; sin modelos y «Simular sin conexión», el mensaje exacto. I prueba el rechazo de una huella distinta. |
| CA-025 | I | M | El `voice-worker` real genera WAV no vacío de «The weather is nice today» con el modelo real; M: escucharlo en el Laboratorio. |
| CA-026 | I | E | Whisper real sobre un WAV fijo que dice «good morning» → texto que contiene «good morning»; E muestra «Entendí: “good morning”» en un campo editable (micrófono simulado). |
| CA-027 | E | — | Micrófono bloqueado (simulado): «Sin acceso al micrófono no podemos escucharte» y «Cómo habilitarlo». |
| CA-028 | E | I | «Leer PDF de prueba» muestra el texto de la página 1 y un resaltado sobre la imagen; I extrae el texto con pdf.js en el proceso de trabajo. |
| CA-029 | I | E | tesseract.js real sobre la imagen de la página 9 → texto con palabras esperadas, sin red; E muestra el resultado. |
| CA-030 | M | C | M: la notificación «Retenia · Esto es una prueba» aparece y al tocarla Retenia pasa al frente. C: la envoltura recibe título y cuerpo exactos y el toque llama a `focus`. |

### Fase 06 · Sistema de diseño y armazón (H-08)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-031 | E | — | El riel tiene los seis nombres y «Buscar»; en cada pantalla hay exactamente un botón con el rol primario. |
| CA-032 | E | R | «Oscuro» cambia el atributo de tema al instante y persiste tras relanzar; R comprueba contraste de los tokens. |
| CA-033 | R | E | Los seis estados renderizan frase y acción; E los ve en la «Galería». |
| CA-034 | E | — | Recorrido con Tab, Enter, Esc, Ctrl+1 a Ctrl+6 y Ctrl+K sin mouse; el elemento con foco siempre es visible. |
| CA-035 | E | — | Ventana de 400 px, zoom 150 % y escala 125 % (emulada): sin desplazamiento horizontal ni texto cortado en las seis pantallas. |
| CA-036 | S | E | El catálogo de textos no tiene inglés suelto ni Lorem ipsum; E recorre las pantallas y busca «undefined», «null», «NaN», «[object Object]». |
| CA-037 | R | S | «Todavía no.» usa la tinta neutra; S confirma que ningún token de error del usuario es rojo. |

### Fase 07 · Materias, temas, apuntes y bandeja (H-09, H-10, H-11)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-038 | E | — | Crear «Química orgánica» y «Hacer activa»; Estudiar la muestra y «Estadística básica» pasa a «En mantenimiento». |
| CA-039 | E | — | Abrir «Historia argentina» no cambia la activa. |
| CA-040 | E | — | Tema «Regresión», nota sin tema en «Sin tema», «Mover a…» la pasa. |
| CA-041 | E | — | Retenia sin datos: «¿Qué querés aprender ahora?», «Química orgánica» queda activa, «Probar con un ejemplo (3 min)» carga «Ejemplo» con etiqueta EJEMPLO y sin progreso. |
| CA-042 | E | — | Tres renglones, Tab anida, Mayús+Tab desanida. |
| CA-043 | E | — | Dos segundos sin escribir → «Guardado»; relanzar conserva el texto. |
| CA-044 | I | E | Renombrar deja el nombre viejo en `topic_aliases`; E lo ve en «Otros nombres». |
| CA-045 | E | — | Archivar saca la nota, aparece en «Archivadas», «Deshacer» la devuelve. |
| CA-046 | E | — | Ctrl+Mayús+N desde Progreso, escribir y Enter: queda en «Bandeja» sin preguntar materia ni tema. |
| CA-047 | E | — | «Mover a…» a «Intervalos de confianza»: la nota aparece ahí y el contador baja de 2 a 1. |
| CA-372 | E | I | Pegar una imagen del portapapeles y arrastrar `campana.png`: se ve en el renglón, sobrevive al relanzar; I comprueba el archivo por huella en `imagenes\`. |
| CA-373 | R | E | El componente renderiza `$\bar{x} \pm t \cdot s/\sqrt{n}$` con KaTeX sin red y vuelve al texto fuente al entrar; E lo hace en la nota del elenco. |
| CA-374 | E | — | «[[» más «Inter» ofrece «Intervalos de confianza»; el enlace abre la nota. |
| CA-375 | E | I | «Mencionada en» lista el renglón de origen con su nota; un clic lleva al renglón. |
| CA-376 | I | E | Renombrar la nota destino: `block_links` sigue apuntando por identificador y el texto del enlace muestra el nombre nuevo. |

### Fase 08 · Tarjetas y fichas (H-12, H-13, H-14)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-048 | E | U | «Pendiente >> …» y Enter crea la tarjeta en «Tarjetas»; U cubre el analizador de «>>». |
| CA-049 | E | U | Seleccionar «100 °C» y Ctrl+Mayús+C crea el hueco y la tarjeta «El agua hierve a [...] al nivel del mar». |
| CA-050 | U | I | Dos huecos → dos tarjetas hermanas con el mismo `sibling_group_id`. |
| CA-051 | E | — | La tarjeta muestra «Estadística básica › Regresión › Regresión lineal» y «Ver en la nota» lleva al renglón. |
| CA-052 | E | — | Borrar el renglón con tarjeta con historial muestra la pregunta con sus dos opciones. |
| CA-377 | E | — | Un renglón con imagen que es tarjeta la muestra del lado correcto en sesión. |
| CA-378 | R | E | La tarjeta con fórmula se ve renderizada en pregunta y en respuesta. |
| CA-053 | E | — | «Editar ficha» permite cargar todo y muestra uno de los cinco estados. |
| CA-054 | E | I | Editar la respuesta pregunta «¿Cambió lo que hay que recordar?»; «No, solo la redacción» conserva el vencimiento; «Sí» reprograma como nueva y deja el historial a la vista. |
| CA-055 | E | I | «Crear inversa» crea la hermana con pregunta y respuesta intercambiadas. |
| CA-056 | E | — | Filtrar por «Intervalos de confianza» muestra solo esas con su próximo repaso; sin filtro, el contador dice 180. |
| CA-057 | I | E | «Pausar esta tarjeta» la saca de la cola hasta «Reanudar» y conserva el historial. |

### Fase 09 · Motor de memoria FSRS-6 (H-15)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-058 | U | — | Tarjeta nueva el 15/03/2027: «La sabía» → 17/03; «Con dudas» → 16/03; «No la sabía» → 16/03, con ts-fsrs y retención 0,90. |
| CA-059 | U | — | Tres «La sabía» seguidos en fecha: intervalos crecientes con los valores exactos de `casos-memoria.md`, generado y congelado en esta fase. |
| CA-060 | U | — | Misma tarjeta con retención 0,85 vuelve más tarde que con 0,90. |
| CA-061 | U | — | Repaso 5 días tarde acertado: usa los días reales, no cuenta como fallo, intervalo mayor que en fecha. |
| CA-062 | P | I | Propiedad: el recálculo desde cero con las observaciones en cualquier orden da las mismas fechas; I lo hace sobre la base del elenco. |
| CA-063 | I | E | Deshacer agrega `review.annulled`; el vencimiento vuelve al anterior y el historial muestra «Anulado». |
| CA-064 | U | — | Acierto con A2 o A3 cuenta como «Con dudas»; con A4, «No la sabía»; interrumpido o defectuoso no mueve nada. |
| CA-065 | E | U | «¿Por qué hoy?» muestra la frase con 23 días, «te costó» y «unos 7 de cada 10»; U calcula la probabilidad. |

### Fase 10 · Sesión de estudio (H-16, H-17, H-18)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-066 | E | — | Solo la pregunta y «Mostrar respuesta»; los botones de calificar no existen en el DOM hasta mostrarla. |
| CA-067 | E | — | Tras la cuarta, «Deshacer» o Ctrl+Z vuelve a esa tarjeta y el progreso pasa de «4/10» a «3/10». |
| CA-068 | E | — | Cerrar con 4 de 10 y relanzar: «Continuar: sesión de hoy (4 de 10)» retoma en la quinta. |
| CA-069 | E | I | Doble clic rápido en «La sabía»: un solo repaso y una sola tarjeta de avance; I cubre la clave de idempotencia. |
| CA-070 | U | E | La tarjeta con «No la sabía» vuelve antes del final después de al menos otras 3. |
| CA-071 | U | E | Dos hermanas que vencen hoy: entra una, la otra pasa a mañana. |
| CA-072 | E | — | Espacio muestra, 1, 2 y 3 califican, Esc pausa. |
| CA-073 | E | — | Escribir «cuánto se alejan», cerrar y volver: el texto sigue con «Borrador guardado». |
| CA-074 | E | U | El cierre muestra minutos, conteos por resultado, como máximo 2 dificultades, 1 próximo paso y la frase exacta. |
| CA-075 | E | — | Un toque en «Fácil», «Justo» o «Difícil» queda registrado; sin toque, nada. |
| CA-076 | E | — | «Guardar una duda» con el texto aparece en Progreso › «Dudas y revisiones» con la tarjeta como contexto. |
| CA-077 | E | I | «La tarjeta está mal» la pasa a «En revisión», sale de la cola y el intento no mueve el vencimiento. |

### Fase 11 · Carga en minutos y pantalla Estudiar (H-19, H-20, H-21, H-22)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-078 | E | — | Con el elenco: «Sesión recomendada · 25 min», «Por qué:», un solo primario «Empezar», como máximo dos alternativas a la vista. |
| CA-079 | U | E | 60 repasos de 12 s y 30 nuevas con 25 min → «60 repasos y 10 tarjetas nuevas · unos 25 min». |
| CA-080 | U | E | Con 10 min → «45 repasos, sin tarjetas nuevas · unos 10 min»; los 15 restantes quedan para mañana sin calificarse. |
| CA-081 | U | E | Con 5 min → «20 repasos, los más urgentes · unos 5 min». |
| CA-082 | U | E | Con 45 min → «60 repasos y 18 tarjetas nuevas · unos 30 min». |
| CA-083 | E | — | «Versión corta (10 min)» empieza la sesión de 10 directamente. |
| CA-084 | E | — | Elegir «10», relanzar: la propuesta vuelve a 25. |
| CA-085 | U | P | Los cuatro tramos del freno con sus bordes exactos; propiedad: la cantidad de nuevas nunca crece al crecer el atraso. |
| CA-086 | E | U | Con 6 días de atraso, el texto exacto del aviso y ningún número en rojo. |
| CA-087 | E | U | «Sumar a mis repasos» con 10 disponibles muestra «entre 5 y 10 minutos … 4 semanas» antes de confirmar. |
| CA-088 | U | — | 40 repasos con mediana 10 y valor inicial 12 → 10,4 s; sin repasos, 12. |
| CA-089 | U | R | Con menos de 20 intentos, redondeo a 5 y etiqueta «estimación inicial»; nunca segundos ni decimales. |
| CA-090 | U | — | Un repaso de 5 minutos cuenta 36 s como máximo y queda fuera de la mediana. |
| CA-091 | E | — | «Posponer» ofrece las tres opciones y registra un aplazamiento sin calificar. |
| CA-092 | U | — | Prioridades 0,675 y 0,30 con la fórmula; la primera va antes. |
| CA-093 | U | — | Tres aplazamientos → prioridad máxima; la cuarta vez entra sí o sí. |
| CA-094 | E | — | «Elegir otra actividad» muestra como máximo 3 y la propuesta no cambia al volver. |

### Fase 12 · Búsqueda (H-23, H-24)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-095 | I | E | «desvio» en FTS5 devuelve primero «¿Qué mide el desvío estándar?» con la palabra resaltada. |
| CA-096 | I | E | «varian» devuelve los elementos con «varianza». |
| CA-097 | I | E | «sqrt(n» devuelve el renglón «s / sqrt(n)». |
| CA-098 | U | I | El analizador de `tipo:` y `materia:` genera los filtros; I devuelve solo tarjetas y la de la Revolución de Mayo. |
| CA-099 | I | E | Tras renombrar a «Medidas de resumen», «Media y dispersión» lo encuentra por `topic_aliases`. |
| CA-100 | I | E | Crear «Teorema de Bayes» y buscar «bayes» en la misma transacción: aparece. |
| CA-101 | E | — | «zzzz» → «No encontré nada con “zzzz”» y una sugerencia. |
| CA-102 | E | — | Ctrl+K en sesión abre el panel lateral; abrir y cerrar un resultado deja la tarjeta y el borrador intactos. |
| CA-103 | D | I | Con 10.000 tarjetas, buscar en menos de 0,2 s y desplazar la lista sin trabas. |

### Fase 13 · Importar materiales: PDF, texto y Word (H-25, H-26)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-104 | E | I | Arrastrar el PDF del elenco: etapas en orden hasta «Listo», sin indicador giratorio indefinido; I corre la cadena completa. |
| CA-105 | I | E | Matar el proceso de trabajo a mitad: al reabrir sigue desde la etapa guardada y el original está. |
| CA-106 | I | E | Mismo archivo por huella → «Parece que ya agregaste “Apunte 3.pdf” el 12/03/2027» con las tres opciones. |
| CA-107 | I | E | `notas.md`, `resumen.docx` y un texto pegado llegan a «Listo» con sus títulos como secciones. |
| CA-108 | I | E | `no-es-un-pdf.pdf` → «No pudimos leer este PDF (protegido o dañado)» con sus dos acciones; el resto sigue andando. |
| CA-109 | E | — | Durante el procesamiento: «Leer el original», estudiar otra cosa y «Cancelar» conserva el original. |
| CA-110 | E | I | «Crear tarjeta desde acá» guarda la cita; «Ver en el original» abre la página con el pasaje resaltado. |
| CA-111 | I | E | Borrar el archivo original del disco: Retenia abre su copia en `originales\`. |
| CA-112 | E | — | «Guardar extracto» manda la selección a la Bandeja con su página. |

### Fase 14 · Importar materiales: escaneos, web y revisión (H-27, H-28)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-113 | E | I | «Revisión» muestra los tres bloques con las páginas 7, 11 y 9 y cada problema con una acción. |
| CA-114 | I | E | «Intentar reconocimiento» sobre la página 9 con tesseract.js real: pasa a «Listo» o «Con problemas» con texto. |
| CA-115 | E | I | «Corregir texto» deja el original intacto y pregunta «2 tarjetas usan este texto. ¿Actualizarlas?». |
| CA-116 | I | U | «Reprocesar esta página» vuelve a aplicar la corrección o la marca «En conflicto»; nunca se pierde. |
| CA-117 | U | E | El resumen de cobertura da «9 de 12 páginas listas · 2 para revisar · 1 pendiente»; E ve color y palabra por página. |
| CA-118 | E | I | «Estudiar sin estas páginas» las marca «Excluidas» y no se ofrecen para tarjetas. |
| CA-119 | I | E | `pagina.html` y una dirección servida localmente (simulado) → instantánea solo con el texto principal, dirección y fecha; abre sin red. |
| CA-120 | I | E | DOMPurify quita los scripts; E abre la instantánea en el `iframe` con `sandbox` y comprueba que ninguno corrió. |
| CA-121 | E | I | Con «Simular sin conexión», pegar una dirección deja «Pendiente: se descarga cuando haya conexión» y se completa al volver. |

### Fase 15 · Traer lo que ya tenés y exportar todo (H-29, H-30)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-122 | I | E | `mazo-demo.apkg` → vista previa «Entran 3 tarjetas y 5 repasos · Rechazadas: 0»; «Importar» deja historial y vencimiento. |
| CA-123 | I | E | `remnote-demo.zip` → «12 notas, 8 tarjetas, 1 rechazada (imagen faltante)»; la base no cambia hasta «Importar». |
| CA-124 | I | — | El mismo archivo otra vez (huella en `imports`) → «0 nuevas · 3 ya estaban». |
| CA-125 | E | I | La lista de rechazadas con motivo y «Guardar lista» escribe el archivo. |
| CA-126 | I | E | «Importar» crea antes la copia «Antes de importar» y lo importado llega a la materia elegida. |
| CA-127 | I | E | «Exportar todo» produce el comprimido con Markdown, tarjetas, historial, originales e índice y sin `clave.bin`. |
| CA-128 | I | E | Importar esa exportación en una base vacía: conteos iguales y `verifyData()` 0 diferencias. |
| CA-379 | I | E | La exportación incluye las imágenes y el Markdown conserva `$…$` y `[[…]]`; al importar se ven igual. |

### Fase 16 · Evaluación sin IA: preguntas, ayuda y desacuerdo (H-31, H-32, H-33)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-129 | U | E | 3 de 3 → «Correcto.», 2 → «Vas bien.», 0 o 1 → «Todavía no.». |
| CA-130 | R | E | El resultado se puede bajar y no subir. |
| CA-131 | U | R | «paris» es correcta; «Paría» muestra la diferencia letra por letra. |
| CA-132 | U | P | 4.2 y 4,22 correctas con tolerancia 0,05; 4,3 no; propiedad: coma y punto equivalen. |
| CA-133 | R | U | Tres opciones, cada equivocada con explicación; U marca el acierto como «con ayuda». |
| CA-134 | R | S | Todo resultado tiene veredicto, qué revisar y una sola acción; S recorre el catálogo de resultados. |
| CA-135 | R | E | «Pista» deshabilitada hasta escribir o tocar «No sé por dónde empezar». |
| CA-136 | E | — | Las pistas llegan en orden y antes de la solución aparece la pregunta exacta. |
| CA-137 | E | I | Acierto tras pista de concepto: «Logrado con pista de concepto», rótulo «PRÁCTICA CON AYUDA» y comprobación programada. |
| CA-138 | E | — | Abrir «Pista», «Ver un ejemplo» o «Fuente» y volver conserva el texto. |
| CA-139 | E | — | «Discrepo» ofrece los cuatro motivos. |
| CA-140 | I | E | «Mi respuesta era correcta» agrega la variante y recalifica el intento con una evaluación nueva. |
| CA-141 | E | — | El aviso «Todavía no → Correcto» con efecto en el próximo repaso, «Entendido» y «Deshacer». |
| CA-142 | I | E | «La referencia es incorrecta» pasa la tarjeta a «En revisión» y marca los intentos como afectados; ninguno cuenta como olvido. |

### Fase 17 · Objetivos, dominio y requisitos (H-34, H-35, H-36)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-143 | E | I | Crear el objetivo «Comprender» y enlazar el ejercicio: aparece en Progreso «Sin iniciar». |
| CA-144 | U | I | Un acierto sin ayuda el 15/03 → «En práctica» y nada más. |
| CA-145 | U | — | Segundo acierto sin ayuda el 16/03 → «Suficiente para avanzar». |
| CA-146 | U | — | Acierto el 23/03 → «Consolidado». |
| CA-147 | U | P | Fallo desde «Consolidado» → «A revisar»; acierto otro día → «Suficiente»; propiedad: ningún camino vuelve a «Sin iniciar». |
| CA-148 | U | — | Acierto con pista o en opciones → «En práctica» y columna «Con ayuda», sin contar para «Suficiente». |
| CA-149 | E | I | El panel muestra las cuatro columnas con conteo y fecha. |
| CA-150 | E | U | «Ya lo sé» → «Suficiente (por verificar)» con comprobación; fallarla → «En práctica». |
| CA-151 | E | U | Con el requisito indispensable «Sin iniciar», la propuesta empieza por él y dice «Antes conviene: Calcular la media y el desvío». |
| CA-152 | E | I | «Esto no es necesario para aquello» desbloquea al instante; un sugerido nunca bloquea. |
| CA-153 | U | E | El orden de diagnóstico con cinco casos armados; E ve una sola acción con su motivo. |
| CA-154 | I | E | La tarjeta con 4 fallos no está en la cola y aparece en «Mejorar la tarjeta» con las cuatro acciones. |
| CA-155 | E | I | «Mis errores» muestra respuesta textual, correcta y tipo, por tema. |
| CA-156 | U | P | 1 y 1 más acierto → 2 y 1; 2 y 2 más pista → 0,535; solución vista no cambia; propiedad: la media queda en (0, 1). |

### Fase 18 · Procedimientos, variantes e intercalado (H-37, H-38, H-39)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-157 | E | — | Primera vez: ejemplo completo y «¿Por qué este paso?» en el paso clave. |
| CA-158 | U | E | Tras aciertos en dos días: último, dos últimos, tres últimos, problema entero. |
| CA-159 | U | — | Dos fallos seguidos del mismo tipo → un paso más de apoyo; un fallo aislado repite el escalón con otro problema. |
| CA-160 | E | U | Error en el paso 3 → «Hay un error en el paso 3; ¿lo encontrás?» antes de la corrección. |
| CA-161 | E | — | «¿Qué método usarías? No lo resuelvas» con elección y porqué. |
| CA-162 | P | E | Propiedad con semilla: en 9 problemas nunca dos seguidos del mismo tipo y ningún enunciado nombra el tipo. |
| CA-163 | E | I | «Crear tarjeta de contraste» crea «¿En qué se diferencian la media y la mediana?». |
| CA-164 | U | P | Dos días, números distintos; en un mismo día solo cuenta la primera variante. |
| CA-165 | U | — | «Aplicar» exige además una variante nueva para «Consolidado». |
| CA-166 | U | E | Dos errores del mismo tipo en la sesión → micro-ejercicio de 5 a 10 ítems; superado con 2 sesiones al 85 % separadas un día. |

### Fase 19 · Compuerta de IA y verificadores (H-40, H-41)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-167 | E | — | Sin clave, estudiar funciona y las funciones de IA muestran «Para usar esto hay que conectar la IA» con «Configurar». |
| CA-168 | I | E | La clave guardada con `safeStorage` no aparece en claro en la carpeta de datos, copias, exportaciones ni registros; E ve «Conexión correcta» (IA simulada). |
| CA-169 | U | E | Tope USD 10: aviso en 8, freno en 10 con los textos exactos y «Este mes: USD 10,00 de 10». |
| CA-170 | I | E | Con «Modo solo local», la compuerta rechaza antes de armar el pedido y la pantalla lo dice. |
| CA-171 | E | I | «Qué se envió» muestra el renglón con fecha, propósito, fragmento y costo. |
| CA-172 | E | I | Primer uso de un material con la IA pregunta el permiso con las tres opciones y se recuerda «Siempre». |
| CA-173 | I | E | Respuesta grabada malformada: se descarta entera, no se guarda nada, «No pude completar esto. Reintentá.». |
| CA-174 | I | E | Todo resultado de la IA lleva marca; la compuerta no expone ninguna operación que marque «Verificada», mueva un repaso o cambie dominio. |
| CA-175 | I | E | `trampa.md` con la frase de inyección: la IA (grabada) lo explica como texto y nada cambia. |
| CA-176 | E | I | Sin conexión, el pedido queda «Pendiente: se reanuda cuando haya conexión» y se envía al volver. |
| CA-177 | U | I | El verificador de citas degrada a «Aporte del modelo, no verificado» toda cita que no está textualmente en el fragmento. |

### Fase 20 · Prompts, rúbricas y voz (H-42, H-43)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-178 | S | — | El catálogo de textos no contiene las palabras ni las formas prohibidas. |
| CA-179 | S | R | Cada mensaje de error del catálogo tiene qué pasó, qué podés hacer y, si corresponde, «guardado»; R muestra uno. |
| CA-180 | S | — | `docs/voz.md` tiene al menos 20 pares «así sí / así no». |
| CA-181 | E | I | El detalle de un resultado dice versión de prompt y de rúbrica. |
| CA-182 | I | S | Los 60 casos trampa corren con respuestas grabadas; el tablero muestra «Casos trampa de IA: 60 de 60». |
| CA-183 | S | E | Cada rúbrica tiene criterios con tres niveles y un ancla por nivel; cambiar el archivo sin subir la versión da rojo. |
| CA-184 | E | M | «Evaluar prompts con la IA real» muestra el costo estimado y, con el adaptador simulado, el informe; M lo corre con tu clave una vez. |

### Fase 21 · Tarjetas propuestas por IA (H-44)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-185 | U | I | 600 palabras → 5 candidatas como máximo; I con la sección 1 grabada devuelve candidatas con objetivo, cita y «Ver en el original». |
| CA-186 | U | I | Candidata con cita no textual no se muestra. |
| CA-187 | E | — | A, E y D aceptan, editan o descartan la enfocada y pasan a la siguiente. |
| CA-188 | E | I | La aceptada está «Revisada», con marca «IA» permanente y nunca «Verificada» sola. |
| CA-189 | E | I | La propuesta de Estudiar no cambia; «Sumar a mis repasos» muestra el costo. |
| CA-190 | U | E | Similitud con una tarjeta existente → aviso «Parecida a: ¿Qué mide el desvío estándar?». |
| CA-191 | I | E | Con un problema de lectura sin resolver, el bloque no se usa y aparece el aviso exacto. |
| CA-192 | U | E | Los tres detectores de defecto (dos respuestas, más de 30 palabras, hueco adivinable) resaltan. |

### Fase 22 · Corrección con IA y apelación (H-45, H-46)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-193 | I | E | Respuesta grabada para el envío del elenco: unidades cubierta, parcial o faltante con la frase citada. |
| CA-194 | I | E | Respuesta correcta con otras palabras → «Distinta de la modelo; verificada». |
| CA-195 | I | E | Respuesta larga sin contenido → «Todavía no.». |
| CA-196 | I | E | Dos evaluaciones grabadas que no coinciden → «No pude evaluarla con seguridad.» con las tres acciones y el repaso quieto. |
| CA-197 | E | I | Adaptador lento (simulado) → a los 8 s «La evaluación está tardando. Tu respuesta está guardada.» con «Seguir y evaluar después». |
| CA-198 | E | — | Adaptador que falla (simulado) → el mensaje exacto con «Reintentar», «Autocorregirme» y «Dejar para revisión». |
| CA-199 | E | I | «Discrepo» deja la nota «Provisional» con trazo punteado, sin tocar repasos ni dominio, y aparece en «Dudas y revisiones». |
| CA-200 | E | I | Resolver con las tres opciones; a los 14 días (reloj) queda «No concluyente». |
| CA-201 | U | E | 1 de cada 5 correcciones pide confirmación (semilla); Ajustes muestra «Acuerdo con la IA: 9 de 10». |
| CA-202 | U | I | Acuerdo menor al 80 % en un tipo → esa corrección pasa a «En revisión» y vuelve la autocorrección. |
| CA-203 | E | I | Apelación aceptada: cuántas evaluaciones se corrigieron y el cambio del próximo repaso, con «Ver detalle». |

### Fase 23 · Tutor (H-47)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-204 | E | — | Los seis controles del tutor están. |
| CA-205 | E | U | 90 s sin tocar nada (reloj) → solo el ícono «Pista disponible». |
| CA-206 | E | I | «Mostrame la solución» la muestra, deja «Resuelta con solución» y ofrece un gemelo sin ayuda. |
| CA-207 | I | E | Respuestas grabadas: «Hay un error; ¿lo encontrás?», pregunta de diagnóstico al segundo, nunca más de 2 preguntas seguidas. |
| CA-208 | E | U | «Según tu material» con citas numeradas que abren el pasaje y «Aporte del modelo, no verificado» separados. |
| CA-209 | I | E | Con «Solo mis materiales» y pregunta sin respaldo → «No encontré material tuyo que respalde una respuesta». |
| CA-210 | E | I | «Esta cita no dice eso» → «Me equivoqué» con qué afirmó y qué corresponde; lo registrado se deshace. |
| CA-211 | U | E | Tras 2 aciertos sin ayuda en días distintos, el tutor no ofrece ayuda de entrada. |

### Fase 24 · Planificador con hitos (H-48, H-49)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-212 | E | — | Los tres pasos de «Mi meta» crean la meta y Estudiar la muestra con su fecha. |
| CA-213 | E | U | Estado «Viable», «Ajustado» o «No alcanza», «N de 10 escenarios» y «¿Por qué?» con demanda y capacidad. |
| CA-214 | U | E | Demanda 780 y realista 480 → «No alcanza (2 de 10 escenarios)» y las tres salidas. |
| CA-215 | U | — | 210 declarados sin historia → 157. |
| CA-216 | E | U | Tres barras; solo «Demostrado» cuenta evidencia sin ayuda y con demora. |
| CA-217 | U | R | Un hito siempre es un rango («entre el 12 y el 16/04»). |
| CA-218 | U | E | Cambios menores a 15 min se aplican solos; hito corrido menos de 3 días avisa; 3 o más o cambio de viabilidad pide confirmación. |
| CA-219 | E | U | «No puedo estos días» del 20 al 24/03: el plan se reacomoda y esos días no generan atraso ni avisos. |
| CA-220 | U | P | Replanificar no cambia las próximas 48 horas. |
| CA-221 | P | U | Propiedad: el mismo estado genera planes idénticos. |
| CA-222 | E | S | Después del domingo aparece «Tu semana» con menos de 150 palabras y sin desplazamiento. |

### Fase 25 · Regreso, compromiso y hábitos (H-50, H-51, H-52)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-223 | U | E | 8 días, 42 min de atraso, 12 de carga, 25 disponibles → el texto exacto con 10 minutos y 4 días; E con «+7 días». |
| CA-224 | E | U | Con «+35 días»: «Hola de nuevo», tema y dificultad, sondeo de 15, reparto en 7 a 14 días, una semana sin nuevas. |
| CA-225 | E | — | Con más de 42 días: «¿Seguís con esta meta?» con «Seguir», «Ajustar» y «Pausar la materia». |
| CA-226 | S | E | Los textos de regreso del catálogo no empiezan por el total, no usan frases de culpa; E confirma que no hay números en rojo. |
| CA-227 | E | — | Sesión pausada en «Intervalos de confianza» y 7 días después: «Dónde quedaste» antes de la propuesta. |
| CA-228 | E | I | «Estudié por otro lado» con 30 minutos queda declarado y ningún repaso cambia. |
| CA-229 | U | E | 5 minutos activos o 10 intentos cuentan el día → «Compromiso semanal: 1 de 3 días». |
| CA-230 | S | E | No existe ningún contador de días seguidos en el catálogo ni en la pantalla; «Días estudiados este mes» solo suma. |
| CA-231 | E | U | «Semana complicada»: compromiso a 1 día por 7 días, recordatorios silenciados, nada incumplido. |
| CA-232 | U | E | 3 semanas al 100 % → propone sumar y espera; menos del 50 % 2 semanas → propone bajar; nunca cambia solo. |
| CA-233 | E | I | «Pausar la materia» congela plan y avisos; reanudar arranca con una comprobación corta. |
| CA-234 | E | — | Tras posponer o cerrar sin empezar, una vez por día «¿Qué se interpone hoy? (opcional)» con sus seis opciones; «Parece mucho» ofrece «Solo 5 min». |
| CA-235 | E | U | 3 aperturas sin empezar en 7 días → «Versión corta (10 min)» es el primario por una semana. |

### Fase 26 · Recordatorios (H-53)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-236 | E | — | Recién instalado: apagados. |
| CA-237 | E | — | Al activar, el texto exacto con «Activar»; decir que no no vuelve a preguntar. |
| CA-238 | M | C | M: el aviso con título, cuerpo y botones aparece a las 19:00; C: la envoltura recibe exactamente esos textos y botones cuando el programador dispara. |
| CA-239 | C | M | `handleActivation` con «Empezar» inicia la sesión y pide el frente; M lo ve. |
| CA-240 | U | I | Ya estudiado hoy → no se envía y el registro dice «No se envió: ya estudiaste hoy». |
| CA-241 | U | — | Un aviso a las 23:30 no sale (silencio 22:00 a 08:00). |
| CA-242 | U | — | Despertar a las 21:10 con un aviso de las 19:00 y 90 minutos de vigencia → no sale. |
| CA-243 | U | C | «Posponer» 30 min vuelve una sola vez y ningún vencimiento cambia. |
| CA-244 | E | I | «¿Por qué recibí esto?» muestra la regla que lo disparó. |
| CA-245 | E | U | 3 avisos sin respuesta → pregunta dentro del programa y no manda más hasta contestar. |
| CA-246 | C | M | Modo privado: solo «Retenia · Tu sesión está lista.», sin materia. |

### Fase 27 · Progreso, confianza y medición honesta (H-54, H-55, H-56)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-247 | E | — | Tres bloques y cada número con «Observado», «Estimado» o «Datos insuficientes» y su cantidad. |
| CA-248 | E | U | El sondeo con las 11 tarjetas, sin resultados hasta el final, 8 aciertos → el texto exacto con 73 % y «Evidencia baja». |
| CA-249 | U | P | Wilson al 95 % para 8 de 11 → 43 % a 90 %; propiedad: el intervalo contiene la proporción y queda en [0, 1]. |
| CA-250 | R | U | Menos de 10 datos → «Todavía hay pocos datos (6 de 10)» sin porcentaje. |
| CA-251 | U | E | 20 repasos o más en un tramo → «El motor predice 90 %; observás 84 %». |
| CA-252 | E | U | «Con ayuda: 15 de 15. Sin ayuda, al día siguiente: 1 de 3.» separadas. |
| CA-253 | U | P | Práctica de 19:00 a 19:20 y lectura de 19:15 a 19:30 → 30 minutos; propiedad: la unión nunca supera la suma. |
| CA-254 | E | U | 1 de cada 5 intentos (semilla), antes del resultado, con las tres opciones; opcional; la primera vez explica. |
| CA-255 | E | U | «Seguro» y fallo → el texto exacto y la tarjeta vuelve en 1 o 2 días. |
| CA-256 | U | E | 20 juicios o más → «Cuando decís “Seguro”, acertás 7 de 10». |
| CA-257 | E | U | Cada tema con 5 escalones, tipo de evidencia, fecha y «desde cuándo» si bajó. |
| CA-258 | U | E | El hito «Primera tarjeta recordada a 30 días» sigue con su fecha aunque el dominio baje. |
| CA-259 | S | E | El catálogo no tiene puntos, niveles, insignias ni monedas; E recorre las pantallas. |

### Fase 28 · Curso de inglés: base de palabras y ubicación (H-57, H-58)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-260 | E | — | El panel del curso con sus diez secciones y «Todavía no disponible» donde corresponde. |
| CA-261 | I | E | «weather» en `curso-ingles.db`: nivel, posición, pronunciación, significado, ejemplo, audio reproducible. |
| CA-262 | S | I | `curso-ingles.db` tiene 9.000 palabras o más con nivel estimado A1 a C2; I la consulta sin red. |
| CA-263 | S | E | Cada fuente de `sources` tiene licencia y atribución; no figuran Oxford 3000 y 5000 ni el English Vocabulary Profile; E lo ve en «Créditos y licencias». |
| CA-264 | E | U | La ficha muestra los dos ejes de estado. |
| CA-265 | E | U | 60 palabras, 20 inventadas; «La conozco» y «No la conozco». |
| CA-266 | U | E | 5 inventadas marcadas o más → «Estimación poco confiable: conviene repetir la prueba». |
| CA-267 | E | U | El resultado con «Vocabulario estimado: cerca de 1.800 palabras · Punto de partida sugerido: A2», etiqueta «Estimación», sin «Tu nivel es…». |
| CA-268 | U | E | Ítems de gramática de más fácil a más difícil; se detienen tras 3 fallos seguidos. |
| CA-269 | I | E | Aceptar deja las palabras bajo el punto de partida en «La entiendo (por verificar)» de una vez, con «Deshacer». |
| CA-270 | E | — | «Empiezo de cero» arranca en A1 sin prueba. |

### Fase 29 · Vocabulario (H-59)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-271 | I | E | «Agregar a mis palabras» crea «Entender» y «Usar»; acertar una no cambia la otra. |
| CA-272 | U | R | «wheather» muestra la diferencia con «weather»; «colour» vale para «color». |
| CA-273 | E | U | Pistas en orden: primera letra, cantidad, oración con hueco, respuesta; con pista el estado no avanza. |
| CA-274 | U | E | 5 palabras de un mismo tema, las siguientes por frecuencia dentro del nivel; «Ya la conozco» la saca. |
| CA-275 | E | — | «Solo escuchar» oculta el texto hasta responder y reproduce el audio. |
| CA-276 | I | E | «for» en la oración de «since» → la explicación de duración y punto de inicio (contenido del curso). |
| CA-277 | U | I | Dos aciertos sin ayuda en días distintos → «La entiendo»; dos de «Usar» → «La uso». |
| CA-278 | E | I | «Palabras que entendés: 600 · Palabras que usás: 120» como dato observado. |

### Fase 30 · Leer y escuchar (H-60, H-61)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-279 | E | U | «A weekend in Bariloche» con marca por palabra y «94 % de palabras conocidas». |
| CA-280 | E | I | Clic en «although»: significado, pronunciación, audio y «Agregar a mis palabras» con la oración como contexto. |
| CA-281 | I | E | «Terminé: el resto las conozco» pasa las no tocadas a «La entiendo (por verificar)». |
| CA-282 | U | E | Porcentaje de conocidas y etiqueta «Cómodo», «Adecuado» o «Exigente» con los bordes 98 y 95. |
| CA-283 | E | S | Al terminar un texto, 3 preguntas con clave; S confirma que todo texto de la biblioteca tiene sus 3 preguntas. |
| CA-284 | S | E | La biblioteca tiene al menos 3 textos por nivel, cada uno con fuente y licencia. |
| CA-285 | E | — | Transcripción oculta, velocidades 0,75× y 1×, «Repetir frase». |
| CA-286 | U | E | «I am» vale por «I'm»; «tomorow» se marca letra por letra. |
| CA-287 | S | E | Todo audio de la biblioteca termina con 2 o 3 preguntas o un dictado; E no puede cerrar sin responder. |
| CA-288 | I | E | Whisper real sobre `entrevista.mp3` (cortado con el detector de voz) produce transcripción con «[inaudible]» donde corresponde. |
| CA-289 | U | E | 7 minutos leídos y 5 escuchados → «Entrada» de la semana suma 12. |

### Fase 31 · Contenido del currículo A1–C2 (H-62)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-290 | S | — | `curso-ingles.db` tiene 300 puntos o más, cada uno con explicación, 3 ejemplos, contraste cuando corresponde y 8 ejercicios con clave. |
| CA-291 | S | I | Cada ejercicio publicado tiene 3 corridas independientes de validación coincidentes registradas; los descartados se cuentan en el tablero. |
| CA-292 | E | — | Una lección dice «Generada con IA · validada» hasta marcarla «Revisada». |
| CA-293 | S | — | 20 descriptores o más por nivel, repartidos entre las cuatro destrezas, propios y no copiados del Marco Europeo (lista de frases prohibidas). |
| CA-294 | S | E | La libreta tiene 60 entradas o más; «depends of» tiene forma correcta «depends on» y regla en español. |
| CA-295 | S | — | 12 contrastes o más con 10 pares cada uno, el primero «ship / sheep». |
| CA-296 | S | E | El tablero «Currículo de inglés» muestra los conteos por nivel y ningún nivel tiene menos de 30 puntos. |
| CA-297 | E | I | «Tiene un error» con texto saca la lección del curso hasta regenerar y validar. |

### Fase 32 · Gramática y pronunciación (H-63, H-64)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-298 | E | — | La lección en una pantalla, 3 ejemplos y ejercicios de completar, transformar y armar. |
| CA-299 | I | E | «I have seen him yesterday» se marca error con la explicación del past simple (clave del curso). |
| CA-300 | E | U | Al día siguiente, práctica nueva sin explicación, «Ver la regla» la abre. |
| CA-301 | P | E | Propiedad con semilla: dos estructuras estudiadas salen mezcladas y ningún ejercicio nombra la estructura. |
| CA-302 | U | E | Oración propia sin ayuda en 2 días → «Suficiente para avanzar»; solo huecos no alcanza. |
| CA-303 | U | E | El siguiente punto según nivel y errores, con motivo, y se puede elegir otro. |
| CA-304 | E | U | 20 ítems de «ship / sheep» con resultado al instante → «ship / sheep: 14 de 20». |
| CA-305 | I | E | En 20 ítems suenan al menos 4 voces distintas del modelo. |
| CA-306 | U | I | Un contraste entrenado entra al repaso espaciado como una tarjeta. |
| CA-307 | E | I | «Grabarme y comparar»: modelo y grabación seguidos, «Entendí: “sheep”» como pista, sin nota (Whisper real sobre WAV fijo). |
| CA-308 | E | — | Micrófono bloqueado (simulado): la escucha funciona y «Grabarme y comparar» muestra el aviso. |
| CA-309 | S | E | El orden de contrastes del curso empieza por «ship / sheep» y sigue la dificultad para hispanohablantes. |

### Fase 33 · Escribir y conversar (H-65, H-66)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-310 | E | S | En A2, consigna con largo («60 a 80 palabras») y contador; S confirma que toda consigna tiene largo. |
| CA-311 | I | E | Texto A2 con respuesta grabada: como máximo 3 errores con forma correcta y regla en español. |
| CA-312 | I | E | Texto B1 con respuesta grabada: dónde y qué tipo sin solución, pide reescribir, después muestra qué quedó resuelto. |
| CA-313 | R | I | Tres ejes separados y ninguna nota única. |
| CA-314 | I | E | El error corregido queda en «Mis errores» con categoría y genera una tarjeta con tu oración. |
| CA-315 | E | — | Sin IA: autocorrección con texto modelo y lista de control. |
| CA-316 | E | — | «Pedir en un café» muestra el objetivo de la situación y el tutor habla al nivel (grabado). |
| CA-317 | I | E | Error que no impide entender: el tutor sigue; al cierre 2 o 3 errores priorizados y pide decirlos bien. |
| CA-318 | E | I | «Mantener para hablar»: transcripción editable antes de enviar; el tutor responde con voz y texto. |
| CA-319 | I | E | Transcripción dudosa: primero «¿Dijiste “she go” o “she goes”?». |
| CA-320 | E | — | Sin IA: «Conversar necesita la IA conectada» y «Practicar con un diálogo guiado». |
| CA-321 | U | E | 8 minutos escritos o conversados → «Salida» suma 8. |

### Fase 34 · Ruta de cero a C2 (H-67)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-322 | U | E | A2 y 25 min → «Vocabulario y gramática 10 min · Leer o escuchar 7 min · Escribir o conversar 4 min · Fluidez 4 min». |
| CA-323 | U | P | Los tres repartos por nivel; propiedad: la suma siempre da los minutos de la sesión. |
| CA-324 | E | U | 52/28/10/10 y la sugerencia de sumar salida y fluidez. |
| CA-325 | E | I | Cada descriptor con estado, evidencia y fecha. |
| CA-326 | E | U | «Lectura: desempeño compatible con A2 · estimación, 12 evidencias · 15/03/2027» y nunca «certificado». |
| CA-327 | U | E | Ritmo 45 × 5 y nivel A2 → el texto exacto con 1,5 a 2,2 y 4,1 a 5,2 años y la aclaración. |
| CA-328 | U | I | Texto nuevo de B1 con 4 de 5 en 2 días → lectura «compatible con B1». |
| CA-329 | E | U | «Lectura cronometrada» muestra palabras por minuto y la diferencia con la vez anterior. |
| CA-330 | E | I | El simulacro C1 con sus cuatro partes, rúbrica de 4 criterios de 0 a 5 y resultado «compatible con…». |

### Fase 35 · Auditoría de la red (H-68)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-331 | S | — | Stryker sobre cada módulo del núcleo: 80 % o más de mutantes detectados; el tablero muestra el porcentaje por módulo. |
| CA-332 | S | — | Sabotaje por criterio: para cada criterio de una fase cerrada, romper lo que promete hace fallar al menos una prueba con su identificador (muestra aleatoria con semilla en cada corrida, completa al cerrar la fase). |
| CA-333 | S | — | La red completa corre 20 veces seguidas en verde (trabajo del CI al cerrar la fase). |
| CA-334 | S | — | `verificar` tarda menos de 2 minutos y `verificar:todo` menos de 15, medidos en la corrida. |
| CA-335 | S | — | El registro de pruebas manuales fallidas (`docs/pruebas-manuales/`) cruza cada falla con una prueba automática que hoy da verde. |

### Fase 36 · Seguridad (H-69)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-336 | C | N | La ventana no tiene `require` ni acceso al disco; cada canal rechaza cargas inválidas; un enlace externo llama al navegador del sistema; N lo confirma en la versión real. |
| CA-337 | I | E | Los cinco archivos trampa (más el gigante generado en la prueba): nada se ejecuta, nada se escribe fuera de la carpeta de datos, Retenia sigue andando. |
| CA-338 | I | N | La clave configurada no aparece en el instalador, la carpeta de datos, los registros, las copias, las exportaciones ni el diagnóstico. |
| CA-339 | S | — | secretlint sin secretos en el repositorio; `npm audit` sin vulnerabilidades altas o críticas sin tratar. |
| CA-340 | N | — | En la versión real instalada no se abren las herramientas de desarrollo ni existe el modo demostración. |
| CA-341 | S | — | `docs/seguridad.md` tiene por hallazgo severidad, reproducción, estado y prueba, en castellano. |

### Fase 37 · Caza de bugs (H-70)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-342 | M | E | Siete personajes (agentes) completan sus misiones y dejan hallazgos con pasos; E incorpora los hallazgos confirmados. |
| CA-343 | M | — | Otro agente reproduce cada hallazgo con los pasos dados; lo que no se reproduce queda refutado. |
| CA-344 | S | — | Cada bug confirmado tiene una prueba automática registrada que antes daba rojo y ahora verde (lo cruza el tablero). |
| CA-345 | M | S | El informe final no deja bugs altos o medios abiertos; S cuenta los estados del informe. |

### Fase 38 · Rendimiento, accesibilidad y pulido (H-71)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-346 | D | — | Con 10.000 tarjetas: arranque, siguiente tarjeta, abrir Estudiar y buscar dentro de los topes de la sección 6. |
| CA-347 | D | E | Con un PDF de 300 páginas procesándose, una sesión completa en E sin esperas mayores a 1 s. |
| CA-348 | E | — | Una sesión completa desde abrir hasta el cierre solo con teclado, foco siempre visible. |
| CA-349 | M | E | M: el Narrador anuncia pregunta, resultado y botones; E comprueba los nombres accesibles y los anuncios en vivo. |
| CA-350 | E | — | Zoom 200 %: sin pérdida de contenido ni desplazamiento lateral. |
| CA-351 | E | — | «Reducir movimiento» (emulado): ninguna animación activa. |
| CA-352 | E | — | La tecla de signo de pregunta abre la hoja de atajos. |

### Fase 39 · Errores, diagnóstico y recuperación (H-72)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-353 | E | R | Un error inyectado muestra «Algo salió mal. Tu trabajo está guardado.» con «Reintentar» y «Guardar diagnóstico», sin texto técnico. |
| CA-354 | I | E | El diagnóstico tiene versión, qué se hacía y el error, y no tiene apuntes, respuestas ni clave. |
| CA-355 | E | I | Matar Retenia y relanzar: «Retenia se cerró de forma inesperada. No se perdió nada.» y continuar donde estaba. |
| CA-356 | I | E | Disco lleno (simulado) al agregar: el mensaje exacto con sus dos acciones y la base intacta. |
| CA-357 | I | E | Base dañada (archivo de prueba): «Restaurar la última copia comprobada» con fecha y el archivo dañado conservado aparte. |
| CA-358 | I | E | Al pasar una semana (reloj), la última copia se abrió en una carpeta temporal, se contó y «Datos y copias» dice «Última copia comprobada». |
| CA-359 | I | E | Un proceso de trabajo colgado (tarea que no termina) vence su tiempo límite, se reinicia y la tarea se reanuda o queda «Requiere revisión». |

### Fase 40 · Instalador, actualización y tus datos (H-73)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-360 | N | M | En la cuenta nueva del CI, instalar abre con la pregunta de la primera vez y guarda en la carpeta de esa cuenta; M lo repite con «José Pérez» en esta PC. |
| CA-361 | N | I | Instalar sobre la versión anterior con 2 tarjetas: siguen, «Verificar datos» da 0 y existe «Antes de actualizar»; I corre las migraciones sobre una base vieja. |
| CA-362 | E | N | Con el servidor local (simulado): «Estás al día» o «Hay una versión nueva» con lo que cambió, sin credencial en el programa. |
| CA-363 | I | E | `latest.yml` con huella distinta: electron-updater rechaza y Retenia lo dice. |
| CA-364 | N | M | Desinstalación silenciosa conserva los datos y reinstalar los muestra; M ve la pregunta «¿Conservar tus datos?» en la desinstalación a mano. |
| CA-365 | N | — | Con las dos variantes instaladas, cada una tiene su carpeta y no ve la otra. |
| CA-366 | E | S | «Acerca de» muestra versión, fecha y «Qué cambió» en castellano; S revisa el archivo de cambios. |

### Fase 41 · Manual de uso y mantenimiento (H-74)

| Criterio | Capa | También | Cómo se comprueba |
|---|---|---|---|
| CA-367 | S | E | 25 temas o más escritos como tareas, en castellano; E usa el buscador de la Ayuda. |
| CA-368 | E | M | Una prueba E sigue al pie de la letra los pasos del tema «Cómo agregar un PDF» tal como están escritos; M lo repite a mano. |
| CA-369 | M | S | M: en cinco minutos se estudia, se agrega un material y se hace una copia; S mide el largo de «Primeros pasos». |
| CA-370 | E | S | Las capturas de la ayuda se generan en cada versión desde E; S falla si falta alguna o cambió el nombre de un botón. |
| CA-371 | S | — | `docs/MANTENIMIENTO.md` tiene rutina mensual, qué hacer si la corrida semanal da rojo y cómo pedir una función, cada cosa con su prompt. |

## 8. Cuántos criterios comprueba cada capa

Conteo de la tabla anterior (lo calcula `tools/cobertura-criterios`; al 13/10/2026 lo calculó un script de consistencia de la Fase 01 y se pegó acá):

| Capa | Como capa principal | Como segunda capa | En total |
|---|---|---|---|
| U · Unitaria | 78 | 39 | 117 |
| P · Propiedades | 4 | 10 | 14 |
| I · Integración con base real | 73 | 62 | 135 |
| C · Contrato del puente | 3 | 3 | 6 |
| R · Componentes de la ventana | 11 | 7 | 18 |
| E · Punta a punta | 156 | 123 | 279 |
| N · Programa instalado | 7 | 4 | 11 |
| S · Estática y de infraestructura | 37 | 10 | 47 |
| D · Medición de rendimiento | 3 | 0 | 3 |
| M · Manual | 7 | 7 | 14 |
| **Total** | **379** | **265** | |

Los 379 criterios tienen capa. 372 tienen una capa principal automática. Siete son manuales por naturaleza (CA-030, CA-238, CA-342, CA-343, CA-345, CA-349 y CA-369: una notificación en pantalla, el Narrador, la caza de bugs con personajes, los cinco minutos de «Primeros pasos») y llevan igual una segunda capa automática que cubre todo lo que se puede comprobar sin ojos ni oídos; además, cada uno figura en la guía de pruebas manuales de su fase. 265 criterios tienen dos capas.

## 9. Cómo se cierra una fase con esta red

1. Prueba primero: los criterios U, P e I de la fase se escriben antes del código y se ven en rojo (commit local).
2. Se construye hasta que la red da verde: `verificar` en cada commit, `verificar:todo` antes del pull request.
3. El CI construye los dos instaladores, corre N y el escaneo del paquete real, mide el tamaño.
4. `verificar:mutaciones` al cerrar la fase; el tablero muestra el porcentaje por módulo.
5. Humo S1 a S5 (los que apliquen) y las pruebas manuales de la fase, a mano, sobre «Retenia (prueba)» instalado.
6. Revisor independiente sin objeciones; `docs/ESTADO.md` y la guía de pruebas manuales al día; tu aprobación; recién entonces se fusiona y se pone el tag.
