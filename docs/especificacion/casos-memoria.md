# Tabla de casos del motor de memoria

Anexo de `historias.md` para CA-059 (H-15). Generada el 04/11/2026 con la biblioteca ts-fsrs 5.4.2 (FSRS-6 con sus 21 parámetros por defecto, sin variación al azar y sin pasos de minutos) y revisada contra la fórmula publicada de FSRS-6, escrita aparte sin la biblioteca. **Está congelada**: la red comprueba en cada corrida que el motor de Retenia da exactamente estas fechas, y el tablero la muestra como «Tabla de casos del motor» con lo esperado y lo obtenido.

## Cómo se lee

- Cada caso empieza con una tarjeta nueva creada el lunes 15/03/2027 a las 10:00 (hora de Buenos Aires), de la materia activa (retención objetivo 0,90) o de una materia en mantenimiento (0,85).
- Los pasos van separados por comas. «en su fecha» es el día en que vencía; «5 días tarde», cinco días después de ese día; «1 día antes», uno antes; «el mismo día», el día del paso anterior.
- La ayuda (CA-064): «con pista de concepto» o «con pista de paso» y «La sabía» el motor lo toma como «Con dudas»; «con la solución vista», como «No la sabía»; «con pregunta orientadora» no cambia nada. Un intento «interrumpido» o «con la tarjeta marcada como defectuosa» no mueve nada.
- Solo el primer repaso de cada día de estudio llega al motor: otro el mismo día queda en el historial y no cambia la fecha.
- «deshacer» anula el último repaso (CA-063): la tarjeta queda como si no hubiera existido. «cambió lo que hay que recordar» la vuelve a programar como nueva.
- «Fechas esperadas» dice el próximo repaso después de cada paso, en orden; «sin repasar» es una tarjeta que quedó nueva. La última columna es la estabilidad (en días) y la dificultad (de 1 a 10) al final.

## Revisión a mano contra la fórmula publicada

La fórmula de FSRS-6 (wiki «The Algorithm» de open-spaced-repetition) con los parámetros por defecto `w0…w20 = 0,212 · 1,2931 · 2,3065 · 8,2956 · 6,4133 · 0,8334 · 3,0194 · 0,001 · 1,8722 · 0,1666 · 0,796 · 1,4835 · 0,0614 · 0,2629 · 1,6483 · 0,6014 · 1,8729 · 0,5425 · 0,0912 · 0,0658 · 0,1542`:

- Probabilidad de recordar a los t días: R = (1 + F · t / S)^(−w20), con F = 0,9^(−1/w20) − 1 = 0,98035. Así, a los S días, R = 0,90.
- Intervalo para una retención r: I = S / F · (r^(−1/w20) − 1), redondeado al día y nunca menos de 1. Con r = 0,90 da I = S; con r = 0,85 da I = 1,9064 · S.
- Primer repaso: S = w0, w1 o w2 según «No la sabía», «Con dudas» o «La sabía»; D = w4 − e^(w5 · (G − 1)) + 1.
- Después de recordar: S' = S · (1 + e^w8 · (11 − D) · S^(−w9) · (e^(w10 · (1 − R)) − 1) · w15 si fue «Con dudas»).
- Después de olvidar: S' = w11 · D^(−w12) · ((S + 1)^w13 − 1) · e^(w14 · (1 − R)), nunca más que S / e^(w17 · w18).
- Dificultad: D' = w7 · D₀(fácil) + (1 − w7) · (D − w6 · (G − 3) · (10 − D) / 9).

Cuentas hechas a mano (con cuatro decimales):

