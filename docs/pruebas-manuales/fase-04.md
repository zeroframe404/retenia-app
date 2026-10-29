# Pruebas manuales · Fase 04 · Libro mayor, copias y deshacer

Preparación: en la terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Hacelas en este orden: cada una usa lo que dejó la anterior (por ejemplo, la copia de M04.3 es la que se restaura en M04.4).

Los textos de abajo son los que muestra el programa hoy y coinciden letra por letra con los del plan de la fase, con **una sola diferencia**, que elegiste vos al aprobar el plan: en M04.4, «Vaciar papelera» pide confirmación, así que hay un toque más («Vaciar»). Las pantallas son provisorias (el diseño fino llega en la Fase 06): arriba hay una barra con «Tarjetas», «Papelera», «Actividad reciente» y «Ajustes», y en cada tarjeta los botones «Repasar», «Historial», «Editar» y «Eliminar».

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.

## S2 · Humo · Tus datos están sanos

- Es la misma prueba que M04.2 (desde esta fase forma parte del humo de siempre): hacela una vez y anotala en las dos filas del registro.

## M04.1 · Historial con dos fechas · CA-015

- Hacé: repasá «¿Qué mide el desvío estándar?» con «La sabía». Andá a Ajustes → «Demostración» → «+7 días». Repasala otra vez con «Con dudas». Abrí su «Historial».
- Tenés que ver: dos renglones: «15/03/2027 · La sabía» y «22/03/2027 · Con dudas». La cinta dice «hoy es lunes 22/03/2027».

## M04.2 · Verificar datos · CA-016

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».

## M04.3 · Hacer una copia · CA-019

- Hacé: «Hacer copia ahora».
- Tenés que ver: una copia nueva en la lista, con la fecha de hoy de la cinta, su tamaño y «Verificada».
- Aclaración: el renglón dice «22/03/2027 10:00 · Hecha por vos · 6 KB» (el tamaño puede variar un poco) y, a la derecha, «Verificada». Más abajo ya hay otra, «15/03/2027 10:00 · Automática»: es la que Retenia hizo sola al abrir por primera vez.

## M04.4 · Restaurar de verdad · CA-020

- Hacé: eliminá «¿Qué mide el desvío estándar?». Abrí «Papelera» y tocá «Vaciar papelera»; aparece «Todo lo que está en la papelera se elimina para siempre: tarjetas, notas, temas y anotaciones de la Bandeja.»: tocá «Vaciar». Volvé a «Datos y copias», elegí la copia recién hecha («Hecha por vos») y tocá «Restaurar».
- Tenés que ver: la tarjeta vuelve a la lista con sus dos renglones de historial, y en la lista de copias aparece una más: «Antes de restaurar».
- Aclaración: al terminar dice «Listo: volviste a la copia del 22/03/2027 10:00. Lo que había antes quedó en la copia «Antes de restaurar».».

## M04.5 · Papelera · CA-022

- Hacé: eliminá cualquier tarjeta. Abrí «Papelera» y tocá «Restaurar».
- Tenés que ver: la tarjeta vuelve a la lista.

## M04.6 · Deshacer una edición · CA-023

- Hacé: editá la pregunta de una tarjeta y agregale la palabra PRUEBA. Abrí «Actividad reciente» y tocá «Deshacer» en ese renglón.
- Tenés que ver: la pregunta vuelve a estar sin la palabra PRUEBA.
- Aclaración: para editar, tocá «Editar» en la tarjeta, cambiá la pregunta y tocá «Guardar». El renglón de «Actividad reciente» dice, por ejemplo, «22/03/2027 10:00 · Editaste «¿Qué es la media muestral? PRUEBA»».

## M04.7 · Cierre a la fuerza · CA-017

- Hacé: repasá una tarjeta y, apenas toques «La sabía», cerrá la ventana con Alt+F4. Abrí de nuevo y tocá «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias». El repaso figura completo en el historial o no figura.

## M04.8 · Copia automática · CA-021

- Hacé: Ajustes → «Demostración» → «+1 día». Cerrá Retenia y abrilo.
- Tenés que ver: en «Datos y copias» hay una copia nueva con la fecha del día siguiente, sin que la pidieras.
- Aclaración: si venís de las pruebas anteriores, la cinta pasa de 22/03 a «hoy es martes 23/03/2027» y la copia nueva dice «23/03/2027 10:00 · Automática».

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Algunas ideas: «Abrir carpeta de copias» (tiene que abrirse el Explorador de Windows en la carpeta de copias), «Deshacer» dos veces seguidas, restaurar la copia «Antes de restaurar» para recuperar lo de después, «+35 días» y abrir la «Papelera».

## Lo que ya comprobé yo (14/10/2026)

Hice S1 y M04.1 a M04.8 contra el programa andando (`npm run iniciar`, con una carpeta de datos nueva), tocando los botones por su nombre: todas dieron lo esperado. Dos cosas no las pude hacer igual que vos: en M04.7 cerré la ventana con la orden de cierre de Windows (la misma que manda Alt+F4) y no con las teclas, y no toqué «Abrir carpeta de copias» porque abre una ventana del Explorador en tu escritorio. La prueba libre es tuya.

## Capturas de las pantallas nuevas

En `docs/pruebas-manuales/capturas/`, en claro y en oscuro (terminan en `-claro.png` y `-oscuro.png`):

- `fase-04-1-tarjetas`: la barra de secciones y las tres tarjetas de ejemplo con «Repasar», «Historial», «Editar» y «Eliminar».
- `fase-04-2-demostracion`: Ajustes › «Demostración» después de «+7 días»; la cinta dice «hoy es lunes 22/03/2027».
- `fase-04-3-historial`: «15/03/2027 · La sabía» y «22/03/2027 · Con dudas».
- `fase-04-4-editar`: «Editar tarjeta» con PRUEBA agregado a la pregunta.
- `fase-04-5-actividad-reciente`: tus cambios, con «Deshacer».
- `fase-04-6-datos-y-copias`: «Todo en orden · 0 diferencias», «Copia hecha y verificada.» y la lista de copias con «Verificada».
- `fase-04-7-papelera`: la tarjeta eliminada, con la fecha en que se elimina para siempre.
- `fase-04-8-papelera-confirmacion`: «Todo lo que está en la papelera se elimina para siempre: tarjetas, notas, temas y anotaciones de la Bandeja.» con «Vaciar» y «Cancelar».
- `fase-04-9-restaurada`: «Listo: volviste a la copia del 22/03/2027 10:00…» y «Antes de restaurar» primera en la lista.
- `fase-04-10-diferencias`: una agenda tocada a mano con Retenia cerrado: «Hay 1 diferencia», el detalle y «Reparar desde el historial».

Se vuelven a sacar con `node tools/capturas.mjs fase-04` (después de `npm run construir`).

## Registro

| Prueba | Resultado | Observaciones |
|---|---|---|
| S1 | | |
| S2 | | |
| M04.1 | | |
| M04.2 | | |
| M04.3 | | |
| M04.4 | | |
| M04.5 | | |
| M04.6 | | |
| M04.7 | | |
| M04.8 | | |
| Libre | | |
