# Estado del proyecto

**Fase 09 lista para tu revisión (04/11/2026).** Retenia (prueba) tiene ahora el motor de memoria de verdad: FSRS-6 con sus parámetros por defecto, en días de estudio, con un solo repaso por día que cuenta, la retención de la materia (0,90 la activa, 0,85 las demás), «Deshacer» después de calificar (el repaso queda como «Anulado» en el historial) y «¿Por qué hoy?» en cada tarjeta. La tabla de casos congelada tiene 51 casos (`docs/especificacion/casos-memoria.md`) y el tablero la muestra como «Tabla de casos del motor». `npm run verificar:todo` da «PENDIENTE_VEREDICTO»; los 8 criterios de la fase (CA-058 a CA-065) tienen prueba. Falta que hagas las pruebas manuales S1, S2, M09.1 a M09.6 y la libre (`docs/pruebas-manuales/fase-09.md`). M09.2 cambió con tu acuerdo: la tercera fecha es dos días después del fallo. PENDIENTE_REVISOR No fusiones ni pongas el tag hasta confirmar.

**Fase 08 lista para tu revisión (04/11/2026).** Retenia (prueba) tiene ahora tarjetas dentro de los apuntes («>>» y huecos con Ctrl+Mayús+C, con sus renglones marcados), fichas, versiones, inversas y pausa, y la pestaña «Tarjetas» nueva con contador, filtros y una lista que no se traba. Las 180 tarjetas de Estadística básica y las 12 de Historia argentina vienen con historial. `npm run verificar:todo` da «VERDE · 2886 pruebas · 0 fallas · 0 salteadas · 35 de 35 criterios cubiertos» (7 min 48 s en esta PC); los 12 criterios de la fase (CA-048 a CA-057, CA-377 y CA-378) tienen prueba. Falta que hagas las pruebas manuales S1, S2, M08.1 a M08.11 y la libre (`docs/pruebas-manuales/fase-08.md`) y que apruebes las 4 capturas de referencia de «Apuntes › Tarjetas» que cambiaron a propósito (más las 10 de la Fase 06 que siguen pendientes). El revisor independiente dejó 15 objeciones: 13 arregladas (casi todas con prueba) y 2 anotadas (`docs/decisiones.md`, Fase 08). No fusiones ni pongas el tag hasta confirmar.