- **C01** «La sabía»: S = w2 = 2,3065; con r = 0,90, I = 2,3065 → 2 días → **17/03/2027**. **C02** «Con dudas»: S = w1 = 1,2931 → 1 día → **16/03/2027**. **C03** «No la sabía»: S = w0 = 0,2120 → 0,21, que sube al mínimo de 1 día → **16/03/2027**. Son las tres fechas de CA-058.
- **C04**, mantenimiento: la misma S = 2,3065, pero I = 1,9064 · 2,3065 = 4,3972 → 4 días → **19/03/2027**, dos días más tarde que en la materia activa (CA-060).
- **C07**, segundo «La sabía» en su fecha (17/03, t = 2): D = 6,4133 − e^(0,8334 · 2) + 1 = 2,1181; R = (1 + 0,98035 · 2 / 2,3065)^(−0,1542) = 0,9095; S' = 2,3065 · (1 + 6,5026 · 8,8819 · 0,8700 · (e^(0,796 · 0,0905) − 1)) = 2,3065 · (1 + 6,5026 · 8,8819 · 0,8700 · 0,0747) = 2,3065 · 4,7537 = 10,9643 → 11 días → **28/03/2027**. La dificultad baja apenas: D' = 2,1112.
- **C14**, «No la sabía» en su fecha (28/03, t = 11, S = 10,9643, D = 2,1112): R = 0,8998; S' = 1,4835 · 2,1112^(−0,0614) · (11,9643^0,2629 − 1) · e^(1,6483 · 0,1002) = 1,4835 · 0,9552 · 0,9203 · 1,1796 = 1,5383, por debajo del techo 10,9643 / e^(0,5425 · 0,0912) = 10,4350 → 2 días → **30/03/2027**.
- **C21**, «La sabía» 5 días tarde (22/03, t = 7 en vez de 2): R = 0,8083, más baja que en fecha, y S' = 2,3065 · (1 + 6,5026 · 8,8819 · 0,8700 · 0,1649) = 21,4114 en vez de 10,9643 → 21 días → **12/04/2027**, más tarde que los 28/03 de C07 (CA-061).

El resto de los renglones los recalcula la red en cada corrida con el motor de Retenia y, aparte, con la fórmula publicada; si alguno no coincide, la red da rojo.

Dos reglas no son de la fórmula sino de cómo la biblioteca arma la agenda, y la tabla las respeta: cada paso se redondea a 8 decimales, y en una tarjeta ya repasada «La sabía» siempre vuelve al menos un día después que «Con dudas».

## Cómo se agrega un caso

Escribí en Claude Code «Agregá un caso:» seguido de la secuencia en castellano. El caso nuevo se calcula con la biblioteca, se revisa contra la fórmula publicada y se suma al final de la tabla con el número que sigue (`node tools/casos-memoria.mjs agregar "…"`); después corre la red y aparece en el tablero.

## La tabla

