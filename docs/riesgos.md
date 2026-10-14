# Riesgos y plan B

Las piezas que más pueden fallar, qué se hace si fallan y en qué fase se comprueba cada una. Un riesgo se cierra cuando la fase que lo comprueba termina en verde; si falla, se aplica el plan B y se anota en `docs/decisiones.md`.

| # | Riesgo | Plan B en una línea | Se comprueba en |
|---|---|---|---|
| 1 | Punta a punta en Windows con Playwright + Electron | WebdriverIO también para la punta a punta | Fases 02 y 03 |
| 2 | Voz y transcripción dentro del instalador | kokoro-js y transformers con Whisper, o ejecutables de sherpa-onnx aparte | Fase 05 |
| 3 | Reconocimiento de escaneos sin internet | tesseract.js en una ventana oculta; solo páginas «No extraído» | Fases 05 y 14 |
| 4 | Tamaño del instalador | Tope de 150 MB; sherpa-onnx pasa a la descarga única | Fase 03 |
| 5 | Costo de la IA | Tabla de precios versionada, tope local por tokens, caché, modelo chico en volumen | Fases 19 y 22 |
| 6 | Actualización sin credenciales | «Hay una versión nueva» abre la página de descarga | Fase 40 |
| 7 | Botones en los avisos de Windows | Aviso sin botones que abre Estudiar con la sesión iniciada | Fases 05 y 26 |
| 8 | Formatos de Anki y RemNote | Exportación compatible con versiones anteriores de Anki; Markdown de RemNote | Fase 15 |
| 9 | Licencias de los datos del curso de inglés | Solo CC0, CC-BY o Apache; menos textos antes que una licencia dudosa | Fases 28 y 30 |
| 10 | Minutos de GitHub Actions | Red completa en tu PC hasta el mes siguiente | Fase 02 |
| 11 | Compilador TypeScript 7 nuevo | TypeScript 6.0.3 | Fase 02 |

## 1. Punta a punta en Windows con Playwright + Electron

- **Qué puede salir mal.** Playwright sigue marcando su soporte de Electron como experimental. Cada versión mayor de Electron puede romper el arranque de las pruebas; el fuse `EnableNodeCliInspectArguments` tiene que seguir encendido en la variante de prueba; las máquinas del CI son más lentas y con otra resolución.
- **Cómo nos damos cuenta.** La primera prueba de punta a punta (Fase 02) y el instalador (Fase 03) se corren en esta PC y en el CI. Un arranque que falla intermitentemente se detecta con las 20 corridas seguidas (CA-333).
- **Plan B.** WebdriverIO con `@wdio/electron-service` también para la punta a punta, con la misma estrategia de selectores por rol y texto, así las pruebas se portan sin reescribir la intención. Está elegido de todas formas para probar el programa instalado y la versión real.
- **Estado hoy.** Comprobado en esta PC el 13/10/2026: Playwright 1.64.0 lanza Electron 44.7.0 y lee la ventana en menos de un segundo. El 14/10/2026 (Fase 03) también abre el programa empaquetado y el instalado (instalado en silencio y desinstalado, 5 pasos en 11 segundos), así que para la variante de prueba no hace falta el plan B; WebdriverIO queda para la versión real endurecida (Fase 36).
- **Se comprueba en** la Fase 02 (primera prueba E) y la Fase 03 (programa instalado).

## 2. Voz y transcripción dentro del instalador

- **Qué puede salir mal.** sherpa-onnx-node es un complemento nativo con DLL de 25 MB; hay reportes abiertos de «Could not find sherpa-onnx-node» cuando el programa está empaquetado en asar; en Electron hay que pasar `enableExternalBuffer: false` en todas las llamadas; los modelos pesan entre 300 y 600 MB y se cargan en un proceso de trabajo que además tiene que reiniciarse solo si se cuelga (CA-359). Whisper acepta como máximo 30 s por pasada.
- **Cómo nos damos cuenta.** El Laboratorio de la Fase 05 (CA-024 a CA-027) corre dentro del programa instalado, no en desarrollo. Los tiempos se miden ahí.
- **Plan B.** Para la voz, `kokoro-js` (Apache-2.0, corre sobre onnxruntime en Node, sin internet); para transcribir, Whisper vía `@huggingface/transformers`; o invocar los ejecutables oficiales de sherpa-onnx como proceso aparte, hablando por archivos. Ninguna de las tres cambia la pantalla ni los criterios.
- **Estado hoy.** Comprobado en esta PC el 13/10/2026 dentro de un `utilityProcess` de Electron 44 sin empaquetar: modelo cargado en 941 ms, frase generada en 833 ms, DLL encontradas solas. Falta lo mismo empaquetado y con Kokoro y Whisper.
- **Se comprueba en** la Fase 05.

