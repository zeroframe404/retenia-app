# Pruebas manuales · Fase 11 · Carga en minutos y pantalla Estudiar

Preparación: en una terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Los textos de abajo son los que muestra el programa hoy. Los de tu lista salen **letra por letra**; hay dos puntos donde lo que ves difiere de lo que esperabas y los dejé al final, en «Qué difiere de tu plan». Las capturas de cada pantalla, en claro y en oscuro, están en `docs/pruebas-manuales/capturas` con el prefijo `fase-11-`.

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.
- Aclaración: la pantalla inicial es Estudiar. Ahora trae la tarjeta «Sesión recomendada · 25 min» (captura `fase-11-1-estudiar-25`).

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».

## S3 · Humo · Se puede estudiar

- Hacé: Estudiar → «Empezar» → «Mostrar respuesta» → «La sabía» → «Deshacer» → «Pausar».
- Tenés que ver: la respuesta aparece recién después de «Mostrar respuesta»; tras «Deshacer» volvés a la misma tarjeta sin calificar.
- Aclaración: «Empezar» arma ahora la sesión de 25 minutos: 70 actividades (60 repasos y 10 tarjetas nuevas), por eso el progreso dice «0/70».

## M11.1 · Una sola propuesta · CA-078

- Hacé: abrí Estudiar y contá los botones de color cobalto.
- Tenés que ver: «Sesión recomendada · 25 min», una línea «Por qué:» y un solo botón cobalto: «Empezar».
- Aclaración: la línea es «Por qué: hoy vencen 60 repasos (dato) y el tiempo es una estimación.» (lo observado entre paréntesis, lo estimado dicho como estimación). Junto a «Empezar» hay dos alternativas, «Versión corta (10 min)» y «Elegir otra actividad»; «Tengo:» y «Posponer» son controles.
- **Ojo con el orden:** S3 termina en «Pausar» y deja una sesión de hoy a medias. Con una sesión a medias, Estudiar muestra «Continuar: sesión de hoy (0 de 70)» como único botón cobalto y «Empezar» pasa a secundario (es la regla de la Fase 10 y de `pantallas.md`). Para ver M11.1 tal cual está escrito, hacelo con los datos recién reiniciados, antes de S3 (o repetí `npm run datos:reiniciar` y `npm run iniciar`). Ver «Qué difiere de tu plan».

## M11.2 · Tengo 25 · CA-079

- Hacé: en «Tengo:» tocá 25.
- Tenés que ver: «60 repasos y 10 tarjetas nuevas · unos 25 min».

## M11.3 · Tengo 10 · CA-080

- Hacé: en «Tengo:» tocá 10.
- Tenés que ver: «45 repasos, sin tarjetas nuevas · unos 10 min».
- Aclaración: los otros 15 repasos quedan para mañana, sin calificarse, recién cuando empezás esa sesión; mirarla no cambia nada (captura `fase-11-2-estudiar-10`).

## M11.4 · Tengo 5 · CA-081

- Hacé: en «Tengo:» tocá 5.
- Tenés que ver: «20 repasos, los más urgentes · unos 5 min».

## M11.5 · Tengo 45 · CA-082

- Hacé: en «Tengo:» tocá 45.
- Tenés que ver: «60 repasos y 18 tarjetas nuevas · unos 30 min». No inventa trabajo para llegar a 45.

## M11.6 · El ajuste vale una vez · CA-084

- Hacé: dejá elegido 10. Cerrá Retenia y abrilo.
- Tenés que ver: la propuesta volvió a 25 minutos («Sesión recomendada · 25 min»).

## M11.7 · Versión corta · CA-083

- Hacé: tocá «Versión corta (10 min)». Después «Pausar».
- Tenés que ver: empieza directo una sesión con «…/45» en el progreso, sin pasar por ninguna pantalla intermedia.
- Aclaración: el progreso dice «0/45». Los 15 repasos que no entraron quedan para mañana (en su historial, un aplazamiento). Después de «Pausar», Estudiar ofrece «Continuar: sesión de hoy (0 de 45)».

## M11.8 · Posponer · CA-091

