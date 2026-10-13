# Decisiones conciliadas

Estas decisiones cierran las contradicciones entre los documentos de investigación previa y fijan lo que Retenia hace. Si algo de la investigación previa contradice una fila de acá, gana la fila. Las decisiones técnicas del día a día van en `docs/decisiones.md`.

## 1. Decisiones de la propuesta original, revisadas

| Decisión | Qué se decidió | Por qué / qué conciliaba |
|---|---|---|
| Plataforma | Programa de escritorio para Windows 11. Sin celular ni servidor en esta versión. | Los documentos oscilaban entre escritorio, PWA y Android. Pediste PC. El registro de repasos queda preparado para sincronizar más adelante. |
| Tecnología | Electron + TypeScript + React + SQLite local. | El plan anterior proponía Tauri. Electron se puede probar de punta a punta de forma automática en Windows con Playwright y todo su ecosistema es npm. |
| Importación | Todo en Node (pdf.js, reconocimiento de escaneos en WebAssembly), sin Python. | Los documentos proponían Docling y Whisper en Python: empaquetar Python en un instalador de Windows es frágil. EPUB, PowerPoint y video quedan para después. |
| Calificación de tarjetas | Tres botones: «No la sabía», «Con dudas», «La sabía». | Coincide con tu sistema de diseño v2. Se traducen al motor como Otra vez, Difícil y Bien; «Fácil» no existe. |
| Escala de ayuda | Una sola: A0 sin ayuda, A1 pregunta orientadora, A2 pista de concepto, A3 pista de paso o ejemplo, A4 solución vista. | Había cinco escalas distintas (0–4, 0–6, 0–7, A0–A5, E0–E6). Solo A0 acredita dominio. |
| Estados de dominio | «Sin iniciar», «En práctica», «A revisar», «Suficiente para avanzar» y «Consolidado». Suficiente = 2 aciertos sin ayuda en días distintos. Consolidado = 3 en días distintos, uno con 7 días o más de demora. Un fallo desde Suficiente o Consolidado lleva a «A revisar», no reinicia. | La frase original «un fallo baja un escalón» contradecía a CA-147; gana el criterio. La máquina de estados completa está en la sección 5. |
| Qué alimenta al motor de memoria | Solo el primer intento del día sin ayuda. Con pista A2 o A3 cuenta como «Con dudas»; con solución vista, como «No la sabía». | Lo provisional o en duda no toca la programación hasta resolverse. |
| Duraciones de sesión | 5, 10, 25 y 45 minutos. «Versión corta» = 10. | Había cinco juegos de duraciones. Estas son las de tu sistema de diseño. El «cuánto» de la meta elige entre estas cuatro. |
| Composición de la sesión | Primero los repasos por prioridad; lo nuevo usa lo que sobra, con tope del 40 % del tiempo y freno por atraso. | Fórmula del documento de carga: nuevo = mínimo(sobrante, 0,4 × tiempo) × freno. La estimación completa está en la sección 4. |
| Compromiso semanal | Días de estudio por semana (propuesta inicial: 3). Sin contadores de días seguidos. Es el mismo número que el «cuánto» de la meta. | Un día cuenta con 5 minutos activos o 10 intentos. El día cambia a las 04:00. |
| Regreso tras una pausa | Hasta 3 días: normal. De 4 a 13: comprobación de 10 minutos y reparto en 3 a 7 días. De 14 a 42: sondeo de 15 tarjetas y una semana sin tarjetas nuevas. Más de 42: además se revisa la meta. | Cuatro documentos daban tramos distintos; se toman los del documento de carga, sin huecos. Decía «comprobación de 10 tarjetas»; CA-223 dice 10 minutos y gana el criterio. |
| Confianza declarada | Tres niveles, pedida en 1 de cada 5 intentos, antes de ver el resultado. Nunca alimenta el dominio. | Un documento la pedía en la primera versión y otro la dejaba como experimento. Entra. |
| IA | Opcional, con tu propia clave, tope de gasto y «Modo solo local». Propone; nunca escribe sola. | Todo el núcleo de estudio funciona sin internet y sin IA. |
| Identificadores | UUID versión 7 en todos los registros. | Había dos propuestas (ULID y UUID versión 7). |
| Motor de memoria | FSRS-6 con la biblioteca ts-fsrs. Retención objetivo 0,90 en la materia activa y 0,85 en mantenimiento. Sin pasos de aprendizaje de corto plazo: la vuelta dentro de la sesión (CA-070) la maneja Retenia. | Existe FSRS-7, todavía en beta para TypeScript. El historial completo queda guardado para migrar. Los pasos de corto plazo harían que una tarjeta nueva volviera en minutos y CA-010 y CA-058 piden días. |
| Notificaciones | Apagadas por defecto. Como máximo un aviso por día, nunca de noche (22:00 a 08:00), vigencia 90 minutos. | Requiere que Retenia quede en la bandeja del sistema; es opcional. |
| Motivación | Compromiso semanal, hitos permanentes y mapa de dominio en 5 escalones. Sin puntos, niveles, insignias ni monedas. | Tu sistema de diseño ya lo fija: «sin castigos». |
| Nivel de idioma | Retenia nunca certifica un nivel. Muestra «desempeño compatible con B1 en lectura», con evidencia y fecha. | Un nivel oficial solo lo da un examen externo. |

