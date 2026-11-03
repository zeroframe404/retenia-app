| Libre | Pendiente (tuya) |  || M07.12 | OK | Fórmula, imagen, «Mencionada en» || M07.11 | OK | Texto de 117.005 caracteres, entero || M07.10 | OK |  || M07.9 | OK |  || M07.8 | OK | Cartel «Anotado en la Bandeja.» y el 1 en el riel || M07.7 | OK |  || M07.6 | OK |  || M07.5 | OK |  || M07.4 | OK | «Guardado» y la nota completa al reabrir || M07.3 | OK |  || M07.2 | OK |  || M07.1 | OK | Con «Crear» antes de «Hacer activa» (ver aclaración) || S2 | OK | «Todo en orden · 0 diferencias» || S1 | OK | Cinta y pantalla inicial, sin carteles |# Pruebas manuales · Fase 07 · Materias, temas, apuntes y bandeja

Preparación: en la terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen **letra por letra**; las diferencias están todas en la sección «Qué difiere de tu plan». Lo que ves al abrir: la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027», el riel a la izquierda y Estudiar con la materia activa «Estadística básica» y el botón «Cambiar». Las materias del elenco son «Estadística básica» (activa), «Historia argentina» (en mantenimiento), «Inglés» (en mantenimiento) y «Ejemplo» (en pausa, con la etiqueta EJEMPLO). Apuntes abre en «Notas»; sus secciones son «Notas», «Bandeja», «Tarjetas» (las tres tarjetas de siempre), «Papelera» y «Actividad reciente».

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial (Estudiar), sin carteles de error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».

## M07.1 · Nueva materia activa · CA-038

- Hacé: Estudiar → «Cambiar» → «Nueva materia». Nombre: Química orgánica. Tocá «Crear» (o Enter) y después, en «Química orgánica», «Hacer activa».
- Tenés que ver: Estudiar muestra «Química orgánica» (detrás del cuadro, que queda abierto con el cartel ««Química orgánica» es ahora tu materia activa.»). En la lista, «Estadística básica» dice «En mantenimiento». Volvé a dejar activa «Estadística básica» con su «Hacer activa».
- Aclaración: la materia nueva nace «En mantenimiento»; «Hacer activa» la pasa a «Activa» y deja a la anterior «En mantenimiento». Un nombre vacío o repetido (aunque cambien las mayúsculas) no se crea y lo dice.

## M07.2 · Consultar sin activar · CA-039

- Hacé: «Cambiar» → en «Historia argentina» tocá «Abrir» y mirá sus apuntes. Volvé a Estudiar.
- Tenés que ver: Estudiar sigue mostrando «Estadística básica».
- Aclaración: al tocar «Abrir» el cuadro se cierra y Apuntes dice «Estás mirando: Historia argentina» y «Materia activa: Estadística básica». Lo que mirás no se guarda: al cerrar y abrir Retenia volvés a mirar la activa.

## M07.3 · Apunte en bloques · CA-042

- Hacé: Apuntes → «Nueva nota». Título: Regresión lineal. Escribí tres renglones. Parate en el segundo y apretá Tab; después Mayús+Tab.
- Tenés que ver: con Tab el segundo renglón queda corrido bajo el primero; con Mayús+Tab vuelve.
- Aclaración: «Nueva nota» (el único botón cobalto de Apuntes) abre la nota con el foco en el título. Enter pasa al renglón siguiente. Cuando Tab no puede anidar (el primer renglón, por ejemplo) el foco sigue su camino. Extras que podés probar: Alt+Mayús+↑ y ↓ mueven el renglón, Ctrl+↑ pliega y Ctrl+↓ despliega (también con el botón de la flechita), y el asa de seis puntos a la izquierda de cada renglón sirve para arrastrarlo con el mouse. «Volver a las notas» vuelve a la lista.

## M07.4 · Se guarda solo y sobrevive · CA-043

- Hacé: escribí una frase más y esperá dos segundos. Cerrá Retenia y volvé a abrirlo. Abrí «Regresión lineal».
- Tenés que ver: primero el cartel «Guardado»; después de reabrir, la nota está completa.
- Aclaración: «Guardando…» se ve mientras escribís y «Guardado» a los dos segundos de dejar de escribir. Si cerrás la ventana sin esperar, Retenia guarda antes de cerrar. La nota está en «Todas las notas» (y en «Sin tema»).

