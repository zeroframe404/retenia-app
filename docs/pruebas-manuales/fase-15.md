# Pruebas manuales · Fase 15 · Traer lo que ya tenés y exportar todo

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`. Si querés migrar de verdad (M15.9), dejá tu exportación de RemNote en Markdown o tu mazo de Anki en la carpeta `mis-exportaciones` del proyecto (`H:\Retenia\mis-exportaciones`; no se sube al repositorio).

Los archivos de ejemplo están en la carpeta `datos-de-ejemplo` del proyecto (`H:\Retenia\datos-de-ejemplo`): `mazo-demo.apkg` y `remnote-demo.zip`. Al tocar «Importar de Anki» o «Importar de RemNote» se abre el diálogo de Windows para elegir el archivo; «Exportar todo» abre el de guardar.

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen **letra por letra**, salvo lo que está en «Qué difiere de tu plan», al final. Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-15-`.

Yo hice S1 a S5 y M15.1 a M15.8 contra el programa de prueba armado, con los datos recién reiniciados, el 20/11/2026: las 13 dieron bien. Al lado de cada una dejo qué vi. Lo que no pude hacer como vos: los diálogos de Windows los reemplacé para que eligieran los archivos de ejemplo (no puedo tocar un diálogo del sistema), y el comprimido lo abrí con el comando de Windows que lo descomprime, no con doble clic. M15.9 no la pude hacer: no hay una exportación tuya.

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Lo que vi: la ventana «Retenia», la cinta exacta y ningún error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».
- Lo que vi: «Todo en orden · 0 diferencias».

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.
- Lo que vi: eso mismo, con «¿Qué mide el desvío estándar?».

## S4 · Humo · Se puede buscar

- Hacé: apretá Ctrl+K, escribí desvio y después Esc.
- Tenés que ver: aparece «¿Qué mide el desvío estándar?» aunque lo escribiste sin tilde; con Esc se cierra y quedás donde estabas.
- Lo que vi: eso mismo.

## S5 · Humo · La fuente está a un clic

- Hacé: Materiales → «Inferencia — capítulos 1 a 4.pdf» → clic en cualquier cita resaltada → «Ver en el original».
- Tenés que ver: se abre la página del PDF con el pasaje resaltado.
- Aclaración: «Inferencia — capítulos 1 a 4.pdf» → «Leer el original»; ahí las citas son los pasajes subrayados.
- Lo que vi: «Página 1 de 12» con el pasaje resaltado.

## M15.1 · Vista previa de Anki · CA-122

- Hacé: Ajustes → «Datos y copias» → «Importar de Anki» → elegí «mazo-demo.apkg».
- Tenés que ver: «Entran 3 tarjetas y 5 repasos · Rechazadas: 0». Todavía no hay tarjetas nuevas en Retenia.
- Aclaración: «Importar de Anki» está en el apartado «Traer de otros programas». La vista previa aparece en un recuadro y dice además «Todavía no se escribió nada en Retenia.».
- Lo que vi: «Entran 3 tarjetas y 5 repasos · Rechazadas: 0» y «Todavía no se escribió nada en Retenia.».

## M15.2 · Importar con historial · CA-122

- Hacé: elegí la materia «Historia argentina» y tocá «Importar». Abrí el «Historial» de una de las tarjetas importadas.
- Tenés que ver: las 3 tarjetas en esa materia; el historial muestra sus repasos viejos con fecha y un próximo repaso.
- Aclaración: la materia se elige en «Materia de destino». Para ver las tarjetas: Estudiar → «Cambiar» → «Historia argentina» → «Abrir» (así la mirás sin hacerla activa) y después Apuntes → «Tarjetas»; tocá la pregunta y «Historial».
- Lo que vi: «Listo: entraron 3 tarjetas y 5 repasos en «Historia argentina». Antes de escribir hice la copia «Antes de importar».»; en el historial de «¿Quién encabezó el cruce de los Andes en 1817?»: «02/02/2027 · La sabía · De Anki» y «06/02/2027 · La sabía · De Anki», y «Próximo repaso: martes 09/03/2027».

## M15.3 · Dos veces no duplica · CA-124

- Hacé: elegí otra vez «mazo-demo.apkg».
- Tenés que ver: «0 nuevas · 3 ya estaban».
- Lo que vi: «0 nuevas · 3 ya estaban», «Este archivo ya lo importaste el 15/03/2027.» y «No hay nada nuevo para importar.»; «Importar» no se puede tocar.

