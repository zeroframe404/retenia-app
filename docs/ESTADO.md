# Estado del proyecto

**Aviso del 29/10/2026.** El pull request #7 de la Fase 06 ya está fusionado (20/10/2026). Hoy `npm run verificar:todo` da ROJO por una sola cosa: la auditoría de dependencias encontró avisos de seguridad publicados después del 20/10 en `electron` (se arregla con el parche 44.10.0, permitido por `docs/versiones.md`) y en `undici` (pieza interna de herramientas de compilación y de pruebas). Las 1539 pruebas siguen en verde y los 30 criterios, cubiertos. Falta decidir una rama de mantenimiento; ver el informe de ese día. Faltan también los tags `fase-05-ok` y `fase-06-ok` y tus pruebas manuales.

**Fase 06 fusionada, sin tag.** Retenia (prueba) tiene ahora su sistema de diseño y su armazón: a la izquierda un riel con «Buscar» y Estudiar, Apuntes, Materiales, Idiomas, Progreso y Ajustes (Ctrl+1 a Ctrl+6 y Ctrl+K), colores claro y oscuro con las tipografías incluidas en el programa, los 18 componentes y los seis estados de una vista en Ajustes › «Demostración» › «Galería», Ajustes › «Apariencia» («Claro», «Oscuro» y «Según el sistema», al instante y recordado) y el zoom con Ctrl y +. La pantalla provisoria de tarjetas pasó adentro de Apuntes. `npm run verificar` y `npm run verificar:todo` dan VERDE. Falta que hagas las pruebas manuales S1, S2, M06.1 a M06.9 y la prueba libre (`docs/pruebas-manuales/fase-06.md`). El instalador de prueba lo baja el CI: escribí «Bajame el instalador de prueba» en Claude Code.