**Fase 07 lista para tu revisión (29/10/2026).** Retenia (prueba) tiene ahora materias, temas, apuntes por bloques y la Bandeja. `npm run verificar:todo` da «VERDE · 2523 pruebas · 0 fallas · 0 salteadas · 38 de 38 criterios cubiertos» (6 min 20 s en esta PC), los 15 criterios de la fase (CA-038 a CA-047 y CA-372 a CA-376) tienen prueba y el revisor independiente dejó 11 objeciones: 6 arregladas con prueba y 5 anotadas (`docs/decisiones.md`, Fase 07). Falta que hagas las pruebas manuales S1, S2, M07.1 a M07.12 y la libre (`docs/pruebas-manuales/fase-07.md`) y que apruebes las 10 capturas de la Fase 06 que cambiaron a propósito. Pendientes de esta fase: las copias de seguridad no incluyen la carpeta `imagenes` (restaurar una copia en otra carpeta deja renglones con imagen sin archivo); y una vez, en la red completa, la medición de `verificar` (CA-001) dio rojo sin que pudiera ver por qué y a la repetición dio verde. No fusiones ni pongas el tag hasta confirmar.

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
| 07 · Materias, temas, apuntes y bandeja | Fusionada (29/10/2026, pull request #8), sin tag `fase-07-ok`: faltan tus pruebas manuales y las capturas |
| 08 · Tarjetas y fichas | Fusionada (04/11/2026, pull request #9), sin tag `fase-08-ok`: faltan tus pruebas manuales y las capturas |
| 09 · Motor de memoria FSRS-6 | En revisión (rama `fase-09`, pull request PENDIENTE_PR): faltan tus pruebas manuales |

Red de la fase: `npm run verificar:todo` en esta PC termina en «VERDE · 1539 pruebas · 0 fallas · 0 salteadas · 30 de 30 criterios cubiertos» (3 min 07 s, 20/10/2026). CI del pull request #7, en la última versión: «Red completa y compilación» en verde (32 min 35 s) e «Instaladores y humo del instalador» en verde (8 min 59 s, a la segunda: la primera vez se cortó la bajada de una herramienta de compilación del servidor de GitHub), con las capturas de referencia sin diferencias. Antes hubo cuatro corridas rojas por tiempos y por un error mío de configuración, todas resueltas y explicadas en docs/decisiones.md.

Cuando apruebes la Fase 06: fusionar el pull request y pedirme el tag (y el de la Fase 05, que quedó sin poner); los pone `npm run cerrar-fase -- NN`, que antes corre la red completa y guarda en el tag cuántas pruebas había.

## Qué hay hoy

Fase 09 (en la rama `fase-09`, que sale de `main` con la 08 fusionada):

- El motor de memoria (versión 2): FSRS-6 con sus 21 parámetros por defecto (no se ajustan con tus datos), sin pasos de minutos. «No la sabía», «Con dudas» y «La sabía» (no hay «fácil»). Cuenta días de estudio (el día cambia a las 04:00) y usa los días que pasaron de verdad: un repaso tardío acertado espacia más, y uno omitido no es un fallo. Solo el primer repaso de cada día llega al motor; los demás quedan en el historial como «Otro repaso del mismo día: no cambió la fecha».
- Retención objetivo según el estado de la materia al calcular: 0,90 la activa, 0,85 en mantenimiento (o en pausa, o archivada). «Hacer activa» reprograma en el momento las tarjetas de las dos materias. En «Historia argentina» una tarjeta nueva con «La sabía» vuelve el viernes 19/03/2027.
- En el repaso, después de calificar, «Deshacer»: el repaso se anula, la tarjeta vuelve a la pregunta y su próximo repaso es otra vez el de antes; en «Historial» ese renglón dice «Anulado».
- «¿Por qué hoy?» en la pantalla de cada tarjeta y en el repaso: «La viste hace 23 días; la última vez te costó; probabilidad estimada de recordarla: unos 7 de cada 10», con «Estimación general (sin datos tuyos)» mientras la tarjeta tenga menos de 5 intentos.
- Cada repaso guarda lo que predecía el motor, los días reales, por qué apareció la tarjeta y con qué motor y parámetros se calculó. La agenda guarda la versión del motor; al abrir, las calculadas con el motor de antes se recalculan solas.
- La variación al azar de las fechas: solo en «Retenia» (uso real), con semilla de la tarjeta y del repaso; en «Retenia (prueba)» no hay.
- La tabla de casos del motor (51 casos) y «Agregá un caso:» en Claude Code (`node tools/casos-memoria.mjs agregar "…"`, también `mostrar` y `revisar`).
- Cosas que todavía no hay: la sesión de estudio con su «Deshacer» y Ctrl+Z (Fase 10); las pistas y «La tarjeta está mal» (las reglas de ayuda ya están en el motor, pero ninguna pantalla manda ayuda todavía; Fases 10 y 16); el sondeo (Fase 27).

Fase 08 (en la rama `fase-08`, que sale de la 07):

- Escribir tarjetas en una nota: un renglón con «pregunta >> respuesta» es una tarjeta de pregunta y respuesta; Ctrl+Mayús+C sobre un texto elegido (o escribir «{{texto}}») lo vuelve un hueco, y un renglón con varios huecos da una tarjeta hermana por hueco. El renglón que es tarjeta lleva una raya y la etiqueta «Tarjeta». Editar el renglón edita la tarjeta (nunca crea otra); borrar un renglón con una tarjeta con historial pregunta «Este renglón tiene una tarjeta con historial. ¿Qué hacemos?».
- Apuntes › «Tarjetas»: contador («180 tarjetas»), filtros por tema, estado y tipo, y una lista que solo arma las filas que se ven. Tocar una pregunta abre su pantalla: camino de contexto, ficha, «Editar ficha» (respuesta de referencia, variantes, hasta 4 componentes esenciales, hasta 3 pistas, explicación, fuente, tipo de forma y estado), «Crear inversa», «Pausar esta tarjeta» / «Reanudar», «Historial», «Ver en la nota», «Repasar» y «Eliminar». «Nueva tarjeta» crea una suelta, sin nota. Al guardar un cambio de la pregunta o la respuesta de una tarjeta con historial pregunta «¿Cambió lo que hay que recordar?».
- Demostración: 192 tarjetas con su historial sembrado como eventos de origen «demostración» (el 15/03/2027: 60 vencidas, 30 nuevas y 90 programadas en Estadística básica). Reemplazan a las tres tarjetas de ejemplo de la Fase 03.
- Cosas que todavía no hay: la sesión de estudio (Fase 10) y la regla de no mostrar hermanas el mismo día; la pausa todavía no saca a la tarjeta de ninguna cola (todavía no hay cola); los ejercicios y las tarjetas con cita del PDF (Fases 13, 14 y 16); la búsqueda dentro de las tarjetas.

Fase 07 (en la rama `fase-07`):

- Estudiar muestra la materia activa y «Cambiar» abre la lista de materias con su estado, «Nueva materia» y, por materia, «Abrir» (consultar sin activar) y «Hacer activa». Arriba de Apuntes se ve qué materia mirás y cuál es la activa.
- Apuntes abre en «Notas»: temas (con «Sin tema», «Archivadas» y «Todas las notas»), «Nuevo tema», «Renombrar» (el nombre viejo queda en «Otros nombres»), «Mover a…», archivar y «Deshacer», eliminar a la Papelera. El editor trabaja por renglones (Enter, Tab, Mayús+Tab, arrastrar, plegar), con fórmulas, imágenes, enlaces con «[[» y «Mencionada en»; guarda a los dos segundos y al cerrar.
- Ctrl+Mayús+N anota en la Bandeja desde cualquier pantalla; el riel muestra su contador solo cuando hay algo; «Mover a…» la convierte en nota.
- Primera vez: con la base vacía, una sola pregunta («¿Qué querés aprender ahora?»). En Ajustes › «Demostración»: «Empezar como la primera vez» y «Volver al elenco».
- Papelera: ahora también guarda notas, temas y elementos de la Bandeja.
- Cosas que todavía no hay: las copias de seguridad no incluyen las imágenes de los apuntes, y las tarjetas dentro del apunte («>>») llegan en la Fase 08.

- `npm run iniciar`: abre Retenia en modo demostración, con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027» y la pantalla inicial, Estudiar. A la izquierda, el riel (se compacta con menos de 720 píxeles de ancho; la ventana no baja de 400):
  - Atajos: Ctrl+1 a Ctrl+6 abren los seis destinos, Ctrl+K abre «Buscar» (por ahora un cuadro que dice que la búsqueda todavía no está disponible), Esc cierra un cuadro, Ctrl y + / Ctrl y - / Ctrl y 0 cambian el zoom.
  - «Estudiar», «Materiales», «Idiomas» y «Progreso»: su título y «Todavía no disponible…» con «Ir a Apuntes».
  - «Apuntes»: tres secciones. «Tarjetas»: ver la Fase 08 (contador, filtros, lista, pantalla de cada tarjeta con «Repasar» —con «Mostrar respuesta», «No la sabía», «Con dudas» y «La sabía»—, «Historial», «Editar ficha» y «Eliminar»). «Papelera»: lo eliminado queda 30 días, con «Restaurar» y «Vaciar papelera» (pide confirmación). «Actividad reciente»: tus últimos 50 cambios, con «Deshacer».
  - «Ajustes»: «Apariencia» («Claro», «Oscuro», «Según el sistema»), «Datos y copias» («Verificar datos», «Reparar desde el historial», «Hacer copia ahora», la lista de copias con «Restaurar», «Abrir carpeta de copias») y «Demostración» («+1 día», «+7 días», «+35 días», «Restablecer fecha», «Simular sin conexión», «Galería» y «Laboratorio»).
  - «Galería» (Fase 06): los 18 componentes con sus variantes, el armazón (cartel breve, lista, panel lateral derecho y diálogo) y los seis estados (vacío, cargando, error, éxito, sin permiso y sin conexión).
  - «Laboratorio» (Fase 05): «Voz» («Descargar modelos», «Frase en inglés», cuatro voces y «Decir en voz alta»), «Transcripción» («Grabar» y «Detener», «Entendí: “…”» con un campo para corregirlo; si Windows bloquea el micrófono, «Cómo habilitarlo»), «PDF» («Leer PDF de prueba»), «Escaneo» («Leer página escaneada») y «Aviso» («Probar aviso»). Tiempos y tamaños medidos en esta PC: `docs/laboratorio.md`.
  - Al abrir, si la última copia tiene un día o más, hace una copia automática; se conservan las 14 automáticas más nuevas, y las tuyas y las «Antes de restaurar» se quedan.
- `npm run datos:reiniciar`: deja la carpeta de datos de demostración como nueva (también borra los modelos de voz bajados ahí) y la fecha vuelve al lunes 15/03/2027; al abrir Retenia vuelve el elenco de ejemplo (192 tarjetas con su historial).
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
