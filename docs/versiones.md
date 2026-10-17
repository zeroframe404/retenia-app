# Versiones verificadas

Fecha de verificación: **13/10/2026**. Fuentes: el registro de npm (`npm view`), las releases y el código fuente en GitHub y la documentación oficial de cada proyecto, más cuatro pruebas descartables hechas en esta PC fuera del repositorio. La Fase 02 instaló, con estas versiones exactas y el lockfile en el repositorio, solo lo que usa: Electron, electron-vite, Vite, el complemento de React, TypeScript, swc, React, Zod, Vitest con su cobertura, fast-check, Playwright, axe-core, Biome, dependency-cruiser, knip, lefthook, secretlint, los tipos de Node y de React, y Opengrep. La Fase 03 sumó, también con la versión exacta de esta tabla: better-sqlite3 con sus tipos, drizzle-orm y drizzle-kit, ts-fsrs, electron-builder, @electron/fuses y @electron/asar (estos tres para armar el instalador y leer el paquete), y para las pruebas de pantallas jsdom, Testing Library (react y dom) y user-event. La Fase 05 sumó, con la versión de esta tabla: sherpa-onnx-node (con sherpa-onnx-win-x64), pdfjs-dist, tesseract.js, tesseract.js-core y los datos de idioma `@tesseract.js-data/eng` y `@tesseract.js-data/spa` (fila nueva). Cada pieza restante entra en su fase con la versión de esta tabla.

## Regla para fijar versiones

1. Se toma la versión que npm marca como `latest` al 13/10/2026, exacta (sin `^` ni `~`).
2. Excepciones, todas anotadas en la tabla: incompatibilidad comprobada (Vite 7.3.7 porque electron-vite 5 no acepta Vite 8; KaTeX 0.18.11 porque TipTap no acepta 0.19; `@vitejs/plugin-react` 5.2.0 porque toda la línea 6 pide Vite 8); versión mayor con menos de cuatro semanas (WebdriverIO 9.32.0 en lugar de 10.0.2); versión publicada el mismo día de la verificación (TipTap 3.31.4, lefthook 2.2.1, user-event 14.6.7, lucide-react 1.55.0); línea mantenida por delante de la etiqueta `latest` (electron-builder 26.17.0 y electron-updater 6.8.10, etiqueta `v26`).
3. Electron lleva siempre el último parche de su versión mayor, porque cada parche trae correcciones de seguridad de Chromium.
4. Un paquete entra solo si existe en npm, es el oficial de su proyecto, tiene actividad en los últimos doce meses y su licencia permite usarlo en un programa de uso personal sin publicar el código.

## Ventanas de actualización

Las dependencias se actualizan solo al empezar las Fases **02, 13, 24, 35 y 40**. En cada ventana: red completa en verde antes, actualizar con la misma regla de arriba, red completa en verde después, y una línea en `docs/decisiones.md` por cada cambio de versión mayor. Fuera de las ventanas, solo parches de seguridad de Electron y arreglos que bloqueen una fase.

## Tabla

