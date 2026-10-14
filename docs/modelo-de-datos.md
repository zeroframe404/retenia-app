# Modelo de datos

Versión 2 (Fase 04, 14/10/2026): el libro mayor, la Papelera, el registro para deshacer y las copias ya existen; lo que cambió respecto de la versión 1 está marcado «(Fase 04)» y explicado en `docs/decisiones.md`. Versión 1: Fase 01, 13/10/2026.

Una sola base SQLite por instalación (`retenia.db`), en modo WAL con `synchronous = FULL`, manejada solo desde `src/data` con Drizzle. Las tablas se nombran en inglés, en `snake_case`; los identificadores son UUID versión 7 en texto; los instantes van en ISO 8601 UTC y los días de estudio como `YYYY-MM-DD` calculados por `core` con el corte de las 04:00 de Buenos Aires.

Cuatro reglas que no se negocian:

1. **El historial solo se agrega.** Las observaciones, las evaluaciones y las operaciones (Fase 04) nunca se actualizan ni se borran: disparadores de SQLite (`BEFORE UPDATE` y `BEFORE DELETE` con `RAISE(ABORT)`) lo impiden incluso a un error de programación. Deshacer, corregir o apelar agrega una fila nueva que apunta a la anterior.
2. **Todo estado se recalcula.** Las proyecciones (vencimientos, estados de dominio, contadores) se pueden borrar y reconstruir desde el historial y el contenido, en orden estable, y dan lo mismo. «Verificar datos» hace exactamente eso y compara (CA-016, CA-062).
3. **El contenido se versiona.** Un apunte, una tarjeta o un ejercicio tiene una fila «cabeza» y filas de versión inmutables; editar crea una versión; «Deshacer» crea otra versión igual a la anterior.
4. **Las migraciones solo agregan.** Tablas y columnas nuevas (con valor por defecto o nulas), índices y disparadores. Nunca `DROP`, `RENAME` ni `ALTER … DROP`. Un dato que cambia de forma se escribe en una columna nueva y se rellena desde el historial.

## 1. Las tres capas del registro

### 1.1 Observaciones (`observations`): lo que pasó, inmutable

| Columna | Tipo | Qué es |
|---|---|---|
| `id` | TEXT, PK | UUID v7 (ordenable por tiempo), generado en el principal antes de guardar. |
| `kind` | TEXT | Tipo de observación (lista cerrada abajo). |
| `occurred_at` | TEXT | Instante en que ocurrió, ISO UTC con milisegundos. |
| `recorded_at` | TEXT | Instante en que se guardó (puede ser después, por ejemplo al importar). |
| `time_zone` | TEXT | Zona horaria de quien lo registró: `America/Argentina/Buenos_Aires` (Fase 04). |
| `device_id` | TEXT | El dispositivo que lo registró (`ledger_state.device_id`) (Fase 04). |
| `seq` | INTEGER | Número de secuencia del dispositivo, uno solo para observaciones, evaluaciones y operaciones; UNIQUE con `device_id`. Es el orden canónico (Fase 04). |
| `subject_id` | TEXT, nulo | Materia, cuando aplica, para filtrar rápido. |
| `payload` | TEXT (JSON) | Los datos del tipo, validados con el esquema Zod de ese `kind` y esa `schema_version`. |
| `schema_version` | INTEGER | Versión del esquema del `payload`; los esquemas viejos se conservan para leer historial viejo. |
| `idempotency_key` | TEXT, UNIQUE | Clave que impide registrar dos veces lo mismo (CA-018): la arma quien registra (por ejemplo `sessionId:activityId:shownAt`). |
| `source` | TEXT | `user`, `system`, `import:anki`, `import:remnote`, `import:retenia`, `demo`. |

Índices: `(kind, occurred_at)`, `(subject_id, occurred_at)`, y por entidad dentro del `payload` mediante columnas generadas para las dos consultas calientes: `card_id` y `objective_id` (columnas `GENERATED ALWAYS AS (json_extract(payload, '$.cardId')) VIRTUAL` con índice).

Fase 04: existen `(kind, occurred_at)`, la columna generada `card_id` con índice `(card_id, seq)`, UNIQUE `idempotency_key` y UNIQUE (`device_id`, `seq`); `subject_id` y `objective_id` llegan agregando con sus fases.

Tipos de observación (`kind`) y lo esencial de su `payload`:

