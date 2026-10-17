# Pruebas manuales · Fase 05 · Laboratorio de piezas riesgosas

Preparación: conectá auriculares o parlantes y un micrófono. En la terminal del proyecto, `npm run datos:reiniciar` y después `npm run iniciar`. Andá a Ajustes → «Demostración» → «Laboratorio».

Los textos de abajo son los que muestra el programa hoy y coinciden letra por letra con los del plan de la fase, con **una sola diferencia**, que elegiste vos hoy: en M05.4 dice «Entendí: “good morning”», con comillas, igual que el criterio CA-026. Las pantallas son provisorias (el diseño fino llega en la Fase 06). El Laboratorio tiene cinco bloques, uno debajo del otro: «Voz», «Transcripción», «PDF», «Escaneo» y «Aviso»; cada uno dice cuánto tardó («Tardó 1,1 s»).

## S1 · Humo · Abre

- Hacé: ejecutá `npm run iniciar`.
- Tenés que ver: la ventana «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, sin carteles de error.

## S2 · Humo · Tus datos están sanos

- Hacé: Ajustes → «Datos y copias» → «Verificar datos».
- Tenés que ver: «Todo en orden · 0 diferencias».

## M05.1 · Descargar los modelos · CA-024

- Hacé: tocá «Descargar modelos».
- Tenés que ver: una barra que avanza y, al terminar, «Modelos listos».
- Aclaración: antes de tocarlo, el bloque «Voz» dice «Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.». Mientras baja, debajo de la barra dice «Bajando los modelos: 45 %» (el número sube). Son 506 MB: con tu conexión tardó 35 segundos.

## M05.2 · Retenia habla · CA-025

- Hacé: escribí The weather is nice today y tocá «Decir en voz alta». Cambiá de voz y repetí.
- Tenés que ver: se escucha la frase clara, en inglés, con dos voces que suenan distintas.
- Aclaración: la frase va en el campo «Frase en inglés». Las voces están debajo, en «Voz que habla»: «Mujer, Estados Unidos», «Hombre, Estados Unidos», «Mujer, Reino Unido» y «Hombre, Reino Unido». Después de cada frase aparece «Tardó …» y un reproductor para volver a escucharla.

## M05.3 · Habla sin internet · CA-025

- Hacé: desconectá el Wi-Fi o el cable de red de la PC. Tocá otra vez «Decir en voz alta».
- Tenés que ver: se escucha igual. Volvé a conectar internet al terminar.

## M05.4 · Retenia te entiende · CA-026

- Hacé: tocá «Grabar», decí good morning y tocá «Detener».
- Tenés que ver: «Entendí: “good morning”» en un campo donde podés corregir el texto.
- Aclaración: la primera vez Windows o Retenia pueden tardar un instante en abrir el micrófono. Mientras graba dice «Grabando… 2 s. Decí la frase y tocá «Detener».» (los segundos suben; corta solo a los 30). El campo para corregir se llama «Lo que entendí (podés corregirlo)»: si lo cambiás, el «Entendí» de arriba cambia con él. Si tocás «Grabar» mientras suena una frase de M05.2, la frase se calla para no grabarla encima. Si no dijiste nada, dice «No escuché nada. Probá de nuevo, más cerca del micrófono.».

## M05.5 · Micrófono bloqueado · CA-027

- Hacé: en Windows: Configuración → Privacidad y seguridad → Micrófono, desactivá el acceso para aplicaciones de escritorio. Volvé a Retenia y tocá «Grabar».
- Tenés que ver: «Sin acceso al micrófono no podemos escucharte» con el enlace «Cómo habilitarlo». Volvé a activar el micrófono al terminar.
- Aclaración: el enlace muestra tres pasos y un botón, «Abrir la configuración del micrófono», que abre esa misma pantalla de Windows.

## M05.6 · Leer un PDF · CA-028

- Hacé: tocá «Leer PDF de prueba».
- Tenés que ver: el texto de la página 1 y, sobre la imagen de la página, una frase resaltada.
- Aclaración: el texto va bajo «Texto de la página 1». Debajo dice «Frase resaltada: “Una muestra es una parte de la población que se elige para observarla y sacar conclusiones sobre el todo.”» y está la página dibujada, con esa frase marcada en amarillo (ocupa dos renglones).

## M05.7 · Leer un escaneo · CA-029

- Hacé: tocá «Leer página escaneada».
- Tenés que ver: el texto de la página 9, legible, aunque esa página es una imagen.
- Aclaración: va bajo «Texto reconocido de la página 9» y empieza «Capítulo 4 - Pruebas de hipótesis». Puede traer alguna marquita suelta (como «- -») que sale de los puntitos del papel escaneado.

## M05.8 · Aviso de Windows · CA-030

- Hacé: tocá «Probar aviso». Minimizá Retenia y tocá la notificación.
- Tenés que ver: una notificación «Retenia · Esto es una prueba» y, al tocarla, Retenia vuelve al frente.
- Aclaración: en el Laboratorio aparece «Aviso enviado. Minimizá Retenia y tocalo: Retenia vuelve al frente.». La notificación tiene el título «Retenia» y el texto «Esto es una prueba». Si en tu PC está activado «No molestar», Windows no la muestra en pantalla y la deja en el centro de notificaciones (el ícono del reloj, abajo a la derecha): tocala desde ahí.

