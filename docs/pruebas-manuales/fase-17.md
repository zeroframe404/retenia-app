# Pruebas manuales · Fase 17 · Objetivos, dominio y requisitos

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Para practicar el ejercicio abierto: Apuntes → «Tarjetas» → **Tipo › «Ejercicio»** (los ejercicios quedan al final de la lista) → en «Un intervalo de confianza del 95 %…», «Practicar ahora». Escribí cualquier cosa, tocá «Enviar» y marcá las unidades en «La cubrí: idea 1», «idea 2» e «idea 3». Para la pista de concepto, antes de «Enviar» tocá «Pista» dos veces (la primera es la pregunta orientadora; la segunda, la de concepto). «Siguiente» guarda el resultado.

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen letra por letra, salvo lo que está en «Qué difiere de tu plan», al final. Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-17-`.

Yo hice S1 a S5, M17.1 a M17.11 y un rato de uso libre contra el programa de prueba armado, con una carpeta de datos nueva (lo mismo que deja `npm run datos:reiniciar`), en este orden, el 25/11/2026: todas dieron bien. Al lado de cada una dejo qué vi. Lo que no pude hacer como vos: manejé la ventana con un guion (Playwright) en vez de con el mouse, y no probé con el lector de pantalla.

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Lo que vi: la ventana «Retenia», la cinta exacta, Estudiar y ningún cartel de error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».
- Lo que vi: «Todo en orden · 0 diferencias» (también al final de todo, después del uso libre).

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.
- Lo que vi: eso mismo, con «¿Qué mide el desvío estándar?».

## S4 · Humo · Se puede buscar

- Hacé: apretá Ctrl+K, escribí desvio y después Esc.
- Tenés que ver: aparece «¿Qué mide el desvío estándar?» aunque lo escribiste sin tilde; con Esc se cierra y quedás donde estabas.
- Lo que vi: el resultado aparece; Esc cierra y sigo en Estudiar.

## S5 · Humo · La fuente está a un clic

- Hacé: Materiales → «Inferencia — capítulos 1 a 4.pdf» → clic en cualquier cita resaltada → «Ver en el original».
- Tenés que ver: se abre la página del PDF con el pasaje resaltado.
- Lo que vi: la página con el pasaje resaltado.

## M17.1 · Crear un objetivo · CA-143

- Hacé: Progreso → «Nuevo objetivo». Tema: Intervalos de confianza. Texto: Interpretar un intervalo de confianza. Tipo: Comprender. Enlazale el ejercicio abierto del intervalo (en «Actividades», la casilla de «Un intervalo de confianza del 95 %…», marcada «Ejercicio»).
- Tenés que ver: el objetivo aparece en la lista con el estado «Sin iniciar».
- Lo que vi: Progreso abre en «Objetivos». El cartel «Objetivo creado: Interpretar un intervalo de confianza» y, en «Intervalos de confianza», debajo de «Recordar: Intervalos de confianza», la fila «Interpretar un intervalo de confianza» con «Sin iniciar» (escalón 1 de 5), «Comprender» y «1 actividad».

## M17.2 · Con ayuda no acredita · CA-148

- Hacé: practicá el ejercicio usando una pista de concepto y marcá las 3 unidades. Volvé a Progreso y abrí el panel del objetivo.
- Tenés que ver: el objetivo dice «En práctica» y el intento figura en la columna «Con ayuda».
- Lo que vi: el resultado «Logrado con pista de concepto»; en Progreso, «En práctica»; en el panel, «Con ayuda: 1 · Última: 15/03/2027».

## M17.3 · Un intento sin ayuda no alcanza · CA-144

- Hacé: Ajustes → «Demostración» → «+1 día». Practicalo otra vez, ahora sin pistas, y marcá las 3 unidades.
- Tenés que ver: el objetivo sigue «En práctica»: un solo acierto sin ayuda no lo hace avanzar.
- Lo que vi: «Correcto.» y el objetivo sigue «En práctica».

## M17.4 · Dos días distintos · CA-145

- Hacé: Ajustes → «Demostración» → «+1 día». Practicá de nuevo sin pistas y con las 3 unidades.
- Tenés que ver: el objetivo pasa a «Suficiente para avanzar».
- Lo que vi: «Correcto.» y «Suficiente para avanzar» (escalón 4 de 5).

## M17.5 · Consolidar con demora · CA-146

- Hacé: «+7 días». Practicá otra vez sin pistas y con las 3 unidades.
- Tenés que ver: el objetivo pasa a «Consolidado».
- Lo que vi: «Correcto.» y «Consolidado» (escalón 5 de 5).

## M17.6 · Fallar no reinicia · CA-147

- Hacé: «+1 día». Practicá y marcá 0 unidades.
- Tenés que ver: el objetivo pasa a «A revisar», no a «Sin iniciar».
- Lo que vi: «Todavía no.» (con la tercera línea «Mirá la explicación: parece un olvido.») y el objetivo en «A revisar».

## M17.7 · El panel de evidencias · CA-149

- Hacé: abrí el panel del objetivo.
- Tenés que ver: cuatro columnas («Sin ayuda», «Con ayuda», «Diferido», «Variantes») con conteos y fechas, y una línea que dice qué falta.
- Lo que vi: «Sin ayuda 3 · Última: 24/03/2027», «Con ayuda 1 · Última: 15/03/2027», «Diferido 1 · Última: 24/03/2027», «Variantes 0 · Ninguna todavía»; «Qué falta para volver a «Suficiente para avanzar»: un acierto sin ayuda otro día.» y, con el rótulo «Estimado», «Lo que estima Retenia de «intervalo de confianza»: unos 7 de cada 10, con 5 observaciones.».

## M17.8 · Un requisito que bloquea · CA-151

- Hacé: abrí «Calcular la media y el desvío» (ya viene en el elenco, en «Media y dispersión») → «Marcar como requisito de…» → Objetivo: «Interpretar un intervalo de confianza», Tipo de requisito: «Indispensable», «Lo confirmo» tildado → «Guardar». Abrí Estudiar. Después, en el requisito (el panel de «Calcular la media y el desvío», en «Es requisito de»), tocá «Esto no es necesario para aquello».
- Tenés que ver: primero «Antes conviene: Calcular la media y el desvío». Al desmarcarlo, la propuesta deja de mencionarlo.
- Lo que vi: la propuesta empieza por «Antes conviene: Calcular la media y el desvío» y «Por qué: «Interpretar un intervalo de confianza» necesita «Calcular la media y el desvío», que todavía está en «Sin iniciar».», con «Practicar ahora» y «Esto no es necesario para aquello». Después de descartarlo («Listo: ese requisito ya no frena.»), Estudiar ya no lo nombra.

## M17.9 · La tarjeta que no entra · CA-154

- Hacé: Progreso → «Mejorar la tarjeta».
- Tenés que ver: «¿Qué significa el 95 % en un intervalo de confianza del 95 %?» con las opciones «Reformular», «Dividir en dos», «Agregar una pista» y «Ver en el original».
- Lo que vi: esa tarjeta, «4 fallos» y los cuatro botones.

## M17.10 · Mis errores · CA-155

- Hacé: fallá a propósito una respuesta corta escribiendo cualquier cosa (por ejemplo, «Capital de Francia» con «asdf»). Abrí Progreso → «Mis errores».
- Tenés que ver: tu respuesta tal como la escribiste, la correcta y un tipo de error que podés cambiar.
- Lo que vi: en el resultado, «Todavía no.», «Revisá las letras marcadas: escribiste «asdf» y la respuesta es «París».» y «Mirá la explicación: parece un olvido.». En «Mis errores», en «Sin tema»: «Capital de Francia», «Tu respuesta: asdf», «La correcta: París» y «Tipo de error» en «No lo recordaba»; lo cambié a «Distracción» («Tipo de error guardado.»).

## M17.11 · La tabla de dominio · CA-156

- Hacé: `npm run tablero` → «Tabla de casos de dominio».
- Tenés que ver: las secuencias de fechas con sus estados y el renglón de la estimación con «0,535», esperado y obtenido iguales.
- Lo que vi: «Tabla de casos de dominio», todos iguales; entre ellos «Estimación 2 y 2 + acierto con pista de concepto» → «2,3 y 2 · media 0,535» en esperado y en obtenido. El tablero muestra lo de la última corrida de la red: si acabás de reiniciar la PC y no corrió ninguna, corré antes `npm run verificar`.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Lo que hice: un objetivo «Entender la mediana» (aviso: «Empezá con lo que vas a poder hacer…»); «Ya lo sé» → «Suficiente para avanzar (por verificar)» con la comprobación desde mañana; «No quiero esto ahora» y «Retomar»; «Enlazar actividades»; «Dividir en dos» en la tarjeta del 95 % (la lista quedó vacía: «Ninguna tarjeta necesita mejoras.»). Al final, «Verificar datos»: «Todo en orden · 0 diferencias».

## Qué difiere de tu plan

1. **M17.8**: «Calcular la media y el desvío» ya viene en el elenco (lo decidiste así): en lugar de crearlo, lo abrís y lo marcás como requisito. El botón se llama «Marcar como requisito de…».
2. **M17.7**: «Diferido» dice 1 (los aciertos con 7 días o más de demora: el del 24/03), como decidiste.
3. Progreso tiene cuatro secciones: «Objetivos» (al abrir), «Mis errores», «Mejorar la tarjeta» y «Dudas y revisiones». Después de guardar una duda o mandar una tarjeta a revisión, abre en «Dudas y revisiones».
4. «Ver en el original» de «Mejorar la tarjeta» abre la página 6 del PDF (la de la cita), sin el pasaje resaltado: las citas del elenco no traen el recuadro. Desde una cita del visor (S5) sí se resalta.
5. Tras cualquier fallo de un ejercicio, la tercera línea dice qué sigue y por qué (por ejemplo «Mirá la explicación: parece un olvido.»): antes decía solo «Mirá la explicación.».
6. Una captura de referencia cambia a propósito y espera tu aprobación: Progreso (ahora abre en «Objetivos»). Está en `docs/pruebas-manuales/capturas/fase-17-referencia-progreso-{claro,oscuro}-nueva.png`. Siguen pendientes las dos de la Fase 16.