| `kind` | Payload | Historias |
|---|---|---|
| `review.graded` | `cardId, sessionId, grade ('again' \| 'hard' \| 'good'), helpLevel ('A0'…'A4'), optionsQuestion (bool), shownAt, durationMs, dueAtThen`. Versión 1 del esquema (Fase 04): `cardId, grade, helpLevel 'A0', dueAtThen`; la sesión, los tiempos y la ayuda llegan con su fase como versión 2. Clave de idempotencia `review:<attemptId>` (la ventana genera `attemptId` al abrir el repaso). | H-02, H-04, H-15, H-16, H-21 |
| `schedule.adopted` | `cardId, memory` (la agenda que traía una tarjeta de una base de la Fase 03, repasada sin historial). Una sola vez por tarjeta, clave `adopt:<cardId>`, fuente `system` (Fase 04). | H-04 |
| `review.annulled` | `reviewId` (la observación anulada) | H-15, H-16 |
| `attempt.submitted` | `activityType ('card' \| 'exercise' \| 'lesson' \| 'word' \| 'contrast' \| 'writing' \| 'dictation' \| 'probe30' \| 'simulacro'), activityId, sessionId?, answer (texto, número u opción), helpLevel, optionsQuestion, variantId?, durationMs` | H-31, H-32, H-37 a H-39, H-54, H-59, H-61, H-63 a H-65, H-67 |
| `hint.requested` | `activityId, sessionId, level` | H-32, H-47 |
| `confidence.declared` | `attemptId, level ('guessing' \| 'think_so' \| 'sure')` | H-55 |
| `session.started` / `session.paused` / `session.resumed` / `session.finished` / `session.rated` | `sessionId, subjectId, plannedMinutes, activityIds[]`; `minutesActive`; `rating ('easy' \| 'fair' \| 'hard')` | H-16, H-17, H-51, H-54 |
| `proposal.postponed` | `kind ('later' \| 'tomorrow' \| 'date'), until, cardIds[]` | H-22 |
| `study.declared_outside` | `minutes, studyDay` | H-50 |
| `blocker.answered` | `option` | H-52 |
| `commitment.changed` | `days, source ('user' \| 'difficult_week' \| 'difficult_week_end')` | H-51 |
| `unavailable.declared` | `from, to` | H-49 |
| `goal.created` / `goal.changed` / `goal.answered` | `goalId, what, dueDate?, minutesPerDay, daysPerWeek`; `answer ('continue' \| 'adjust' \| 'pause')` | H-48, H-50 |
| `objective.know_already` | `objectiveId` | H-34 |
| `requirement.dismissed` | `objectiveId, requiresId` | H-35 |
| `placement.answered` / `placement.finished` / `placement.accepted` / `placement.skipped` | `itemId, answer`; `estimatedWords, suggestedLevel, reliable` | H-58 |
| `word.added` / `word.know_already` | `wordId, context?` | H-59, H-60 |
| `reading.finished` / `reading.timed` / `reading.rest_known` | `textId, questionsCorrect, wordsPerMinute, untouchedWordIds[]` | H-60, H-67 |
| `listening.finished` | `audioId, kind ('dictation' \| 'questions'), correct` | H-61 |
| `writing.submitted` | `promptId, text, level` | H-65 |
| `conversation.turn` | `conversationId, situationId, role, text` | H-66 |
| `lesson.flagged` / `lesson.reviewed` | `lessonId, reason?` | H-62 |
| `probe30.finished` | `cardIds[], correct` | H-54 |
| `reminder.decided` | `scheduledFor, outcome ('sent' \| 'skipped' \| 'postponed' \| 'clicked'), reason` | H-53 |
| `material.permission` | `materialId, scope` | H-40 |
| `ai.correction_confirmed` | `evaluationId, agree` | H-46 |

Lo que **no** es observación: los cambios de contenido (van como versiones), los pedidos a la IA (`ai_requests`, por su costo y su privacidad), las copias y las importaciones (tablas operativas).

### 1.2 Evaluaciones (`evaluations`): versionadas, se enmiendan agregando

Una evaluación dice qué resultado tuvo un intento. Se agregan versiones; la vigente es la de mayor `version` (no hay columna `superseded_by`: eso obligaría a modificar la anterior). Un disparador exige que la versión 1 no enmiende nada y que la N enmiende la N-1 del mismo intento; UNIQUE (`attempt_id`, `version`).

Fase 04: cada repaso de tarjeta escribe su evaluación versión 1 (fuente `user`, veredicto `correct` para «La sabía», `partial` para «Con dudas» e `incorrect` para «No la sabía») y la agenda usa la calificación de la vigente. La tabla tiene por ahora `id, attempt_id, version, supersedes_id, verdict, source, created_at` más `time_zone`, `device_id` y `seq`; las demás columnas entran agregando en la fase que las use.

| Columna | Qué es |
|---|---|
| `id` | UUID v7. |
| `attempt_id` | La observación `attempt.submitted` o `review.graded` evaluada. |
| `version` | 1, 2, 3… |
| `supersedes_id` | La versión anterior que esta enmienda (nula en la primera). |
| `verdict` | `correct`, `partial`, `incorrect`, `uncertain` («No pude evaluarla con seguridad.»). |
| `units` | JSON: por unidad de idea, `covered \| partial \| missing` y la frase del intento en que se basa. |
| `axes` | JSON (escritura): «Se entiende», «Precisión», «Adecuación». |
| `errors` | JSON: errores detectados (texto, forma correcta, tipo, regla) para «Mis errores». |
| `source` | `rule` (regla sin IA), `user` (vos marcaste), `ai`. |
| `model`, `prompt_version`, `rubric_version` | Con qué se hizo (CA-181). |
| `status` | `firm`, `provisional` (apelada, trazo punteado), `inconclusive` (14 días sin resolver). |
| `appeal_reason` | Uno de los cuatro motivos de «Discrepo», si corresponde. |
| `affected` | 1 cuando la referencia se marcó incorrecta y este intento no cuenta como olvido (CA-142). |
| `created_at`, `resolves_at` | Instantes. |

Índices: `(attempt_id, version)`, `(status, resolves_at)`.

