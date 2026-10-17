# Laboratorio de piezas riesgosas (Fase 05)

Las cinco piezas que más podían fallar, comprobadas dentro de Retenia antes de construir encima: voz, transcripción, lectura de PDF, reconocimiento de escaneos y avisos de Windows. Están en Ajustes › «Demostración» › «Laboratorio», solo en «Retenia (prueba)»: la versión de uso real no tiene el Laboratorio ni sus piezas.

Medido el 17/10/2026 en esta PC (Windows 11 Pro, Ryzen 7 9700X, 31 GB de RAM), dentro del programa empaquetado (`release/prueba/win-unpacked`, el mismo archivo que se instala) y también como lo abre `npm run iniciar`. «Primera vez» incluye cargar el modelo; después queda cargado mientras el Laboratorio se use (el proceso de trabajo se apaga a los 5 minutos sin pedidos).

## Resumen

| Pieza | Tiempo medido | Tamaño en disco | ¿Cumple? |
|---|---|---|---|
| Descargar modelos (CA-024) | 35 s desde internet (Hugging Face, 506 MB) · 1,4 s desde un servidor local | 506 MB en la carpeta de datos | Sí |
| Voz, «Decir en voz alta» (CA-025) | 1,8 s la primera frase; después 0,9 a 1,4 s por frase corta | 148 MB del modelo (en la descarga) + 23 MB de sherpa-onnx en el instalador | Sí (tope: 2 s por frase) |
| Transcripción, «Grabar» y «Detener» (CA-026, CA-027) | 1,1 a 1,2 s la primera vez; después 0,2 s para «good morning» | 358 MB del modelo (en la descarga) | Sí |
| PDF, «Leer PDF de prueba» (CA-028) | 0,1 s (texto y posiciones de la página 1) | 3,3 MB de pdf.js para el proceso de materiales + 2,1 MB de pdf.js en la ventana | Sí |
| Escaneo, «Leer página escaneada» (CA-029) | 0,7 a 0,8 s; el texto se parece al original en un 98,4 % | 17,4 MB en el instalador (núcleo 11 MB, programa 1,5 MB, español e inglés 4,9 MB) | Sí |
| Aviso, «Probar aviso» (CA-030) | 0,1 s hasta que Windows confirma que lo mostró | nada aparte | Sí (el toque lo comprobás vos) |

El instalador de «Retenia (prueba)» pasó de 116 MB a 131,6 MB (tope 150 MB); el de «Retenia» sigue en 116,1 MB, porque no lleva nada del Laboratorio. Ningún plan B de `docs/riesgos.md` hizo falta. Abajo, el detalle de cada pieza y lo que hubo que resolver en el camino.

## 1. Descarga única de los modelos

- **Qué hace.** Baja 17 archivos (14 de Kokoro y 3 de Whisper) de los repositorios oficiales del proyecto sherpa-onnx en Hugging Face, cada uno fijado por su revisión. Mientras llega, calcula la huella SHA-256; solo si el tamaño y la huella coinciden con el manifiesto del repositorio (`src/main/voice-models/manifest.ts`) lo mueve a la carpeta `modelos` de la carpeta de datos. Muestra la barra y el porcentaje, y termina en «Modelos listos».
- **Si algo sale mal.** Sin conexión (o con «Simular sin conexión»): «Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.». Una conexión cortada a mitad sigue desde donde quedó la próxima vez. Un archivo con otra huella se descarta y se avisa. Sin lugar en el disco no empieza.
- **Medido.** 35 s desde internet con tu conexión (`npm run iniciar`, carpeta de datos nueva); 1,4 s desde un servidor local con los mismos archivos (programa empaquetado).
- **Tamaño.** 506 MB (531 millones de bytes), dentro de los 300 a 600 MB de `no-funcionales.md`.

## 2. Voz: Kokoro

- **Elegido.** Kokoro 82M int8 multilingüe v1.0, solo lo que usa el inglés. Cuatro voces en el Laboratorio: mujer y hombre de Estados Unidos (af_heart, am_michael), mujer y hombre del Reino Unido (bf_emma, bm_george); el modelo trae 28 voces en inglés para la Fase 28.
- **Medido.** Dentro del programa empaquetado, «The weather is nice today»: 1,8 s la primera vez (con la carga), y 1,0, 0,9 y 1,1 s con las otras tres voces. Con `npm run iniciar`: 1,8 y 1,4 s. Cada frase dura entre 1,4 y 2,1 s de audio.
- **Sin internet.** El proceso de voz no usa la red: las pruebas de la capa «sin red» lo corren con la red bloqueada (`tests/sin-red/voz.test.ts`).
- **Lo que hubo que resolver.** sherpa-onnx abre sus archivos con rutas de 8 bits: con una carpeta con «í» (una cuenta de Windows como «Martín») no encontraba los modelos y el proceso se caía. Ahora el proceso de voz se para en la carpeta de modelos y le pasa rutas relativas. Prueba: `tests/sin-red/voz-cuenta.test.ts`.
- **Plan B (no hizo falta).** `kokoro-js` sobre onnxruntime, o los ejecutables de sherpa-onnx como proceso aparte (`docs/riesgos.md`, riesgo 2).

## 3. Transcripción: Whisper

