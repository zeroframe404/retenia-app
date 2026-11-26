import { sql } from 'drizzle-orm';
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Las tablas de Retenia (docs/modelo-de-datos.md). Solo se agregan: una migración aplicada no
// se edita y nunca se borra ni se renombra nada.

// --- Contenido: la «cabeza» de la tarjeta, sus versiones y su agenda (Fase 03) ---

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    currentVersionId: text('current_version_id').notNull(),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
    // Fase 08. Sin claves foráneas: la tarjeta sobrevive a que el renglón, la nota o el tema se
    // purguen. Nulos en las tarjetas de antes; la materia se completa al crear la primera.
    subjectId: text('subject_id'),
    topicId: text('topic_id'),
    // La nota y el renglón en que nació, y el hueco (nulo en las de pregunta y respuesta).
    noteId: text('note_id'),
    blockId: text('block_id'),
    clozeId: text('cloze_id'),
    // 'qa' (pregunta y respuesta) o 'cloze' (completar).
    kind: text('kind').notNull().default('qa'),
    // 'manual' (la escribiste en Tarjetas) o 'note' (nació en un renglón).
    origin: text('origin').notNull().default('manual'),
    // Las hermanas (los huecos de un renglón, una tarjeta y su inversa) comparten este grupo.
    siblingGroupId: text('sibling_group_id'),
    inverseOfCardId: text('inverse_of_card_id'),
    pausedAt: text('paused_at'),
    // El renglón dejó de pedir esta tarjeta (borraste el renglón o le sacaste la marca).
    detachedAt: text('detached_at'),
    // Fase 15: 1 si llegó «Disponible» (importada sin historial). No entra a los repasos hasta
    // «Sumar a mis repasos» (el evento `card.activated`). Se escribe al crearla y no cambia.
    availableOnly: integer('available_only').notNull().default(0),
  },
  (table) => [
    index('cards_created_idx').on(table.createdAt, table.id),
    index('cards_subject_topic_idx').on(table.subjectId, table.topicId),
    index('cards_block_idx').on(table.blockId),
  ],
);

export const cardVersions = sqliteTable(
  'card_versions',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    createdAt: text('created_at').notNull(),
    cause: text('cause').notNull().default('edit'),
    // Fase 08: el contenido con imágenes (JSON, nulo en las de antes) y la ficha.
    questionContent: text('question_content'),
    answerContent: text('answer_content'),
    referenceAnswer: text('reference_answer').notNull().default(''),
    variants: text('variants').notNull().default('[]'),
    essentials: text('essentials').notNull().default('[]'),
    hints: text('hints').notNull().default('[]'),
    explanation: text('explanation').notNull().default(''),
    sourceText: text('source_text').notNull().default(''),
    // Fase 13: la cita de un material (JSON: material, huella del original, versión del material,
    // versión de la cadena, localizador y cita textual). Nula en las tarjetas sin material.
    sourceCite: text('source_cite'),
    // 'exact' o 'meaning'.
    formType: text('form_type').notNull().default('exact'),
    sheetState: text('sheet_state').notNull().default('reviewed'),
    // Fase 16: el tipo de actividad (nulo en la tarjeta de siempre, «me califico») y lo propio de ese
    // tipo en JSON (valor y margen, opciones, pasos o unidades de idea); el ejemplo de «Ver un
    // ejemplo» y si la actividad es de práctica o de evaluación.
    activityType: text('activity_type'),
    activity: text('activity'),
    example: text('example').notNull().default(''),
    mode: text('mode').notNull().default('practice'),
  },
  (table) => [index('card_versions_card_idx').on(table.cardId)],
);

// La agenda de cada tarjeta es una proyección: se recalcula entera desde el historial.
export const cardSchedule = sqliteTable(
  'card_schedule',
  {
    cardId: text('card_id')
      .primaryKey()
      .references(() => cards.id),
    state: integer('state').notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    dueAt: text('due_at').notNull(),
    lastReviewAt: text('last_review_at'),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    retentionTarget: real('retention_target').notNull().default(0.9),
    // La versión del motor de memoria con que se calculó (Fase 09). Las de la 1 se recalculan
    // solas con la vigente al abrir la base.
    engineVersion: integer('engine_version').notNull().default(1),
  },
  (table) => [index('card_schedule_due_idx').on(table.dueAt)],
);

// --- Libro mayor (Fase 04): eventos que solo se agregan ---