| Pieza | Versión exacta | Verificado | Licencia | Por qué esta y no otra |
|---|---|---|---|---|
| **Aplicación** | | | | |
| electron | 44.7.0 | 13/10/2026 | MIT | Último parche del mayor estable más nuevo (Node 24.21.0, Chromium 152, ABI 149); Electron mantiene los tres últimos mayores (42, 43, 44). La 45 está en beta. |
| electron-vite | 5.0.0 | 13/10/2026 | MIT | Única versión estable; arma principal, puente, ventana y procesos de trabajo con una sola configuración. La 6.0 (Vite 8) está en beta 8. |
| vite | 7.3.7 | 13/10/2026 | MIT | Última de la línea 7, la más alta que acepta electron-vite 5; Vite 8 espera a electron-vite 6. |
| @vitejs/plugin-react | 5.2.0 | 13/10/2026 | MIT | La más alta que acepta Vite 7. La 6.1.2 (`latest`) declara que pide Vite 8: lo descubrió la instalación de la Fase 02. |
| typescript | 7.0.2 | 13/10/2026 | Apache-2.0 | `latest`, compilador nativo mucho más rápido para `tsc --noEmit`; no trae API de compilador, pero ninguna herramienta elegida la necesita. Plan B: 6.0.3. |
| @swc/core | 1.16.18 | 13/10/2026 | Apache-2.0 | Lo pide electron-vite y lo usa dependency-cruiser para leer TypeScript sin la API de tsc. |
| react, react-dom | 19.3.0 | 13/10/2026 | MIT | `latest`; la biblioteca de interfaz que piden TipTap y Testing Library; sin cambios mayores pendientes. |
| lucide-react | 1.55.0 | 13/10/2026 | ISC | Íconos sobrios, sin dependencias; la 1.56.0 salió hoy. |
| electron-builder | 26.17.0 | 13/10/2026 | MIT | Última de la línea 26 (etiqueta `v26`); trae el destino NSIS, `electronFuses`, `asarUnpack` y `extraResources`. La 27 está en alfa; la etiqueta `latest` quedó en 26.15.3. |
| electron-updater | 6.8.10 | 13/10/2026 | MIT | Pareja de electron-builder 26.17.0; proveedor GitHub sin credenciales con releases públicas; comprueba la huella sha512 y borra lo que no coincide. |
| @electron/fuses | 2.1.3 | 13/10/2026 | MIT | La trae electron-builder; nombra los nueve fuses que se fijan por variante. |
| **Datos** | | | | |
| better-sqlite3 | 13.0.3 | 13/10/2026 | MIT | SQLite 3.53.4 con FTS5 compilado; desde la 13.0.0 es Node-API con binarios dentro del paquete: no se recompila para Electron. Comprobado en esta PC. |
| @types/better-sqlite3 | 9.6.0 | 13/10/2026 | MIT | Tipos de TypeScript para better-sqlite3, actualizados el 04/10/2026; el paquete no trae los suyos. |
| drizzle-orm | 0.45.4 | 13/10/2026 | Apache-2.0 | Consultas tipadas y migraciones SQL legibles sobre better-sqlite3; la 1.0 está en rc. |
| drizzle-kit | 0.31.11 | 13/10/2026 | MIT | Genera las migraciones comparando esquemas, sin conexión a la base. |
| ts-fsrs | 5.4.2 | 13/10/2026 | MIT | FSRS-6 con 21 parámetros. Medido el 14/10/2026: con `enable_short_term: false` una tarjeta nueva con «La sabía» vuelve a los 3 días (fuerza intervalos crecientes entre los botones); con `enable_short_term: true` y `learning_steps` y `relearning_steps` vacíos vuelve a los 2 días, y «Con dudas» y «No la sabía» a 1, que es lo que fijan CA-010 y CA-058. Con retención 0,85 da 4 días. Se usa la segunda configuración. |
| @electron/asar | 4.3.1 | 14/10/2026 | MIT | Oficial del proyecto Electron; solo en pruebas: lee `app.asar` del paquete real para comprobar CA-013. Última publicada el 26/09/2026. |
| zod | 4.6.7 | 13/10/2026 | MIT | Valida cada mensaje del puente y cada evento; genera los esquemas JSON que exige la IA. |
| UUID versión 7 | `crypto.randomUUIDv7()` de Node 24.21 | 13/10/2026 | — | Viene con Electron 44: sin dependencia. Plan B: paquete `uuid` 14.0.3 (MIT). |
| **Contenido y materiales** | | | | |
| @tiptap/core, @tiptap/pm, @tiptap/react, @tiptap/starter-kit, @tiptap/extension-image, @tiptap/extension-mathematics, @tiptap/extension-mention, @tiptap/suggestion | 3.31.4 | 13/10/2026 | MIT | Editor por bloques con React 19, imágenes, fórmulas (KaTeX) y menciones con disparador propio (`[[`); todos de código abierto. La 3.32.0 salió hoy. |
| katex | 0.18.11 | 13/10/2026 | MIT | Render de fórmulas sin ejecutar nada, con fuentes dentro del paquete; la 0.19.0 queda fuera del rango que acepta TipTap. |
| pdfjs-dist | 6.4.299 | 13/10/2026 | Apache-2.0 | Texto y render de PDF; la 6.x eliminó el último uso de `eval` (ya no tiene la opción `isEvalSupported`; una prueba busca `eval` y `new Function` en su código) y su API nunca ejecuta el JavaScript de un PDF. En Node, compilación `legacy`; dentro de un `utilityProcess` hay que indicarle su hilo de trabajo (Fase 05). Trae `@napi-rs/canvas` como opcional: no se usa y no viaja en el instalador. |
| tesseract.js, tesseract.js-core | 7.0.0 | 13/10/2026 | Apache-2.0 | Reconocimiento de escaneos en WebAssembly, sin internet con datos locales; hilos de trabajo en Node. Comprobado en la Fase 05: en Node carga siempre el núcleo completo (un error de la 7.0.0), así que viaja ese; su script de instalación (un aviso de donaciones) queda denegado. |
| @tesseract.js-data/eng, @tesseract.js-data/spa | 1.0.0 | 17/10/2026 | MIT | Los datos de inglés y español que tesseract.js usa por defecto (versión entera comprimida, 2,9 y 2,1 MB), del mismo proyecto (naptha/tessdata). Publicados en 2023: son datos que no cambian. Van en el instalador (tu pedido de la Fase 05), no en la descarga única. |
| mammoth | 1.13.0 | 13/10/2026 | BSD-2-Clause | Word a texto con títulos, activo. |
| @mozilla/readability | 0.6.0 | 13/10/2026 | Apache-2.0 | Extrae el texto principal de una página web; es el de Firefox. |
| jsdom | 30.1.2 | 13/10/2026 | MIT | DOM en Node para readability y DOMPurify; también entorno de las pruebas de componentes. |
| dompurify | 3.4.17 | 13/10/2026 | MPL-2.0 o Apache-2.0 | Sanea el HTML de las instantáneas web; documentado con jsdom. |
| yauzl | 3.4.0 | 13/10/2026 | MIT | Lee comprimidos por partes y rechaza nombres con `..`, rutas absolutas y barras invertidas. |
| yazl | 3.3.1 | 13/10/2026 | MIT | Escribe comprimidos por partes (exportaciones y copias). |
| **Voz** | | | | |
| sherpa-onnx-node, sherpa-onnx-win-x64 | 1.13.8 | 13/10/2026 | Apache-2.0 | Voz y transcripción sin internet con modelos abiertos; complemento Node-API. Comprobado en esta PC dentro de un proceso de trabajo de Electron, empaquetado e instalado (Fase 05): las DLL viajan fuera del asar y se encuentran solas. Abre sus archivos con rutas de 8 bits: Retenia le pasa rutas relativas a la carpeta de modelos (una carpeta con «í» lo tumbaba). |
| **IA** | | | | |
| @anthropic-ai/sdk | 0.133.0 | 13/10/2026 | MIT | `latest`; salidas con esquema definitivas, caché de prompts, API de modelos. |
| claude-opus-5-5 | identificador vigente | 13/10/2026 | — | Tu decisión para corregir, tutor, escritura y conversación. USD 4 por millón de tokens de entrada y 20 de salida; retiro no antes del 22/09/2027. |
| claude-haiku-5-5 | identificador vigente | 13/10/2026 | — | Tareas en volumen (candidatas, explicar fragmentos). USD 0,10 / 0,50; retiro no antes del 07/10/2027. |
| claude-sonnet-5-5 | identificador vigente | 13/10/2026 | — | Solo la validación triple del curso de inglés (Fase 31). USD 2 / 10; retiro no antes del 28/09/2027. |
| **Pruebas** | | | | |
| vitest, @vitest/coverage-v8 | 5.0.4 | 13/10/2026 | MIT | `latest`; mayor 5 desde el 03/09/2026; corre con Vite 7. |
| fast-check | 4.10.2 | 13/10/2026 | MIT | Pruebas de propiedades con semilla reproducible. |
| @testing-library/react | 16.3.3 | 13/10/2026 | MIT | Pruebas de componentes por rol y texto; React 19. |
| @testing-library/dom | 10.4.2 | 14/10/2026 | MIT | Lo pide @testing-library/react como dependencia par y lo pide user-event; versión `latest`. |
| @testing-library/user-event | 14.6.7 | 13/10/2026 | MIT | Teclado y mouse realistas; la 14.6.8 salió hoy. |
| @testing-library/jest-dom | 7.0.1 | 13/10/2026 | MIT | Aserciones sobre el DOM. |
| axe-core | 4.14.0 | 13/10/2026 | MPL-2.0 | Revisión automática de accesibilidad de la ventana (claro y oscuro) en `verificar:todo`; oficial de Deque, publicado desde 2015, solo en pruebas. Agregado en la Fase 02. |
| @playwright/test | 1.64.0 | 13/10/2026 | Apache-2.0 | Punta a punta en Electron por rol y texto; su soporte de Electron sigue marcado experimental y exige el fuse `EnableNodeCliInspectArguments` encendido. Comprobado en esta PC. |
| @wdio/cli, @wdio/local-runner, @wdio/mocha-framework, webdriverio | 9.32.0 | 13/10/2026 | MIT | Prueba el programa instalado y la versión real endurecida; la 10.0 salió el 05/10 (menos de cuatro semanas). |
| @wdio/electron-service | 10.4.0 | 13/10/2026 | MIT | Sucesor oficial de `wdio-electron-service` (obsoleto desde el 24/10/2025); maneja el ejecutable instalado por Chromedriver. |
| @stryker-mutator/core, @stryker-mutator/vitest-runner | 10.0.0 | 13/10/2026 | Apache-2.0 | Mide qué roturas detecta la red (CA-331); corre en Windows en su propio CI; modo incremental. |
| **Calidad y seguridad** | | | | |
| @biomejs/biome | 2.5.15 | 13/10/2026 | MIT o Apache-2.0 | Formato y lint en una sola herramienta nativa. |
| dependency-cruiser | 18.6.0 | 13/10/2026 | MIT | Vigila la regla de capas con reglas por carpeta y por paquete; lee TypeScript con swc. |
| knip | 6.41.0 | 13/10/2026 | ISC | Código, exportaciones y dependencias sin uso; no necesita la API de tsc. |
| lefthook | 2.2.1 | 13/10/2026 | MIT | Ganchos de git rápidos, binario Go con paquete para Windows; la 2.2.2 salió hoy. |
| secretlint, @secretlint/secretlint-rule-preset-recommend | 13.0.7 | 13/10/2026 | MIT | Escáner de secretos en el gancho de commit y en `verificar`, sin binario externo. Plan B: gitleaks 8.30.1. |
| Opengrep | 1.30.2 (`opengrep_windows_x86.exe`) | 13/10/2026 | LGPL-2.1 | Reglas de seguridad sobre el código con ejecutable nativo de Windows; se baja a `tools/bin/` y se verifica con la huella de abajo. Comprobado en esta PC. |
| **Tipos** | | | | |
| @types/node | 24.19.2 | 13/10/2026 | MIT | Node 24, el de Electron 44. |
| @types/react, @types/react-dom | 19.3.0 | 13/10/2026 | MIT | Tipos de React 19.3, misma versión que la biblioteca; los pide TipTap React. |

