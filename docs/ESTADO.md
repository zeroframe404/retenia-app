# Estado del proyecto

**Fase 03 en revisión.** Retenia ya guarda tarjetas en una base de datos local, las repasa con fecha de próximo repaso y se puede instalar: `npm run verificar` y `npm run verificar:todo` dan VERDE con los 14 criterios de H-01, H-02 y H-03 cubiertos. Falta que hagas las pruebas manuales M03.1 a M03.8 y la prueba libre (`docs/pruebas-manuales/fase-03.md`). El instalador de prueba lo baja el CI: escribí «Bajame el instalador de prueba» en Claude Code.

| Fase | Estado |
|---|---|
| Semilla | Hecha (13/10/2026) |
| 00 · Especificación en el repositorio | Fusionada (13/10/2026), sin tag `fase-00-ok` |
| 01 · Arquitectura y plan de pruebas | Fusionada (13/10/2026), sin tag `fase-01-ok` |
| 02 · Andamiaje y red de pruebas | Fusionada (13/10/2026); tag `fase-02-ok` puesto el 14/10/2026 |
| 03 · Esqueleto caminante instalable | En revisión: pull request abierto (rama `fase-03` sobre `main`), faltan tus pruebas manuales |
| 04 · Libro mayor, copias y deshacer | Sigue después de cerrar la 03 |

Cuando apruebes la Fase 03: fusionar el pull request y pedirme el tag; lo pone `npm run cerrar-fase -- 03`, que antes corre la red completa y guarda en el tag cuántas pruebas había.

## Qué hay hoy

- `npm run iniciar`: abre Retenia en modo demostración, con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla «Tarjetas»: lista, «Nueva tarjeta» (con «Pregunta» y «Respuesta»), y repaso con «Mostrar respuesta», «No la sabía», «Con dudas» y «La sabía». La primera vez muestra tres tarjetas de ejemplo.
- `npm run datos:reiniciar`: deja la carpeta de datos de demostración como nueva; al abrir Retenia vuelven las tres tarjetas de ejemplo.
- `npm run verificar`: la red rápida (formato y linter, reloj del sistema, tipos, capas, código muerto, secretos, pruebas unitarias, de propiedades, de contrato, de pantallas, de integración y estáticas, trazabilidad, cobertura del núcleo). Unos 5 segundos.
- `npm run verificar:todo`: lo anterior más compilar y empaquetar las dos variantes, la ventana real de punta a punta sobre el programa empaquetado, accesibilidad, auditoría de dependencias, Opengrep, el escaneo del paquete real, los fuses y los cuatro sabotajes. Cerca de 1 minuto en esta PC.
- `npm run construir`: compila y empaqueta «Retenia (prueba)» y «Retenia» sin instalar (`release/<variante>/win-unpacked`); con `-- --instalador` arma además los dos instaladores.
- `npm run tablero`, `npm run sabotaje -- N` (N de 1 a 4), `npm run trazabilidad` y `npm run cerrar-fase -- NN`.
- Además: `node tools/capturas.mjs` saca las capturas de las pantallas en claro y en oscuro, y `node tools/bajar-instalador.mjs` baja a tu Escritorio el instalador de prueba del CI.
- En Claude Code: cada archivo editado se formatea y se revisa; al terminar un turno con cambios corre la red y frena el cierre si da rojo.
- En git: el commit pasa por la revisión estática y el escáner de secretos; la subida, por `npm run verificar`.
- En GitHub: cada pull request corre la red completa en Windows y un trabajo aparte que arma los dos instaladores, instala «Retenia (prueba)» en silencio, crea una tarjeta, cierra, abre, abre por segunda vez y desinstala; una vez por semana, además, los cuatro sabotajes.

## Datos

- «Retenia» guarda sus datos en `%APPDATA%\Retenia` y «Retenia (prueba)» en `%APPDATA%\Retenia (prueba)`: nunca dentro de la carpeta del programa. `npm run iniciar` usa `datos-locales/demostracion` dentro del proyecto.
- Desinstalar no borra tus datos.

Decisiones del 14/10/2026 en `docs/decisiones.md` (sección «Fase 03»).
