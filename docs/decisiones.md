# Decisiones técnicas

Acá se anotan las decisiones técnicas que toma Claude Code, con fecha y el motivo en una línea.

## 13/10/2026 · Semilla

- Las cinco órdenes existen desde ya en un `package.json` mínimo, sin dependencias, y responden «todavía no disponible: llega en la Fase 02». Así los permisos previos ya apuntan a órdenes reales.
- Git usa el nombre `zeroframe404` solo dentro de este proyecto, sin tocar la configuración global.
- Saltos de línea: Git convierte a formato Windows al bajar y a formato universal al subir (`core.autocrlf=true`).
- La carpeta `build/` no está en `.gitignore` porque electron-builder suele guardar ahí íconos del instalador; se ignoran `dist/`, `out/` y `release/`.
- El repositorio se llama `retenia-app` porque `retenia` ya existía en tu cuenta (creado el 18/09/2026, solo con un README.md). Ese no se tocó.

## 13/10/2026 · Fase 00

- La especificación vive en `docs/especificacion/` en ocho archivos Markdown, uno por tema, para que cada fase lea solo el que necesita y los cambios se vean renglón por renglón en los pull requests.
- Cada criterio va en tres renglones (Dado / cuando / entonces) con su identificador en negrita (`- **CA-NNN**`), para que un script pueda contarlos, detectar huecos y, desde la Fase 02, cruzarlos con las pruebas que los cubren.
- Los números que no cerraban se cerraron con reglas explícitas (estimación de duración con 1 minuto fijo, escenarios fijos de la meta, intervalo de Wilson, mayor resto para las hebras); están en la sección 4 de `decisiones-conciliadas.md` y se pueden revisar si la medición real de una fase no se parece.
- El motor de memoria usa FSRS-6 (ts-fsrs) sin pasos de aprendizaje de corto plazo: los pasos harían que una tarjeta nueva volviera en minutos y los criterios piden días. La repetición dentro de la sesión la maneja Retenia.
- Las fórmulas se muestran con una biblioteca de render matemático que no ejecuta nada (KaTeX o equivalente, se confirma en la Fase 01); el texto de la fórmula es dato.
- Las imágenes pegadas se guardan como archivos dentro de la carpeta de datos, con nombre por huella, y el apunte las referencia; así entran en copias y exportaciones sin duplicarse.
- Los enlaces entre notas se guardan por identificador, no por nombre, para que renombrar una nota no los rompa (CA-376).
- Las pruebas manuales de cada fase se guardan en `docs/pruebas-manuales/fase-NN.md`, con una tabla de registro para anotar el resultado.

## 13/10/2026 · Fase 01

Cada línea: qué se eligió, por qué y qué se descartó. Las versiones exactas están en `docs/versiones.md`.