## M15.4 · Vista previa de RemNote · CA-123

- Hacé: «Importar de RemNote» → «remnote-demo.zip».
- Tenés que ver: «12 notas, 8 tarjetas, 1 rechazada (imagen faltante)».
- Lo que vi: «12 notas, 8 tarjetas, 1 rechazada (imagen faltante)», «Sin historial: entran como «Disponibles».», y en «Entró distinto» el renglón «Miembros de la Primera Junta >>> · entró como texto común».

## M15.5 · Importar apuntes · CA-125

- Hacé: tocá «Importar». Abrí una de las notas importadas en Apuntes. Volvé y mirá la lista de rechazadas.
- Tenés que ver: la nota conserva sus renglones anidados y sus tarjetas marcadas. La lista muestra la imagen faltante con su motivo.
- Aclaración: elegí «Historia argentina» en «Materia de destino» antes de «Importar». La lista de rechazadas está en «Importaciones», con «Ver rechazadas» (y «Guardar lista»).
- Lo que vi: la nota «Congreso de Tucumán» con sus tres niveles de renglones y sus renglones de tarjeta marcados; en «Importaciones», «Cruce de los Andes: mapa-del-cruce.png · imagen faltante».

## M15.6 · La copia previa · CA-126

- Hacé: mirá la lista de copias en «Datos y copias».
- Tenés que ver: una copia llamada «Antes de importar» por cada importación.
- Lo que vi: dos copias «Antes de importar» (una por cada importación que escribió algo) y la automática. La segunda vez de M15.3 no escribe nada, así que no hace copia.

## M15.7 · Exportar todo · CA-127

