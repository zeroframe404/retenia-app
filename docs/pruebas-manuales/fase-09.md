# Pruebas manuales · Fase 09 · Motor de memoria FSRS-6

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`. En otra terminal, `npm run tablero` (se abre en el navegador).

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen **letra por letra**, salvo uno que difiere y está en «Qué difiere de tu plan» (M09.2, que ya consultamos). Lo nuevo de esta fase está en la pantalla de cada tarjeta (Apuntes › «Tarjetas», tocá la pregunta): el botón «¿Por qué hoy?», y en el repaso, después de calificar, «Deshacer».

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».

## M09.1 · La tabla de casos · CA-058

- Hacé: en el tablero abrí «Tabla de casos del motor». Buscá los tres primeros renglones: tarjeta nueva con cada botón.
- Tenés que ver: esperado y obtenido iguales y en verde: 17/03/2027, 16/03/2027 y 16/03/2027.
- Aclaración: la sección está en «Tablas de casos: lo esperado y lo obtenido»; el título dice «Tabla de casos del motor · 51 casos · 51 iguales» y se abre tocándolo. Los tres primeros renglones son «C01 · tarjeta nueva, La sabía el 15/03/2027», «C02 · tarjeta nueva, Con dudas el 15/03/2027» y «C03 · tarjeta nueva, No la sabía el 15/03/2027»; el verde es la marca «Pasó». El tablero muestra la última corrida de la red: si acabás de cambiar algo, corré antes `npm run verificar`.

## M09.2 · Un caso propio · CA-059

- Hacé: en Claude Code escribí: Agregá un caso: tarjeta nueva, La sabía el 15/03, La sabía en su fecha, No la sabía en su fecha. Recargá el tablero.
- Tenés que ver: un renglón nuevo con las tres fechas calculadas: la segunda más lejana que la primera, y la tercera dos días después del fallo (30/03/2027).
- Aclaración: las fechas son 17/03/2027 · 28/03/2027 · 30/03/2027. El renglón nuevo queda al final de la tabla con el número que sigue (C52) y su secuencia tal como la escribiste. Claude Code corre la red y te muestra el renglón del tablero.

## M09.3 · Con dudas vuelve antes · CA-058

- Hacé: en Retenia, creá una tarjeta nueva suelta, tocá «Repasar», «Mostrar respuesta» y «Con dudas».
- Tenés que ver: «Próximo repaso: martes 16/03/2027».
- Aclaración: «Nueva tarjeta» está arriba de la lista de Apuntes › «Tarjetas»; la tarjeta nueva queda primera y su «Repasar» está en su fila.

## M09.4 · Mantenimiento espacia más · CA-060

- Hacé: abrí «Historia argentina», creá una tarjeta nueva y repasala con «La sabía».
- Tenés que ver: un próximo repaso posterior al miércoles 17/03/2027.
- Aclaración: «Historia argentina» se abre desde Estudiar → «Cambiar» → «Abrir» en su renglón (no la hace activa). Después, Apuntes › «Tarjetas» («12 tarjetas»), «Nueva tarjeta», «Repasar», «Mostrar respuesta» y «La sabía». Dice «Próximo repaso: viernes 19/03/2027».

## M09.5 · ¿Por qué hoy? · CA-065

- Hacé: en «¿Qué significa el 95 % en un intervalo de confianza del 95 %?» tocá «¿Por qué hoy?».
- Tenés que ver: una frase con los días desde el último repaso, cómo te fue y una probabilidad dicha como «unos N de cada 10», sin decimales.
- Aclaración: abrí la tarjeta tocando su pregunta en la lista (está en el tema «Intervalos de confianza»; con el filtro «Tema» la encontrás enseguida). Dice «La viste hace 1 día; la última vez no te salió; probabilidad estimada de recordarla: unos 6 de cada 10» y abajo «Estimación general (sin datos tuyos)», porque esa tarjeta tiene menos de 5 intentos. En «¿Qué mide el desvío estándar?» dice «La viste hace 23 días; la última vez te costó; probabilidad estimada de recordarla: unos 7 de cada 10». «¿Por qué hoy?» también está en el repaso, antes de mostrar la respuesta.

## M09.6 · Anular un repaso · CA-063

- Hacé: repasá cualquier tarjeta con «La sabía», anotá la fecha anterior y tocá «Deshacer». Abrí su «Historial».
- Tenés que ver: el próximo repaso vuelve a ser el de antes y el renglón nuevo dice «Anulado».
- Aclaración: la fecha anterior es la que dice la pantalla de la tarjeta («Próximo repaso: …») antes de tocar «Repasar». Al tocar «Deshacer» el repaso dice «Repaso anulado. Próximo repaso: …» con esa misma fecha (en una tarjeta nueva: «Repaso anulado. La tarjeta quedó sin repasar.») y vuelve a la pregunta, por si querés repasarla otra vez. Con «Volver a las tarjetas», abrí la tarjeta y tocá «Historial»: el último renglón dice «15/03/2027 · La sabía · Anulado».

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Aclaración: cosas de esta fase que vale la pena probar. Repasar dos veces la misma tarjeta el mismo día: la segunda queda en el historial como «Otro repaso del mismo día: no cambió la fecha» y no mueve la fecha (al motor solo le llega el primer intento del día). Hacer activa «Historia argentina» y volver a mirar las fechas de Estadística básica: pasan a la retención de mantenimiento y vuelven más tarde (con «Deshacer» en «Actividad reciente» vuelven). Ajustes › «Demostración» › «+7 días» y repasar una tarjeta atrasada: el intervalo siguiente es mayor que si la hubieras repasado en fecha, y no cuenta como fallo. Si después tocás «Restablecer fecha», los repasos de las tarjetas que repasaste en el día adelantado ya no mueven su fecha hasta volver a llegar a ese día: el historial los marca «Con una fecha anterior al último repaso que contó: no cambió la fecha» y «¿Por qué hoy?» dice «La última vez que la viste figura con una fecha posterior a hoy: la fecha volvió atrás.».

## Qué difiere de tu plan

- M09.2: tu plan decía «y la tercera al día siguiente del fallo». Con FSRS-6 sin retoques la tercera fecha es el 30/03/2027, **dos** días después del fallo del 28/03, porque esa tarjeta ya aguantaba 11 días. Lo consulté antes de cambiarlo y elegiste dejar el motor tal cual; el texto quedó «y la tercera dos días después del fallo (30/03/2027)». Todos los demás textos de tu plan salen letra por letra.
