# Pruebas manuales · Fase 06 · Sistema de diseño y armazón

Preparación: en la terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Los textos de abajo son los que muestra el programa hoy y coinciden letra por letra con los del plan de la fase. Hay **una sola diferencia con tu lista**: en la «Galería», los nombres de los componentes están escritos en castellano, con espacios y tildes (por ejemplo «Botón», «Rótulo de modo», «Aviso de estado»), y no como los nombres de código (`Boton`, `RotuloModo`, `BannerEstado`); la lista completa está en M06.3. Todo lo demás (los nombres del riel, de las opciones de «Apariencia», de los seis estados y de la variante «Todavía no.») es exactamente el de tu plan.

Cómo se ve ahora: a la izquierda, el riel con «Buscar» arriba y Estudiar, Apuntes, Materiales, Idiomas, Progreso y Ajustes; a la derecha, la pantalla elegida. «Tarjetas» ya no está en el riel: la pantalla provisoria vive adentro de Apuntes, con «Papelera» y «Actividad reciente» como secciones. Estudiar, Materiales, Idiomas y Progreso todavía no tienen contenido (llegan en otras fases): dicen «Todavía no disponible. Acá vas a …» y tienen un botón «Ir a Apuntes».

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Aclaración: la pantalla inicial es Estudiar. La cinta es la franja de arriba, con borde punteado.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».

## M06.1 · El riel · CA-031

- Hacé: tocá uno por uno: Estudiar, Apuntes, Materiales, Idiomas, Progreso y Ajustes.
- Tenés que ver: cada uno abre su pantalla con su título. En ninguna hay más de un botón de color cobalto.
- Aclaración: en cada pantalla hay exactamente uno: «Ir a Apuntes» en Estudiar, Materiales, Idiomas y Progreso; «Nueva tarjeta» en Apuntes; «Hacer copia ahora» en Ajustes. Idiomas dice «Todavía no disponible. Acá vas a seguir el curso de inglés, de cero a C2.».

## M06.2 · Tema oscuro · CA-032

- Hacé: Ajustes → «Apariencia» → «Oscuro». Cerrá Retenia y abrilo.
- Tenés que ver: todo oscuro al instante y se lee bien. Al volver a abrir sigue oscuro. Dejalo en «Según el sistema» al terminar.
- Aclaración: las tres opciones son «Claro», «Oscuro» y «Según el sistema». También se oscurece la barra de título de la ventana. Con «Según el sistema», Retenia sigue el tema de tu Windows.

## M06.3 · La galería · CA-033

- Hacé: Ajustes → «Demostración» → «Galería». Recorrela hasta el final.
- Tenés que ver: los 18 componentes y los seis estados (vacío, cargando, error, éxito, sin permiso, sin conexión), sin textos cortados ni superpuestos.
- Aclaración: los 18 componentes, en este orden, se llaman: «Botón», «Rótulo de modo», «Rótulo de dato», «Etiqueta de ejemplo», «Indicador de borrador», «Propuesta de sesión», «Compromiso semanal», «Barra de ayuda», «Confianza declarada», «Unidades de idea», «Resultado», «Aviso de evaluación corregida», «Valoración de sesión», «Cierre de sesión», «Estado de dominio», «Propuesta de ítem», «Etapas de procesamiento» y «Aviso de estado». Después viene «Armazón» (cartel breve, lista, panel lateral derecho y un diálogo que se abre con «Abrir el diálogo de ejemplo») y, al final, los seis estados, cada uno con una frase y un botón. Todo lo que muestra es de ejemplo. «Volver a Ajustes» (arriba a la derecha) vuelve.

## M06.4 · Todo con el teclado · CA-034

