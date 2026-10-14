# Lo que no es una función

Condiciones que Retenia cumple siempre, en todas las pantallas. Cada una tiene su prueba en la fase que la construye (Fases 02, 06, 36, 38, 39 y 40, sobre todo).

## Dónde corre

- Una PC con Windows 11. Una sola persona. Sin cuentas ni servidor.
- Programa de escritorio instalable. Dos instalaciones posibles a la vez, «Retenia» y «Retenia (prueba)», con carpetas de datos separadas.

## Sin conexión

- Todo funciona sin internet salvo la IA, bajar páginas web y descargar los modelos de voz una vez. Lo que necesita conexión queda «Pendiente» y se reanuda solo cuando vuelve.
- Las fórmulas, el diccionario del curso, las lecciones y los textos de la biblioteca vienen dentro del instalador.
- Modelos de voz (lectura en voz alta con al menos 4 voces en inglés, reconocimiento de habla) y de reconocimiento de escaneos: descarga única, verificada por huella, del orden de 300 a 600 MB en total. El tamaño exacto se fija en la Fase 05.

## Volumen

- 10.000 tarjetas, 300 materiales y 200.000 repasos sin que se note.

## Tiempos

| Qué | Límite |
|---|---|
| Arranque | menos de 3 segundos |
| Siguiente tarjeta | menos de 0,1 segundos |
| Abrir Estudiar | menos de 0,5 segundos |
| Buscar | menos de 0,2 segundos |
| Guardar un apunte | 2 segundos después de dejar de escribir |
| Evaluación con IA | aviso a los 8 segundos, con la respuesta guardada |
| Procesar un PDF de 300 páginas | en segundo plano, sin trabar la ventana |
| Proceso de fondo colgado | se reinicia solo al pasar su tiempo límite |

## Datos

- En la carpeta de datos de aplicaciones de la cuenta de Windows. Copia automática si la última tiene más de 24 horas; se conservan 14; comprobación semanal de la última. Nada se borra sin pasar por la Papelera (30 días).
- El historial solo se agrega. Cualquier estado se puede recalcular desde él («Verificar datos» da 0 diferencias). Un cierre a la fuerza deja cada repaso completo o ausente, nunca a medias.
- Identificadores únicos (UUID versión 7) en todos los registros.
- Exportación completa en formatos abiertos: apuntes en Markdown, imágenes, originales, tarjetas, historial e índice. Se puede reconstruir todo en un Retenia vacío.

## Privacidad

- Nada sale de la PC sin que lo actives. Sin registro de teclas, cámara ni rastreo. «Qué se envió» lista cada envío a la IA con fecha, propósito, fragmento y costo.
- La clave de IA vive solo en el almacén seguro de Windows; no aparece en archivos, copias, exportaciones, registros ni diagnósticos.
- El contenido de los materiales, de las páginas web, de las fórmulas y de las respuestas de la IA es dato, nunca instrucción: nada de eso se ejecuta ni cambia estados por su cuenta.

## Seguridad

- Aislamiento de contexto activado y sin integración de Node en la ventana. Todo mensaje del puente se valida antes de usarse.
- Los enlaces externos se abren en el navegador, nunca dentro de Retenia.
- Actualizaciones verificadas por huella; sin credenciales dentro del programa. El instalador no está firmado (Windows avisa la primera vez).
- La versión de uso real no tiene herramientas de desarrollo ni modo demostración.
- Archivos trampa (scripts, rutas hacia afuera, PDF con código, tamaño gigante, nombres raros) no ejecutan nada ni escriben fuera de la carpeta de datos.
- Sin secretos en el repositorio ni en el instalador; sin dependencias con vulnerabilidades altas o críticas sin tratar.

## Idioma y formato

- Interfaz en español rioplatense con voseo. Identificadores de código en inglés.
- Fechas dd/mm/aaaa, coma decimal, hora de Buenos Aires. Separador de miles: punto (10.000).
- Sin emojis. Sin color rojo para errores del usuario ni para números de atraso.
- Palabras prohibidas en toda la interfaz: las cuatro que fija CLAUDE.md, más «Te extrañamos», «Perdiste» y cualquier forma de tuteo. Un catálogo de textos lo comprueba en cada corrida.
- Ningún texto de pantalla muestra «undefined», «null», «NaN», «[object Object]», inglés suelto ni Lorem ipsum.

## Accesibilidad

- Todo se alcanza con teclado y el foco siempre se ve. Hoja de atajos con la tecla de signo de pregunta.
- Compatible con el Narrador de Windows: anuncia pregunta, resultado y botones por su nombre.
- Zoom al 200 % y escala de Windows al 125 % sin pérdida de contenido ni desplazamiento horizontal. Ventana mínima de 400 píxeles de ancho.
- «Reducir movimiento» de Windows quita las animaciones.
- Modo claro y oscuro, recordado entre sesiones.

## Roles y fronteras

Retenia es de uso personal y no tiene cuentas: hay un solo rol, vos, con acceso a todo. No hay matriz de permisos. Lo que sí se protege es otra frontera: la ventana del programa no puede tocar el disco ni la clave de IA por su cuenta, y eso se comprueba con pruebas automáticas en las Fases 02 y 36.

## Calidad y mantenimiento

- `npm run verificar` en menos de 2 minutos; `npm run verificar:todo` en menos de 15. La red completa da verde 20 veces seguidas.
- La red detecta el 80 % o más de las roturas provocadas en cada módulo del núcleo.
- Toda prueba manual que falló durante el plan tiene su prueba automática que hoy da verde.
- Ayuda dentro del programa (25 temas o más, como tareas) y `docs/MANTENIMIENTO.md` con la rutina mensual y prompts listos para copiar.