### 1.3 Inferencias (proyecciones): recalculables

Cada proyección tiene una función pura en `core` que la calcula desde observaciones, evaluaciones y contenido, con el reloj inyectado. Se actualizan en la misma transacción que la observación que las afecta, y «Verificar datos» las reconstruye y las compara campo por campo.

Orden canónico (Fase 04): el número de secuencia (`seq`), con el identificador como desempate; ya no `(occurred_at, id)`. «Restablecer fecha» y un reloj de PC atrasado hacen que la hora vaya para atrás; con la secuencia el recálculo da lo mismo que el cálculo hecho en el momento y el historial solo crece al final. La agenda de una tarjeta se recalcula en cada escritura leyendo todos sus eventos de la base, con la misma función (`projectCardMemory`, versión del motor 1, retención 0,90) que usa «Verificar datos».

| Tabla | Clave | Columnas principales | Calculada por | Historias |
|---|---|---|---|---|
| `card_schedule` | `card_id` | `state, stability, difficulty, due_at, last_review_at, reps, lapses, retention_target, consecutive_fails, in_improve_list, scheduled_as_new_since` | `core/memory` (ts-fsrs, FSRS-6, sin pasos cortos) | H-02, H-15, H-20, H-36 |
| `objective_state` | `objective_id` | `state, pending_check, count_unaided, count_aided, count_delayed, count_variants, last_unaided_day, since, prior_state` | `core/mastery` (máquina de estados de `decisiones-conciliadas.md`) | H-34, H-35, H-39, H-56 |
| `concept_estimate` | `concept_id` | `in_favor, against` (empiezan en 1 y 1) | `core/mastery` | H-36 |
| `word_state` | `word_id` | `understand ('unknown' \| 'seen' \| 'understood'), use ('not_used' \| 'used'), pending_check, context_sentence` | `core/languages` | H-58 a H-60 |
| `study_days` | `study_day` | `minutes_active, attempts, counts_for_commitment, declared_outside_minutes` | `core/habits` (unión de intervalos, CA-253) | H-51, H-54 |
| `session_current` | una fila | `session JSON, valid_until` (04:00 siguiente) | `core/session` | H-16 |
| `load_cache` | `subject_id` | `due_minutes, delay_days, new_allowance, estimate_per_review_s, review_count` | `core/load` | H-19 a H-21 |
| `plan_cache` | `goal_id` | `state ('viable' \| 'tight' \| 'short'), scenarios_ok, demand_minutes, capacity_minutes, milestones JSON (rangos), bars JSON` | `core/planner` | H-48, H-49 |
| `return_state` | `subject_id` | `days_away, tier ('normal' \| '4-13' \| '14-42' \| '>42'), plan JSON, new_cards_blocked_until` | `core/return` | H-50 |
| `ai_usage_month` | `month` | `usd, requests, agreement_by_kind JSON` | `core/ai_cost` | H-40, H-46 |
| `skill_level` | `(course_id, skill)` | `level, evidence_count, since` | `core/languages` | H-67 |
| `descriptor_state` | `descriptor_id` | `state, evidence_count, last_at` | `core/languages` | H-67 |
| `thread_minutes` | `(week, thread)` | `minutes` | `core/languages` | H-61, H-66, H-67 |
| `milestones` | `milestone_id` | `kind, achieved_at, card_id?` (permanentes porque el historial no cambia) | `core/measures` | H-56 |
| `error_notebook_user` | `evaluation_id, index` | `text, correct, type, topic_id, course?` | `core/measures` | H-36, H-38, H-65 |
| `search_documents` + `search_index` (FTS5) | `doc_id` | ver sección 3 | `data/search` | H-23, H-24 |

### 1.4 Operaciones (`operations`): el registro para deshacer (Fase 04)

Cada alta, edición, borrado, restauración desde la Papelera y vaciado de una tarjeta. Solo se agrega (disparadores como los de las observaciones). «Deshacer» agrega una operación del tipo inverso con `undoes_id`; nunca modifica ni borra una anterior.

| Columna | Qué es |
|---|---|
| `id` | UUID v7. |
| `kind` | `card.create` · `card.edit` · `card.delete` · `card.restore` · `card.purge`. |
| `entity_type`, `entity_id` | `card` y la tarjeta. |
| `version_before_id`, `version_after_id` | Las versiones de contenido antes y después (sin clave foránea: sobreviven a vaciar la papelera). |
| `trash_entry_id` | La entrada de la Papelera, en borrados, restauraciones y vaciados. |
| `undoes_id` | La operación que esta deshace, si es un «Deshacer». |
| `source` | `user`, `system` (vencimiento de la Papelera) o `demo` (siembra del ejemplo). «Actividad reciente» muestra solo `user`. |
| `occurred_at`, `recorded_at`, `time_zone`, `device_id`, `seq` | Como en las observaciones. |

Índices: UNIQUE (`device_id`, `seq`) y (`entity_type`, `entity_id`, `seq`).

`ledger_state` (una fila): `device_id` (UUID v7 creado al abrir la base por primera vez) y `last_seq`, que se suma en la misma transacción que cada evento. Al restaurar una copia vieja, el dispositivo sigue y `last_seq` toma el mayor de los dos: un par (dispositivo, número) nunca se repite.

