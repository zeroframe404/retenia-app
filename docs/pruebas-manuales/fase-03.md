# Pruebas manuales · Fase 03 · Esqueleto caminante instalable

Preparación: en la terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`.

Los textos de abajo son los que muestra el programa hoy, y coinciden letra por letra con los del plan de la fase: ninguno cambió. La pantalla «Tarjetas» es provisoria (el diseño fino llega en la Fase 06). La fecha de M03.3 sale del motor de repaso (ts-fsrs, FSRS-6) y da el miércoles 17/03/2027 porque «Retenia (prueba)» tiene fija la fecha de hoy en el lunes 15/03/2027.

## M03.1 · Alta de tarjeta · CA-009

- Hacé: tocá «Nueva tarjeta». Pregunta: ¿Capital de Francia? Respuesta: París. Tocá «Guardar».
- Tenés que ver: el cartel «Tarjeta guardada» y «¿Capital de Francia?» primera en la lista.

## M03.2 · No guarda sin pregunta · CA-011

- Hacé: «Nueva tarjeta», escribí solo la respuesta Roma y tocá «Guardar».
- Tenés que ver: el campo Pregunta marcado con «Escribí la pregunta». «Roma» sigue escrito y en la lista no aparece nada nuevo.

## M03.3 · Repaso con fecha · CA-010

- Hacé: en «¿Capital de Francia?» tocá «Repasar», después «Mostrar respuesta» y «La sabía».
- Tenés que ver: «Próximo repaso: miércoles 17/03/2027».

## M03.4 · Sobrevive a cerrar todo · CA-009

- Hacé: cerrá la ventana, ejecutá de nuevo `npm run iniciar`.
- Tenés que ver: «¿Capital de Francia?» sigue en la lista con su próximo repaso.

## M03.5 · Maltrato del formulario

- Hacé: «Nueva tarjeta»: pegá un texto larguísimo (copiá varias páginas de cualquier lado) con ñ, tildes y un emoji. Hacé doble clic rápido en «Guardar».
- Tenés que ver: se guarda una sola tarjeta y la lista no se desarma: el texto largo se corta con puntos suspensivos.
- Aclaración: cada campo acepta hasta 100.000 caracteres (unas 30 páginas). Con más, el programa lo avisa junto al campo, sin perder lo escrito.

## M03.6 · Volver al estado conocido

- Hacé: cerrá Retenia. `npm run datos:reiniciar` y `npm run iniciar`.
- Tenés que ver: la lista tiene solo las tres tarjetas de ejemplo («¿Qué mide el desvío estándar?», «¿Qué es la varianza?» y «¿Qué es la media muestral?»); «¿Capital de Francia?» ya no está.

## M03.7 · Instalar de verdad · CA-012

- Hacé: en Claude Code escribí: `Bajame el instalador de prueba`. Ejecutá el archivo que quedó en el Escritorio (se llama `Retenia-prueba-instalador-0.0.0.exe`). Si Windows muestra «Windows protegió su PC», tocá «Más información» y «Ejecutar de todas formas». Abrí «Retenia (prueba)» desde el menú Inicio.
- Tenés que ver: Retenia abre con la cinta de demostración y las tres tarjetas de ejemplo.

## M03.8 · Una sola ventana · CA-014

- Hacé: con «Retenia (prueba)» abierto, abrilo otra vez desde el menú Inicio.
- Tenés que ver: no se abre una segunda ventana: la que estaba pasa al frente.

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.

## Capturas de las pantallas nuevas

En `docs/pruebas-manuales/capturas/`, en claro y en oscuro (terminan en `-claro.png` y `-oscuro.png`):

- `fase-03-1-lista`: las tres tarjetas de ejemplo.
- `fase-03-2-formulario-con-aviso`: «Escribí la pregunta» junto al campo, con «Roma» conservado.
- `fase-03-3-lista-con-cartel`: «Tarjeta guardada» y la tarjeta nueva primera.
- `fase-03-4-repaso-pregunta`, `fase-03-5-repaso-respuesta` y `fase-03-6-repaso-resultado`: el repaso paso a paso.
- `fase-03-7-lista-con-repaso`: la lista con «Próximo repaso: miércoles 17/03/2027».

Se vuelven a sacar con `node tools/capturas.mjs fase-03` (después de `npm run construir`).

## Registro

| Prueba | Resultado | Observaciones |
|---|---|---|
| M03.1 | | |
| M03.2 | | |
| M03.3 | | |
| M03.4 | | |
| M03.5 | | |
| M03.6 | | |
| M03.7 | | |
| M03.8 | | |
| Libre | | |