// El dispositivo que escribe esta base y el último número de secuencia que usó. Una sola fila.
export const ledgerState = sqliteTable('ledger_state', {
  id: integer('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  lastSeq: integer('last_seq').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

// Lo que pasó. Nunca se modifica ni se borra (lo impiden disparadores de la migración 0002).
export const observations = sqliteTable(
  'observations',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    occurredAt: text('occurred_at').notNull(),
    recordedAt: text('recorded_at').notNull(),
    timeZone: text('time_zone').notNull(),
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull(),
    payload: text('payload').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    source: text('source').notNull(),
    cardId: text('card_id').generatedAlwaysAs(sql`json_extract(payload, '$.cardId')`, {
      mode: 'virtual',
    }),
    // Fase 10: la sesión de estudio de la observación (nula fuera de una sesión).
    sessionId: text('session_id').generatedAlwaysAs(sql`json_extract(payload, '$.sessionId')`, {
      mode: 'virtual',
    }),
    // Fase 17: el objetivo de la observación (enlaces, «Ya lo sé», requisitos, posponer).
    objectiveId: text('objective_id').generatedAlwaysAs(
      sql`json_extract(payload, '$.objectiveId')`,
      { mode: 'virtual' },
    ),
  },
  (table) => [
    uniqueIndex('observations_idempotency_key_unique').on(table.idempotencyKey),
    uniqueIndex('observations_device_seq_unique').on(table.deviceId, table.seq),
    index('observations_kind_occurred_idx').on(table.kind, table.occurredAt),
    index('observations_card_idx').on(table.cardId, table.seq),
    index('observations_session_idx').on(table.sessionId, table.seq),
    index('observations_objective_idx').on(table.objectiveId, table.seq),
  ],
);

// Cómo se calificó un intento. Se enmienda agregando una versión que apunta a la anterior.
export const evaluations = sqliteTable(
  'evaluations',
  {
    id: text('id').primaryKey(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => observations.id),
    version: integer('version').notNull(),
    supersedesId: text('supersedes_id'),
    verdict: text('verdict').notNull(),
    source: text('source').notNull(),
    // Fase 16: lo que propuso Retenia (el veredicto nunca queda más alto), con qué regla y qué versión
    // del contenido se evaluó, el estado de cada componente (JSON), la certeza, lo que el intento le
    // dice al motor, por qué hay esta versión, el motivo de «Discrepo», si el intento quedó afectado
    // (no cuenta) y la enmienda que la escribió o que deshace.
    proposedVerdict: text('proposed_verdict'),
    rubricVersion: text('rubric_version'),
    contentVersionId: text('content_version_id'),
    components: text('components'),
    certainty: text('certainty').notNull().default('certain'),
    engineSignal: text('engine_signal'),
    cause: text('cause').notNull().default('graded'),
    appealReason: text('appeal_reason'),
    affected: integer('affected').notNull().default(0),
    amendmentId: text('amendment_id'),
    undoesAmendmentId: text('undoes_amendment_id'),
    createdAt: text('created_at').notNull(),
    timeZone: text('time_zone').notNull(),
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull(),
  },
  (table) => [
    uniqueIndex('evaluations_attempt_version_unique').on(table.attemptId, table.version),
    uniqueIndex('evaluations_device_seq_unique').on(table.deviceId, table.seq),
  ],
);

// Cada alta, edición, borrado, restauración y vaciado: el registro de «Actividad reciente» y de
// «Deshacer». Sin claves foráneas hacia versiones ni papelera: sobrevive a vaciarla.
export const operations = sqliteTable(
  'operations',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    versionBeforeId: text('version_before_id'),
    versionAfterId: text('version_after_id'),
    trashEntryId: text('trash_entry_id'),
    undoesId: text('undoes_id'),
    source: text('source').notNull(),
    occurredAt: text('occurred_at').notNull(),
    recordedAt: text('recorded_at').notNull(),
    timeZone: text('time_zone').notNull(),
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull(),
    // Lo que hace falta para deshacer (Fase 07): el tema de antes, el nombre de antes, la materia
    // activa de antes. JSON.
    detail: text('detail'),
  },
  (table) => [
    uniqueIndex('operations_device_seq_unique').on(table.deviceId, table.seq),
    index('operations_entity_idx').on(table.entityType, table.entityId, table.seq),
  ],
);

// La Papelera (operativa: marca cuándo se restauró o se vació).
export const trashEntries = sqliteTable(
  'trash_entries',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    deletedAt: text('deleted_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    restoredAt: text('restored_at'),
    purgedAt: text('purged_at'),
  },
  (table) => [
    index('trash_entries_expires_idx').on(table.expiresAt),
    index('trash_entries_entity_idx').on(table.entityType, table.entityId),
  ],
);

// El permiso para borrar las versiones de una tarjeta al vaciar la papelera. Vive dentro de una
// sola transacción: se agrega, se borran las versiones y se saca.
export const purgePermits = sqliteTable(
  'purge_permits',
  {
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entityType, table.entityId] })],
);