## 2. Contenido con versiones inmutables

Convención: la tabla «cabeza» guarda identidad, pertenencia y `current_version_id`; la tabla `*_versions` guarda cada estado del contenido con `created_at` y `cause` (`edit`, `undo`, `import`, `correction`, `ai`, `restore`). Borrar es marcar `deleted_at` y crear una entrada en `trash_entries`; a los 30 días se eliminan las versiones de contenido, nunca las observaciones que las mencionan (el historial muestra «(eliminada)»).

Fase 04, tarjetas: la cabeza `cards` tiene por ahora `id, current_version_id, created_at, deleted_at` y `card_versions` tiene `id, card_id, question, answer, created_at, cause` (`edit` al crear o editar, `undo` al deshacer); las demás columnas entran agregando. Vaciar la papelera (o su vencimiento a los 30 días, que corre al abrir después de la copia automática) borra en una transacción la agenda, las versiones y la cabeza, marca `purged_at` y agrega la operación `card.purge`; las observaciones, las evaluaciones y las operaciones de esa tarjeta quedan.

### Organización

| Tabla | Columnas | Historias |
|---|---|---|
| `subjects` | `id, name, status ('active' \| 'maintenance' \| 'paused' \| 'archived'), is_course, course_id?, retention_target, created_at, deleted_at` | H-09, H-51, H-57 |
| `topics` | `id, subject_id, name, position, created_at, deleted_at` | H-09 |
| `topic_aliases` | `topic_id, name, since` («Otros nombres», CA-044, CA-099) | H-10, H-23 |
| `notes` | `id, subject_id, topic_id?, title, archived_at, created_at, deleted_at` | H-10 |
| `blocks` | `id, note_id, parent_block_id?, position (entero con reordenamiento por lotes), kind ('text' \| 'image'), current_version_id, created_at, deleted_at` | H-10, H-12 |
| `block_versions` | `id, block_id, content (JSON del editor: texto con marcas, fórmulas como texto fuente, enlaces por id), text_plain, image_id?, card_marker (JSON: '>>' o huecos), created_at, cause` | H-10, H-12 |
| `block_links` | `block_id, target_note_id` (enlaces por identificador, CA-374 a CA-376) | H-10 |
| `images` | `id, sha256, mime, bytes, width, height, created_at` (el archivo vive en `imagenes\<sha256>`) | H-10, H-12, H-30 |
| `inbox_items` | `id, text, source (JSON: materialId, pageNo, selection), created_at, moved_to_note_id, moved_at` | H-11, H-26 |

### Tarjetas y ejercicios

| Tabla | Columnas | Historias |
|---|---|---|
| `cards` | `id, subject_id, topic_id?, block_id?, material_id?, origin ('manual' \| 'note' \| 'material' \| 'ai' \| 'import' \| 'contrast' \| 'word' \| 'writing'), sibling_group_id?, inverse_of_card_id?, ai_marked, paused_at, available_only (no entra hasta «Sumar a mis repasos»), current_version_id, created_at, deleted_at` | H-02, H-12 a H-14, H-44 |
| `card_versions` | `id, card_id, question, answer, variants (JSON), hints (JSON, hasta 3), explanation, source_cite (JSON: materialId, pageNo, quote), sheet_state ('proposed' \| 'reviewed' \| 'verified' \| 'in_review' \| 'retired'), meaning_changed (reprograma como nueva), created_at, cause` | H-13, H-18, H-33 |
| `exercises` | `id, subject_id, topic_id?, kind ('open' \| 'numeric' \| 'options' \| 'procedure' \| 'method_choice' \| 'micro'), current_version_id, created_at, deleted_at` | H-31, H-37 a H-39 |
| `exercise_versions` | `id, exercise_id, prompt, model_answer_units (JSON, 2 a 4), steps (JSON, con el paso clave), variant_family (JSON: plantilla y rangos), options (JSON con explicación por opción), tolerance, created_at, cause` | H-31, H-37 a H-39 |
| `candidates` | `id, material_id, section_id, question, answer, objective_text, quote, similar_to_card_id?, defects (JSON), decision ('pending' \| 'accepted' \| 'edited' \| 'discarded'), created_at` | H-44 |

### Materiales

| Tabla | Columnas | Historias |
|---|---|---|
| `materials` | `id, subject_id, title, kind ('pdf' \| 'text' \| 'docx' \| 'md' \| 'web' \| 'audio'), original_sha256, original_name, size_bytes, source_url?, snapshot_at?, status ('saved' \| 'extracted' \| 'sectioned' \| 'ready' \| 'failed' \| 'cancelled' \| 'pending_network'), previous_material_id? («Agregar como nueva versión»), added_at, deleted_at` | H-25, H-26, H-28, H-61 |
| `material_pages` | `(material_id, page_no), status ('ready' \| 'review' \| 'pending' \| 'error' \| 'excluded'), text, text_source ('pdf' \| 'ocr' \| 'corrected'), problems (JSON), width, height` | H-25, H-27 |
| `page_corrections` | `id, material_id, page_no, before_sha256, after_text, state ('applied' \| 'conflict'), created_at` | H-27 |
| `sections` | `id, material_id, title, from_page, to_page, word_count, position` | H-25, H-44 |
| `transcripts` | `material_id, segments (JSON con tiempos y «[inaudible]»), created_at` | H-61 |