| Fase | Estado |
|---|---|
| Semilla | Hecha (13/10/2026) |
| 00 · Especificación en el repositorio | Fusionada (13/10/2026), sin tag `fase-00-ok` |
| 01 · Arquitectura y plan de pruebas | Fusionada (13/10/2026), sin tag `fase-01-ok` |
| 02 · Andamiaje y red de pruebas | Fusionada (13/10/2026); tag `fase-02-ok` puesto el 14/10/2026 |
| 03 · Esqueleto caminante instalable | Fusionada; tag `fase-03-ok` puesto el 14/10/2026 (red completa en VERDE, 196 pruebas) |
| 04 · Libro mayor, copias y deshacer | Fusionada; tag `fase-04-ok` puesto el 17/10/2026 (red completa en VERDE, 477 pruebas) |
| 05 · Laboratorio de piezas riesgosas | Fusionada (17/10/2026, pull request #6), sin tag `fase-05-ok` todavía: lo pongo cuando lo pidas |
| 06 · Sistema de diseño y armazón | Fusionada (20/10/2026, pull request #7), sin tag `fase-06-ok`: faltan tus pruebas manuales |

Red de la fase: `npm run verificar:todo` en esta PC termina en «VERDE · 1539 pruebas · 0 fallas · 0 salteadas · 30 de 30 criterios cubiertos» (3 min 07 s, 20/10/2026). CI del pull request #7, en la última versión: «Red completa y compilación» en verde (32 min 35 s) e «Instaladores y humo del instalador» en verde (8 min 59 s, a la segunda: la primera vez se cortó la bajada de una herramienta de compilación del servidor de GitHub), con las capturas de referencia sin diferencias. Antes hubo cuatro corridas rojas por tiempos y por un error mío de configuración, todas resueltas y explicadas en docs/decisiones.md.

Cuando apruebes la Fase 06: fusionar el pull request y pedirme el tag (y el de la Fase 05, que quedó sin poner); los pone `npm run cerrar-fase -- NN`, que antes corre la red completa y guarda en el tag cuántas pruebas había.

## Qué hay hoy

- `npm run iniciar`: abre Retenia en modo demostración, con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, Estudiar. A la izquierda, el riel (se compacta con menos de 720 píxeles de ancho; la ventana no baja de 400):
  - Atajos: Ctrl+1 a Ctrl+6 abren los seis destinos, Ctrl+K abre «Buscar» (por ahora un cuadro que dice que la búsqueda todavía no está disponible), Esc cierra un cuadro, Ctrl y + / Ctrl y - / Ctrl y 0 cambian el zoom.
  - «Estudiar», «Materiales», «Idiomas» y «Progreso»: su título y «Todavía no disponible…» con «Ir a Apuntes».
  - «Apuntes»: tres secciones. «Tarjetas»: lista, «Nueva tarjeta» y, en cada tarjeta, «Repasar» (con «Mostrar respuesta», «No la sabía», «Con dudas» y «La sabía»), «Historial», «Editar» y «Eliminar» (la primera vez, tres tarjetas de ejemplo). «Papelera»: lo eliminado queda 30 días, con «Restaurar» y «Vaciar papelera» (pide confirmación). «Actividad reciente»: tus últimos 50 cambios, con «Deshacer».
  - «Ajustes»: «Apariencia» («Claro», «Oscuro», «Según el sistema»), «Datos y copias» («Verificar datos», «Reparar desde el historial», «Hacer copia ahora», la lista de copias con «Restaurar», «Abrir carpeta de copias») y «Demostración» («+1 día», «+7 días», «+35 días», «Restablecer fecha», «Simular sin conexión», «Galería» y «Laboratorio»).
  - «Galería» (Fase 06): los 18 componentes con sus variantes, el armazón (cartel breve, lista, panel lateral derecho y diálogo) y los seis estados (vacío, cargando, error, éxito, sin permiso y sin conexión).
  - «Laboratorio» (Fase 05): «Voz» («Descargar modelos», «Frase en inglés», cuatro voces y «Decir en voz alta»), «Transcripción» («Grabar» y «Detener», «Entendí: “…”» con un campo para corregirlo; si Windows bloquea el micrófono, «Cómo habilitarlo»), «PDF» («Leer PDF de prueba»), «Escaneo» («Leer página escaneada») y «Aviso» («Probar aviso»). Tiempos y tamaños medidos en esta PC: `docs/laboratorio.md`.
  - Al abrir, si la última copia tiene un día o más, hace una copia automática; se conservan las 14 automáticas más nuevas, y las tuyas y las «Antes de restaurar» se quedan.
- `npm run datos:reiniciar`: deja la carpeta de datos de demostración como nueva (también borra los modelos de voz bajados ahí) y la fecha vuelve al lunes 15/03/2027; al abrir Retenia vuelven las tres tarjetas de ejemplo.
- `npm run verificar`: la red rápida (formato y linter, reloj del sistema, tipos, capas, código muerto, secretos, migraciones que no cambian, pruebas unitarias, de propiedades, de contrato, de pantallas, de integración y estáticas, trazabilidad, cobertura del núcleo). Unos 8 segundos.
- `npm run verificar:todo`: lo anterior más compilar y empaquetar las dos variantes, las piezas «sin red» del Laboratorio con sus modelos reales (la primera vez baja los modelos de voz de desarrollo, 506 MB, a `%LOCALAPPDATA%\Retenia-desarrollo\modelos`), la ventana real de punta a punta sobre el programa empaquetado (con el Laboratorio entero, el riel y los atajos, la ventana angosta, el zoom, la Galería y las capturas de referencia en claro y en oscuro), accesibilidad de cada pantalla, auditoría de dependencias, Opengrep, el corte a la fuerza en cada punto de cada escritura, la medición del tiempo de `verificar`, el escaneo del paquete real, los fuses y los cuatro sabotajes. Unos 4 minutos en esta PC.
- `npm run construir`: compila y empaqueta «Retenia (prueba)» y «Retenia» sin instalar (`release/<variante>/win-unpacked`); con `-- --instalador` arma además los dos instaladores (131,6 MB el de prueba y 116,1 MB el real; tope 150 MB).
- `npm run tablero`, `npm run sabotaje -- N` (N de 1 a 4), `npm run trazabilidad` y `npm run cerrar-fase -- NN`.
- Además: `node tools/capturas.mjs fase-06` saca las capturas de las pantallas en claro y en oscuro, `node tools/bajar-instalador.mjs` baja a tu Escritorio el instalador de prueba del CI, `node tools/preparar.mjs` prepara Opengrep y los modelos de voz de desarrollo, y `node tools/generar-datos-de-ejemplo.mjs` vuelve a armar los archivos de ejemplo.
- En Claude Code: cada archivo editado se formatea y se revisa; al terminar un turno con cambios corre la red y frena el cierre si da rojo.
- En git: el commit pasa por la revisión estática y el escáner de secretos; la subida, por `npm run verificar`.
- En GitHub: cada pull request corre la red completa en Windows y un trabajo aparte que arma los dos instaladores, instala «Retenia (prueba)» en silencio, crea una tarjeta, cierra, abre, abre por segunda vez, recorre el Laboratorio (baja los modelos de un servidor local, habla, transcribe el audio de ejemplo, lee el PDF y el escaneo y manda el aviso) y desinstala; una vez por semana, además, los cuatro sabotajes. Los dos trabajos guardan entre corridas los modelos de voz de desarrollo.

## Datos

- «Retenia» guarda sus datos en `%APPDATA%\Retenia` y «Retenia (prueba)» en `%APPDATA%\Retenia (prueba)`: nunca dentro de la carpeta del programa. `npm run iniciar` usa `datos-locales/demostracion` dentro del proyecto.
- Las copias van en la subcarpeta `copias` de esa misma carpeta; los modelos de voz, en `modelos` (se bajan una sola vez por carpeta de datos).
- Si tenés instalado «Retenia (prueba)» de una fase anterior, al abrir la versión nueva tus tarjetas y sus repasos siguen; el Laboratorio te va a pedir bajar los modelos una vez.
- Desinstalar no borra tus datos.

Decisiones del 17/10/2026 en `docs/decisiones.md` (secciones «Fase 05» y «Fase 06»).