## M05.9 · Todo, instalado

- Hacé: en Claude Code escribí: Bajame el instalador de prueba. Instalalo, abrí «Retenia (prueba)», andá al Laboratorio y repetí «Decir en voz alta» y «Leer PDF de prueba».
- Tenés que ver: las dos cosas funcionan igual que recién.
- Aclaración: el programa instalado tiene su propia carpeta de datos, así que antes de «Decir en voz alta» tocá «Descargar modelos» (lo mismo que en M05.1). El instalador se llama `Retenia-prueba-instalador-0.0.0.exe`; si Windows muestra «Windows protegió su PC», tocá «Más información» y «Ejecutar de todas formas».

## Libre · Uso libre · 5 minutos

- Hacé: usalo cinco minutos como lo usarías vos en un día de mucho estudio e intentá romperlo. Anotá todo lo raro.
- Tenés que ver: nada se rompe ni se pierde. Si algo te hizo dudar más de 30 segundos, anotalo y reportalo.
- Algunas ideas: frases largas o con signos en «Decir en voz alta»; «Grabar» y quedarte callado; tocar varios botones del Laboratorio seguidos; volver a Ajustes en medio de una grabación. Para ver el mensaje sin conexión sin desenchufar nada: `npm run datos:reiniciar`, abrir Retenia, marcar «Simular sin conexión» en Ajustes › «Demostración» y tocar «Descargar modelos» (después vas a tener que bajarlos de nuevo con la casilla desmarcada).

## Lo que ya comprobé yo (17/10/2026)

Contra el programa andando como lo abre `npm run iniciar` (la misma orden y la misma carpeta de datos, después de `npm run datos:reiniciar`), tocando los botones por su nombre:

- S1: ventana «Retenia», cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027», las tres tarjetas, sin carteles de error.
- S2: «Todo en orden · 0 diferencias».
- M05.1: antes, el mensaje de descargar; la barra avanzó de 0 % a 100 % y terminó en «Modelos listos» a los 35 segundos, bajando de internet de verdad.
- M05.2: «Mujer, Estados Unidos» armó 1,4 s de audio y «Hombre, Reino Unido» 2,1 s, y los dos empezaron a sonar solos («Tardó 1,8 s» y «Tardó 1,4 s»). **No los pude escuchar**: que la voz se oiga clara y suene distinta lo comprobás vos.
- M05.4: con el micrófono de esta PC y nadie hablando, grabó y dijo «No escuché nada. Probá de nuevo, más cerca del micrófono.». **No pude decir «good morning»**: lo que sí comprobé es la misma cadena con el micrófono de prueba de Chromium que «dice» good morning: «Entendí: “good morning”».
- M05.6: el texto de la página 1 y la frase resaltada en dos renglones sobre la página dibujada («Tardó 0,1 s»).
- M05.7: el texto de la página 9, empezando por «Capítulo 4 - Pruebas de hipótesis / 4.1 La hipótesis nula y la alternativa…» («Tardó 0,8 s»), con un 98,4 % de parecido al original.
- M05.8: «Aviso enviado…» (Windows confirmó que lo mostró). **No pude tocar la notificación** ni ver si apareció en pantalla (tu PC tiene «No molestar»): lo comprobás vos.

**No pude comprobar:** M05.3 (no desconecto tu red; la prueba automática «sin red» corre la voz con la red bloqueada), M05.5 (no cambio la configuración de privacidad de tu Windows; la punta a punta lo simula), M05.9 (lo instala el CI en una Windows limpia y recorre el Laboratorio entero; el resultado está en `docs/ESTADO.md`) y la prueba libre, que es tuya.

## Capturas de las pantallas nuevas

En `docs/pruebas-manuales/capturas/`, en claro y en oscuro (terminan en `-claro.png` y `-oscuro.png`):

- `fase-05-1-ajustes-demostracion`: Ajustes › «Demostración» con «Simular sin conexión» y «Laboratorio».
- `fase-05-2-laboratorio-sin-modelos`: el Laboratorio recién abierto, sin modelos: el mensaje para descargarlos y «Descargar modelos».
- `fase-05-3-voz`: «Modelos listos», la frase, las cuatro voces, «Tardó …» y el reproductor.
- `fase-05-4-grabando`: «Grabando… 2 s. Decí la frase y tocá «Detener».».
- `fase-05-5-transcripcion`: «Entendí: “good morning”» con el campo para corregirlo.
- `fase-05-6-pdf`: la página 1 dibujada con la frase resaltada.
- `fase-05-7-escaneo`: el texto reconocido de la página 9.
- `fase-05-8-aviso`: «Aviso enviado…».
- `fase-05-9-microfono-bloqueado`: «Sin acceso al micrófono no podemos escucharte», «Cómo habilitarlo», los pasos y el botón.

Se vuelven a sacar con `node tools/capturas.mjs fase-05` (después de `npm run construir`; usa los modelos de desarrollo).

## Registro

| Prueba | Resultado | Observaciones |
|---|---|---|
| S1 | | |
| S2 | | |
| M05.1 | | |
| M05.2 | | |
| M05.3 | | |
| M05.4 | | |
| M05.5 | | |
| M05.6 | | |
| M05.7 | | |
| M05.8 | | |
| M05.9 | | |
| Libre | | |