- Hacé: tocá «Exportar todo», guardalo en el Escritorio y abrí el archivo comprimido con el Explorador. Abrí uno de los apuntes con el Bloc de notas.
- Tenés que ver: carpetas de apuntes, tarjetas, historial y originales. El apunte se lee como texto normal.
- Aclaración: «Exportar todo» está en «Tus datos, para llevar». Los apuntes están en `apuntes\<materia>\<tema>\`.
- Lo que vi: «Exportado en «Retenia 15-03-2027.zip»: 4 materias · 203 tarjetas · 312 repasos.»; adentro, las carpetas `apuntes`, `datos`, `historial`, `imagenes`, `originales` y `tarjetas` y el archivo `indice.json`; «Congreso de Tucumán.md» empieza con su encabezado (id, materia, tema, título y fecha) y sigue con los renglones como lista («- El Congreso se reunió en San Miguel de Tucumán.» y, más adentro, «- ¿En qué año se declaró la Independencia? >> 1816»).

## M15.8 · Volver a cargar todo · CA-128

- Hacé: anotá los conteos que muestra la exportación. Ajustes → «Demostración» → «Empezar como la primera vez». «Importar exportación» → elegí el archivo. Después «Verificar datos».
- Tenés que ver: los mismos conteos de materias, tarjetas y repasos, y «Todo en orden · 0 diferencias». Al terminar, «Volver al elenco».
- Aclaración: en la pantalla de la primera vez, «Importar exportación» está debajo de la pregunta; muestra «Exportación del 15/03/2027: …» con los conteos y «Cargar». Al tocar «Cargar» aparece el programa con tus datos.
- Lo que vi: exporté «4 materias · 203 tarjetas · 312 repasos»; al cargar, «Exportación del 15/03/2027: 4 materias · 203 tarjetas · 312 repasos.»; después «Verificar datos» dio «Todo en orden · 0 diferencias», y «Volver al elenco» volvió a los datos de ejemplo.

## M15.9 · Tu exportación de verdad

- Hacé: si dejaste una exportación tuya, importala a una materia nueva llamada Prueba de migración. Elegí tres notas al azar y comparalas con RemNote.
- Tenés que ver: los conteos de la vista previa son creíbles y las tres notas dicen lo mismo que en RemNote. Si no tenés exportación, salteá esta prueba y tildala.
- Aclaración: en «Materia de destino» elegí «Nueva materia…» y escribí el nombre. Si exportaste una carpeta suelta en vez de un comprimido, usá «Elegir una carpeta de RemNote».
- Lo que vi: no la pude hacer (no hay una exportación tuya). Es la prueba más importante de la fase: el formato de RemNote no está documentado.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Cosas para probar que no están en tu lista: en Apuntes › «Tarjetas» de «Historia argentina», las 8 de RemNote dicen «Disponible»: tildalas y «Sumar a mis repasos» (te dice el costo); «Guardar lista» en «Importaciones»; «Cancelar» en una vista previa (no escribe nada); importar el mazo a una «Nueva materia…»; abrir `tarjetas\tarjetas-y-relaciones.json` del comprimido.

## Textos nuevos

Estos textos no estaban en tu lista: los puse yo y salen del catálogo de textos.

- Importar: «Traer de otros programas», «Elegir una carpeta de RemNote», «Leyendo el archivo…», «Vista previa de «…»», «Todavía no se escribió nada en Retenia.», «Este archivo ya lo importaste el 15/03/2027.», «Sin historial: entran como «Disponibles».», «No van a tus repasos hasta que las sumes con «Sumar a mis repasos», en Apuntes › Tarjetas.», «Entró distinto», «Rechazadas», «Materia de destino», «Nueva materia…», «Nombre de la materia nueva», «Cancelar», «No hay nada nuevo para importar.», «Listo: entraron 3 tarjetas y 5 repasos en «Historia argentina».» (o «12 notas y 8 tarjetas»), «Antes de escribir hice la copia «Antes de importar».», «No pude importar. Tus datos siguen como estaban.».
- Motivos de rechazo: «imagen faltante», «audio faltante», «imagen en internet», «imagen en un formato que Retenia no muestra», «tipo de tarjeta que Retenia no tiene», «tarjeta sin texto», «texto demasiado largo», «documento que no se pudo leer». Anotaciones: «entró como texto común», «la fórmula entró como texto», «enlace a un documento que no vino».
- Archivos que no sirven: «Este archivo no es una exportación de Anki (.apkg o .colpkg).», «No encontré documentos de RemNote en Markdown en este archivo.», «Este archivo es de una versión de Anki más nueva que Retenia todavía no lee. Exportalo otra vez desde Anki con «Support older Anki versions».», «Este archivo está dañado: no lo pude leer.», «Este archivo tiene partes que no son seguras y no lo abrí.».
- Importaciones: «Importaciones», «Todavía no importaste nada.», cada una como «15/03/2027 · Anki · «mazo-demo.apkg» en «Historia argentina» · 3 tarjetas y 5 repasos · 0 rechazadas», «Ver rechazadas», «Ocultar rechazadas», «Guardar lista», «Lista guardada.», y el archivo «Rechazadas de remnote-demo.txt».
- Exportar y cargar: «Tus datos, para llevar», «Exportando…», «Exportado en «…»: 4 materias · 203 tarjetas · 312 repasos.», «Revisando la exportación…», «Exportación del 15/03/2027: …», «Cargar», «Cargando…», «Listo: …», «Para cargar una exportación entera, Retenia tiene que estar vacío. Tus datos siguen como estaban.», «Este archivo no es una exportación de Retenia.», «Esta exportación está dañada o se modificó: no la cargué.», «Esta exportación es de una versión más nueva de Retenia.».
- Copias: «Antes de importar». Tarjetas: «Disponible». Historial de una tarjeta: «De Anki» al lado de cada repaso importado, y el próximo repaso arriba de la lista.

## Qué difiere de tu plan

1. **Dos botones donde la especificación tenía uno.** La especificación decía «Importar de Anki o RemNote»; seguí tu lista: «Importar de Anki» e «Importar de RemNote» (y actualicé la especificación). Sumé «Elegir una carpeta de RemNote» para una exportación descomprimida.
2. **La pantalla de la primera vez tiene un botón más,** «Importar exportación», debajo de la pregunta (lo aprobaste en el plan). Sin eso, un Retenia recién instalado no tendría cómo cargar una exportación.
3. **M15.2, M15.5 y M15.7 suman cómo llegar** (ver «Aclaración» en cada una).
4. **M15.6:** la segunda vez del mismo mazo (M15.3) no escribe nada, así que no hace copia: quedan dos «Antes de importar» por las dos importaciones que escribieron algo.
5. **CA-379** (imágenes, fórmulas y enlaces que sobreviven a exportar e importar) estaba en la especificación de esta fase y no en tu lista: tiene sus pruebas automáticas; a mano se ve en M15.8.