## 2. Decisiones de la Fase 00 (tus respuestas del 13/10/2026)

| Pregunta | Qué decidiste | Consecuencia en la especificación |
|---|---|---|
| El curso de inglés y la materia activa | Una sola materia activa. Inglés es una materia más. | Cuando otra está activa, la propuesta diaria solo trae los repasos de Inglés; sus actividades se pueden hacer a mano desde Idiomas y sus repasos corren con retención de mantenimiento. Nota en H-09. |
| Seis números que no cerraban | Aplicar las seis correcciones. | Ver sección 3, bloque «Números». |
| Seis nombres que cambiaban | Aplicar las seis unificaciones. | Ver sección 3, bloque «Nombres». |
| Nivel de 9.000 palabras sin lista abierta | Nivel estimado por frecuencia, calibrado con listas abiertas, y dicho en la ficha. | CA-262 dice «nivel estimado»; la Fase 28 elige las fuentes y anota licencias en «Créditos y licencias» (CA-263). |
| Quién redacta y valida el contenido del curso | Claude Code redacta en la Fase 31 y lo guarda en el repositorio; la validación triple corre con tu clave de IA, con costo estimado visible (del orden de USD 10 a 30) y tope. | Nota en H-62; CA-291 dice «por la IA, en corridas independientes». |
| Dos «días por semana» | Un solo número. | El «cuánto» de «Mi meta» es el compromiso semanal, editable desde Estudiar y desde Ajustes › «Estudio». Notas en H-48 y H-51. |
| Lo que usás en RemNote y faltaba | Entran las tres: imágenes pegadas, fórmulas renderizadas y enlaces entre apuntes. | Criterios nuevos CA-372 a CA-379 en H-10, H-12 y H-30. Oclusión de imagen y grafo de enlaces quedan fuera de alcance. |

## 3. Correcciones aplicadas al texto original

Números (cambian lo que el programa muestra; aprobadas por vos):

| Criterio | Decía | Dice | Por qué |
|---|---|---|---|
| CA-086 | «Vuelven cuando baje de 2 días.» | «Vuelven de a poco cuando baje de 5 días.» | CA-085 frena del todo solo con más de 5 días; entre 2 y 5 ya entran hasta 3. |
| CA-117 | «11 de 12 páginas listas; 1 requiere revisión» | «9 de 12 páginas listas · 2 para revisar · 1 pendiente» | CA-113 define tres páginas con problemas (7, 9 y 11). |
| CA-223 y decisión de regreso | Decisión: «comprobación de 10 tarjetas» (2 minutos) | «10 minutos de comprobación» en ambos lados | Son lo mismo con nombres distintos; gana el criterio que se prueba a mano. |
| CA-327 | «B2 entre 2,6 y 3,1 años · C2 entre 5,1 y 6,2 años» (desde cero) | «desde donde estás: B2 entre 1,5 y 2,2 años · C2 entre 4,1 y 5,2 años» | El elenco arranca en A2; proyectar desde cero era incoherente con el dato. Cálculo en la sección 4. |
| CA-158 | «primero el último, después los dos últimos, después el problema entero» | agrega «después los tres últimos» | Con 4 pasos faltaba un escalón para que sea «un paso más vacío cada vez». |
| CA-212 | «cuánto: 30 minutos, 5 días por semana» | «cuánto: 25 minutos, 5 días por semana» | Las duraciones son 5, 10, 25 y 45; 30 no existe. |