// --- Organización (Fase 07): materias, temas, notas, renglones, imágenes y Bandeja ---

export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // active, maintenance, paused o archived (la lista cerrada vive en core/organization).
  status: text('status').notNull().default('maintenance'),
  // La materia «Ejemplo»: lleva la etiqueta EJEMPLO y no suma progreso.
  isExample: integer('is_example', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const topics = sqliteTable(
  'topics',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id),
    name: text('name').notNull(),
    // El orden de creación dentro de la materia.
    position: integer('position').notNull(),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('topics_subject_idx').on(table.subjectId)],
);

// «Otros nombres» de un tema: los que tuvo antes (CA-044).
export const topicAliases = sqliteTable(
  'topic_aliases',
  {
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id),
    name: text('name').notNull(),
    since: text('since').notNull(),
  },
  (table) => [primaryKey({ columns: [table.topicId, table.name] })],
);

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id),
    // Sin tema es nulo; un tema que se purgó también lo deja nulo.
    topicId: text('topic_id').references(() => topics.id),
    title: text('title').notNull().default(''),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('notes_subject_topic_idx').on(table.subjectId, table.topicId)],
);

// Un renglón de una nota: la «cabeza» con su lugar. Lo que dice vive en sus versiones.
export const blocks = sqliteTable(
  'blocks',
  {
    id: text('id').primaryKey(),
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id),
    parentBlockId: text('parent_block_id'),
    position: integer('position').notNull(),
    // Plegado: es del lugar, no del contenido (no crea versión).
    collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
    currentVersionId: text('current_version_id').notNull(),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('blocks_note_parent_idx').on(table.noteId, table.parentBlockId, table.position),
  ],
);

// Las versiones de un renglón no se modifican (disparador de la migración 0004).
export const blockVersions = sqliteTable(
  'block_versions',
  {
    id: text('id').primaryKey(),
    blockId: text('block_id')
      .notNull()
      .references(() => blocks.id),
    // El JSON de lo que hay adentro del renglón: texto, enlaces e imágenes.
    content: text('content').notNull(),
    // El texto que usará el buscador (lleva el texto fuente de las fórmulas).
    textPlain: text('text_plain').notNull(),
    createdAt: text('created_at').notNull(),
    cause: text('cause').notNull().default('edit'),
  },
  (table) => [index('block_versions_block_idx').on(table.blockId)],
);

// Los renglones que enlazan a una nota (para «Mencionada en»). Sin clave foránea hacia la nota
// enlazada: purgar una nota saca los enlaces que apuntan a ella.
export const blockLinks = sqliteTable(
  'block_links',
  {
    blockId: text('block_id')
      .notNull()
      .references(() => blocks.id),
    targetNoteId: text('target_note_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.blockId, table.targetNoteId] }),
    index('block_links_target_idx').on(table.targetNoteId),
  ],
);

// Las imágenes de las notas: el archivo vive en `imagenes\<sha256>` de la carpeta de datos.
export const images = sqliteTable(
  'images',
  {
    id: text('id').primaryKey(),
    sha256: text('sha256').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('images_sha256_unique').on(table.sha256)],
);

// La Bandeja: líneas sueltas, sin materia ni tema, hasta que se las mueve a un tema.
export const inboxItems = sqliteTable('inbox_items', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
  // La nota en la que se convirtió (sin clave foránea: la nota puede purgarse).
  movedToNoteId: text('moved_to_note_id'),
  movedAt: text('moved_at'),
  deletedAt: text('deleted_at'),
  // Fase 13: de dónde salió un extracto de un material (JSON: material, unidad, localizador y cita).
  source: text('source'),
});

// --- La sesión de estudio (Fase 10) ---

