# Pruebas manuales · Fase 02 · Andamiaje y red de pruebas

Preparación: en la terminal del proyecto, con Claude Code abierto en otra pestaña.

Los textos de abajo son los que muestra el programa hoy. Una aclaración sobre M02.3 a M02.6: la línea que empieza con «ROJO ·» tiene un formato fijo («ROJO · N fallas · copiá desde acá hasta el final y pegáselo a Claude Code»), así que lo que se nombra («día de estudio», «secreto», «1 salteada», «capas») aparece en el resumen que va justo debajo de esa línea.

## M02.1 · El veredicto en una línea · CA-001

- Hacé: en la terminal, `npm run verificar`. Mirá el reloj al empezar y al terminar.
- Tenés que ver: menos de 2 minutos (en esta PC tarda unos 2 segundos) y una última línea que empieza con «VERDE ·», por ejemplo «VERDE · 57 pruebas · 0 fallas · 0 salteadas · 8 de 8 criterios cubiertos».

## M02.2 · Abre la ventana

- Hacé: `npm run iniciar`.
- Tenés que ver: una ventana llamada «Retenia» con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» arriba y el nombre «Retenia» en el centro. Sigue el tema claro u oscuro de tu Windows. Al cerrarla vuelve la terminal.

## M02.3 · Sabotaje 1: una regla rota · CA-003

- Hacé: en Claude Code escribí: `Sabotaje 1`.
- Tenés que ver: una línea que empieza con «ROJO ·» y, en el resumen de debajo, las pruebas de «día de estudio» que fallaron con lo esperado y lo obtenido; enseguida «Revertido» y una línea «VERDE ·».

## M02.4 · Sabotaje 2: una clave en el código · CA-004

- Hacé: en Claude Code escribí: `Sabotaje 2`.
- Tenés que ver: primero «Commit frenado: encontré un posible secreto…», después la línea «ROJO ·» con «posible secreto en ajustes-ia.json» en el resumen, y enseguida «Revertido» y una línea «VERDE ·».

## M02.5 · Sabotaje 3: una prueba salteada · CA-005

- Hacé: en Claude Code escribí: `Sabotaje 3`.
- Tenés que ver: la línea «ROJO ·» y, debajo, «hay 1 salteada: …» y «· 1 salteada ·» en las cuentas; enseguida «Revertido» y una línea «VERDE ·».

## M02.6 · Sabotaje 4: capas mezcladas · CA-006

- Hacé: en Claude Code escribí: `Sabotaje 4`.
- Tenés que ver: la línea «ROJO ·» y, debajo, «Capas: «src/renderer/App.tsx» importa «src/data/database.ts». La ventana (renderer) solo puede hablar con el puente…»; enseguida «Revertido» y una línea «VERDE ·».

## M02.7 · El freno de cierre · CA-007

- Hacé: en Claude Code escribí: `Probá el freno de cierre`.
- Tenés que ver: Claude Code te cuenta que dejó la red en rojo a propósito e intentó terminar el turno, que el freno le devolvió el resumen («Freno de cierre: la red quedó en ROJO…» con la línea «ROJO ·»), y que recién terminó después de revertir y volver a ver «VERDE ·».

## M02.8 · El tablero · CA-008

- Hacé: `npm run tablero`.
- Tenés que ver: se abre el navegador con «Tablero de Retenia»: el estado de la red, la Fase 02 con la historia H-01 («Como dueño de Retenia quiero una red de pruebas que avise sola cuando algo se rompe…»), sus 8 criterios (CA-001 a CA-008) con el estado de cada uno y sus pruebas, la tabla de casos del día de estudio con lo esperado y lo obtenido, y los lugares de cobertura, mutación, seguridad, accesibilidad y rendimiento. Todo en castellano y sin nombres de archivos.

## M02.9 · La nube también lo comprueba

- Hacé: abrí en GitHub el pull request de la fase.
- Tenés que ver: un tilde verde junto a las comprobaciones («Red de pruebas / Red completa y compilación»). Si está girando, esperá unos minutos.

## Capturas de la ventana

`docs/pruebas-manuales/capturas/fase-02-claro.png` y `docs/pruebas-manuales/capturas/fase-02-oscuro.png`.

## Registro

| Prueba | Resultado | Observaciones |
|---|---|---|
| M02.1 | | |
| M02.2 | | |
| M02.3 | | |
| M02.4 | | |
| M02.5 | | |
| M02.6 | | |
| M02.7 | | |
| M02.8 | | |
| M02.9 | | |
