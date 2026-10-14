# Cómo está armada Retenia, en una página

## Dónde están tus datos

Todo lo tuyo vive en tu PC, en una carpeta de tu cuenta de Windows: `C:\Users\<tu usuario>\AppData\Roaming\Retenia`. Adentro hay un archivo con todos tus apuntes, tarjetas, historial y ajustes; los archivos originales que agregaste (PDF, Word, audios) y las imágenes que pegaste, guardados tal cual; las copias de seguridad (una automática al abrir si la última tiene un día o más, se conservan las últimas 14 automáticas, más las que hagas vos con «Hacer copia ahora» y las «Antes de restaurar», que quedan hasta que las borres; cada una comprobada antes de aparecer en la lista); los modelos de voz y de reconocimiento que descargaste; y un registro técnico que no contiene tu contenido. La versión de prueba usa otra carpeta («Retenia (prueba)») y nunca ve la tuya.

Nada se borra sin pasar por la Papelera, donde queda 30 días; vaciarla antes pide confirmación. El historial solo se agrega: lo que estudiaste no se reescribe, y «Verificar datos» recalcula todo desde ahí y confirma que no hay diferencias. «Deshacer» y «Restaurar» desde la Papelera agregan al historial, nunca lo cambian; «Reparar desde el historial» solo recalcula cuándo vuelve cada tarjeta. Restaurar una copia vuelve todo a como estaba en esa copia, pero antes guarda el estado actual entero como «Antes de restaurar»: lo hecho después de esa copia no se pierde y se recupera restaurándola. «Exportar todo» te da un archivo comprimido con todo en formatos abiertos (apuntes en texto, tarjetas e historial legibles, originales e imágenes) que se puede volver a cargar en un Retenia vacío.

Lo único que no está a la vista en esa carpeta es tu clave de IA: va cifrada con la protección de datos de Windows, atada a tu cuenta, y no entra en copias, exportaciones, registros ni diagnósticos. Retenia no tiene cuentas, no manda nada a un servidor propio y no registra lo que hacés fuera de ella.

## Qué pasa sin internet

Todo funciona: estudiar, apuntes, tarjetas y repasos, materiales en PDF, Word y texto, búsqueda, progreso, el curso de inglés con su diccionario y sus lecciones, la voz y la transcripción (una vez que bajaste los modelos), el reconocimiento de escaneos y las copias.

Solo tres cosas necesitan conexión: la IA (opcional), bajar una página web para guardarla como material, y la descarga única de los modelos de voz y de reconocimiento (entre 300 y 450 MB, una sola vez, desde Ajustes › «Voz»; cada archivo se verifica antes de usarse). Lo que necesita conexión queda «Pendiente» y se completa solo cuando vuelve. «Buscar actualizaciones» también la necesita; sin conexión, no pasa nada.

## Qué hace la IA y qué no

Es opcional, usa tu propia clave de Anthropic y está apagada hasta que la configures en Ajustes › «Inteligencia artificial». Lo que hace: proponer tarjetas a partir de un material (vos decidís cuáles entran), corregir respuestas abiertas con una rúbrica mostrando en qué frase tuya se basa, hacer de tutor que te deja pensar, corregir tus textos en inglés y conversar en inglés.

Lo que nunca hace: marcar una tarjeta como verificada, mover un repaso, cambiar un estado de dominio ni escribir en tus apuntes por su cuenta. Todo lo que produce lleva una marca visible de que es una propuesta, y podés discrepar en un toque.

Qué sale de tu PC: solo los fragmentos del material que vos permitiste, tu respuesta y las instrucciones de la tarea. Nunca tu clave, tus copias ni tu historial completo. Cada envío queda anotado en «Qué se envió» con fecha, propósito, fragmento y costo. «Modo solo local» corta toda salida. El texto de un material o de una respuesta de la IA es dato: Retenia no ejecuta nada de lo que contiene.

## Cuánto cuesta por mes

USD 0 fijos. Retenia no cobra, el instalador y las actualizaciones se publican gratis en GitHub, los modelos de voz y de reconocimiento son gratuitos y de licencia abierta, y no hay servidor ni suscripción. Tampoco hay firma digital paga del instalador: Windows va a avisar la primera vez que lo abras.

El único gasto posible es la IA, y lo controlás vos. Cargás crédito prepago en tu cuenta de Anthropic (vence al año de comprado) y Retenia frena sola al llegar al tope mensual que elegís, con un aviso al 80 %. Tope por defecto: USD 20. Con el modelo que elegiste (Opus 5.5) y un uso típico de 22 sesiones por mes, el gasto estimado es de USD 3 a 6; con el ajuste más barato baja a centavos. Una sola vez, al construir el curso de inglés, se gastan unos USD 25 en validar sus ejercicios con la IA, y Retenia muestra el costo antes de arrancar.