// Lo escrito en «Tu respuesta…» de cada actividad de una sesión y si ya se pidió la respuesta. No
// es historia: se pisa cada 2 segundos, al perder el foco, al pausar y al cerrar.
export const sessionDrafts = sqliteTable(
  'session_drafts',
  {
    sessionId: text('session_id').notNull(),
    activityId: text('activity_id').notNull(),
    text: text('text').notNull().default(''),
    answerShown: integer('answer_shown').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.activityId] })],
);

// «Guardar una duda»: el texto y de qué tarjeta y qué sesión salió (sin claves foráneas: la
// tarjeta puede purgarse y la duda queda).
export const doubts = sqliteTable(
  'doubts',
  {
    id: text('id').primaryKey(),
    text: text('text').notNull(),
    cardId: text('card_id'),
    sessionId: text('session_id'),
    createdAt: text('created_at').notNull(),
    resolvedAt: text('resolved_at'),
    // Fase 17: la versión de la tarjeta sobre la que se guardó la duda (corregirla la apaga para el
    // diagnóstico tras un fallo). Nula en las de antes.
    cardVersionId: text('card_version_id'),
  },
  (table) => [index('doubts_created_idx').on(table.createdAt)],
);

// --- Objetivos (Fase 17) ---

// Lo que querés poder hacer: el texto («Interpretar un intervalo de confianza»), su acción
// observable y su contenido, las condiciones, el tipo (remember, understand, apply, reason o
// execute) y el concepto (el contenido sin artículo ni tildes). No se modifica (un disparador lo
// impide). El objetivo implícito «Recordar: tema» no es una fila. Los enlaces con sus actividades,
// los requisitos, «Ya lo sé» y «No quiero esto ahora» son eventos del libro mayor; el estado se
// calcula desde la evidencia.
export const objectives = sqliteTable(
  'objectives',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id').notNull(),
    topicId: text('topic_id'),
    title: text('title').notNull(),
    action: text('action').notNull(),
    content: text('content').notNull(),
    conditions: text('conditions'),
    kind: text('kind').notNull(),
    conceptKey: text('concept_key').notNull(),
    // user o demo (el del elenco).
    source: text('source').notNull().default('user'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('objectives_subject_idx').on(table.subjectId, table.topicId)],
);

// Ajustes y preferencias que viven en la base (JSON por clave): «ya viste la ayuda de teclas» y lo
// que se anotó con «Ajustar el plan».
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// El buscador (Fase 12). Todo esto se puede borrar y reconstruir desde el contenido («Reconstruir
// índice de búsqueda»): son proyecciones, no datos tuyos, salvo `search_recent` (qué abriste).

// Una fila por cosa que se puede encontrar: una nota, un renglón, una tarjeta, un tema o una duda
// (los materiales llegan con su fase). `title` y `body` son lo que indexan los dos índices (uno por
// palabras y otro por pedazos de palabra); `raw` es el texto crudo de fórmulas y código; `label`
// es lo que se muestra como título.
export const searchDocuments = sqliteTable(
  'search_documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    docId: text('doc_id').notNull(),
    kind: text('kind').notNull(),
    entityId: text('entity_id').notNull(),
    parentId: text('parent_id'),
    subjectId: text('subject_id'),
    topicId: text('topic_id'),
    label: text('label').notNull().default(''),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    raw: text('raw').notNull().default(''),
    aliases: text('aliases').notNull().default(''),
    archived: integer('archived').notNull().default(0),
    touchedAt: text('touched_at').notNull().default(''),
  },
  (table) => [
    uniqueIndex('search_documents_doc_idx').on(table.docId),
    index('search_documents_subject_idx').on(table.subjectId, table.kind),
  ],
);

