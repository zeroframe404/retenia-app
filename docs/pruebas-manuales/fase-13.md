# Pruebas manuales · Fase 13 · Importar materiales: PDF, texto y Word

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`. Al abrir, los dos materiales del elenco («Inferencia — capítulos 1 a 4.pdf» y «Apunte 3.pdf») se leen solos en unos segundos: en Materiales los vas a ver pasar a «Listo».

Los archivos de ejemplo que nombran las pruebas están en la carpeta `datos-de-ejemplo` del proyecto (`H:\Retenia\datos-de-ejemplo`).

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen **letra por letra**. Los que no estaban en tu lista están en «Textos nuevos», al final, junto con lo que difiere de tu plan. Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-13-`.

Yo hice todas estas pruebas (menos la libre y la M13.9 con tu PDF) contra el programa de prueba armado, con los datos recién reiniciados, el 19/11/2026: las 14 dieron bien. Al lado de cada una dejo qué vi.

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Lo que vi: la cinta exacta y ningún cartel de error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».
- Lo que vi: «Todo en orden · 0 diferencias», al principio y otra vez al final de todas las pruebas.

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.
- Lo que vi: eso mismo.

## S4 · Humo · Se puede buscar

- Hacé: apretá Ctrl+K, escribí desvio y después Esc.
- Tenés que ver: aparece «¿Qué mide el desvío estándar?» aunque lo escribiste sin tilde; con Esc se cierra y quedás donde estabas.
- Lo que vi: eso mismo.

## M13.1 · Agregar un PDF · CA-104

- Hacé: Ajustes → «Demostración» → activá «Procesar despacio». Materiales → arrastrá una copia de «Inferencia — capítulos 1 a 4.pdf» renombrada como Inferencia 2.pdf. **Paso nuevo:** aparece «Parece que ya agregaste “Inferencia — capítulos 1 a 4.pdf” el 08/03/2027»; tocá «Agregar igual». Tocá «Inferencia 2» en la lista para ver sus etapas.
- Tenés que ver: las etapas avanzan una por una con sus conteos, hasta «Listo». Nunca un círculo girando sin información.
- Lo que vi: «Archivo guardado · Hecho», después «Texto extraído (1 de 12 páginas)», «(2 de 12)»… hasta «(11 de 12 páginas)» (la página 9 es un escaneo: se lee recién con la Fase 14), «Secciones detectadas» y «Listo». En la lista, «Procesando 1 de 12» … «Procesando 11 de 12» y «Listo». Con «Procesar despacio» cada página tarda 2 segundos.

## M13.2 · Cerrar a mitad · CA-105

- Hacé: agregá otro PDF cualquiera y, cuando vaya por la mitad, cerrá Retenia. Abrilo de nuevo.
- Tenés que ver: el material sigue en la lista y el procesamiento continúa solo hasta «Listo». Desactivá «Procesar despacio».
- Aclaración: si el PDF que elegís ya estaba en Retenia, aparece el aviso de M13.1; tocá «Agregar igual».
- Lo que vi: con un PDF de 8 páginas, lo cerré en «Procesando 3 de 8»; al abrir, seguía en «Procesando 3 de 8» y siguió solo hasta «Listo». Después desactivé «Procesar despacio» y un PDF de 60 páginas quedó «Listo» en 1 segundo.

## M13.3 · Duplicado · CA-106

- Hacé: arrastrá «Apunte 3.pdf».
- Tenés que ver: «Parece que ya agregaste “Apunte 3.pdf” el 12/03/2027» con las tres opciones.
- Lo que vi: el aviso exacto con «Abrir el existente», «Agregar como nueva versión» y «Agregar igual». «Abrir el existente» no agrega nada.

## M13.4 · Otros formatos · CA-107

- Hacé: agregá «notas.md» y «resumen.docx». Después «Agregar material» → «Pegar texto» y pegá tres párrafos de cualquier lado.
- Tenés que ver: los tres llegan a «Listo» y se pueden leer por secciones.
- Aclaración: para leerlos, tocá el material en la lista y después «Leer el original». Un texto pegado sin títulos se lee como párrafos, sin secciones; toma como nombre su primer renglón.
- Lo que vi: «notas» con «Medidas de centro», «Dispersión» y «Para la próxima clase»; «resumen» con «Qué es un intervalo de confianza» y «Cómo se interpreta»; los tres párrafos pegados, legibles.

## M13.5 · Un archivo que miente · CA-108

- Hacé: arrastrá «no-es-un-pdf.pdf».
- Tenés que ver: «No pudimos leer este PDF (protegido o dañado)» con «Elegir otro» y «Pegar el texto».
- Aclaración: el mensaje aparece al tocar el material, que dice «Error» en la lista. Hay además «Quitar de la lista». El aviso es de tono neutro, nunca rojo.
- Lo que vi: el mensaje exacto con las dos acciones.

## M13.6 · Tarjeta desde una frase · CA-110

- Hacé: abrí «Inferencia — capítulos 1 a 4.pdf». En el texto de la página 2 seleccioná una oración y tocá «Crear tarjeta desde acá». Escribí una pregunta y guardá. En la tarjeta tocá «Ver en el original».
- Tenés que ver: la tarjeta trae la oración como cita; «Ver en el original» abre la página 2 con esa oración resaltada.
- Aclaración: para abrir el PDF, tocá «Inferencia — capítulos 1 a 4» y «Leer el original»; para pasar a la página 2, «Página siguiente». El panel muestra «Inferencia — capítulos 1 a 4 · página 2» y la oración. Para llegar a la tarjeta: Apuntes → «Tarjetas» (o Ctrl+K y su pregunta); su ficha dice «Fuente: Inferencia — capítulos 1 a 4 · página 2».
- Lo que vi: eso mismo, con el párrafo de la oración resaltado en el texto y sus renglones en ámbar sobre la página.