- Hacé: soltá el mouse. Apretá Ctrl+3, después Tab varias veces, Enter sobre un botón y Esc.
- Tenés que ver: Ctrl+3 abre Materiales. Siempre ves un contorno marcando dónde estás. Esc cierra lo que se abrió.
- Aclaración: Ctrl+3 abre Materiales y deja el contorno en su título. Tab pasa por «Ir a Apuntes» y después da la vuelta por «Buscar» y el riel. Enter sobre «Buscar» (o Ctrl+K desde cualquier lado) abre el cuadro «Buscar», que por ahora dice «La búsqueda todavía no está disponible.»; Esc lo cierra y el contorno vuelve a «Buscar». Enter sobre «Ir a Apuntes» te lleva a Apuntes (ahí Esc no tiene nada que cerrar). Ctrl+1 a Ctrl+6 abren los seis destinos en el orden del riel.

## M06.5 · Ventana angosta · CA-035

- Hacé: achicá la ventana todo lo que se deje y recorré tres pantallas.
- Tenés que ver: ninguna barra de desplazamiento horizontal; el riel se compacta y nada queda tapado.
- Aclaración: la ventana no se deja achicar a menos de 400 píxeles de ancho. Con menos de 720 queda solo la columna de íconos del riel (cada uno con su nombre si apoyás el mouse).

## M06.6 · Zoom al 150 % · CA-035

- Hacé: apretá Ctrl y + hasta llegar a 150 %. Recorré Estudiar y Ajustes. Volvé con Ctrl y 0.
- Tenés que ver: todo más grande y nada se pisa ni se corta.
- Aclaración: Ctrl y + sube de a un paso (110 %, 125 % y 150 % son tres toques), Ctrl y - baja y Ctrl y 0 vuelve al 100 %. Retenia no tiene menú, así que estas teclas las maneja ella misma (antes no andaban).

## M06.7 · Escala de Windows · CA-035

- Hacé: en Windows: Configuración → Sistema → Pantalla → Escala: 125 %. Mirá Retenia. Volvé a tu escala habitual.
- Tenés que ver: texto nítido, sin elementos fuera de lugar.

## M06.8 · Textos limpios · CA-036

- Hacé: recorré las seis pantallas y la galería leyendo los textos.
- Tenés que ver: ningún «undefined», «null», palabra en inglés suelta ni texto de relleno.

## M06.9 · Sin castigos · CA-037

- Hacé: en la galería, buscá el componente «Resultado» en su variante «Todavía no.».
- Tenés que ver: fondo gris neutro, palabra e ícono. Nada rojo en toda la galería.
- Aclaración: la variante se llama «Variante: Todavía no.» y la tarjeta dice «Todavía no.». Justo debajo hay otra con «Provisional» y el borde punteado, y después «No pude evaluarla con seguridad.», que es la única en naranja (el color que Retenia reserva para fallas que piden una decisión tuya; no es rojo).

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Algunas ideas: crear una tarjeta sin pregunta (el aviso va en ámbar, no en rojo), repasar una tarjeta, eliminarla y restaurarla desde Apuntes › «Papelera», cambiar de tema y de pantalla con el teclado, achicar la ventana en medio de un repaso, apretar Ctrl y + varias veces con el cuadro «Buscar» abierto.

## Lo que ya comprobé yo (17/10/2026)

Contra el programa andando como lo abre `npm run iniciar` (la misma carpeta de datos, después de `npm run datos:reiniciar`), manejándolo por sus nombres y mirando las capturas:

- S1: ventana «Retenia», cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027», pantalla inicial Estudiar, ningún cartel de error.
- S2: «Todo en orden · 0 diferencias».
- M06.1: las seis pantallas abren con su título y cada una tiene un solo botón cobalto («Ir a Apuntes» en cuatro, «Nueva tarjeta» en Apuntes, «Hacer copia ahora» en Ajustes).
- M06.2: con «Oscuro» el fondo pasó a oscuro al instante; cerré y abrí y seguía oscuro; la dejé en «Según el sistema». Miré las capturas en claro y en oscuro: se lee bien (el contraste de todos los pares de colores lo mide además una prueba automática).
- M06.3: 18 componentes y los seis estados; recorrí la galería hasta el final (7.216 píxeles de alto); sin textos cortados ni superpuestos, a 1.100 y a 400 píxeles de ancho.
- M06.4: **hacerla a mano me hizo encontrar un defecto**: si antes se usaba el mouse, Ctrl+3 dejaba el foco en el título sin contorno. Está arreglado y con prueba (ver `docs/decisiones.md`). Ahora: Ctrl+3 abre Materiales con contorno de 2 píxeles y 2 de separación; Tab pasa por «Ir a Apuntes», «Buscar» y el riel, siempre con contorno; Ctrl+K abre «Buscar» y Esc lo cierra y el foco vuelve a donde estaba.
- M06.5: a 400 píxeles no hay barra horizontal en Estudiar, Apuntes ni Ajustes, el riel queda de íconos y nada se superpone; a la ventana de verdad le pedí 200 × 200 y quedó en 400 × 360.
- M06.6: Ctrl y + tres veces llegó al 150 %; Estudiar y Ajustes, sin barra ni superposiciones; Ctrl y 0 volvió al 100 %.
- M06.8: leí el texto de las seis pantallas y de la galería: ningún «undefined», «null», inglés suelto ni relleno.
- M06.9: la tarjeta «Todavía no.» es gris neutro (#e9ebef en claro) con palabra e ícono; en toda la galería no se dibuja ningún color rojo (se midieron todos los colores que dibuja el navegador, en claro y en oscuro).
- Libre: **no la pude hacer como persona**. Hice dos sesiones de uso al azar con el programa real (850 acciones entre toques, teclas, texto escrito —incluso 300 letras seguidas y emojis—, cambios de tamaño, zoom y tema): no apareció ningún error ni texto roto, y «Verificar datos» terminó en «Todo en orden · 0 diferencias». No tocó el Laboratorio ni «Abrir carpeta de copias».

**No pude comprobar:** M06.7 (no cambio la escala de tu Windows; la simulé con el interruptor de Chromium al 125 % y las seis pantallas quedan bien, pero la prueba con la escala real es tuya), cómo se ve el programa en tu monitor y la prueba libre de verdad.

## Capturas de las pantallas nuevas

En `docs/pruebas-manuales/capturas/`, en claro y en oscuro (terminan en `-claro.png` y `-oscuro.png`):

- `fase-06-1-estudiar`: Estudiar con su estado vacío y «Ir a Apuntes».
- `fase-06-2-apuntes`: Apuntes con la lista de tarjetas y sus tres secciones.
- `fase-06-3-materiales`, `fase-06-4-idiomas` y `fase-06-5-progreso`: los tres destinos vacíos.
- `fase-06-6-ajustes`: Ajustes con «Apariencia», «Datos y copias» y «Demostración».
- `fase-06-7-buscar`: el cuadro «Buscar» abierto.
- `fase-06-8-galeria-principio` y `fase-06-8-galeria-estados`: el principio de la galería y sus seis estados.
- `fase-06-9-oscuro-elegido`: el tema oscuro elegido a mano con el sistema en claro (una sola imagen).

Se vuelven a sacar con `node tools/capturas.mjs fase-06` (después de `npm run construir`). Las capturas de referencia que la red compara en cada corrida (cada pantalla y cada tramo de la galería, 46 imágenes) están en `tests/e2e/capturas-de-referencia`; no se actualizan sin que veas la diferencia y la apruebes.

## Registro

| Prueba | Resultado | Observaciones |
|---|---|---|
| S1 | | |
| S2 | | |
| M06.1 | | |
| M06.2 | | |
| M06.3 | | |
| M06.4 | | |
| M06.5 | | |
| M06.6 | | |
| M06.7 | | |
| M06.8 | | |
| M06.9 | | |
| Libre | | |