// Lo que cambió desde la última vez que se actualizó el índice: lo anotan disparadores de la base
// y se vacía en la misma transacción que el cambio.
export const searchDirty = sqliteTable(
  'search_dirty',
  {
    kind: text('kind').notNull(),
    entityId: text('entity_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.entityId] })],
);

// Lo que abriste desde el buscador: sin texto, el buscador muestra esto. `seq` es el orden en que
// lo abriste (el reloj de la demostración está quieto, así que no alcanza para ordenar).
export const searchRecent = sqliteTable('search_recent', {
  docId: text('doc_id').primaryKey(),
  seq: integer('seq').notNull(),
});

// --- Los materiales (Fase 13) ---

// Un material: un archivo (o un texto pegado) que agregaste a una materia. El original vive en
// `originales\<sha256>.<ext>` de la carpeta de datos y nunca cambia; acá queda su huella, su
// nombre (un dato, no una ruta) y lo que dijo la recepción. El estado no se guarda: sale de sus
// tareas y sus unidades (src/core/materials/status.ts). `error_code` dice por qué no se pudo leer;
// un material con error puede no tener original.
export const materials = sqliteTable(
  'materials',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id').notNull(),
    title: text('title').notNull(),
    // 'pdf', 'docx', 'md' o 'text'; nulo si no se llegó a saber.
    kind: text('kind'),
    originalSha256: text('original_sha256'),
    originalName: text('original_name').notNull(),
    originalExt: text('original_ext'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    errorCode: text('error_code'),
    // Páginas de un PDF; 1 en Word, Markdown y texto. Nulo hasta validar.
    unitCount: integer('unit_count'),
    // «Agregar como nueva versión»: el material del que es versión nueva.
    previousMaterialId: text('previous_material_id'),
    versionNo: integer('version_no').notNull().default(1),
    // La versión de la cadena de procesamiento con que se armaron sus bloques.
    pipelineVersion: integer('pipeline_version').notNull().default(1),
    addedAt: text('added_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    // Fase 14: una página web guarda su dirección (nula si vino de un archivo .html) y cuándo se
    // sacó la instantánea; mientras no hay conexión queda pendiente y todavía sin original.
    sourceUrl: text('source_url'),
    snapshotAt: text('snapshot_at'),
    pendingNetwork: integer('pending_network').notNull().default(0),
  },
  (table) => [
    index('materials_sha_idx').on(table.originalSha256),
    index('materials_subject_idx').on(table.subjectId, table.addedAt),
  ],
);

// Cada unidad de un material: una página de un PDF, o el documento entero en Word, Markdown y
// texto. 'pending' hasta leerla; 'ready' leída con texto; 'no_text' leída sin texto (un escaneo);
// 'review' si no se pudo leer después de los reintentos.
export const materialUnits = sqliteTable(
  'material_units',
  {
    materialId: text('material_id').notNull(),
    unitNo: integer('unit_no').notNull(),
    status: text('status').notNull().default('pending'),
    charCount: integer('char_count').notNull().default(0),
    // Cuántos bloques con texto salieron de la unidad (en Word, Markdown y texto, «párrafos»).
    paragraphCount: integer('paragraph_count').notNull().default(0),
    width: real('width'),
    height: real('height'),
    // Fase 14: «Estudiar sin estas páginas»; de dónde salió el texto ('pdf' o 'ocr'); la confianza
    // del reconocimiento (0 a 100); y cuántas veces se pidió leerla de nuevo (entra en la clave de
    // la etapa para que «Reprocesar» no reuse lo guardado).
    excluded: integer('excluded').notNull().default(0),
    textSource: text('text_source').notNull().default('pdf'),
    ocrConfidence: real('ocr_confidence'),
    generation: integer('generation').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.materialId, table.unitNo] })],
);

// La capa de correcciones (Fase 14): lo que corregiste de un bloque, aparte del texto de base. El
// bloque se reconoce por `block_key` (la huella de su tipo y su texto de base), así la corrección
// se vuelve a aplicar cuando se reprocesa la página; si el texto de base cambió, queda 'conflict'.
// `pending_cards` son las tarjetas anclada al bloque que todavía no se actualizaron (JSON).
export const blockCorrections = sqliteTable(
  'block_corrections',
  {
    id: text('id').primaryKey(),
    materialId: text('material_id').notNull(),
    unitNo: integer('unit_no').notNull(),
    blockKey: text('block_key').notNull(),
    beforeText: text('before_text').notNull(),
    // El texto que tenía el bloque justo antes de la última vez que se guardó esta corrección
    // (el de base la primera vez): con él se mueve la cita de una tarjeta.
    previousText: text('previous_text'),
    afterText: text('after_text').notNull(),
    state: text('state').notNull().default('applied'),
    pendingCards: text('pending_cards').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('block_corrections_material_idx').on(table.materialId, table.unitNo)],
);

// Lo que decidiste de cada problema de la revisión: marcarlo como imagen o ignorarlo (Fase 14).
// `problem_key` es la huella del bloque, o 'unit' si el aviso es de la página entera.
export const problemResolutions = sqliteTable(
  'problem_resolutions',
  {
    materialId: text('material_id').notNull(),
    unitNo: integer('unit_no').notNull(),
    problemKey: text('problem_key').notNull(),
    resolution: text('resolution').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.materialId, table.unitNo, table.problemKey] })],
);