## M13.7 · Retenia tiene su copia · CA-111

- Hacé: copiá «notas.md» al Escritorio con el nombre prueba.md, agregalo a Retenia, borrá el archivo del Escritorio y abrí el material en Retenia.
- Tenés que ver: se abre normalmente.
- **Paso nuevo:** como «prueba.md» tiene el mismo contenido que «notas.md» (que agregaste en M13.4), aparece «Parece que ya agregaste “notas.md” el 15/03/2027»; tocá «Agregar igual».
- Lo que vi: el aviso, «Agregar igual», y después de borrar el archivo de afuera se abrió con sus secciones. (Lo hice en una carpeta temporal, no en tu Escritorio.)

## M13.8 · Maltrato

- Hacé: arrastrá tres archivos juntos. Después arrastrá una foto o un archivo vacío.
- Tenés que ver: los tres entran a la cola y se procesan; para el archivo que no sirve, un mensaje claro con una acción, sin romper nada.
- Aclaración: si alguno de los tres ya estaba en Retenia, aparece el aviso de duplicado de a un archivo por vez; los demás entran a la cola enseguida. Se pueden soltar hasta 20 archivos juntos.
- Lo que vi: tres textos juntos llegaron a «Listo». La foto dice «Retenia lee PDF, Word (.docx), Markdown y texto. Este archivo es de otro tipo.» y el archivo vacío «Este archivo está vacío», los dos con «Elegir otro»; Estudiar siguió andando.

## M13.9 · Tu material de verdad

- Hacé: arrastrá tu PDF de estudio de 50 páginas o más.
- Tenés que ver: llega a «Listo» o a «Parcialmente procesado» diciendo cuántas páginas leyó, y podés leerlo por secciones. Si se cuelga o inventa texto, reportalo como falla.
- Aclaración: las secciones salen del índice del PDF, si lo trae, o del tamaño de la letra. Las páginas escaneadas cuentan como leídas sin texto («Texto extraído (20 de 50 páginas)») y el material queda «Listo»: el texto de los escaneos llega con la Fase 14.
- Lo que vi (con un PDF mío de 60 páginas, sin índice, armado para esta prueba): «Listo» en 1 a 3 segundos, «Texto extraído (60 de 60 páginas)», los capítulos y subtítulos como secciones y los números de página afuera del texto. Tu PDF no lo puedo probar yo.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Cosas para probar que no están en tu lista: «Guardar extracto» con una frase (va a la Bandeja con «· página 3» debajo); los pasajes subrayados del PDF del elenco (los citan tarjetas: tocalos y «Ver en el original»); «Ver en el original» dentro de una sesión, después de «Mostrar respuesta»; buscar con Ctrl+K «error estándar» (aparece la sección del PDF); «Cancelar» mientras procesa y «Seguir procesando»; soltar un archivo mientras leés otro (vuelve a la lista).

## Textos nuevos

Estos textos no estaban en tu lista: los puse yo y salen del catálogo de textos.

- Agregar: «Arrastrá archivos acá», «Título (opcional)», «Texto», «Podés agregar hasta 20 archivos a la vez.», «No pudimos agregar estos archivos. Probá de nuevo.».
- La lista: «Todavía no hay materiales en esta materia.», «Leímos 48 de 52 páginas» (un material cancelado o con páginas en revisión), «versión 2».
- Las etapas: «Texto extraído (24 párrafos)» en Word, Markdown y texto.
- Las acciones: «Seguir procesando», «Quitar de la lista», «Volver a la lista».
- Los problemas: «Este archivo está vacío», «Este archivo es demasiado grande», «Retenia lee PDF, Word (.docx), Markdown y texto. Este archivo es de otro tipo.», «No pudimos leer este documento de Word (dañado o con contenido no permitido)», «No pudimos guardar una copia de este archivo».
- El visor: «Página 2 de 12», «Página anterior», «Página siguiente», «Todavía estamos leyendo esta página» (PDF), «Todavía estamos leyendo este documento» (Word, Markdown y texto), «No se leyó porque cancelaste el procesamiento. Tocá «Seguir procesando» para leerlo.», «Tarjetas que citan este pasaje», «No encontramos esta cita en el original».
- Las citas: «Extracto guardado en la Bandeja», «Fuente a reubicar», «La respuesta puede tener hasta 2.000 letras: acortala para guardar.».
- Un texto pegado sin nada que sirva de título se llama «Texto pegado».
- Ajustes › «Demostración»: «Procesar despacio», con la línea «Agrega una demora de 2 segundos por página para probar el cierre a mitad de camino.».

## Qué difiere de tu plan

1. **M13.1 suma un paso** (lo aprobaste en el plan): el duplicado se reconoce por el contenido, así que la copia renombrada dispara el aviso y hay que tocar «Agregar igual».
2. **M13.7 suma el mismo paso**: «prueba.md» es una copia de «notas.md», que agregaste en M13.4.
3. **M13.8**: si alguno de los tres ya estaba en Retenia, sale el aviso de a un archivo por vez.
4. **M13.2, M13.4, M13.5 y M13.6 dicen cómo llegar** a cosas que tu lista no nombra (tocar el material, «Leer el original», «Página siguiente», abrir la tarjeta).