## M07.5 · Tema y mover · CA-040

- Hacé: creá el tema Regresión («Nuevo tema», campo «Nombre del tema», «Crear»). La nota «Regresión lineal» está en «Sin tema»: usá «Mover a…» → «Regresión».
- Tenés que ver: la nota aparece bajo «Regresión» y ya no está en «Sin tema».
- Aclaración: el cuadro «Mover a…» tiene un botón por tema y «Sin tema». También se puede arrastrar la nota con el mouse sobre un tema de la lista.

## M07.6 · Renombrar conserva el nombre viejo · CA-044

- Hacé: elegí el tema «Media y dispersión», «Renombrar» → Medidas de resumen → «Guardar». Abrí «Detalles».
- Tenés que ver: en «Otros nombres» figura «Media y dispersión».

## M07.7 · Archivar y deshacer · CA-045

- Hacé: en «Todas las notas», «Archivar» en la nota «Media y desvío». Tocá «Deshacer» en el cartel.
- Tenés que ver: la nota desaparece de la lista y vuelve al deshacer.
- Aclaración: si en vez de «Deshacer» tocás «Archivadas», la nota está ahí con «Desarchivar». Un tema también se archiva («Archivar tema») y se deshace igual.

## M07.8 · Captura al vuelo · CA-046

- Hacé: andá a Progreso. Apretá Ctrl+Mayús+N, escribí Revisar teorema central del límite y Enter.
- Tenés que ver: seguís en Progreso, con el cartel «Anotado en la Bandeja.»; el riel muestra un 1 junto a «Bandeja» (una fila bajo «Apuntes»).

## M07.9 · De la bandeja a su lugar · CA-047

- Hacé: Apuntes → «Bandeja» → en el elemento, «Mover a…» → «Intervalos de confianza».
- Tenés que ver: la Bandeja queda vacía y el texto aparece como nota en ese tema (cartel «Pasó a «Intervalos de confianza» como nota.»). El 1 del riel desaparece.

## M07.10 · La primera vez · CA-041

- Hacé: Ajustes → «Demostración» → «Empezar como la primera vez». Mirá la pantalla. Tocá «Probar con un ejemplo (3 min)». Después, «Volver al elenco».
- Tenés que ver: una sola pregunta: «¿Qué querés aprender ahora?». Con el ejemplo aparece una materia con la etiqueta EJEMPLO.
- Aclaración: la pantalla única no tiene riel; tiene el campo, «Agregar mi primer material» (escribí «Química orgánica» y Enter: queda activa y te lleva a Materiales, todavía vacío) y «Probar con un ejemplo (3 min)» (carga «Ejemplo», con su etiqueta, y te deja en Estudiar). Como sin riel no se llega a Ajustes, esa pantalla trae también «Volver al elenco» (solo en la versión de prueba). El modo queda recordado: si cerrás Retenia en la primera vez, al abrir sigue la pregunta; «Volver al elenco» o `npm run datos:reiniciar` lo sacan.

## M07.11 · Maltrato del editor

- Hacé: en una nota pegá un texto larguísimo con ñ, tildes y un emoji. Dejá el título vacío. Salí y volvé a entrar.
- Tenés que ver: todo el texto está; la nota se llama «Sin título»; nada se desarmó.
- Aclaración: «Sin título» es el nombre con el que se ve la nota en la lista y arriba; el campo «Título» queda vacío.

## M07.12 · Imágenes, fórmulas y enlaces · CA-372 a CA-376 (no estaban en tu lista y entran por la tabla de la especificación)