// Los bloques de un material, en orden: sección, título, párrafo, lista, tabla, fórmula, figura,
// código, encabezado o pie de página. El texto crudo, el normalizado y la lista de arreglos que
// lleva de uno al otro (se pueden deshacer); el localizador (página y cajas en un PDF; índice de
// párrafo y ruta de títulos en Word, Markdown y texto). Es una proyección de los resultados de la
// cadena: se rearma igual.
export const materialBlocks = sqliteTable(
  'material_blocks',
  {
    id: text('id').primaryKey(),
    materialId: text('material_id').notNull(),
    parentId: text('parent_id'),
    position: integer('position').notNull(),
    type: text('type').notNull(),
    level: integer('level').notNull().default(0),
    unitNo: integer('unit_no').notNull(),
    rawText: text('raw_text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    transformations: text('transformations').notNull().default('[]'),
    locator: text('locator').notNull(),
    // Fase 14: el texto de base de un bloque corregido (el que salió de la lectura, antes de tu
    // corrección). Nulo si el bloque no tiene corrección: su texto de base es `normalized_text`.
    baseText: text('base_text'),
  },
  (table) => [
    index('material_blocks_unit_idx').on(table.materialId, table.unitNo),
    index('material_blocks_position_idx').on(table.materialId, table.position),
  ],
);

// El resultado de cada etapa, por su clave: la huella de (huella del original, unidad, etapa,
// herramienta, versión de la herramienta, parámetros). Guarda la salida completa de la
// herramienta, comprimida. Solo se agrega: un disparador impide cambiarla o borrarla.
export const ingestResults = sqliteTable(
  'ingest_results',
  {
    key: text('key').primaryKey(),
    originalSha256: text('original_sha256').notNull(),
    unitNo: integer('unit_no').notNull(),
    stage: text('stage').notNull(),
    tool: text('tool').notNull(),
    toolVersion: text('tool_version').notNull(),
    params: text('params').notNull(),
    output: blob('output', { mode: 'buffer' }).notNull(),
    outputSha256: text('output_sha256').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('ingest_results_original_idx').on(table.originalSha256)],
);

// La cola: una tarea por etapa y por unidad. `runner_id` es el arranque de Retenia que la tomó y
// `heartbeat_at`, su último latido (en milisegundos del cronómetro de ese arranque). Una tarea «en
// curso» de otro arranque, o sin latido hace más de 15 s, vuelve a «pendiente».
export const ingestTasks = sqliteTable(
  'ingest_tasks',
  {
    id: text('id').primaryKey(),
    materialId: text('material_id').notNull(),
    stage: text('stage').notNull(),
    stageOrder: integer('stage_order').notNull(),
    unitNo: integer('unit_no').notNull().default(0),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    recoveries: integer('recoveries').notNull().default(0),
    runnerId: text('runner_id'),
    heartbeatAt: integer('heartbeat_at'),
    lastProblem: text('last_problem'),
    // La clave del resultado que dejó (en `ingest_results`).
    resultKey: text('result_key'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('ingest_tasks_status_idx').on(table.status, table.createdAt),
    index('ingest_tasks_material_idx').on(table.materialId, table.stageOrder, table.unitNo),
  ],
);

// --- Importar y exportar (Fase 15) ---

// Cada importación hecha con «Importar» (de Anki o de RemNote): qué archivo (por su huella), cuándo,
// a qué materia, cuánto entró y qué se rechazó con su motivo. «Importaciones» y «Ver rechazadas» de
// «Datos y copias» salen de acá.
export const imports = sqliteTable(
  'imports',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    fileSha256: text('file_sha256').notNull(),
    fileName: text('file_name').notNull(),
    subjectId: text('subject_id').notNull(),
    at: text('at').notNull(),
    summary: text('summary').notNull(),
    rejected: text('rejected').notNull().default('[]'),
    annotated: text('annotated').notNull().default('[]'),
  },
  (table) => [index('imports_file_idx').on(table.fileSha256)],
);

// La huella del origen de cada elemento importado (CA-124): una tarjeta de Anki es la nota de Anki
// (su guid, que no cambia entre exportaciones) y su número de tarjeta; un documento de RemNote, su
// ruta. Importar otra vez el mismo elemento no lo duplica. Las etiquetas de Anki quedan acá.
export const importItems = sqliteTable(
  'import_items',
  {
    sourceKey: text('source_key').primaryKey(),
    importId: text('import_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    tags: text('tags').notNull().default('[]'),
  },
  (table) => [index('import_items_entity_idx').on(table.entityType, table.entityId)],
);

// Los audios que trajo una tarjeta de Anki. El archivo vive en `adjuntos\<sha256>` de la carpeta de
// datos; la tarjeta lo nombra («Audio: nombre.mp3») y se va a poder escuchar con la Fase 30.
export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    sha256: text('sha256').notNull(),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('attachments_sha_idx').on(table.sha256)],
);