- La rama `fase-01` nace de `fase-00` y su pull request apunta a `fase-00`, porque la Fase 00 todavía no está fusionada y la 01 necesita la especificación; GitHub lo redirige a `main` cuando se fusione la 00.
- Electron 44.7.0 (Node 24.21.0, Chromium 152): el mayor estable más nuevo, con soporte hasta que salga la 47. Descartados: 43 (menos vida útil) y 45 (beta).
- electron-vite 5.0.0 con Vite 7.3.7, porque electron-vite 5 no acepta Vite 8 y la 6 está en beta. Descartados: Electron Forge (sin creador oficial de NSIS), vite-plugin-electron, Vite 8 hoy.
- TypeScript 7.0.2 solo para chequear tipos (compilador nativo, mucho más rápido); dependency-cruiser lee TypeScript con swc porque la 7.0 no trae API. Plan B anotado: 6.0.3.
- electron-builder 26.17.0 y electron-updater 6.8.10 (línea `v26`, mantenida); la 27 está en alfa. Instalador NSIS asistido, por usuario, sin administrador, con `guid` fijo por variante.
- `npmRebuild: false` y `asarUnpack` para los módulos nativos: todos son Node-API con binarios dentro del paquete y `@electron/rebuild` intentaría compilarlos sin necesidad.
- Fuses por variante: la de prueba deja encendido `EnableNodeCliInspectArguments` porque Playwright lo necesita; la real lo apaga y se prueba con WebdriverIO.
- better-sqlite3 13.0.3 (SQLite 3.53.4) con Drizzle 0.45.4 y migraciones SQL solo aditivas vigiladas por una prueba; WAL con `synchronous = FULL`. Descartado: Drizzle 1.0 (rc).
- UUID versión 7 con `crypto.randomUUIDv7()` de Node 24, sin dependencia. Descartado: paquete `uuid` (queda como plan B).
- Búsqueda con FTS5 y tokenizador `trigram remove_diacritics 1` de SQLite 3.53: prefijo, infijo y sin tildes sin normalizar a mano. Descartados: `unicode61` con prefijo (no busca «sqrt(n» adentro), búsqueda semántica (fuera de alcance).
- ts-fsrs 5.4.2 (FSRS-6, 21 parámetros, `enable_short_term: false`). Descartado: FSRS-7 (6.0 beta), como ya decía la especificación.
- TipTap 3.31.4 con KaTeX 0.18.11 (la 0.19 queda fuera del rango que acepta TipTap); menciones con disparador `[[`; imágenes por huella. Descartado: escribir un editor propio.
- pdf.js 6.4.299: texto en el proceso de trabajo con la compilación `legacy`, render en la ventana; la 6.x ya no usa `eval` y su API no ejecuta JavaScript de PDF. Descartado: `@napi-rs/canvas` (solo haría falta para renderizar en Node).
- tesseract.js 7.0.0 con datos `tessdata_best` (eng y spa, unos 25 MB) dentro de la descarga única, como fija `no-funcionales.md`. Descartado: incluirlos en el instalador.
- Páginas web: readability + jsdom + DOMPurify; instantánea en `iframe` con `sandbox`. Descartados: linkedom y happy-dom (DOMPurify desaconseja happy-dom).
- Comprimidos: yauzl y yazl (leen y escriben por partes; yauzl rechaza rutas trampa). Descartados: fflate (no valida nombres), adm-zip (todo en memoria).
- Voz: sherpa-onnx-node 1.13.8 en un proceso de trabajo propio, con `enableExternalBuffer: false`; candidatos Kokoro int8 (28 voces en inglés, 132 MB) y Whisper base.en o small.en int8 con Silero VAD para cortar en 30 s. Plan B: kokoro-js y transformers con Whisper. Descartados: Kokoro v1_1 (3 voces en inglés), Parakeet (640 MB, CC-BY).
- Modelos de voz y de reconocimiento alojados en el repositorio público `retenia-releases`, reempaquetados con su licencia y verificados por SHA-256 (tu decisión). Descartado: bajar desde GitHub de terceros (dependencia de un tercero).
- IA: SDK 0.133.0; Opus 5.5 para corregir, tutor, escritura y conversación (tu decisión), Haiku 5.5 para tareas en volumen, Sonnet 5.5 solo para validar el curso; salidas con esquema generadas desde Zod; caché del prompt del sistema; precios en `src/ai/precios.json` con fecha; tope por defecto USD 20. Mi recomendación era Sonnet 5.5 con tope USD 10; queda anotado como alternativa de una línea si Opus resulta lento o caro.
- Clave de IA con `safeStorage` de Electron (DPAPI) en `clave.bin`, fuera de copias y exportaciones. Descartados: `@napi-rs/keyring` (plan B), `keytar` (archivado), guardarla en la base.
- Cinco procesos: principal, puente, ventana y dos procesos de trabajo (`materials-worker`, `voice-worker`) con `utilityProcess`, más un supervisor con tiempo límite por tarea. Descartado: un solo proceso de trabajo (un cuelgue de voz frenaría una importación).
- Contrato del puente en `src/preload/contract/` con un esquema Zod de petición y de respuesta por canal; la API de la ventana se genera desde el contrato. Descartado: escribir la lista a mano en el puente.
- Capas vigiladas por dependency-cruiser (12 reglas), knip, Biome y `tsc`; CA-006 se prueba saboteando una importación.
- Red de pruebas en diez capas (U, P, I, C, R, E, N, S, D, M); Vitest 5, fast-check, Testing Library con jsdom, Playwright para la punta a punta en la variante de prueba, WebdriverIO 9.32 con `@wdio/electron-service` 10.4 para el programa instalado y la versión real. Descartados: happy-dom (le faltan APIs para el editor), capturas de píxeles, llamadas reales a la IA en la red.
- Stryker 10 corre en una orden propia (`npm run verificar:mutaciones`) en modo incremental, no dentro de `verificar:todo`, para respetar los 15 minutos. Las cinco órdenes del `CLAUDE.md` no cambian.
- Topes de rendimiento medidos en esta PC (la de referencia); en el CI se comparan con un tope tres veces mayor, dicho desde ahora.
- secretlint en el gancho de commit y en `verificar` (sin binario externo). Descartado: gitleaks (plan B).
- Opengrep 1.30.2 con ejecutable nativo de Windows, bajado por `tools/preparar` y verificado con la huella SHA-256 anotada en `docs/versiones.md`. Descartado: Semgrep (sin Windows nativo).
- CI en GitHub Actions `windows-latest`: `verificar` en cada push, `verificar:todo` más el instalador en cada pull request, artefactos guardados dos días; si se agotan los minutos gratis, la red completa corre en esta PC hasta el mes siguiente (tu decisión). Descartados: pagar el excedente, hacer público el repositorio.
- Actualizaciones desde el repositorio público `retenia-releases` sin credenciales en el programa (tu decisión); `autoDownload: false`; copia «Antes de actualizar». Descartados: hacer público el código, actualización manual.
- Avisos de Windows con botones «Empezar» y «Posponer» por `Notification` y `handleActivation`; bandeja del sistema opcional. Plan B: aviso sin botones.
- Carpeta de datos en `%APPDATA%\Retenia` con originales e imágenes por huella, copias como instantáneas `VACUUM INTO` más blobs compartidos, modelos por instalación. Descartado: compartir los modelos entre las dos variantes (acopla lo que CA-365 pide separado).
- El contenido del curso de inglés viaja en `resources/curso-ingles.db`, de solo lectura, separado de tus datos; tus marcas sobre él van a tu base.
- Modo demostración como variante de compilación (`RETENIA_VARIANTE=prueba`) con el código en `main/demo` y `renderer/demo`; cinco garantías de que no existe en la versión real. Descartado: un interruptor en tiempo de ejecución.
- Registro propio de 60 líneas sin contenido del usuario. Descartado: electron-log.
- Sin biblioteca de fechas (`Intl` con Buenos Aires, que no cambia de horario), sin enrutador ni gestor de estado, CSS modules con variables de diseño, íconos lucide-react. Descartado: Tailwind.
- Dependencias se actualizan solo en las ventanas de las Fases 02, 13, 24, 35 y 40.
- Cuatro pruebas descartables fuera del repositorio dieron bien el 13/10/2026 (Electron + better-sqlite3 + trigram; Playwright + Electron; sherpa-onnx en un `utilityProcess`; Opengrep en Windows); los resultados están en `docs/versiones.md` y la carpeta temporal se borró.