- Imagen: en un renglón, pegá una imagen del portapapeles (Ctrl+V) o arrastrá un archivo de imagen. Se ve en el renglón, queda guardada en la carpeta `imagenes` de tus datos y sigue ahí al cerrar y abrir. La nota «Intervalos de confianza» trae una (una campana).
- Fórmula: escribí `$\bar{x} \pm t \cdot s/\sqrt{n}$` y salí del renglón: se ve como en un libro, sin internet. Al volver a entrar con el cursor ves el texto original.
- Enlace: escribí `[[Interv`; elegí «Intervalos de confianza» de la lista (flechas y Enter); queda un enlace que abre esa nota con un clic.
- «Mencionada en»: en «Intervalos de confianza», el botón «Mencionada en» lista cada renglón que la enlaza, con el nombre de su nota; un clic lleva a ese renglón.
- Renombrar: cambiá el título de «Intervalos de confianza»; en «Media y desvío» el enlace muestra el nombre nuevo.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Algunas ideas: pegar una imagen grande, escribir mucho y cerrar la ventana enseguida, arrastrar renglones y notas, eliminar una nota y restaurarla desde Apuntes › «Papelera», anotar con Ctrl+Mayús+N estando en la Bandeja, achicar la ventana con una nota abierta.

## Qué difiere de tu plan

- Controles que tu plan no nombra y elegí yo: «Nuevo tema» (con el campo «Nombre del tema» y «Crear»), «Renombrar», «Detalles», «Archivar tema», «Eliminar tema», «Crear» (en «Nueva materia»), «Todas las notas» (la entrada por defecto de la lista de temas, antes de «Sin tema» y «Archivadas»), «Volver a las notas», «Mencionada en».
- El riel tiene solo los seis destinos (CA-031 lo exige). El contador de la Bandeja es una fila aparte, «Bandeja» con su número, bajo «Apuntes», y **solo aparece cuando hay algo**: con la Bandeja vacía el riel es el de siempre.
- El elenco trae la Bandeja vacía (`elenco.md` decía dos elementos; uno es un extracto de PDF de la Fase 14 y el otro rompería tu M07.8, que espera un 1).
- El elenco trae también la materia «Ejemplo» (en pausa), como pedía tu lista de tareas, aunque `elenco.md` dice que no viene cargada; «Probar con un ejemplo (3 min)» en la primera vez la carga igual.
- La pantalla de la primera vez trae «Volver al elenco» (solo en la versión de prueba) para no dejarte sin salida.
- Las notas «Intervalos de confianza» y «Media y desvío» son las de tu lista (`elenco.md` decía «Media y dispersión» para la segunda).

## Lo que ya comprobé yo

El 29/10/2026 corrí, con un guion contra el programa empaquetado («Retenia (prueba)», datos nuevos y cerrar y abrir de verdad), todo lo de arriba menos «Libre»: S1, S2, M07.1 a M07.12 (30 comprobaciones, todas en OK, dos corridas seguidas). Miré las capturas de M07.1, M07.3, M07.6, M07.7, M07.8, M07.10, M07.11 y M07.12 (están en `.cache/manual7`). Lo que **no** pude comprobar: arrastrar notas y renglones con el mouse real (lo cubren las pruebas de pantalla, no un mouse de verdad), pegar una imagen desde el portapapeles de Windows con Ctrl+V (la prueba usa el evento de pegado) y la escala de Windows al 125 %, y por supuesto el uso libre de cinco minutos: eso es tuyo.

**Capturas que cambiaron, para que las apruebes (regla 2 del `CLAUDE.md`).** Actualicé 10 capturas de referencia de la Fase 06 porque la pantalla cambió a propósito: Estudiar con la materia activa (claro y oscuro) y Apuntes con su cabecera «Estás mirando…» y sus secciones nuevas (tarjetas, actividad, papelera y formulario con aviso, en claro y oscuro). Las ves con `git show 4741b07 --stat` y abriendo esos PNG en `tests/e2e/capturas-de-referencia`; si alguna no te gusta, decime y la rehago. Hasta que las apruebes, no fusiones.

## Registro

| Prueba | Resultado | Observaciones |
|---|---|---|
| S1 | | |
| S2 | | |
| M07.1 | | |
| M07.2 | | |
| M07.3 | | |
| M07.4 | | |
| M07.5 | | |
| M07.6 | | |
| M07.7 | | |
| M07.8 | | |
| M07.9 | | |
| M07.10 | | |
| M07.11 | | |
| M07.12 | | |
| Libre | | |
