# Estado del proyecto

**Fase 05 en revisión.** Retenia (prueba) tiene el «Laboratorio» en Ajustes › «Demostración»: baja una sola vez los modelos de voz (506 MB, verificados por huella), dice frases en inglés con cuatro voces, transcribe lo que grabás con el micrófono, lee el texto de un PDF y resalta una frase sobre la página, reconoce una página escaneada sin internet y manda un aviso de Windows; cada bloque dice cuánto tardó. `npm run verificar` y `npm run verificar:todo` dan VERDE con los 30 criterios de H-01 a H-07 cubiertos. Falta que hagas las pruebas manuales S1, S2, M05.1 a M05.9 y la prueba libre (`docs/pruebas-manuales/fase-05.md`). El instalador de prueba lo baja el CI: escribí «Bajame el instalador de prueba» en Claude Code.

| Fase | Estado |
|---|---|
| Semilla | Hecha (13/10/2026) |
| 00 · Especificación en el repositorio | Fusionada (13/10/2026), sin tag `fase-00-ok` |
| 01 · Arquitectura y plan de pruebas | Fusionada (13/10/2026), sin tag `fase-01-ok` |
| 02 · Andamiaje y red de pruebas | Fusionada (13/10/2026); tag `fase-02-ok` puesto el 14/10/2026 |
| 03 · Esqueleto caminante instalable | Fusionada; tag `fase-03-ok` puesto el 14/10/2026 (red completa en VERDE, 196 pruebas) |
| 04 · Libro mayor, copias y deshacer | Fusionada; tag `fase-04-ok` puesto el 17/10/2026 (red completa en VERDE, 477 pruebas) |
| 05 · Laboratorio de piezas riesgosas | En revisión: pull request abierto (rama `fase-05` sobre `main`), faltan tus pruebas manuales |
| 06 · Sistema de diseño y armazón | Sigue después de cerrar la 05 |

Red de la fase: `npm run verificar:todo` en esta PC termina en «VERDE · 646 pruebas · 0 fallas · 0 salteadas · 30 de 30 criterios cubiertos» (2 min 30 s). En el CI del pull request #6, la red completa terminó en «VERDE · 645 pruebas · 0 fallas · 0 salteadas · 30 de 30 criterios cubiertos» (23 min 19 s en su máquina) y el humo del instalador pasó sus 6 pasos, incluido el Laboratorio en «Retenia (prueba)» instalada: bajó los modelos de un servidor local, dijo una frase, transcribió el audio de ejemplo con el micrófono de prueba, leyó el PDF y el escaneo y Windows confirmó el aviso. Instaladores del CI: 129,8 MB el de prueba y 114,9 MB el real.

Cuando apruebes la Fase 05: fusionar el pull request y pedirme el tag; lo pone `npm run cerrar-fase -- 05`, que antes corre la red completa y guarda en el tag cuántas pruebas había.

## Qué hay hoy

- `npm run iniciar`: abre Retenia en modo demostración, con la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027». Arriba, una barra provisoria (el diseño fino llega en la Fase 06):
  - «Tarjetas»: lista, «Nueva tarjeta» y, en cada tarjeta, «Repasar» (con «Mostrar respuesta», «No la sabía», «Con dudas» y «La sabía»), «Historial», «Editar» y «Eliminar». La primera vez muestra tres tarjetas de ejemplo.
  - «Papelera»: lo eliminado queda 30 días, con «Restaurar» y «Vaciar papelera» (pide confirmación).
  - «Actividad reciente»: tus últimos 50 cambios, con «Deshacer».
  - «Ajustes»: «Datos y copias» («Verificar datos», «Reparar desde el historial», «Hacer copia ahora», la lista de copias con «Restaurar», «Abrir carpeta de copias») y «Demostración» («+1 día», «+7 días», «+35 días», «Restablecer fecha», «Simular sin conexión» y «Laboratorio»).
  - «Laboratorio» (Fase 05): «Voz» («Descargar modelos», «Frase en inglés», cuatro voces y «Decir en voz alta»), «Transcripción» («Grabar» y «Detener», «Entendí: “…”» con un campo para corregirlo; si Windows bloquea el micrófono, «Cómo habilitarlo»), «PDF» («Leer PDF de prueba»), «Escaneo» («Leer página escaneada») y «Aviso» («Probar aviso»). Tiempos y tamaños medidos en esta PC: `docs/laboratorio.md`.
  - Al abrir, si la última copia tiene un día o más, hace una copia automática; se conservan las 14 automáticas más nuevas, y las tuyas y las «Antes de restaurar» se quedan.