Nombres (no cambian comportamiento; aprobados por vos):

| Antes | Ahora | Dónde |
|---|---|---|
| «Mi objetivo» | «Mi meta» | CA-212, CA-213 («una meta con fecha»), CA-216, CA-225 («¿Seguís con esta meta?»), pantallas, glosario. «Objetivo» queda para lo que aprendés (H-34). |
| «Ver ejemplo» / «Ver un ejemplo» | «Ver un ejemplo» | CA-138, CA-204, barra de ayuda. |
| «Pausar materia» / «Pausar la materia» | «Pausar la materia» | CA-225, CA-233. |
| «Vas bien» | «Vas bien.» | CA-129, pantalla Resultado. Igual que «Correcto.» y «Todavía no.». |
| «escala de 5 puntos» | «escala de 5 escalones» | CA-257. Evita chocar con «no hay puntos» de CA-259. |
| «verificación corta» | «comprobación corta» | CA-150. Una sola palabra para la misma cosa. |

Precisión (hacen comprobable lo que no lo era; no cambian la intención):

| Criterio | Qué se precisó |
|---|---|
| CA-001 | Los números de la línea son de ejemplo; se comprueba el formato y que las cifras sean reales. |
| CA-012 | «Carpeta del usuario» pasa a «carpeta de datos de aplicaciones de mi cuenta de Windows, separada de la de Retenia». |
| CA-026 | «Entendí: good morning» pasa a «Entendí: “good morning”», como CA-307. |
| CA-085 | Bordes: menos de 0,5 → completo; de 0,5 a menos de 2 → mitad; de 2 a 5 → hasta 3; más de 5 → ninguna. |
| CA-087 | La acción se llama «Sumar a mis repasos», como en CA-189. |
| CA-153 | La acción siguiente muestra su motivo, para que el orden de diagnóstico se pueda comprobar desde la pantalla. |
| CA-222 | «Se lee en dos minutos» pasa a «menos de 150 palabras y sin desplazarse». |
| CA-264 | Cuatro estados en fila pasan a dos ejes: entender («Desconocida», «Vista», «La entiendo») y usar («No la uso», «La uso»). |
| CA-265 | «En unos 4 minutos» queda como dato informativo; se comprueba «60 palabras, 20 inventadas». |
| CA-284 | Se fija un mínimo: al menos 3 textos por nivel. |
| CA-291 | «De forma independiente» pasa a «por la IA, 3 veces, en corridas independientes y sin ver la clave». |
| CA-316 | «Veo mi objetivo» pasa a «veo el objetivo de la situación», para no confundir con los objetivos de aprendizaje. |
| H-51 y H-56 | «Sin racha» y «sin rachas» en los títulos pasan a «sin contadores de días seguidos», porque los títulos de historia se vuelven títulos de pruebas y esa palabra está prohibida. |
| Humo | S1 desde la Fase 03, S2 desde la 04, S4 desde la 12 y S5 desde la 13 (la fase en que cada función queda terminada). |

Elenco (lo que faltaba para poder probar): ver `elenco.md`. Resumen: Bandeja con 2 elementos; historial de «¿Qué mide el desvío estándar?»; renglones con «varianza» y «s / sqrt(n)»; desglose 60 + 30 + 89 + 1 = 180; 11 tarjetas sin ver hace 27 a 33 días; texto de la página 7 usado por 2 tarjetas; objetivo «Calcular la media y el desvío»; último estudio 14/03 y «Tu semana» vista; más de 20 repasos con mediana 12 s; 169 de 180 palabras conocidas; 600 y 120 palabras; archivos «trampa.md», «entrevista.mp3», «campana.png» y los cinco archivos trampa.