## 3. Reconocimiento de escaneos sin internet

- **Qué puede salir mal.** tesseract.js carga un núcleo WebAssembly de 45 MB y los datos de idioma desde rutas que dentro del asar no existen; un PDF escaneado de 300 páginas puede llevar decenas de minutos; el reconocimiento consume CPU y puede trabar el proceso de trabajo.
- **Cómo nos damos cuenta.** CA-029 (Fase 05) sobre el programa instalado y CA-114 y CA-347 (Fases 14 y 38) con el PDF de 300 páginas.
- **Plan B.** Correr tesseract.js en una ventana oculta de Electron (modo navegador, que es el más probado del proyecto) en vez de en Node; reconocer solo las páginas marcadas «No extraído» y una por vez, con avance visible; tope de tiempo por página con «Requiere revisión».
- **Se comprueba en** las Fases 05 y 14.

## 4. Tamaño del instalador

- **Qué puede salir mal.** Electron ocupa unos 100 MB instalado; sherpa-onnx suma 25 MB de DLL; pdf.js, KaTeX con sus fuentes, el núcleo de tesseract.js y el curso de inglés suman más. Un instalador de 200 MB hace lenta cada actualización y cada corrida del CI.
- **Cómo nos damos cuenta.** El CI mide el tamaño del instalador en cada pull request desde la Fase 03 y falla si supera 150 MB.
- **Plan B.** Mover sherpa-onnx (las DLL, no solo los modelos) a la descarga única; comprimir el instalador con LZMA (lo hace NSIS); dejar el núcleo de tesseract.js fuera del asar pero dentro del instalador, que es más chico que descargarlo.
- **Estado hoy.** El instalador de «Retenia (prueba)» pesa unos 116 MB (14/10/2026), con Electron, la base de datos y las pantallas; el CI lo mide y falla si pasa de 150 MB. Falta lo que traen las fases siguientes (sherpa-onnx, pdf.js, KaTeX, el curso de inglés).
- **Se comprueba en** la Fase 03 (y en cada pull request después).

## 5. Costo de la IA

- **Qué puede salir mal.** Los precios cambian; la estimación de uso se queda corta; Opus 5.5 razona siempre antes de responder y eso suma tokens de salida y segundos; un bucle de reintentos gasta sin que lo veas.
- **Cómo nos damos cuenta.** «Qué se envió» registra cada envío con su costo calculado en la PC; el tope mensual frena al 100 % y avisa al 80 % (CA-169); la Fase 22 compara el costo calculado con la factura real de la consola de Anthropic.
- **Plan B.** La tabla de precios vive en el repositorio con fecha y se actualiza en las ventanas de actualización; el costo se calcula con los campos `usage` reales de cada respuesta; los reintentos tienen tope (3) y los pedidos en volumen van a Haiku 5.5; si Opus 5.5 resulta lento o caro para corregir, cambiar las rúbricas a Sonnet 5.5 es un cambio de una línea en la configuración de modelos por tarea.
- **Estado hoy.** Precios verificados el 13/10/2026. Estimación de uso típico con tu elección: USD 3 a 6 por mes.
- **Se comprueba en** las Fases 19 (contador y tope con respuestas grabadas) y 22 (gasto real con tu clave y un tope chico).

## 6. Actualización sin credenciales

- **Qué puede salir mal.** El código está en un repositorio privado y electron-updater necesita un token para leer releases privadas. Resuelto con el repositorio público `retenia-releases` solo de instaladores y modelos (tu decisión del 13/10/2026). Queda el riesgo de que el repositorio público se desincronice del privado o de que GitHub cambie sus releases; electron-updater 7 (hoy en alfa) va a cambiar la instalación al salir y a exigir metadatos firmados.
- **Cómo nos damos cuenta.** CA-362 y CA-363 (Fase 40) con un servidor local que sirve `latest.yml`; una prueba del CI publica una versión de prueba en `retenia-releases` y la baja.
- **Plan B.** «Hay una versión nueva» abre la página de descarga en el navegador; la huella se comprueba a mano con la publicada. La actualización a electron-updater 7 se hace en una ventana de actualización, nunca antes de la Fase 40.
- **Se comprueba en** la Fase 40.