- `npm run datos:reiniciar`: deja la carpeta de datos de demostración como nueva (también borra los modelos de voz bajados ahí) y la fecha vuelve al lunes 15/03/2027; al abrir Retenia vuelven las tres tarjetas de ejemplo.
- `npm run verificar`: la red rápida (formato y linter, reloj del sistema, tipos, capas, código muerto, secretos, migraciones que no cambian, pruebas unitarias, de propiedades, de contrato, de pantallas, de integración y estáticas, trazabilidad, cobertura del núcleo). Unos 8 segundos.
- `npm run verificar:todo`: lo anterior más compilar y empaquetar las dos variantes, las piezas «sin red» del Laboratorio con sus modelos reales (la primera vez baja los modelos de voz de desarrollo, 506 MB, a `%LOCALAPPDATA%\Retenia-desarrollo\modelos`), la ventana real de punta a punta sobre el programa empaquetado (con el Laboratorio entero), accesibilidad, auditoría de dependencias, Opengrep, el corte a la fuerza en cada punto de cada escritura, la medición del tiempo de `verificar`, el escaneo del paquete real, los fuses y los cuatro sabotajes. Unos 3 minutos en esta PC.
- `npm run construir`: compila y empaqueta «Retenia (prueba)» y «Retenia» sin instalar (`release/<variante>/win-unpacked`); con `-- --instalador` arma además los dos instaladores (131,6 MB el de prueba y 116,1 MB el real; tope 150 MB).
- `npm run tablero`, `npm run sabotaje -- N` (N de 1 a 4), `npm run trazabilidad` y `npm run cerrar-fase -- NN`.
- Además: `node tools/capturas.mjs fase-05` saca las capturas de las pantallas en claro y en oscuro, `node tools/bajar-instalador.mjs` baja a tu Escritorio el instalador de prueba del CI, `node tools/preparar.mjs` prepara Opengrep y los modelos de voz de desarrollo, y `node tools/generar-datos-de-ejemplo.mjs` vuelve a armar los archivos de ejemplo.
- En Claude Code: cada archivo editado se formatea y se revisa; al terminar un turno con cambios corre la red y frena el cierre si da rojo.
- En git: el commit pasa por la revisión estática y el escáner de secretos; la subida, por `npm run verificar`.
- En GitHub: cada pull request corre la red completa en Windows y un trabajo aparte que arma los dos instaladores, instala «Retenia (prueba)» en silencio, crea una tarjeta, cierra, abre, abre por segunda vez, recorre el Laboratorio (baja los modelos de un servidor local, habla, transcribe el audio de ejemplo, lee el PDF y el escaneo y manda el aviso) y desinstala; una vez por semana, además, los cuatro sabotajes. Los dos trabajos guardan entre corridas los modelos de voz de desarrollo.

## Datos

- «Retenia» guarda sus datos en `%APPDATA%\Retenia` y «Retenia (prueba)» en `%APPDATA%\Retenia (prueba)`: nunca dentro de la carpeta del programa. `npm run iniciar` usa `datos-locales/demostracion` dentro del proyecto.
- Las copias van en la subcarpeta `copias` de esa misma carpeta; los modelos de voz, en `modelos` (se bajan una sola vez por carpeta de datos).
- Si tenés instalado «Retenia (prueba)» de una fase anterior, al abrir la versión nueva tus tarjetas y sus repasos siguen; el Laboratorio te va a pedir bajar los modelos una vez.
- Desinstalar no borra tus datos.

Decisiones del 17/10/2026 en `docs/decisiones.md` (sección «Fase 05»).