## 4. Reglas que cierran los números

Estas reglas hacen que los ejemplos numéricos de los criterios den exactamente lo que dicen. Son decisiones de la Fase 00, abiertas a cambiar si la medición real de una fase posterior no se parece.

- **Estimación de duración de una sesión** (CA-079 a CA-082, CA-089): 1 minuto fijo + segundos por repaso × repasos + 60 segundos × tarjetas nuevas. Lo nuevo usa el menor valor entre lo que sobra del tiempo elegido y el 40 % de ese tiempo, multiplicado por el freno. La duración se muestra redondeada a 5 minutos. Con 60 repasos de 12 s y 30 nuevas: 5 min → 20 repasos (4 min + 1); 10 min → 45 repasos (9 min + 1); 25 min → 60 repasos (12 min) + 10 nuevas (10 min) + 1 = 23 → «unos 25 min»; 45 min → 60 repasos + 18 nuevas + 1 = 31 → «unos 30 min».
- **Freno por atraso** (CA-085): atraso en días = minutos de repasos vencidos ÷ capacidad diaria en minutos. Menos de 0,5: lo nuevo completo. De 0,5 a menos de 2: la mitad. De 2 a 5: hasta 3 tarjetas. Más de 5: ninguna.
- **Estimación por repaso** (CA-088, CA-090): (n × mediana + 10 × 12) ÷ (n + 10), con n repasos propios; sin repasos, 12 s. Un repaso dura como máximo 3 veces la estimación vigente y, si llega al tope, no entra en la mediana.
- **Prioridad de una tarjeta** (CA-092, CA-093): (1 − probabilidad de recuerdo) × 1,5 si es requisito de otra × (1 + 0,25 × aplazamientos). Tras 3 aplazamientos, prioridad máxima.
- **Escenarios de la meta** (CA-213, CA-214, CA-215): capacidad realista = 75 % de la declarada mientras no haya historia. Los 10 escenarios son la declarada × 0,50 · 0,60 · 0,70 · 0,75 · 0,80 · 0,90 · 1,00 · 1,10 · 1,25 · 1,40. «Viable» con 8 o más escenarios que cubren la demanda; «Ajustado» con 5 a 7; «No alcanza» con 4 o menos. En CA-214: declarada 640, realista 480, demanda 780 → solo 1,25 y 1,40 alcanzan → «No alcanza (2 de 10 escenarios)».
- **Rango de confianza y evidencia** (CA-248 a CA-250): intervalo de Wilson al 95 % (8 de 11 → 43 % a 90 %). Evidencia baja de 10 a 29 datos, media de 30 a 99, alta con 100 o más; menos de 10, «Datos insuficientes».
- **Reparto de hebras** (CA-322): porcentajes por nivel sobre los minutos de la sesión, redondeados por el método del mayor resto. 40/30/15/15 sobre 25 → 10 / 7 / 4 / 4.
- **Motor de memoria** (CA-010, CA-058, CA-060): FSRS-6 con parámetros por defecto de ts-fsrs, retención 0,90 (activa) y 0,85 (mantenimiento), sin pasos de corto plazo. Cálculo preliminar: tarjeta nueva + «La sabía» = 2 días (0,90) y 4 días (0,85); «Con dudas» y «No la sabía» = 1 día. La Fase 09 congela la versión y genera la tabla de casos de CA-059.
- **Proyección de idiomas** (CA-327): horas de referencia acumuladas A2 180–200, B2 500–600, C2 1.000–1.200. Ritmo 45 min × 5 días × 52 semanas = 195 h por año. Desde A2: B2 (500 − 200) ÷ 195 = 1,5 a (600 − 180) ÷ 195 = 2,2 años; C2 (1.000 − 200) ÷ 195 = 4,1 a (1.200 − 180) ÷ 195 = 5,2 años.
- **Regreso de 4 a 13 días** (CA-223): hoy 10 minutos de comprobación; después, días de recuperación = los que hagan falta para cubrir el atraso más la carga normal con la capacidad diaria. Con 42 min de atraso, 12 min de carga normal y 25 disponibles: 4 días (100 min para 42 + 48 = 90).
- **Estimación interna de un concepto** (CA-156): dos contadores, a favor y en contra, que empiezan en 1 y 1. Acierto sin ayuda: +1 a favor. Acierto con pista: +0,3 a favor. Fallo: +1 en contra. Solución vista: sin cambio. La media es a favor ÷ (a favor + en contra): 2,3 ÷ 4,3 = 0,535.
- **Candidatas por sección** (CA-185): 8 por cada 1.000 palabras, redondeado hacia arriba: 600 palabras → 5.
- **Tiempo de estudio** (CA-253): unión de intervalos, sin contar dos veces lo superpuesto.