- **Elegido.** Whisper multilingüe, tamaño small, int8 (tu pedido: multilingüe; el tamaño lo elegí midiendo). Comparé los tres tamaños con cuatro frases con ruido de fondo:

| Tamaño | Tamaño en disco | Cargar | Por frase | Frases bien entendidas |
|---|---|---|---|---|
| tiny | 98 MB | 0,8 s | 0,09 s | 3 de 4 |
| base | 153 MB | 0,8 s | 0,16 s | 2 de 4 |
| small (elegido) | 358 MB | 1,3 s | 0,48 s | 4 de 4 |

- **Medido en el Laboratorio.** «Grabar» dos segundos y «Detener»: 1,1 a 1,2 s la primera vez, 0,2 s después; entiende «good morning».
- **Micrófono.** El permiso se pide recién al tocar «Grabar». Si Windows lo bloquea: «Sin acceso al micrófono no podemos escucharte» y «Cómo habilitarlo» con los pasos. Una grabación dura como mucho 30 s. Con el micrófono de esta PC y nadie hablando, dice «No escuché nada. Probá de nuevo, más cerca del micrófono.».
- **Lo que hubo que resolver.** Whisper escribe «[BLANK_AUDIO]» cuando no oye voz: ya no se muestra como palabras. Grabar mientras sonaba la frase de «Decir en voz alta» mezclaba las voces (el cancelador de eco): ahora «Grabar» la calla.
- **Plan B (no hizo falta).** Moonshine base (111 MB) o Whisper con `@huggingface/transformers`.

## 4. PDF: pdf.js

- **Qué hace.** El proceso de materiales extrae el texto de la página 1 de «Inferencia — capítulos 1 a 4.pdf» con la caja de cada renglón; la ventana dibuja la página y resalta encima la frase «Una muestra es una parte de la población que se elige para observarla y sacar conclusiones sobre el todo.» (dos renglones).
- **Sin ejecutar nada.** pdf.js 6 no tiene cómo evaluar código (una prueba busca `eval` y `new Function` en su código y no hay); los formularios dinámicos están apagados. La ventana no sale a la red (`connect-src 'none'`).
- **Medido.** 0,1 s.
- **Lo que hubo que resolver.** Dentro del proceso de trabajo de Electron, pdf.js no se reconoce como Node: se le indica su hilo de trabajo.

## 5. Escaneo: tesseract.js

- **Qué hace.** Toma la imagen de la página 9 (un escaneo sin texto) y la reconoce con los datos de español e inglés que vienen **dentro del instalador**: no baja nada de internet al usarse (la prueba de la capa «sin red» bloquea la red también en los hilos de tesseract.js).
- **Medido.** 0,7 a 0,8 s en el programa empaquetado. El texto reconocido se parece al original en un 98,4 % (la prueba exige 90 % o más); se lee entero, con alguna marquita suelta como «- -» que sale de los puntitos del papel.
- **Lo que hubo que resolver.** tesseract.js 7.0.0 carga en Node siempre su núcleo completo, así que viaja ese; y empaquetado no llegan sus nombres sueltos, así que se usa su módulo entero.
- **Plan B (no hizo falta).** Correr tesseract.js en una ventana oculta (`docs/riesgos.md`, riesgo 3): los hilos de Node dentro del proceso de trabajo andan, empaquetados.

## 6. Aviso de Windows

- **Qué hace.** «Probar aviso» muestra la notificación de Windows con título «Retenia» y texto «Esto es una prueba»; el Laboratorio dice «Aviso enviado. Minimizá Retenia y tocalo: Retenia vuelve al frente.» recién cuando Windows confirma que la mostró. Tocarla trae Retenia al frente (instalado, el aviso sale con el nombre del programa).
- **Medido.** 0,1 s hasta la confirmación de Windows, también con `npm run iniciar`.
- **Lo que no puedo comprobar yo.** Tocar el aviso: lo comprueba tu prueba manual M05.8. La prueba de contrato comprueba que el toque llama a traer Retenia al frente.
- **Plan B (para la Fase 26).** Aviso sin botones que abre Estudiar (`docs/riesgos.md`, riesgo 7).

## 7. En el CI

El trabajo «Instaladores y humo del instalador» instala «Retenia (prueba)» en una Windows limpia y recorre el Laboratorio: baja los modelos de un servidor local que los sirve como la página real, dice una frase (comprueba que el audio dura más de un segundo, porque no hay parlantes), transcribe el audio de ejemplo con el micrófono de prueba de Chromium (no hay micrófono), lee el PDF y el escaneo y manda el aviso. El resultado del CI de este pull request está en `docs/ESTADO.md`.

## Cómo se repite

- Las pruebas: `npm run verificar` (capa «sin red» y las demás) y `npm run verificar:todo` (punta a punta sobre el programa empaquetado).
- A mano: Ajustes › «Demostración» › «Laboratorio», con las pruebas de `docs/pruebas-manuales/fase-05.md`.
- Los modelos de desarrollo: `node tools/preparar.mjs --modelos` (los baja una vez a `%LOCALAPPDATA%\Retenia-desarrollo\modelos`, verificados).
- Los archivos de ejemplo: `node tools/generar-datos-de-ejemplo.mjs`.
