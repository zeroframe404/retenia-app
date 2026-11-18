# Rojos conocidos del entorno

Antes de investigar un rojo, mirá si está acá. Si está, no es del código: se aplica lo que dice la tabla y se sigue. Si es nuevo y es del entorno, se agrega una fila.

| Qué se ve | Por qué pasa | Qué hacer |
| --- | --- | --- |
| `detected dubious ownership in repository` (tablero CA-008, migraciones) | Git no confía en la carpeta del proyecto en esta PC | Ya resuelto con `git config --global --add safe.directory H:/Retenia`. Si vuelve, repetirlo |
| `this operation must be run in a work tree` | La app de escritorio a veces deja `core.bare = true` en `.git/config` al armar copias de trabajo | `git config core.bare false` y reintentar |
| Fallas con rutas `.claude/worktrees/...` | La red leía las copias de trabajo de otras sesiones | Resuelto: la red ignora `.claude` |
| `EXDEV: cross-device link not permitted` al bajar los modelos de voz | El disco de la carpeta de modelos y el de la descarga son distintos en esta PC | Rojo solo en la PC (el CI sí los baja). No se arregla desde el código del producto |
| Auditoría de dependencias: aviso de `picomatch` | Sin versión corregida publicada | Aceptado y con fecha de revisión en `tools/lib/auditoria.mjs`; revisar al llegar la fecha |
| `electron.launch: WebSocket error: read ECONNRESET` en el CI | El programa no llegó a abrir en la máquina de GitHub | La red reintenta el arranque hasta 3 veces. Si el CI igual lo muestra, volver a lanzar una vez |
| `red tardó demasiado y la corté` en «Paquete, red completa y sabotajes» | El tramo ronda los 45 minutos de su tope | Volver a lanzar una vez; si repite, subir el tope y anotarlo en `docs/decisiones.md` |
| Dos redes a la vez (`verificar` y `verificar:todo`) fallan con errores raros | Comparten `.cache/red` | Correr una sola |
| Capturas de referencia en rojo | Cambió la pantalla | No se actualizan sin que el usuario vea la diferencia y la apruebe |