Huella SHA-256 del ejecutable `opengrep_windows_x86.exe` de la release v1.30.2 (53.366.784 bytes), calculada en esta PC el 13/10/2026: `523b1074a81006436fec457e2daccf7cf7cacc04000d4482f1072a1b19bc6372`. La release trae firma sigstore (`.sig` y `.cert`), no un archivo de sumas; la huella de arriba es la que fija `tools/preparar`.

## Acciones de GitHub del CI

Fijadas por la huella del commit de su versión (verificadas el 13/10/2026 con la API de GitHub); todas sus versiones mayores tienen más de cuatro semanas.

| Acción | Versión | Huella |
|---|---|---|
| actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| actions/setup-node | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| actions/cache | v6.1.0 | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` |
| actions/upload-artifact | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |

## Modelos y datos que se descargan una sola vez

No son paquetes npm. Elegidos en la Fase 05 midiendo en esta PC (`docs/laboratorio.md`). Retenia los baja una sola vez de los repositorios oficiales del proyecto sherpa-onnx en Hugging Face, cada archivo fijado por su revisión y aceptado solo si su tamaño y su huella SHA-256 coinciden con el manifiesto de este repositorio (`src/main/voice-models/manifest.ts`); solo los archivos que se usan. En la Fase 05 se bajan desde el Laboratorio; desde la Fase 28, también desde Ajustes › «Voz». El repositorio propio `retenia-releases` que estaba previsto todavía no existe (ver `docs/decisiones.md`, Fase 05).

| Modelo | Elegido | Tamaño | Licencia | Para qué |
|---|---|---|---|---|
| Voz en inglés (Kokoro 82M, vía sherpa-onnx) | `csukuangfj/kokoro-int8-multi-lang-v1_0`, revisión `2a360693d79b88b49b88e29aec2b53577f41f206`: modelo, voces, símbolos, los dos léxicos en inglés, lo que usa el inglés de espeak-ng y la licencia (14 archivos) | 148 MB | Apache-2.0 | «Decir en voz alta», 28 voces en inglés; el Laboratorio usa cuatro (CA-305 pide al menos 4). Descartadas: la `en-v0_19` (ya no está en Hugging Face con esa forma) y la v1_1 (3 voces en inglés, todas femeninas). |
| Transcripción (Whisper multilingüe, vía sherpa-onnx) | `csukuangfj/sherpa-onnx-whisper-small`, revisión `8f3c18b358db4d1f2fc1eae49d75cd20989e4309`: codificador y decodificador int8 y los símbolos (3 archivos) | 358 MB | MIT | «Entendí: …», «Mantener para hablar», transcribir audios propios. Elegido sobre tiny (98 MB) y base (152 MB): fue el único que entendió bien cuatro frases con ruido, y tarda medio segundo por frase. Solo hasta 30 s por pasada. |
| Detector de voz (Silero VAD, vía sherpa-onnx) | todavía no: llega con CA-288 (Fase 30), para cortar audios largos | del orden de 2 MB | MIT | Cortar audios largos en frases para Whisper. |
| Plan B de transcripción | Moonshine base en (cuantizado 2026-02-27) | 111 MB | MIT | No hizo falta: Whisper small entra en tiempo y en tamaño. |

Total: 506 MB (531 millones de bytes), dentro de los 300 a 600 MB que fija `no-funcionales.md`. Los datos de reconocimiento de escaneos ya no están en esta lista: viajan en el instalador (`@tesseract.js-data`, fila de arriba).

## Comprobado en esta PC (13/10/2026)

Cuatro pruebas descartables en una carpeta temporal fuera del repositorio, borrada al terminar la fase:

1. **Electron 44.7.0 + better-sqlite3 13.0.3.** Desde el proceso principal: SQLite 3.53.4, FTS5 compilado, tabla con `tokenize = 'trigram remove_diacritics 1'`. «desvio» encuentra «¿Qué mide el **desvío** estándar?», «DESVÍO» también, «varian» encuentra «varianza», «sqrt(n» encuentra «s / sqrt(n)», `highlight()` resalta. Node-API versión 10, ABI 149, sin recompilar nada.
2. **Playwright 1.64.0 + Electron 44.7.0.** `_electron.launch` abrió la ventana en 773 ms, leyó el título y un encabezado por rol, y evaluó código en el proceso principal.
3. **sherpa-onnx-node 1.13.8 dentro de un `utilityProcess` de Electron 44.7.0.** Con el modelo de prueba Piper `en_US-amy-low` int8 (20 MB): modelo cargado en 941 ms, frase «The weather is nice today» generada en 833 ms (1,86 s de audio a 16 kHz, archivo WAV de 59 KB), con `enableExternalBuffer: false`. Las DLL se encontraron solas, sin tocar el PATH. Queda por comprobar en la Fase 05 lo mismo dentro del programa empaquetado (asar) y con Kokoro y Whisper.
4. **Opengrep 1.30.2.** Ejecutable nativo de Windows: `--version` responde 1.30.2 y un escaneo con dos reglas propias sobre un archivo de muestra encontró las dos faltas esperadas (`eval` y `nodeIntegration: true`). En el CI se corre con `--error` para que las faltas den rojo.

## Lo que no se pudo verificar: riesgo y plan B

| Qué | Por qué no | Plan B | Dónde se resuelve |
|---|---|---|---|
| Monto mínimo de carga de crédito en la consola de Anthropic | No está publicado en la documentación ni en el soporte; solo se ve en el formulario de compra. | La página para humanos dice «crédito prepago» sin monto; lo anotás vos al cargarlo. | Fase 19 |
| Si GitHub sigue contando doble los minutos de Windows | La documentación quitó la tabla de multiplicadores; las facturas que reportan los usuarios siguen mostrando el doble. | Se presupuesta como doble (unos 1.000 minutos de Windows por mes); si se agotan, la red completa corre en tu PC. | Fase 02 |
| Que una actualización bajada por Retenia no dispare el aviso de Windows | Es un razonamiento sobre la marca de origen de los archivos (la escriben los navegadores, no Node), sin prueba empírica. | Se comprueba a mano en la Fase 40; si aparece, la Ayuda lo explica. | Fase 40 |
| Velocidad de Kokoro y Whisper en una PC de escritorio | Solo hay cifras oficiales para Raspberry Pi. En esta PC el modelo chico de prueba generó 1,86 s de audio en 0,8 s. | Se mide en la Fase 05; si Kokoro tarda más de 2 s por frase, se usa la variante más chica o Piper. | Fase 05 |
| sherpa-onnx dentro del programa empaquetado | Hay reportes abiertos de «Could not find sherpa-onnx-node» en programas empaquetados; la prueba de hoy corrió sin empaquetar. | `asarUnpack` de sus dos paquetes y carga por ruta absoluta; si falla, ejecutables de sherpa-onnx como proceso aparte. | Fase 05 |
| Tamaño exacto de la variante int8 de Whisper | Los paquetes traen fp32 e int8 juntos. | Se mide al reempaquetar en la Fase 05. | Fase 05 |
| Disparador `[[` en las menciones de TipTap | Funciona por construcción (el disparador se escapa en una expresión regular) pero no está documentado. | Si no anda, un disparador de un carácter (`[`) con filtro propio. | Fase 07 |

## Herramientas de esta PC (desarrollo)

Windows 11 Pro, Ryzen 7 9700X, 31 GB de RAM. Node 24.21.0 (la misma versión que lleva Electron 44), npm 11.19.0, git 2.55.0, Python 3.14.7, Visual Studio Build Tools 2026 (plan B para compilar módulos nativos; hoy no hace falta). El CI usa `windows-latest` de GitHub Actions.
