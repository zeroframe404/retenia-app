# Estado del proyecto

**Fase 04 en revisión.** Retenia ya anota cada repaso en un historial que solo se agrega, muestra el «Historial» de cada tarjeta, verifica y repara sus datos, hace copias comprobadas (a mano y automáticas al abrir) y las restaura, y tiene «Editar», «Eliminar», «Papelera» y «Actividad reciente» con «Deshacer». `npm run verificar` y `npm run verificar:todo` dan VERDE con los 23 criterios de H-01 a H-06 cubiertos. Falta que hagas las pruebas manuales S1, S2, M04.1 a M04.8 y la prueba libre (`docs/pruebas-manuales/fase-04.md`). El instalador de prueba lo baja el CI: escribí «Bajame el instalador de prueba» en Claude Code.

| Fase | Estado |
|---|---|
| Semilla | Hecha (13/10/2026) |
| 00 · Especificación en el repositorio | Fusionada (13/10/2026), sin tag `fase-00-ok` |
| 01 · Arquitectura y plan de pruebas | Fusionada (13/10/2026), sin tag `fase-01-ok` |
| 02 · Andamiaje y red de pruebas | Fusionada (13/10/2026); tag `fase-02-ok` puesto el 14/10/2026 |
| 03 · Esqueleto caminante instalable | Fusionada; tag `fase-03-ok` puesto el 14/10/2026 (red completa en VERDE, 196 pruebas) |
| 04 · Libro mayor, copias y deshacer | En revisión: pull request abierto (rama `fase-04` sobre `main`), faltan tus pruebas manuales |
| 05 · Laboratorio de piezas riesgosas | Sigue después de cerrar la 04 |

Cuando apruebes la Fase 04: fusionar el pull request y pedirme el tag; lo pone `npm run cerrar-fase -- 04`, que antes corre la red completa y guarda en el tag cuántas pruebas había.

## Qué hay hoy

- `npm run iniciar`: abre Retenia en modo demostración, con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027». Arriba, una barra provisoria (el diseño fino llega en la Fase 06):
  - «Tarjetas»: lista, «Nueva tarjeta» y, en cada tarjeta, «Repasar» (con «Mostrar respuesta», «No la sabía», «Con dudas» y «La sabía»), «Historial», «Editar» y «Eliminar». La primera vez muestra tres tarjetas de ejemplo.
  - «Papelera»: lo eliminado queda 30 días, con «Restaurar» y «Vaciar papelera» (pide confirmación).
  - «Actividad reciente»: tus últimos 50 cambios, con «Deshacer».
  - «Ajustes»: «Datos y copias» («Verificar datos», «Reparar desde el historial», «Hacer copia ahora», la lista de copias con «Restaurar», «Abrir carpeta de copias») y «Demostración» («+1 día», «+7 días», «+35 días», «Restablecer fecha»; la cinta cambia al instante y la fecha sobrevive al cierre).
  - Al abrir, si la última copia tiene un día o más, hace una copia automática; se conservan las 14 automáticas más nuevas, y las tuyas y las «Antes de restaurar» se quedan.
- `npm run datos:reiniciar`: deja la carpeta de datos de demostración como nueva y la fecha vuelve al lunes 15/03/2027; al abrir Retenia vuelven las tres tarjetas de ejemplo.
- `npm run verificar`: la red rápida (formato y linter, reloj del sistema, tipos, capas, código muerto, secretos, migraciones que no cambian, pruebas unitarias, de propiedades, de contrato, de pantallas, de integración y estáticas, trazabilidad, cobertura del núcleo). Unos 10 segundos.
- `npm run verificar:todo`: lo anterior más compilar y empaquetar las dos variantes, la ventana real de punta a punta sobre el programa empaquetado, accesibilidad, auditoría de dependencias, Opengrep, el corte a la fuerza en cada punto de cada escritura, la medición del tiempo de `verificar`, el escaneo del paquete real, los fuses y los cuatro sabotajes. Unos 2 minutos y medio en esta PC.
- `npm run construir`: compila y empaqueta «Retenia (prueba)» y «Retenia» sin instalar (`release/<variante>/win-unpacked`); con `-- --instalador` arma además los dos instaladores.
- `npm run tablero`, `npm run sabotaje -- N` (N de 1 a 4), `npm run trazabilidad` y `npm run cerrar-fase -- NN`.
- Además: `node tools/capturas.mjs fase-04` saca las capturas de las pantallas en claro y en oscuro, y `node tools/bajar-instalador.mjs` baja a tu Escritorio el instalador de prueba del CI.
- En Claude Code: cada archivo editado se formatea y se revisa; al terminar un turno con cambios corre la red y frena el cierre si da rojo.
- En git: el commit pasa por la revisión estática y el escáner de secretos; la subida, por `npm run verificar`.
- En GitHub: cada pull request corre la red completa en Windows y un trabajo aparte que arma los dos instaladores, instala «Retenia (prueba)» en silencio, crea una tarjeta, cierra, abre, abre por segunda vez y desinstala; una vez por semana, además, los cuatro sabotajes.

## Datos

- «Retenia» guarda sus datos en `%APPDATA%\Retenia` y «Retenia (prueba)» en `%APPDATA%\Retenia (prueba)`: nunca dentro de la carpeta del programa. `npm run iniciar` usa `datos-locales/demostracion` dentro del proyecto.
- Las copias van en la subcarpeta `copias` de esa misma carpeta.
- Si tenés instalado «Retenia (prueba)» de la Fase 03, al abrir la versión nueva tus tarjetas y sus repasos siguen; el historial de esos repasos viejos dice «Repasos anteriores, sin detalle».
- Desinstalar no borra tus datos.

Decisiones del 14/10/2026 en `docs/decisiones.md` (secciones «Fase 03» y «Fase 04»).