export const cardAttachments = sqliteTable(
  'card_attachments',
  {
    cardId: text('card_id').notNull(),
    attachmentId: text('attachment_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.cardId, table.attachmentId] })],
);

// --- La compuerta de IA (Fase 19) ---

// «Qué se envió»: cada envío a la IA que salió de la PC, con lo que costó (calculado en la PC con la
// tabla de precios de src/ai/precios.json). Nunca el texto del pasaje ni la respuesta. Solo se
// agrega (disparadores en 0018_ia_disparadores.sql). Alimenta el contador y el tope del mes.
export const aiRequests = sqliteTable(
  'ai_requests',
  {
    id: text('id').primaryKey(),
    at: text('at').notNull(),
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: integer('prompt_version').notNull(),
    rubricVersion: integer('rubric_version'),
    priceVersion: text('price_version').notNull(),
    // JSON: [{ materialId, title, chars, sha256 }].
    fragments: text('fragments').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    // En millonésimas de dólar.
    usdMicros: integer('usd_micros').notNull(),
    // 'ok' · 'rejected_schema' (no cumplió el formato) · 'refused' · 'failed' (error técnico).
    status: text('status').notNull(),
    queueItemId: text('queue_item_id'),
  },
  (table) => [index('ai_requests_at_idx').on(table.at)],
);

// Lo que decidiste para cada material en «¿Permitir enviar fragmentos de este material a la IA?»:
// 'always' o 'never'. «Solo esta vez» no se guarda.
export const aiMaterialPermissions = sqliteTable('ai_material_permissions', {
  materialId: text('material_id').primaryKey(),
  scope: text('scope').notNull(),
  decidedAt: text('decided_at').notNull(),
});

// Lo ya preguntado, para no volver a pagar: por huella de entrada, proveedor, modelo, versión del
// prompt y de la rúbrica. Guarda la respuesta ya validada (no es un dato de aprendizaje).
export const aiCache = sqliteTable('ai_cache', {
  key: text('key').primaryKey(),
  purpose: text('purpose').notNull(),
  model: text('model').notNull(),
  promptVersion: integer('prompt_version').notNull(),
  rubricVersion: integer('rubric_version'),
  output: text('output').notNull(),
  createdAt: text('created_at').notNull(),
});

// La cola de pedidos a la IA: sin conexión esperan acá y salen solos al volver. El pasaje vive acá
// solo hasta que el pedido termina.
export const aiQueue = sqliteTable(
  'ai_queue',
  {
    id: text('id').primaryKey(),
    createdAt: text('created_at').notNull(),
    purpose: text('purpose').notNull(),
    cacheKey: text('cache_key').notNull(),
    materialId: text('material_id').notNull(),
    materialTitle: text('material_title').notNull(),
    fragment: text('fragment').notNull(),
    // 'pending' · 'sending' · 'finished'.
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    // 'sending' · 'offline' · 'retrying'.
    waiting: text('waiting').notNull().default('sending'),
    outcome: text('outcome'),
    finishedAt: text('finished_at'),
  },
  (table) => [index('ai_queue_status_idx').on(table.status, table.createdAt)],
);

// Las trazas técnicas de cada intento (sin textos): se borran a los 90 días.
export const aiTraces = sqliteTable(
  'ai_traces',
  {
    id: text('id').primaryKey(),
    at: text('at').notNull(),
    queueItemId: text('queue_item_id').notNull(),
    event: text('event').notNull(),
    errorKind: text('error_kind'),
    httpStatus: integer('http_status'),
    latencyMs: integer('latency_ms'),
    attempt: integer('attempt').notNull(),
  },
  (table) => [index('ai_traces_at_idx').on(table.at)],
);