## 5. Máquina de estados de dominio

| Estado actual | Acierto sin ayuda, otro día | Acierto sin ayuda, mismo día | Acierto con ayuda u opciones | Fallo | «Ya lo sé» |
|---|---|---|---|---|---|
| Sin iniciar | En práctica | En práctica | En práctica (cuenta en «Con ayuda») | En práctica | Suficiente (por verificar) |
| En práctica | Suficiente para avanzar, si ya había un acierto sin ayuda otro día; si no, sigue | sigue | sigue («Con ayuda») | sigue | — |
| A revisar | Suficiente para avanzar | sigue | sigue («Con ayuda») | sigue | — |
| Suficiente para avanzar | Consolidado si pasaron 7 días o más desde el acierto anterior (en «Aplicar», además una variante nueva); si no, sigue | sigue | sigue («Con ayuda») | A revisar | — |
| Consolidado | sigue (cuenta en «Diferido» si pasaron 7 días o más) | sigue | sigue («Con ayuda») | A revisar | — |
| Suficiente (por verificar) | Suficiente para avanzar (comprobación aprobada; se quita la marca) | — | — | En práctica | — |

Solo cuenta el primer intento del día por objetivo. «Diferido» cuenta aciertos sin ayuda con 7 días o más desde el anterior. Los 5 escalones del mapa de dominio son Sin iniciar (1), En práctica (2), A revisar (3), Suficiente para avanzar (4) y Consolidado (5); la marca «(por verificar)» no cambia el escalón.

## 6. Contradicciones con la investigación previa

| Tema | La investigación previa decía | Gana | Dónde se anota |
|---|---|---|---|
| Plataforma | Escritorio, PWA o Android, según el documento | Escritorio Windows 11 | Sección 1 |
| Tecnología | Tauri | Electron | Sección 1 |
| Importación | Docling y Whisper en Python | pdf.js, tesseract.js y sherpa-onnx en Node | Sección 1 |
| Escala de ayuda | Cinco escalas (0–4, 0–6, 0–7, A0–A5, E0–E6) | A0 a A4 | Sección 1, glosario |
| Duraciones | Cinco juegos distintos | 5, 10, 25, 45 | Sección 1 |
| Regreso | Cuatro tramos distintos; «10 tarjetas» de comprobación | Tramos del documento de carga; «10 minutos» | Sección 1, CA-223 |
| Identificadores | ULID o UUID versión 7 | UUID versión 7 | Sección 1 |
| Motor | FSRS-7 | FSRS-6, sin pasos de corto plazo | Sección 1 |
| Confianza declarada | Primera versión o experimento | Entra, 1 de cada 5, nunca alimenta el dominio | Sección 1 |
| Dominio tras un fallo | «Baja un escalón» | «A revisar» (CA-147) | Secciones 1 y 5 |
| Botones de calificación | Cuatro, con «Fácil» | Tres | Sección 1 |
| Compromiso | Racha de días seguidos | Días por semana, un solo número con la meta | Secciones 1 y 2 |
| Nivel de las palabras | Listas Oxford o English Vocabulary Profile | Nivel estimado por frecuencia, dicho en la ficha | Sección 2 |
| Proyección a C2 | Desde cero | Desde el nivel actual | Sección 3 |
| Capacidad y compromiso | Dos números (meta y compromiso) | Uno | Sección 2 |