## 7. Botones en los avisos de Windows

- **Qué puede salir mal.** Los botones «Empezar» y «Posponer» del aviso (CA-238, CA-239) dependen de que el acceso del menú Inicio lleve el identificador de aplicación correcto, de `Notification.handleActivation` (que Electron documenta para Windows) y de que Retenia quede en la bandeja del sistema. Si alguno falla, el aviso sale sin botones o el toque no llega.
- **Cómo nos damos cuenta.** CA-030 (Fase 05) prueba el aviso básico y el toque; CA-238 a CA-246 (Fase 26) los botones.
- **Plan B.** Aviso sin botones: tocarlo abre Estudiar con la sesión ya iniciada; «Posponer» se hace desde Estudiar. Cumple el espíritu de H-53 con un paso más.
- **Se comprueba en** las Fases 05 y 26.

## 8. Formatos de Anki y RemNote

- **Qué puede salir mal.** Anki 26.09 exporta `collection.anki21b` comprimido con zstd y la lista de medios en protobuf; el zstd de Node 24 está marcado experimental y el protobuf exige un lector mínimo propio. RemNote exporta en un formato poco documentado y no está confirmado que traiga el historial.
- **Cómo nos damos cuenta.** CA-122 a CA-125 (Fase 15) con `mazo-demo.apkg` y `remnote-demo.zip`.
- **Plan B.** Pedir, en la Ayuda y en la vista previa, la exportación de Anki con «Support older Anki versions» (produce `collection.anki21` con medios en JSON, que se lee sin zstd ni protobuf) y la exportación Markdown de RemNote; si RemNote no trae historial, las tarjetas entran como nuevas y la vista previa lo dice (ya previsto en H-29).
- **Se comprueba en** la Fase 15.

## 9. Licencias de los datos del curso de inglés

- **Qué puede salir mal.** La base de 9.000 palabras con frecuencia, pronunciación y ejemplos, los textos por nivel y los audios dependen de fuentes abiertas cuyas licencias hay que verificar una por una; una fuente con licencia no comercial o sin atribución clara no puede entrar. Las listas Oxford y el English Vocabulary Profile están prohibidas por CA-263.
- **Cómo nos damos cuenta.** CA-263 y CA-284 exigen que cada fuente figure con su licencia; una prueba estática falla si una fuente no tiene licencia anotada.
- **Plan B.** Solo fuentes CC0, CC-BY o Apache-2.0; si para un nivel no alcanzan los textos, se redactan textos propios con la IA y se validan (como el temario), antes que usar una fuente dudosa.
- **Se comprueba en** las Fases 28 y 30.

## 10. Minutos de GitHub Actions

- **Qué puede salir mal.** El plan gratuito da 2.000 minutos por mes a los repositorios privados y Windows cuenta doble según las facturas que reportan los usuarios (la documentación ya no lo dice). Estimación: unos 130 minutos de Windows por fase; con 2 o 3 fases por mes alcanza, pero una fase con muchas corridas puede agotarlo. Los instaladores también consumen los 500 MB de almacenamiento de artefactos.
- **Cómo nos damos cuenta.** El tablero muestra los minutos usados en el mes (los lee de la API de GitHub); los artefactos se guardan dos días.
- **Plan B.** Tu decisión del 13/10/2026: si se agotan, la red completa y el instalador se corren en esta PC hasta el mes siguiente y el CI sigue corriendo `verificar`. No se paga excedente ni se hace público el repositorio.
- **Se comprueba en** la Fase 02 (primer CI).

## 11. Compilador TypeScript 7 nuevo

- **Qué puede salir mal.** TypeScript 7.0 es el compilador nativo nuevo y no trae API de compilador; una herramienta que la necesite, o una diferencia de comportamiento con alguna definición de tipos, puede frenar `verificar`.
- **Cómo nos damos cuenta.** `tsc --noEmit` en la Fase 02; knip y dependency-cruiser no usan la API (oxc y swc).
- **Plan B.** TypeScript 6.0.3, la última versión con API, con la misma configuración.
- **Se comprueba en** la Fase 02.