| Caso | Secuencia | Fechas esperadas | Estabilidad · dificultad al final |
|---|---|---|---|
| C01 | tarjeta nueva, La sabía el 15/03/2027 | 17/03/2027 | 2,3065 · 2,1181 |
| C02 | tarjeta nueva, Con dudas el 15/03/2027 | 16/03/2027 | 1,2931 · 5,1122 |
| C03 | tarjeta nueva, No la sabía el 15/03/2027 | 16/03/2027 | 0,2120 · 6,4133 |
| C04 | tarjeta nueva de una materia en mantenimiento, La sabía el 15/03/2027 | 19/03/2027 | 2,3065 · 2,1181 |
| C05 | tarjeta nueva de una materia en mantenimiento, Con dudas el 15/03/2027 | 17/03/2027 | 1,2931 · 5,1122 |
| C06 | tarjeta nueva de una materia en mantenimiento, No la sabía el 15/03/2027 | 16/03/2027 | 0,2120 · 6,4133 |
| C07 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha | 17/03/2027 · 28/03/2027 | 10,9643 · 2,1112 |
| C08 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha | 17/03/2027 · 28/03/2027 · 13/05/2027 | 46,2802 · 2,1043 |
| C09 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha, La sabía en su fecha | 17/03/2027 · 28/03/2027 · 13/05/2027 · 23/10/2027 | 162,8622 · 2,0975 |
| C10 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha, La sabía en su fecha, La sabía en su fecha | 17/03/2027 · 28/03/2027 · 13/05/2027 · 23/10/2027 · 03/03/2029 | 497,4472 · 2,0906 |
| C11 | tarjeta nueva, Con dudas el 15/03/2027, Con dudas en su fecha, Con dudas en su fecha | 16/03/2027 · 19/03/2027 · 26/03/2027 | 6,7283 · 7,8214 |
| C12 | tarjeta nueva, Con dudas el 15/03/2027, La sabía en su fecha, La sabía en su fecha | 16/03/2027 · 21/03/2027 · 07/04/2027 | 16,5513 · 5,0924 |
| C13 | tarjeta nueva, No la sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha, La sabía en su fecha | 16/03/2027 · 18/03/2027 · 24/03/2027 · 10/04/2027 | 17,3792 · 6,3798 |
| C14 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, No la sabía en su fecha | 17/03/2027 · 28/03/2027 · 30/03/2027 | 1,5383 · 7,3922 |
| C15 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha, No la sabía en su fecha | 17/03/2027 · 28/03/2027 · 13/05/2027 · 16/05/2027 | 2,9326 · 7,3900 |
| C16 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha, No la sabía en su fecha, La sabía en su fecha | 17/03/2027 · 28/03/2027 · 13/05/2027 · 16/05/2027 · 24/05/2027 | 7,7782 · 7,3778 |
| C17 | tarjeta nueva, La sabía el 15/03/2027, No la sabía en su fecha, No la sabía en su fecha | 17/03/2027 · 18/03/2027 · 19/03/2027 | 0,2188 · 9,1288 |
| C18 | tarjeta nueva, No la sabía el 15/03/2027, No la sabía en su fecha, No la sabía en su fecha | 16/03/2027 · 17/03/2027 · 18/03/2027 | 0,0550 · 9,5929 |
| C19 | tarjeta nueva, La sabía el 15/03/2027, Con dudas en su fecha, No la sabía en su fecha, La sabía en su fecha | 17/03/2027 · 25/03/2027 · 26/03/2027 · 29/03/2027 | 2,7158 · 8,2475 |
| C20 | tarjeta nueva, La sabía el 15/03/2027, La sabía 1 día tarde | 17/03/2027 · 01/04/2027 | 13,8269 · 2,1112 |
| C21 | tarjeta nueva, La sabía el 15/03/2027, La sabía 5 días tarde | 17/03/2027 · 12/04/2027 | 21,4114 · 2,1112 |
| C22 | tarjeta nueva, La sabía el 15/03/2027, La sabía 30 días tarde | 17/03/2027 · 24/05/2027 | 38,1612 · 2,1112 |
| C23 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía 5 días tarde | 17/03/2027 · 28/03/2027 · 29/05/2027 | 56,5720 · 2,1043 |
| C24 | tarjeta nueva, La sabía el 15/03/2027, No la sabía 5 días tarde | 17/03/2027 · 23/03/2027 | 0,7179 · 7,3945 |
| C25 | tarjeta nueva, La sabía el 15/03/2027, No la sabía 30 días tarde | 17/03/2027 · 17/04/2027 | 0,9146 · 7,3945 |
| C26 | tarjeta nueva, La sabía el 15/03/2027, Con dudas 30 días tarde | 17/03/2027 · 10/05/2027 | 23,8695 · 4,7529 |
| C27 | tarjeta nueva, Con dudas el 15/03/2027, La sabía 1 día tarde | 16/03/2027 · 24/03/2027 | 6,5747 · 5,1023 |
| C28 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía 30 días tarde | 17/03/2027 · 28/03/2027 · 25/07/2027 | 88,9020 · 2,1043 |
| C29 | tarjeta nueva, La sabía el 15/03/2027, La sabía 1 día antes | 17/03/2027 · 23/03/2027 | 7,3153 · 2,1112 |
| C30 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía 5 días antes | 17/03/2027 · 28/03/2027 · 25/04/2027 | 33,2191 · 2,1043 |
| C31 | tarjeta nueva, No la sabía el 15/03/2027, La sabía el mismo día | 16/03/2027 · 16/03/2027 | 0,2120 · 6,4133 |
| C32 | tarjeta nueva, La sabía el 15/03/2027, No la sabía el mismo día | 17/03/2027 · 17/03/2027 | 2,3065 · 2,1181 |
| C33 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, No la sabía el mismo día, La sabía el mismo día | 17/03/2027 · 28/03/2027 · 28/03/2027 · 28/03/2027 | 10,9643 · 2,1112 |
| C34 | tarjeta nueva de una materia en mantenimiento, La sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha | 19/03/2027 · 19/04/2027 · 09/10/2027 | 90,9889 · 2,1043 |
| C35 | tarjeta nueva de una materia en mantenimiento, La sabía el 15/03/2027, La sabía 5 días tarde | 19/03/2027 · 09/05/2027 | 23,9930 · 2,1112 |
| C36 | tarjeta nueva de una materia en mantenimiento, La sabía el 15/03/2027, La sabía en su fecha, No la sabía en su fecha | 19/03/2027 · 19/04/2027 · 23/04/2027 | 2,0189 · 7,3922 |
| C37 | tarjeta nueva, La sabía el 15/03/2027 con pista de concepto | 16/03/2027 | 1,2931 · 5,1122 |
| C38 | tarjeta nueva, La sabía el 15/03/2027 con pista de paso | 16/03/2027 | 1,2931 · 5,1122 |
| C39 | tarjeta nueva, La sabía el 15/03/2027 con la solución vista | 16/03/2027 | 0,2120 · 6,4133 |
| C40 | tarjeta nueva, La sabía el 15/03/2027 con pregunta orientadora | 17/03/2027 | 2,3065 · 2,1181 |
| C41 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha con pista de concepto | 17/03/2027 · 25/03/2027 | 7,5133 · 4,7529 |
| C42 | tarjeta nueva, La sabía el 15/03/2027, Con dudas en su fecha con la solución vista | 17/03/2027 · 18/03/2027 | 0,6076 · 7,3945 |
| C43 | tarjeta nueva, La sabía el 15/03/2027, interrumpido en su fecha, La sabía el mismo día | 17/03/2027 · 17/03/2027 · 28/03/2027 | 10,9643 · 2,1112 |
| C44 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha con la tarjeta marcada como defectuosa | 17/03/2027 · 17/03/2027 | 2,3065 · 2,1181 |
| C45 | tarjeta nueva, No la sabía el 15/03/2027 con pista de concepto | 16/03/2027 | 0,2120 · 6,4133 |
| C46 | tarjeta nueva, La sabía el 15/03/2027, deshacer | 17/03/2027 · sin repasar | nueva |
| C47 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, deshacer | 17/03/2027 · 28/03/2027 · 17/03/2027 | 2,3065 · 2,1181 |
| C48 | tarjeta nueva, La sabía el 15/03/2027, deshacer, Con dudas el mismo día | 17/03/2027 · sin repasar · 16/03/2027 | 1,2931 · 5,1122 |
| C49 | tarjeta nueva, La sabía el 15/03/2027, No la sabía en su fecha, deshacer, La sabía el mismo día | 17/03/2027 · 18/03/2027 · 17/03/2027 · 28/03/2027 | 10,9643 · 2,1112 |
| C50 | tarjeta nueva, No la sabía el 15/03/2027, La sabía el mismo día, deshacer | 16/03/2027 · 16/03/2027 · 16/03/2027 | 0,2120 · 6,4133 |
| C51 | tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, cambió lo que hay que recordar el 20/03/2027, La sabía el mismo día | 17/03/2027 · 28/03/2027 · sin repasar · 22/03/2027 | 2,3065 · 2,1181 |
