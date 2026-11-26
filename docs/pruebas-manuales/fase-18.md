# Pruebas manuales · Fase 18 · Procedimientos, variantes e intercalado

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Para practicar algo: apretá **Ctrl+K**, escribí el nombre y, abajo del primer resultado, tocá **«Practicar ahora»**. También está en Apuntes → «Tarjetas» → Tipo › «Ejercicio».

«+1 día» está en Ajustes → «Demostración». Hacé las pruebas M18.1 a M18.9 en orden y sin reiniciar los datos entre una y otra.

Los textos de abajo son los que muestra el programa. Los de tu lista salen letra por letra; lo que cambia en los pasos está en «Qué difiere de tu plan», al final. Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-18-`.

Yo hice S1 a S5, M18.1 a M18.9 y un rato de uso libre contra el programa de prueba armado, con una carpeta de datos nueva (lo mismo que deja `npm run datos:reiniciar`), en ese orden, el 26/11/2026, y las repetí enteras después de arreglar lo que marcó el revisor: todas dieron bien. Además arranqué `npm run iniciar` y comprobé que abre la ventana «Retenia» sin errores. Al lado de cada una dejo qué vi. **Lo que no pude hacer como vos:** manejé la ventana con un guion (Playwright) en vez de con el mouse, no miré con mis ojos la ventana de `npm run iniciar` (comprobé su título), y no probé con el lector de pantalla.

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Lo que vi: eso, exacto.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».
- Lo que vi: eso, también al final de todo y después del uso libre.

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.
- Lo que vi: eso. «Deshacer» deja la misma tarjeta en la pregunta, con «0/70».

## S4 · Humo · Se puede buscar

- Hacé: apretá Ctrl+K, escribí desvio y después Esc.
- Tenés que ver: aparece «¿Qué mide el desvío estándar?» aunque lo escribiste sin tilde; con Esc se cierra y quedás donde estabas.
- Lo que vi: eso.

## S5 · Humo · La fuente está a un clic

- Hacé: Materiales → «Inferencia — capítulos 1 a 4.pdf» → clic en cualquier cita resaltada → «Ver en el original».
- Tenés que ver: se abre la página del PDF con el pasaje resaltado.
- Lo que vi: la página del PDF con el pasaje resaltado.

## M18.1 · El ejemplo completo · CA-157

- Hacé: buscá «Calcular un intervalo de confianza para la media» y «Practicar ahora».
- Tenés que ver: «Ejemplo resuelto», los 4 pasos con su «Resultado:» y su explicación, y en el paso 1 la pregunta «¿Por qué este paso?» con un campo («Tu respuesta queda guardada y no se califica.»).
- Lo que vi: eso. Hasta que no escribís algo, «Terminar el ejemplo» está apagado.

## M18.2 · Se va vaciando · CA-158

- Hacé: respondé y tocá «Terminar el ejemplo» → «Terminar». «+1 día», practicalo: **es el ejemplo otra vez, con otros números**; respondé y terminá. «+1 día» y practicalo otra vez.
- Tenés que ver: el segundo día, «La vez pasada escribiste: «…»» y al terminar «La próxima vez, otro día: con el último paso vacío.» con «Un paso menos de apoyo: te salió bien en 2 días distintos.». El tercer día, «Completá el último paso; los demás ya están resueltos.», con el paso 4 vacío («Paso 4: tu resultado») y otros números.
- Lo que vi: eso. Los tres días salieron números distintos.

## M18.3 · El error, por paso · CA-160

- Hacé: en «Paso 4: tu resultado» escribí un número cualquiera mal y tocá «Enviar».
- Tenés que ver: «Hay un error en el paso 4; ¿lo encontrás?», el campo «Paso 4: probá de nuevo» con «Reintentar el paso 4» y «Ver la corrección». Todavía no se ve ningún resultado.
- Seguí: reintentá (mal: «El paso 4 todavía no sale. Probá otra vez o mirá la corrección.»; bien: «Ahora sí: el paso 4 quedó bien.») → «Ver la corrección» → «Ver el resultado» → «Terminar».
- Lo que vi: eso, y el resultado en tres líneas: «Vas bien.» · «Corregiste el paso 4 al reintentar.» · «La próxima vez, otro día: con el último paso vacío.», con «Terminar», «Otro problema» y «Discrepo».

## M18.4 · Elegir el método · CA-161

- Hacé: buscá «Una tienda quiere saber qué talle» (o «En una empresa») y «Practicar ahora». Elegí un método y «Enviar».
- Tenés que ver: «¿Qué método usarías? No lo resuelvas», «La media», «La mediana» y «La moda» (mezclados) y, al enviar, «El porqué de cada método», con «El que elegiste» y «El que conviene».
- Lo que vi: eso; con «La moda» en la de la tienda, «Correcto.». Con otra, «Todavía no.» y «La correcta: La moda».

## M18.5 · Problemas mezclados · CA-162

- Hacé: buscá «Media, mediana y moda», «Practicar ahora» y resolvé los 9.
- Tenés que ver: arriba «Media, mediana y moda · Problema 1 de 9»; ningún enunciado dice de qué tipo es. Al final, «Conjunto terminado» y «Los tipos, en el orden en que salieron», sin dos iguales seguidos.
- Lo que vi: los 9 sin nombrar el tipo y el cierre sin repetidos seguidos (el orden cambia cada vez que armás uno nuevo).

## M18.6 · Una variante distinta · CA-164

- Hacé: practicá «Calcular un intervalo de confianza para la media», mirá los números, «+1 día» y practicalo de nuevo.
- Tenés que ver: el mismo problema con otros números.
- Lo que vi: por ejemplo, «En una muestra de 16 datos, la media es 45 y el desvío estándar es 6» y al otro día «… 64 datos, la media es 70 … 24».

## M18.7 · Tarjeta de contraste · CA-163

- Hacé: Progreso → «Mis errores» → en el de «La correcta: La mediana» (viene en el elenco, es de la tarjeta del sueldo), «Crear tarjeta de contraste».
- Tenés que ver: «Tarjeta creada: ¿En qué se diferencian la media y la mediana?» y «Abrir la tarjeta».
- Lo que vi: eso. La respuesta sale de tus tarjetas «¿Qué es la media muestral?» y «¿Qué es la mediana?»; no se inventa nada. Tocarlo de nuevo dice «Ya tenías esa tarjeta: …».

## M18.8 · Micro-ejercicio · CA-166

- Hacé: practicá el procedimiento y escribí mal el paso 4 → «Enviar» → «Ver la corrección» → «Ver el resultado» → **«Otro problema»** → otra vez mal el paso 4, hasta ver el resultado → **«Terminar»**.
- Tenés que ver: «Práctica terminada» y el recuadro «Micro-ejercicio»: «Se repitió el mismo error en el paso «Calculá el límite superior del intervalo». Te propongo 7 ítems cortos sobre ese paso.», con «Hacer el micro-ejercicio».
- Seguí: cada ítem trae los pasos 1 a 3 en «Ya resuelto» y pide el 4. Al final, «Acertaste N de 7.» y «Llevás 1 de 2 sesiones buenas. Se supera con 2, en días distintos.» (con 6 o 7 aciertos).
- Lo que vi: eso. Hecha la de hoy, no se vuelve a proponer hasta otro día. Si ya habías fallado el paso 4 en M18.3, la propuesta puede aparecer con un solo fallo más. El cierre de una sesión de Estudiar también la propone. Si lo que fallás dos veces es el paso 2 (el 1,96, que da siempre lo mismo), no se propone: no hay ítems distintos para armar.

## M18.9 · El escalón se recuerda · CA-159

- Hacé: el mismo día, cerrá Retenia, abrilo y practicá el procedimiento.
- Tenés que ver: «Completá el último paso; los demás ya están resueltos.», no el ejemplo completo.
- Lo que vi: eso. **Ojo:** si en M18.8 fallaste el mismo paso en dos días seguidos (el de M18.3 y el de M18.8), al **día siguiente** vuelve el ejemplo completo: es la regla de CA-159 («dos fallos seguidos del mismo tipo traen un paso más de apoyo»).

## Libre · Uso libre

- Hacé: usalo cinco minutos como en un día de mucho estudio e intentá romperlo.
- Lo que probé: salir a mitad de un ejemplo y volver (muestra la lista), doble clic en cada botón, textos con símbolos y código, cerrar en el medio del conjunto (sigue en el mismo problema), «Restablecer fecha» (el escalón no retrocede), el editor con una cuenta mal escrita y un conjunto que nombra un tipo (avisa sin guardar), una numérica con variantes dos días, editar la ficha del procedimiento sin cambios, el micro-ejercicio dejado a medias desde Estudiar, y «Verificar datos» al final: «0 diferencias», sin errores internos. El conjunto retomado hasta el cierre, el cierre de una numérica con variantes y «Discrepo» en el procedimiento los cubren pruebas de pantalla nuevas.
- Lo que arreglé por esto: volver a «Tarjetas» reabría sola la última actividad practicada (ya pasaba antes, pero ahora anotaba números u otra vuelta sin pedirlo), y «Restablecer fecha» devolvía el apoyo al ejemplo completo.

## Qué difiere de tu plan

Los textos que escribiste salen igual. Difiere esto:

1. **M18.2, el segundo día:** no hay nada para «resolver»: es el ejemplo completo otra vez, con otros números. El apoyo se saca recién con 2 días bien (CA-158), así que el paso vacío aparece el tercer día, como esperás.
2. **La escalera tiene un escalón más que tu lista:** ejemplo, 1 vacío, 2 vacíos, **3 vacíos**, problema entero y variante. Tu lista de tareas saltaba los «tres vacíos», pero CA-158 los pide (lo aprobaste en la Fase 00: con 4 pasos faltaba ese).
3. **M18.8, «terminá la sesión»:** en «Practicar ahora» el cierre se llama «Práctica terminada» y se llega con «Terminar».
4. **M18.9** es el mismo día (ver el «Ojo» de arriba).
5. **Fuera de tus pruebas:** el 24/11/2026 decidiste que en esta fase los ejercicios iban a entrar solos en las sesiones de Estudiar. **No está hecho**: no figura en las tareas ni en los criterios de la Fase 18, y tu prueba S3 cuenta con que la sesión empiece por una tarjeta. Decime si lo sumo.