- Hacé: en Estudiar tocá «Posponer» → «Mañana». Abrí el historial de la primera tarjeta de la cola.
- Tenés que ver: un cartel «Listo: vuelve mañana». En el historial figura un aplazamiento, sin resultado.
- Aclaración: «Posponer» abre «¿Para cuándo los posponés?» con «Más tarde hoy», «Mañana» y «Elegir día». La primera tarjeta de la cola es «¿Qué mide el desvío estándar?» (Apuntes › «Tarjetas» → ella → «Historial»): el renglón nuevo dice «15/03/2027 · Aplazada hasta el 16/03/2027». Con «Mañana» (o «Elegir día») la sesión que tenías a medias se deja y hoy no se agregan tarjetas nuevas (captura `fase-11-7-posponer-listo`).

## M11.9 · El freno después de una pausa larga · CA-086

- Hacé: Ajustes → «Demostración» → «+35 días». Volvé a Estudiar.
- Tenés que ver: la propuesta no trae tarjetas nuevas y lo explica con una frase que menciona los días de atraso. Nada en rojo. Después tocá «Restablecer fecha».
- Aclaración: la propuesta dice «115 repasos, sin tarjetas nuevas · unos 25 min» y la frase es «Hoy no agrego tarjetas nuevas: tenés cerca de 1 día de repasos atrasados. Vuelven completas cuando baje de medio día.» (captura `fase-11-8-estudiar-atraso`). **No es la frase de CA-086**: esa («… tenés cerca de 6 días de repasos atrasados. Vuelven de a poco cuando baje de 5 días.») sale solo con más de 5 días de atraso, que acá no se llega (125 repasos atrasados son 1 día de lo que estudiás por día). Ver «Qué difiere de tu plan».

## M11.10 · La tabla de casos de carga · CA-088

- Hacé: `npm run tablero` → «Tabla de casos de carga».
- Tenés que ver: los renglones de 5, 10, 25 y 45 minutos, el freno, «10,4 segundos» y la prioridad «0,675», con esperado y obtenido iguales.
- Aclaración: la tabla tiene 16 casos (todos «Pasó»): los cuatro tiempos con el resultado de cada uno («Tengo 10 min» → «45 repasos, 0 nuevas, 15 para mañana, unos 10 min»), el freno con 0,3, 1,2, 3 y 6 días, la contracción del tiempo de un repaso con 0, 10 y 40 repasos tuyos («40 repasos tuyos, mediana 10 s» → «10,4 segundos»), el corte de inactividad («300 s sin tocar nada, mediana 12 s» → «36 segundos») y la prioridad («0,675 va antes que 0,3»). El tablero muestra lo que dieron las pruebas de la última corrida de `npm run verificar`: si nunca la corriste, la tabla sale vacía.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Cosas para probar que no están en tu lista: «Elegir otra actividad» (hasta 3 alternativas, mirarlas no cambia la propuesta; captura `fase-11-5-elegir-otra`); «Posponer» → «Elegir día»; en Apuntes › «Tarjetas», tildar tarjetas nuevas y «Sumar a mis repasos» (antes de confirmar dice, con 10 tarjetas, «Agregar 10 tarjetas hoy suma entre 5 y 10 minutos de repaso repartidos en las próximas 4 semanas»; capturas `fase-11-9` y `fase-11-10`).

## Qué difiere de tu plan

1. **M11.1 después de S3.** Tu lista pide, justo después de S3, «un solo botón cobalto: «Empezar»». S3 deja una sesión pausada y la regla de la Fase 10 (con una sesión de hoy a medias, el primario es «Continuar: sesión de hoy (N de M)») la muestra como el único cobalto. El texto de M11.1 sale tal cual con datos recién reiniciados. No toqué esa regla porque cambiarla rompería lo que aprobaste en la Fase 10; si preferís que una sesión pausada sin ninguna tarjeta hecha no cuente como «a medias», decímelo.
2. **M11.9.** La frase que se lee no es la de CA-086 sino la de la franja «de 0,5 a 2 días» (ver arriba). Menciona los días de atraso, no trae tarjetas nuevas y no hay nada en rojo, como pide tu lista.
