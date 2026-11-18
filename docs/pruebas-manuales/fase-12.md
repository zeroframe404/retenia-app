# Pruebas manuales · Fase 12 · Búsqueda

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen **letra por letra**; los que no estaban en tu lista (el título «Abiertos hace poco», los títulos de los grupos y alguna frase más) están en «Textos nuevos», al final, junto con lo que difiere de tu plan. Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-12-`.

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».
- Aclaración: ahora «Verificar datos» también compara el índice de búsqueda con lo que guardaste. Al lado hay un botón nuevo, «Reconstruir índice de búsqueda» (dice «Índice reconstruido: N elementos.»; captura `fase-12-8-ajustes-reconstruir`).

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.

## S4 · Humo · Se puede buscar

- Hacé: apretá Ctrl+K, escribí desvio y después Esc.
- Tenés que ver: aparece «¿Qué mide el desvío estándar?» aunque lo escribiste sin tilde; con Esc se cierra y quedás donde estabas.
- Aclaración: esta prueba de la lista de humo todavía no existía: hasta esta fase Ctrl+K abría un cuadro que decía que la búsqueda no estaba disponible.

## M12.1 · Sin tilde · CA-095

- Hacé: apretá Ctrl+K y escribí desvio.
- Tenés que ver: «¿Qué mide el desvío estándar?» primero, con «desvío» resaltado.
- Aclaración: el resaltado es color y subrayado, no solo color (captura `fase-12-2-desvio`). Con Mayúsculas y con tilde («DESVÍO», «desvío») da lo mismo.

## M12.2 · Un pedazo de palabra · CA-096

- Hacé: borrá y escribí varian.
- Tenés que ver: resultados que contienen «varianza».
- Aclaración: salen tarjetas («¿Qué es la varianza?») y renglones de apuntes («varianza: el promedio de los cuadrados…»). Un pedazo de menos de 3 letras («va») no busca pedazos: solo encuentra la palabra entera.

## M12.3 · Una fórmula · CA-097

- Hacé: escribí sqrt(n
- Tenés que ver: el renglón de la nota «Intervalos de confianza» con «s / sqrt(n)».
- Aclaración: aparece en el grupo «Apuntes», con «Renglón» y «Intervalos de confianza» (captura `fase-12-3-formula`).

## M12.4 · Filtros escritos · CA-098

- Hacé: escribí tipo:tarjeta mediana. Después materia:historia mayo.
- Tenés que ver: primero solo tarjetas; después la de la Revolución de Mayo.
- Aclaración: «tipo:» acepta tarjeta, apunte, tema, duda y material; «materia:» y «tema:» buscan por el nombre (o parte del nombre). Con una materia o un tipo que no existen no hay resultados. Capturas `fase-12-4-filtro` y, para lo de Historia, escribilo vos.

## M12.5 · El nombre viejo también sirve · CA-099

- Hacé: renombrá el tema «Media y dispersión» a Medidas de resumen. Buscá Media y dispersión.
- Tenés que ver: aparece el tema «Medidas de resumen».
- Aclaración: para renombrar: Apuntes → «Notas» → el tema «Media y dispersión» → «Renombrar». El tema aparece primero, en el grupo «Apuntes» con la etiqueta «Tema» (captura `fase-12-6-nombre-viejo`).

## M12.6 · Lo nuevo aparece al instante · CA-100

- Hacé: creá una nota llamada Teorema de Bayes. Enseguida apretá Ctrl+K y escribí bayes.
- Tenés que ver: la nota aparece en los resultados.
- Aclaración: aunque no hayan pasado los dos segundos del guardado automático: al abrir el buscador, lo que estás escribiendo en la nota se guarda.

## M12.7 · Nada que mostrar · CA-101

- Hacé: escribí zzzz.
- Tenés que ver: «No encontré nada con “zzzz”» y una sugerencia.
- Aclaración: la sugerencia es «Probá con otra palabra o con menos letras.» (captura `fase-12-5-sin-resultados`).

## M12.8 · Maltrato del buscador

- Hacé: pegá en el buscador un texto larguísimo y después escribí "*()[] con comillas y símbolos.
- Tenés que ver: no aparece ningún error: resultados o el mensaje de «No encontré nada».
- Aclaración: el campo acepta hasta 300 caracteres (lo que sobra se corta al pegar) y se buscan las primeras 8 palabras. Las comillas, los asteriscos y los paréntesis se buscan como texto; el texto que escribiste se muestra tal cual en «No encontré nada con “…”», nunca como código.

## M12.9 · Consultar sin salir de la sesión · CA-102

- Hacé: Estudiar → «Empezar». Escribí algo en «Tu respuesta…». Apretá Ctrl+K, buscá intervalos, abrí la nota y cerrala con Esc.
- Tenés que ver: la nota se abre en un panel a la derecha; al cerrarla seguís en la misma tarjeta con tu texto intacto.
- Aclaración: con «intervalos» lo primero que sale es una tarjeta; la nota está en el grupo «Apuntes» (con la etiqueta «Nota» y el título «Intervalos de confianza»): elegila con las flechas o con el mouse y Enter. Si escribís `tipo:nota intervalos` es lo primero. El panel muestra la nota para leer (las fórmulas, dibujadas), no para editar. Al cerrarlo el foco vuelve a «Tu respuesta…» (captura `fase-12-7-sesion-panel`).

## M12.10 · Con 10.000 tarjetas · CA-103

- Hacé: Ajustes → «Demostración» → «Cargar 10.000 tarjetas». Buscá desvio. Abrí la materia «Volumen» → «Tarjetas» y deslizá rápido hasta el final.
- Tenés que ver: los resultados aparecen sin espera y la lista se desplaza fluida.
- Aclaración: cargar tarda unos segundos y dice «Listo: 10.000 tarjetas en la materia «Volumen».» (capturas `fase-12-9` y `fase-12-10`). Para abrir «Volumen»: Estudiar → «Cambiar» → «Abrir» en «Volumen» → Apuntes → «Tarjetas». Cargar otra vez no agrega nada; «Volver al elenco» o `npm run datos:reiniciar` lo deja como estaba.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Cosas para probar que no están en tu lista: flechas arriba y abajo y Enter dentro del buscador; sin escribir nada, el buscador muestra lo que abriste hace poco; archivar una nota y buscarla (aparece al final, con «Archivada»); «tema:» con un nombre con espacios entre comillas; borrar una tarjeta y buscarla (ya no está) y restaurarla de la Papelera (vuelve); guardar una duda y buscarla con «tipo:duda».

## Textos nuevos

Estos textos no estaban en tu lista: los puse yo, en español con voseo, y salen del catálogo de textos.

- Sin escribir nada: «Abiertos hace poco» (el título de la lista) y «Todavía no abriste nada. Escribí para buscar.» (si todavía no abriste nada).
- Los títulos de los grupos: «Apuntes», «Tarjetas», «Materiales» y «Dudas» (se ven solo los que tienen resultados, el del mejor resultado primero); las etiquetas de cada resultado: «Nota», «Renglón», «Tarjeta», «Tema», «Duda»; «Sin título» para una nota sin título y «Archivada».
- El campo: «Buscar en tus apuntes y tarjetas» (lo que lee el lector de pantalla) y «Escribí para buscar» (lo que se ve adentro).
- En el panel de la sesión: «Pregunta» y «Respuesta» (de una tarjeta), «Notas de este tema» y «Este tema todavía no tiene notas.», y «Abriendo…» mientras carga.
- Ajustes: «Reconstruir índice de búsqueda», «Índice reconstruido: N elementos.», «Cargar 10.000 tarjetas», «Cargando tarjetas…» y «Listo: 10.000 tarjetas en la materia «Volumen».».

## Qué difiere de tu plan

1. **M12.9: la nota no es lo primero.** Tu lista pide «buscá intervalos, abrí la nota». Con «intervalos» el primer resultado es una tarjeta («¿Para qué sirve el teorema central del límite al construir intervalos?») y la nota «Intervalos de confianza» está justo después, en el grupo «Apuntes». Es lo que da el orden pedido (título más corto primero, tarjeta con un poco más de peso que un apunte). No cambié el orden para forzarlo; con `tipo:nota intervalos` la nota es la primera.
2. **M12.5 y M12.10 dicen cómo llegar**, porque «Renombrar» y abrir la materia «Volumen» pasan por pantallas de Apuntes y de Estudiar → «Cambiar» que tu lista no nombra.
3. **«Cargar 10.000 tarjetas» no existía antes de esta fase** (estaba en la especificación, no en el programa): lo construí acá.