### Objetivos, metas y hábitos

| Tabla | Columnas | Historias |
|---|---|---|
| `objectives` | `id, topic_id, title, kind ('understand' \| 'apply'), created_at, deleted_at` | H-34 |
| `objective_links` | `objective_id, activity_type, activity_id` | H-34 |
| `objective_requirements` | `objective_id, requires_objective_id, kind ('indispensable' \| 'suggested'), confirmed, dismissed_at` | H-35 |
| `goals` | `id, subject_id, what, due_date?, minutes_per_day, days_per_week (= compromiso semanal), status ('active' \| 'paused' \| 'done'), created_at` | H-48, H-51 |
| `availability_exceptions` | `id, from_day, to_day, created_at` («No puedo estos días») | H-49 |
| `micro_exercises` | `id, error_type, items (JSON, 5 a 10), created_at, passed_at` | H-39 |
| `doubts` | `id, text, context (JSON: cardId o activityId), created_at, resolved_at` | H-17, H-46 |

### Operación

| Tabla | Columnas | Historias |
|---|---|---|
| `settings` | `key, value (JSON), updated_at` | H-08, H-19, H-40, H-51, H-53 |
| `trash_entries` | `id, entity_type, entity_id, deleted_at, expires_at, restored_at, purged_at` (`purged_at`: Fase 04) | H-05, H-06 |
| `purge_permits` | `entity_type, entity_id` (Fase 04): el permiso para borrar las versiones de una tarjeta; se agrega y se saca dentro de la transacción de vaciar la papelera, así que fuera de ella siempre está vacía | H-06 |
| `ai_requests` | `id, at, purpose, task, model, prompt_version, rubric_version, fragments (JSON: materialId, pageNo, sha256, chars), input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, usd, status ('ok' \| 'rejected_schema' \| 'failed' \| 'pending'), related_attempt_id?` (solo se agrega) | H-40, H-41, H-43 |
| `ai_material_permissions` | `material_id, scope ('once' \| 'always' \| 'never'), decided_at` | H-40 |
| ~~`backups`~~ | No existe (Fase 04): las copias son archivos con su manifiesto adentro, ver «Copias» abajo | H-05, H-29, H-72, H-73 |
| `imports` | `id, kind ('anki' \| 'remnote' \| 'retenia'), file_sha256, at, summary (JSON), rejected (JSON)` (CA-124: un archivo ya importado se reconoce por su huella) | H-29, H-30 |
| `model_downloads` | `name, version, sha256, status, downloaded_at` | H-07 |
| `course_item_states` | `item_id, state ('reviewed' \| 'flagged' \| 'excluded'), note, at` (tus marcas sobre el contenido del curso) | H-62, H-63 |
| `user_texts` | `id, title, text, level_estimate, known_ratio, created_at` (textos en inglés pegados por vos) | H-60 |
| `schema_meta` | `key, value` (versión de migraciones aplicadas, fecha de la última verificación de datos) | H-04, H-73 |

### Copias (Fase 04): archivos, no tabla

La lista de copias sale de leer la carpeta `copias\` de la carpeta de datos, no de la base: restaurar reemplaza la base, y una base dañada (Fase 39) igual tiene que saber qué copias hay.

- Nombre: `AAAA-MM-DD-HHMM-<tipo>-<8 caracteres>.retenia-copia` (hora de Buenos Aires; los 8 caracteres salen de un UUID v7, así dos copias del mismo minuto no chocan y se ordenan bien).
- Contenido: gzip de un renglón de manifiesto JSON seguido de una instantánea de la base hecha con `VACUUM INTO`. Manifiesto: `format 'retenia-copia'`, `formatVersion 1`, `id` (UUID v7), `kind` (`auto` · `manual` · `before_restore`; `before_import` y `before_update` llegan con sus fases), `createdAt`, `timeZone`, `appVersion`, `migrations`, `counts` (filas por tabla), `databaseBytes` y `databaseSha256`.
- Una copia se escribe como `.tmp`, se sincroniza con el disco, se descomprime y se verifica (huella, `PRAGMA integrity_check` y cantidades) y recién entonces se renombra con su nombre: toda copia de la lista está verificada. Rotan solo las automáticas (quedan las 14 más nuevas).
- Restaurar recibe el `id` del manifiesto, nunca una ruta.

### Base del curso de inglés (`curso-ingles.db`, solo lectura, dentro del instalador)

Se construye en las Fases 28 a 34 con herramientas de `tools/` a partir de fuentes con licencia anotada, y se publica con cada versión. Tablas: `words` (lema, posición por frecuencia, nivel estimado, pronunciación, significado en español, ejemplo, fuente), `grammar_points` (nivel, explicación, 3 ejemplos, contraste con el español), `course_exercises` (8 por punto, con clave y estado de validación triple), `lessons`, `descriptors` (20 o más por nivel), `error_notebook` (60 o más), `sound_contrasts` y `contrast_pairs` (12 o más, 10 pares cada uno), `reading_texts` (3 o más por nivel, con fuente, licencia y 3 preguntas), `listening_items`, `situations`, `writing_prompts`, `placement_items` (palabras reales e inventadas, ítems de gramática por dificultad), `simulacros`, `sources` (fuente, licencia, atribución, para «Créditos y licencias»). Tus datos nunca van ahí; tus marcas van a `course_item_states`.

## 3. Índice de búsqueda

- `search_documents` es una proyección: una fila por cosa buscable, con `doc_id`, `kind` (`note`, `block`, `card`, `exercise`, `material`, `section`, `topic`, `word`), `subject_id`, `title`, `body` y `destination` (JSON para saltar al lugar exacto). El `body` de un renglón incluye el texto fuente de sus fórmulas (CA-097); el de una tarjeta, pregunta y respuesta; el de un tema, su nombre y sus «Otros nombres» (CA-099); el de un material, su título, sus secciones y el texto de sus páginas.
- `search_index` es una tabla FTS5 de contenido externo sobre `search_documents`, con `tokenize = 'trigram remove_diacritics 1'` y `detail = full`. Trigram da prefijo e infijo («varian» → varianza, «sqrt(n» → s / sqrt(n)); `remove_diacritics` iguala «desvio» y «desvío»; es insensible a mayúsculas. Consultas de menos de 3 caracteres no se envían: la pantalla pide al menos 3 letras.
- La actualización del índice va en la misma transacción que el cambio de contenido, así «bayes» aparece de inmediato (CA-100). Los filtros `tipo:` y `materia:` se traducen a condiciones sobre `kind` y `subject_id` antes de la consulta FTS (CA-098). El orden es por `rank` de FTS5 con desempate por recencia; `highlight()` resalta; el límite es 50 resultados.

## 4. Cada historia y las tablas en que se apoya

| Historia | Tablas y proyecciones |
|---|---|
| H-01 | ninguna del producto: la red lee el repositorio |
| H-02 | `cards`, `card_versions`, `observations` (`review.graded`), `card_schedule` |
| H-03 | `settings`, `schema_meta` (carpeta por variante; sin tablas nuevas) |
| H-04 | `observations`, `evaluations`, `ledger_state`, todas las proyecciones (recalcular y comparar) |
| H-05 | copias (archivos con manifiesto, sin tabla), `trash_entries` |
| H-06 | `trash_entries`, `purge_permits`, `operations`, `*_versions` (Actividad reciente y Deshacer) |
| H-07 | `model_downloads` |
| H-08 | `settings` |
| H-09 | `subjects`, `topics`, `notes` |
| H-10 | `notes`, `blocks`, `block_versions`, `block_links`, `images`, `topic_aliases` |
| H-11 | `inbox_items` |
| H-12 | `blocks`, `block_versions`, `cards`, `card_versions`, `images` |
| H-13 | `cards`, `card_versions`, `card_schedule` |
| H-14 | `cards`, `card_schedule`, `exercises` |
| H-15 | `observations` (`review.graded`, `review.annulled`), `card_schedule`, `subjects.retention_target` |
| H-16 | `observations` (sesión, repasos), `session_current`, `cards.sibling_group_id` |
| H-17 | `observations` (`session.finished`, `session.rated`), `doubts`, `micro_exercises` |
| H-18 | `card_versions.sheet_state`, `evaluations.affected` |
| H-19 | `load_cache`, `card_schedule`, `settings` |
| H-20 | `load_cache`, `cards.available_only` |
| H-21 | `observations.durationMs`, `load_cache.estimate_per_review_s` |
| H-22 | `observations` (`proposal.postponed`), `card_schedule`, `objective_requirements` |
| H-23 | `search_documents`, `search_index`, `topic_aliases` |
| H-24 | `search_index`, `session_current` |
| H-25 | `materials`, `material_pages`, `sections` |
| H-26 | `materials` (original por huella), `card_versions.source_cite`, `inbox_items` |
| H-27 | `material_pages`, `page_corrections`, `cards` (que usan el texto) |
| H-28 | `materials` (`kind = 'web'`, `pending_network`) |
| H-29 | `imports`, copias (`before_import`), `cards`, `observations` (`source = 'import:anki'`) |
| H-30 | todo (exportar e importar la base completa), `images` |
| H-31 | `exercises`, `exercise_versions`, `observations` (`attempt.submitted`), `evaluations` |
| H-32 | `observations` (`hint.requested`), `card_versions.hints`, `objective_state` |
| H-33 | `evaluations` (versiones y apelaciones), `card_versions.variants`, `card_versions.sheet_state` |
| H-34 | `objectives`, `objective_links`, `objective_state` |
| H-35 | `objective_requirements`, `objective_state` |
| H-36 | `card_schedule.in_improve_list`, `error_notebook_user`, `concept_estimate` |
| H-37 | `exercises` (`procedure`), `exercise_versions.steps`, `evaluations` |
| H-38 | `exercises` (`method_choice`), `cards` (`origin = 'contrast'`) |
| H-39 | `exercise_versions.variant_family`, `objective_state.count_variants`, `micro_exercises` |
| H-40 | `settings`, `ai_requests`, `ai_material_permissions`, `ai_usage_month` |
| H-41 | `ai_requests.status`, `evaluations.source`, `candidates` |
| H-42 | ninguna: el catálogo de textos vive en el código |
| H-43 | `evaluations.prompt_version`, `evaluations.rubric_version`, `ai_requests` |
| H-44 | `candidates`, `cards.available_only`, `cards.ai_marked`, `sections` |
| H-45 | `evaluations` (dos corridas, `uncertain`), `ai_requests` |
| H-46 | `evaluations` (`provisional`, `inconclusive`), `observations` (`ai.correction_confirmed`), `ai_usage_month.agreement_by_kind` |
| H-47 | `ai_requests`, `evaluations`, `objective_state` (deja de ofrecer ayuda) |
| H-48 | `goals`, `plan_cache` |
| H-49 | `availability_exceptions`, `plan_cache`, `settings` («Tu semana» vista) |
| H-50 | `return_state`, `observations` (`study.declared_outside`, `goal.answered`), `session_current` |
| H-51 | `study_days`, `observations` (`commitment.changed`), `goals.days_per_week`, `subjects.status` |
| H-52 | `observations` (`blocker.answered`), `settings` |
| H-53 | `settings`, `observations` (`reminder.decided`) |
| H-54 | `observations` (`probe30.finished`), `study_days`, `card_schedule` |
| H-55 | `observations` (`confidence.declared`), `card_schedule` |
| H-56 | `objective_state`, `milestones` |
| H-57 | `curso-ingles.db` (`words`, `sources`), `word_state` |
| H-58 | `curso-ingles.db` (`placement_items`), `observations` (`placement.*`), `word_state` |
| H-59 | `cards` (`origin = 'word'`), `word_state`, `curso-ingles.db` (`words`) |
| H-60 | `curso-ingles.db` (`reading_texts`), `user_texts`, `word_state`, `observations` (`reading.*`) |
| H-61 | `materials` (`kind = 'audio'`), `transcripts`, `observations` (`listening.finished`), `thread_minutes` |
| H-62 | `curso-ingles.db` (`grammar_points`, `course_exercises`, `descriptors`, `error_notebook`, `sound_contrasts`), `course_item_states` |
| H-63 | `curso-ingles.db` (`lessons`), `observations` (`attempt.submitted`), `objective_state` |
| H-64 | `curso-ingles.db` (`contrast_pairs`), `cards` (contrastes como tarjetas), `observations` |
| H-65 | `curso-ingles.db` (`writing_prompts`), `observations` (`writing.submitted`), `evaluations.axes`, `error_notebook_user`, `cards` (`origin = 'writing'`) |
| H-66 | `curso-ingles.db` (`situations`), `observations` (`conversation.turn`), `thread_minutes` |
| H-67 | `skill_level`, `descriptor_state`, `thread_minutes`, `curso-ingles.db` (`simulacros`) |
| H-68 | ninguna: la red mide al código |
| H-69 | `ai_requests` (nada de la clave), `materials` (archivos trampa) |
| H-70 | ninguna |
| H-71 | `search_index`, `card_schedule` (10.000 tarjetas) |
| H-72 | copias, `schema_meta`, `materials` (disco lleno) |
| H-73 | copias (`before_update`), `schema_meta` (migraciones), `settings` |
| H-74 | ninguna: la ayuda vive en el código |

## 5. Cada tabla y las historias que la justifican

| Tabla | Historias |
|---|---|
| `observations` | H-02, H-04, H-15 a H-17, H-21, H-22, H-29, H-31, H-32, H-34, H-35, H-37 a H-39, H-46 a H-55, H-58 a H-67 |
| `evaluations` | H-04, H-18, H-31, H-33, H-37, H-41, H-43, H-45 a H-47, H-65 |
| `operations` | H-06 |
| `ledger_state` | H-04, H-05 |
| `card_schedule` | H-02, H-13 a H-15, H-19, H-20, H-22, H-36, H-54, H-55, H-71 |
| `objective_state` | H-32, H-34, H-35, H-39, H-47, H-56, H-63 |
| `concept_estimate` | H-36 |
| `word_state` | H-57 a H-60 |
| `study_days` | H-51, H-54 |
| `session_current` | H-16, H-24, H-50 |
| `load_cache` | H-19 a H-21 |
| `plan_cache` | H-48, H-49 |
| `return_state` | H-50 |
| `ai_usage_month` | H-40, H-46 |
| `skill_level`, `descriptor_state`, `thread_minutes` | H-61, H-66, H-67 |
| `milestones` | H-56 |
| `error_notebook_user` | H-36, H-38, H-65 |
| `search_documents`, `search_index` | H-23, H-24, H-71 |
| `subjects` | H-09, H-15, H-51, H-57 |
| `topics`, `topic_aliases` | H-09, H-10, H-23 |
| `notes`, `blocks`, `block_versions`, `block_links` | H-06, H-10, H-12 |
| `images` | H-10, H-12, H-30 |
| `inbox_items` | H-11, H-26 |
| `cards`, `card_versions` | H-02, H-06, H-12 a H-14, H-18, H-26, H-32, H-33, H-38, H-44, H-59, H-64, H-65 |
| `exercises`, `exercise_versions` | H-14, H-31, H-37 a H-39 |
| `candidates` | H-41, H-44 |
| `materials`, `material_pages`, `sections` | H-25 a H-28, H-44, H-61, H-69, H-72 |
| `page_corrections` | H-27 |
| `transcripts` | H-61 |
| `objectives`, `objective_links` | H-34 |
| `objective_requirements` | H-22, H-35 |
| `goals` | H-48, H-51 |
| `availability_exceptions` | H-49 |
| `micro_exercises` | H-17, H-39 |
| `doubts` | H-17, H-46 |
| `settings` | H-03, H-08, H-19, H-40, H-49, H-51 a H-53, H-73 |
| `trash_entries` | H-05, H-06 |
| `purge_permits` | H-06 |
| `ai_requests` | H-40, H-41, H-43, H-45, H-47, H-69 |
| `ai_material_permissions` | H-40 |
| `imports` | H-29, H-30 |
| `model_downloads` | H-07 |
| `course_item_states` | H-62, H-63 |
| `user_texts` | H-60 |
| `schema_meta` | H-03, H-04, H-72, H-73 |

Toda tabla tiene al menos una historia; ninguna historia que guarde datos queda sin tabla. Si en una fase aparece una tabla sin historia, se saca. Las copias (H-05, H-29, H-72, H-73) no son una tabla desde la Fase 04: son archivos con su manifiesto.

## 6. Reglas de implementación

- **Identificadores.** UUID v7 generados en el principal con `crypto.randomUUIDv7()`; `core` recibe el generador inyectado. Nunca enteros autoincrementales en tablas de negocio (se sincronizarían mal más adelante).
- **Append-only por disparador.** `observations`, `evaluations`, `ai_requests` y todas las `*_versions` tienen disparadores `BEFORE UPDATE` y `BEFORE DELETE` que abortan, salvo la purga de versiones vencidas de la Papelera, que corre con un `PRAGMA` de mantenimiento explícito dentro de una transacción marcada.
  - Cómo quedó en la Fase 04 (migración `0002_libro_mayor_disparadores.sql`): `observations`, `evaluations` y `operations` rechazan todo `UPDATE` y `DELETE`, sin excepción. `card_versions` rechaza todo `UPDATE`, y un `DELETE` solo pasa si existe en `purge_permits` el permiso para esa tarjeta; vaciar la papelera agrega el permiso, borra y lo saca en la misma transacción (en vez del `PRAGMA`, que no se puede limitar a una tarjeta). `evaluations` además controla al insertar que la versión 1 no enmiende nada y que la N enmiende la N-1 del mismo intento.
- **Transacciones.** Una calificación (observación + evaluación + proyección + índice) es una transacción; un cierre a la fuerza deja todo o nada (CA-017). `PRAGMA journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 5000`. Al abrir: `PRAGMA quick_check`; si falla, se ofrece «Restaurar la última copia comprobada» y el archivo dañado se conserva aparte (CA-357).
- **Idempotencia.** Toda escritura de observación lleva `idempotency_key`; un duplicado se ignora en silencio (CA-018, CA-069). Desde la Fase 04 un duplicado tampoco gasta número de secuencia, ni agrega evaluación, ni toca la agenda (se busca la clave antes y se inserta con `ON CONFLICT(idempotency_key) DO NOTHING`).
- **Migraciones.** Archivos SQL generados por drizzle-kit en `src/data/migrations/`, aplicados al arrancar con el migrador de Drizzle, dentro de una transacción, después de la copia «Antes de actualizar». Una prueba estática lee cada migración y falla ante `DROP`, `RENAME`, `ALTER … DROP` o cambios de tipo. Desde la Fase 04 otra prueba estática compara cada migración que alguna vez entró al historial de git con su primer commit: una migración aplicada no se edita, no se renombra ni se borra. Cada columna nueva es nula o tiene valor por defecto; cada tabla nueva se rellena desde el historial si hace falta.
- **Recálculo.** `verifyData()` reconstruye cada proyección en una tabla temporal con la misma función de `core` y compara con la vigente; informa «Todo en orden · 0 diferencias» o la lista de diferencias y, si pedís, reemplaza. Las funciones de `core` son deterministas: reciben el reloj, el generador de identificadores y los datos ordenados por `(occurred_at, id)` (CA-062). Cómo quedó en la Fase 04: la reconstrucción se hace en memoria (no en tablas temporales), cubre la agenda de cada tarjeta existente (también las de la Papelera) y compara campo por campo; los datos van ordenados por número de secuencia (ver 1.3). «Reparar desde el historial» reescribe, agrega o saca solo filas de `card_schedule`, en una transacción, y nunca toca eventos.
- **Exportación.** «Exportar todo» produce un comprimido con `apuntes/` en Markdown (fórmulas como `$…$`, enlaces como `[[Título]]` con el identificador en un atributo, imágenes referenciadas por archivo), `imagenes/`, `originales/`, `tarjetas.json`, `historial.jsonl` (observaciones y evaluaciones), `indice.json` (conteos y huellas) y nunca `clave.bin` (CA-127, CA-379). «Importar exportación» en un Retenia vacío reconstruye todo y «Verificar datos» da 0 diferencias (CA-128).
- **Volumen.** 10.000 tarjetas y 200.000 repasos ocupan del orden de 150 MB con el índice trigram. Índices además de los ya dichos: `card_schedule(due_at)`, `cards(subject_id, topic_id)`, `blocks(note_id, parent_block_id, position)`, `block_links(target_note_id)`, `materials(original_sha256)`, `material_pages(material_id, status)`, `trash_entries(expires_at)`, `ai_requests(at)`.
