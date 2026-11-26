// Catálogo de textos visibles. Todo lo que se ve en pantalla sale de acá, en castellano
// rioplatense. Lo comparten la ventana y el proceso principal. Los textos de la variante de
// prueba viven en demo-texts.ts.

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const numberFormat = new Intl.NumberFormat('es-AR');

// Por qué no entró algo de una importación (Fase 15): en palabras y en tono neutro.
const IMPORT_REASONS = {
  missingImage: 'imagen faltante',
  missingAudio: 'audio faltante',
  onlineImage: 'imagen en internet',
  unsupportedImage: 'imagen en un formato que Retenia no muestra',
  unsupportedCard: 'tipo de tarjeta que Retenia no tiene',
  emptyCard: 'tarjeta sin texto',
  tooLarge: 'texto demasiado largo',
  unreadableDocument: 'documento que no se pudo leer',
  duplicate: 'repetida en el archivo',
} as const;

// Cómo se llama una nota que no tiene título.
const UNTITLED = 'Sin título';
const decimalFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

// Las cantidades de la propuesta de Estudiar, con su singular: «1 repaso», «18 tarjetas nuevas».
const reviewsPhrase = (count: number) =>
  count === 1 ? '1 repaso' : `${numberFormat.format(count)} repasos`;
const newCardsPhrase = (count: number) =>
  count === 1 ? '1 tarjeta nueva' : `${numberFormat.format(count)} tarjetas nuevas`;
const minutesPhrase = (count: number) =>
  count === 1 ? '1 minuto' : `${numberFormat.format(count)} minutos`;

// Lo que se estudia, dicho en una frase: «60 repasos y 10 tarjetas nuevas».
function contentPhrase(reviews: number, newCards: number): string {
  return [
    ...(reviews > 0 ? [reviewsPhrase(reviews)] : []),
    ...(newCards > 0 ? [newCardsPhrase(newCards)] : []),
  ].join(' y ');
}

// Los días de repasos atrasados: con menos de 2 días, una decimal con coma («1,2 días»); desde 2,
// entero («6 días»).
function lateDays(days: number): string {
  const shown = days < 2 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${decimalFormat.format(shown)} ${shown === 1 ? 'día' : 'días'}`;
}

// La dirección de una página como se lee (sin los %C3%AD de las letras con tilde).
const readable = (address: string) => {
  try {
    return decodeURI(address);
  } catch {
    return address;
  }
};

export const texts = {
  appName: 'Retenia',
  appNameTest: 'Retenia (prueba)',
  // El riel lateral (H-08): los seis destinos, en este orden, y «Buscar» arriba.
  nav: {
    label: 'Riel lateral',
    study: 'Estudiar',
    notes: 'Apuntes',
    materials: 'Materiales',
    languages: 'Idiomas',
    progress: 'Progreso',
    settings: 'Ajustes',
    search: 'Buscar',
    searchShortcut: 'Ctrl+K',
  },
  // Lo que todavía no existe dice «Todavía no disponible» y lleva a lo que sí se puede hacer.
  screens: {
    languages: 'Todavía no disponible. Acá vas a seguir el curso de inglés, de cero a C2.',
    goToNotes: 'Ir a Apuntes',
  },
  // Apuntes: las notas con sus temas, la Bandeja y, por ahora, la lista provisoria de tarjetas, la
  // Papelera y la Actividad reciente.
  notes: {
    tabsLabel: 'Secciones de Apuntes',
    notesTab: 'Notas',
    inboxTab: 'Bandeja',
    cards: 'Tarjetas',
    trash: 'Papelera',
    activity: 'Actividad reciente',
    loading: 'Cargando tus notas…',
    loadFailed: 'No pude cargar tus notas. Probá de nuevo.',
    retry: 'Reintentar',
    actionFailed: 'No pude completar esto. Probá de nuevo.',
    topics: {
      label: 'Temas',
      all: 'Todas las notas',
      none: 'Sin tema',
      archived: 'Archivadas',
      // El nombre del tema con cuántas notas tiene: «Álgebra lineal · 2».
      withCount: (name: string, count: number) => `${name} · ${numberFormat.format(count)}`,
      newTopic: 'Nuevo tema',
      nameLabel: 'Nombre del tema',
      create: 'Crear',
      cancel: 'Cancelar',
      rename: 'Renombrar',
      renameTitle: 'Renombrar el tema',
      save: 'Guardar',
      details: 'Detalles',
      detailsTitle: (name: string) => `Detalles de «${name}»`,
      archive: 'Archivar tema',
      unarchive: 'Desarchivar tema',
      remove: 'Eliminar tema',
      otherNames: 'Otros nombres',
      noOtherNames: 'Todavía no tiene otros nombres.',
      notesCount: (count: number) =>
        count === 1 ? '1 nota' : `${numberFormat.format(count)} notas`,
      nameRequired: 'Escribí el nombre del tema',
      nameTooLong: (max: number) =>
        `El nombre es demasiado largo: el máximo es ${numberFormat.format(max)} caracteres`,
      nameTaken: 'Ya tenés un tema con ese nombre en esta materia',
      archivedTopicsLabel: 'Temas archivados',
    },
    list: {
      label: 'Notas',
      archivedLabel: 'Notas archivadas',
      newNote: 'Nueva nota',
      untitled: UNTITLED,
      inTopic: (topic: string) => `Tema: ${topic}`,
      withoutTopic: 'Sin tema',
      emptyAll: 'Todavía no hay notas en esta materia. Tocá «Nueva nota» para escribir la primera.',
      emptyNone: 'No hay notas sin tema.',
      emptyTopic: 'Este tema todavía no tiene notas.',
      emptyArchived: 'No archivaste nada.',
      moveTo: 'Mover a…',
      moveTitle: 'Mover a…',
      moveNone: 'Sin tema',
      moveNoTopics: 'Todavía no creaste temas. Podés dejarla sin tema.',
      archive: 'Archivar',
      unarchive: 'Desarchivar',
      remove: 'Eliminar',
      open: 'Abrir',
    },
    toast: {
      undo: 'Deshacer',
      undone: 'Listo: deshiciste el cambio.',
      notUndone: 'Ese cambio ya no se puede deshacer.',
      archived: 'Nota archivada.',
      unarchived: 'Nota desarchivada.',
      moved: (topic: string) => `Nota movida a «${topic}».`,
      movedToNone: 'Nota movida a «Sin tema».',
      alreadyIn: (topic: string) => `Esa nota ya está en «${topic}».`,
      alreadyInNone: 'Esa nota ya está en «Sin tema».',
      removed: 'La nota está en la Papelera.',
      topicCreated: (name: string) => `Tema «${name}» creado.`,
      topicRenamed: (name: string) => `Tema renombrado a «${name}».`,
      topicArchived: 'Tema archivado.',
      topicUnarchived: 'Tema desarchivado.',
      topicRemoved: 'El tema está en la Papelera.',
      // Un enlace a una nota que ya no existe.
      missing: 'Esa nota ya no existe.',
    },
    editor: {
      back: 'Volver a las notas',
      titleLabel: 'Título',
      contentLabel: 'Contenido de la nota',
      saveFailed: 'No pude guardar tu nota. Lo que escribiste sigue acá: probá de nuevo.',
      loadFailed: 'No pude abrir la nota. Probá de nuevo.',
      fold: 'Plegar',
      unfold: 'Desplegar',
      drag: 'Mover el renglón',
      imageAlt: 'Imagen de la nota',
      imageFailed: 'No pude guardar la imagen.',
      imageLoadFailed: 'No pude mostrar la imagen.',
      mentionList: 'Notas para enlazar',
      mentionEmpty: 'No encontré notas con ese nombre.',
      mentionOption: (title: string, topic: string | null) =>
        topic === null ? title : `${title} · ${topic}`,
      mentionedIn: 'Mencionada en',
      noMentions: 'Ninguna nota la menciona todavía.',
      mentionsLabel: 'Renglones que la mencionan',
      mentionOpen: (note: string) => `Abrir ${note}`,
      mentionsFailed: 'No pude cargar las menciones. Probá de nuevo.',
      missingNote: 'una nota que ya no existe',
      // El renglón que es tarjeta (Fase 08).
      cardTag: 'Tarjeta',
      cardTagCloze: (count: number) => (count === 1 ? 'Tarjeta' : `${count} tarjetas`),
      cardTagLabelQa: 'Este renglón es una tarjeta de pregunta y respuesta',
      cardTagLabelCloze: 'Este renglón es una tarjeta de completar',
      hole: 'Hueco de una tarjeta',
    },
  },
  // La materia que estás mirando y la activa; «Cambiar» abre la lista de materias (H-09).
  subjects: {
    activeLabel: 'Materia activa',
    viewing: (name: string) => `Estás mirando: ${name}`,
    viewingActive: (name: string) => `Estás mirando tu materia activa: ${name}`,
    active: (name: string) => `Materia activa: ${name}`,
    noActive: 'Todavía no tenés una materia activa.',
    change: 'Cambiar',
    dialogTitle: 'Tus materias',
    listLabel: 'Materias',
    newSubject: 'Nueva materia',
    nameLabel: 'Nombre',
    create: 'Crear',
    cancel: 'Cancelar',
    open: 'Abrir',
    makeActive: 'Hacer activa',
    status: {
      active: 'Activa',
      maintenance: 'En mantenimiento',
      paused: 'En pausa',
      archived: 'Archivada',
    },
    // La materia con su estado: «Geografía · En mantenimiento».
    row: (name: string, status: string) => `${name} · ${status}`,
    activated: (name: string) => `«${name}» es ahora tu materia activa.`,
    nameRequired: 'Escribí el nombre de la materia',
    nameTooLong: (max: number) =>
      `El nombre es demasiado largo: el máximo es ${numberFormat.format(max)} caracteres`,
    nameTaken: 'Ya tenés una materia con ese nombre',
    failed: 'No pude completar esto. Probá de nuevo.',
    loadFailed: 'No pude cargar tus materias. Probá de nuevo.',
    retry: 'Reintentar',
  },
  // La primera vez: una sola pregunta (CA-041).
  firstTime: {
    question: '¿Qué querés aprender ahora?',
    addMaterial: 'Agregar mi primer material',
    tryExample: 'Probar con un ejemplo (3 min)',
    nameRequired: 'Escribí qué querés aprender',
    nameTooLong: (max: number) =>
      `Es demasiado largo: el máximo es ${numberFormat.format(max)} caracteres`,
    failed: 'No pude guardar esto. Probá de nuevo.',
  },
  // Anotar al vuelo (Ctrl+Mayús+N) y la Bandeja (H-11).
  inbox: {
    title: 'Bandeja',
    listLabel: 'Elementos de la Bandeja',
    empty: 'La Bandeja está vacía. Con Ctrl+Mayús+N anotás algo al vuelo desde cualquier pantalla.',
    moveTo: 'Mover a…',
    moveTitle: 'Mover a…',
    moveNoTopics: 'Esta materia todavía no tiene temas. Creá uno en Notas y volvé.',
    remove: 'Eliminar',
    removed: 'El elemento está en la Papelera.',
    moved: (topic: string) => `Pasó a «${topic}» como nota.`,
    captureTitle: 'Anotar al vuelo',
    captureLabel: 'Anotá lo que se te ocurrió',
    captureSave: 'Guardar',
    captured: 'Anotado en la Bandeja.',
    captureRequired: 'Escribí algo para anotar',
    captureTooLong: (max: number) =>
      `Es demasiado largo: el máximo es ${numberFormat.format(max)} caracteres`,
    captureFailed: 'No pude anotarlo. Probá de nuevo.',
    loading: 'Cargando la Bandeja…',
    loadFailed: 'No pude cargar la Bandeja. Probá de nuevo.',
    // El contador junto a «Apuntes» en el riel: «Bandeja, 1 elemento».
    railLabel: (count: number) =>
      `Bandeja, ${count === 1 ? '1 elemento' : `${numberFormat.format(count)} elementos`}`,
    railBadge: 'Bandeja',
  },
  // La materia «Ejemplo» de «Probar con un ejemplo (3 min)»: contenido real y corto.
  example: {
    subject: 'Ejemplo',
    topic: 'Cómo se aprende mejor',
    note: 'Primero intentá, después mirá la respuesta',
    blocks: [
      {
        depth: 0,
        text: 'Intentar recordar antes de mirar la respuesta fortalece la memoria más que releer.',
      },
      { depth: 1, text: 'Aunque falles, el intento hace que la respuesta se grabe mejor.' },
      { depth: 0, text: 'Repasar justo antes de olvidar rinde más que repasar todo seguido.' },
      {
        depth: 1,
        text: 'Por eso Retenia espacia los repasos: cada vez más lejos si te salen bien.',
      },
      { depth: 0, text: 'Tus apuntes se escriben en renglones.' },
      { depth: 1, text: 'Tab mete un renglón adentro del anterior y Mayús+Tab lo saca.' },
    ],
  },
  // Ctrl+K o «Buscar»: el buscador (Fase 12).
  search: {
    label: 'Buscar en tus apuntes y tarjetas',
    placeholder: 'Escribí para buscar',
    resultsLabel: 'Resultados',
    recentTitle: 'Abiertos hace poco',
    recentEmpty: 'Todavía no abriste nada. Escribí para buscar.',
    noResults: (text: string) => `No encontré nada con “${text}”`,
    noResultsHint: 'Probá con otra palabra o con menos letras.',
    failed: 'No pude buscar. Probá de nuevo.',
    untitled: 'Sin título',
    archived: 'Archivada',
    groups: {
      notes: 'Apuntes',
      cards: 'Tarjetas',
      materials: 'Materiales',
      doubts: 'Dudas',
    },
    kinds: {
      note: 'Nota',
      block: 'Renglón',
      card: 'Tarjeta',
      topic: 'Tema',
      doubt: 'Duda',
      material: 'Material',
      section: 'Sección',
    },
    // Dentro de una sesión: el resultado se abre en un panel a la derecha.
    panel: {
      loading: 'Abriendo…',
      topicNotes: 'Notas de este tema',
      noNotes: 'Este tema todavía no tiene notas.',
      loadFailed: 'No pude abrir esto. Probá de nuevo.',
      question: 'Pregunta',
      answer: 'Respuesta',
    },
  },
  // Materiales (Fase 13): agregar, las etapas, el visor y la fuente anclada.
  materials: {
    listLabel: 'Materiales de la materia',
    empty: 'Todavía no hay materiales en esta materia.',
    add: 'Agregar material',
    dropHere: 'Arrastrá archivos acá',
    chooseFile: 'Elegir archivo',
    pasteText: 'Pegar texto',
    subject: 'Materia',
    moreOptions: 'Más opciones',
    titleOptional: 'Título (opcional)',
    textLabel: 'Texto',
    addText: 'Agregar',
    states: {
      received: 'Recibido',
      processing: (read: number, total: number) => `Procesando ${read} de ${total}`,
      ready: 'Listo',
      partial: 'Parcialmente procesado',
      review: 'Requiere revisión',
      error: 'Error',
      pendingNetwork: 'Pendiente: se descarga cuando haya conexión',
    },
    partialDetail: (read: number, total: number) => `Leímos ${read} de ${total} páginas`,
    version: (number: number) => `versión ${number}`,
    readOriginal: 'Leer el original',
    cancel: 'Cancelar',
    resume: 'Seguir procesando',
    chooseAnother: 'Elegir otro',
    pasteInstead: 'Pegar el texto',
    dismiss: 'Quitar de la lista',
    problems: {
      notPdf: 'No pudimos leer este PDF (protegido o dañado)',
      pdfUnreadable: 'No pudimos leer este PDF (protegido o dañado)',
      notWord: 'No pudimos leer este documento de Word (dañado o con contenido no permitido)',
      wordUnreadable:
        'No pudimos leer este documento de Word (dañado o con contenido no permitido)',
      unsupported: 'Retenia lee PDF, Word (.docx), Markdown y texto. Este archivo es de otro tipo.',
      textUnreadable:
        'Retenia lee PDF, Word (.docx), Markdown y texto. Este archivo es de otro tipo.',
      empty: 'Este archivo está vacío',
      tooLarge: 'Este archivo es demasiado grande',
      copyFailed: 'No pudimos guardar una copia de este archivo',
      webBlocked:
        'Esta página pide iniciar sesión o pagar. Retenia no se salta eso: pegá el texto o elegí un archivo.',
      webNotPage: 'Esta dirección no es una página web que Retenia pueda guardar.',
      webEmpty: 'Esta página no tiene texto que guardar.',
      webUnreachable: 'No pudimos bajar esta página: no existe o no responde.',
    },
    duplicate: (name: string, date: string) => `Parece que ya agregaste “${name}” el ${date}`,
    openExisting: 'Abrir el existente',
    addAsVersion: 'Agregar como nueva versión',
    addAnyway: 'Agregar igual',
    page: (number: number, total: number) => `Página ${number} de ${total}`,
    previousPage: 'Página anterior',
    nextPage: 'Página siguiente',
    pageImage: (number: number) => `Página ${number} del original`,
    highlighted: 'Pasaje resaltado',
    stillReading: 'Todavía estamos leyendo esta página',
    stillReadingDocument: 'Todavía estamos leyendo este documento',
    notReadCancelled:
      'No se leyó porque cancelaste el procesamiento. Tocá «Seguir procesando» para leerlo.',
    untitledText: 'Texto pegado',
    tooManyFiles: 'Podés agregar hasta 20 archivos a la vez.',
    addFailed: 'No pudimos agregar estos archivos. Probá de nuevo.',
    answerTooLong: 'La respuesta puede tener hasta 2.000 letras: acortala para guardar.',
    back: 'Volver a la lista',
    createCard: 'Crear tarjeta desde acá',
    saveExcerpt: 'Guardar extracto',
    excerptSaved: 'Extracto guardado en la Bandeja',
    question: 'Pregunta',
    answer: 'Respuesta',
    save: 'Guardar',
    citedLabel: 'Tarjetas que citan este pasaje',
    viewOriginal: 'Ver en el original',
    relocate: 'Fuente a reubicar',
    notFound: 'No encontramos esta cita en el original',
    pageReference: (title: string, page: number) => `${title} · página ${page}`,
    sectionReference: (title: string, section: string) => `${title} · ${section}`,
    // Páginas web (Fase 14).
    addWebAddress: 'Dirección web',
    webAddressLabel: 'Dirección de la página',
    webAddressInvalid: 'Pegá una dirección que empiece con http:// o https://.',
    snapshot: {
      view: 'Instantánea',
      text: 'Texto',
      frameLabel: 'Instantánea de la página guardada',
      savedOn: (address: string | null, date: string) =>
        address
          ? `Instantánea de ${readable(address)} · guardada el ${date}`
          : `Instantánea guardada el ${date}`,
    },
    // «Revisión» de un material (Fase 14).
    review: {
      open: 'Revisión',
      title: 'Revisión',
      back: 'Volver al material',
      backToReview: 'Volver a la revisión',
      ready: 'Listo',
      readySections: (count: number) => (count === 1 ? '1 sección' : `${count} secciones`),
      problems: 'Con problemas',
      notExtracted: 'No extraído',
      excluded: 'Excluidas',
      nothingHere: 'Nada por acá.',
      pageLabel: (page: number) => `Página ${page}`,
      signals: {
        possibleTable: 'Posible tabla',
        possibleFormula: 'Posible fórmula',
        anomalousChars: 'Posibles caracteres raros',
        lowCoverage: 'Posible texto faltante',
        lowConfidence: 'Reconocimiento dudoso',
      },
      actions: {
        viewOriginal: 'Ver original',
        correctText: 'Corregir texto',
        markAsImage: 'Marcar como imagen',
        ignore: 'Ignorar',
        recognize: 'Intentar reconocimiento',
        studyWithout: 'Estudiar sin estas páginas',
        reprocess: 'Reprocesar esta página',
        includeAgain: 'Volver a incluir esta página',
        undo: 'Deshacer',
      },
      resolutions: {
        corrected: 'Corregido',
        image: 'Marcado como imagen',
        ignored: 'Ignorado',
        conflict: 'En conflicto',
      },
      reasons: {
        none: 'Sin texto: parece un escaneo.',
        sparse: 'Casi sin texto para el tamaño de la página.',
        pending: 'Todavía se está leyendo.',
        error: 'No se pudo leer esta página.',
      },
      recognizing: 'Reconociendo el texto…',
      originalText: 'Texto original',
      correctedText: 'Texto corregido',
      saveCorrection: 'Guardar corrección',
      cancelCorrection: 'Cancelar',
      savedCorrection: 'Corrección guardada. El original no cambió.',
      derivedAsk: (count: number) =>
        count === 1
          ? '1 tarjeta usa este texto. ¿Actualizarla?'
          : `${count} tarjetas usan este texto. ¿Actualizarlas?`,
      derivedUpdate: (count: number) => (count === 1 ? 'Actualizarla' : 'Actualizarlas'),
      derivedLater: 'Ahora no',
      derivedUpdated: (count: number) =>
        count === 1 ? 'Actualicé 1 tarjeta.' : `Actualicé ${count} tarjetas.`,
      conflict: {
        explain: 'El texto de base de esta página cambió después de tu corrección.',
        mine: 'Tu corrección',
        current: 'Texto nuevo de la página',
        keepMine: 'Mantener mi corrección',
        useNew: 'Usar el texto nuevo',
      },
      readFirst: 'Leer la sección 1',
      readAll: 'Leer el material',
      stagesLabel: 'Etapas de este material',
    },
    // El mapa de cobertura: cada página con color y palabra, y el resumen.
    coverage: {
      open: 'Mapa de cobertura',
      close: 'Cerrar el mapa',
      label: 'Páginas del material',
      words: {
        ready: 'Lista',
        review: 'Revisar',
        pending: 'Pendiente',
        error: 'Error',
        excluded: 'Excluida',
      },
      summary: (counts: {
        total: number;
        ready: number;
        review: number;
        pending: number;
        error: number;
        excluded: number;
      }) => {
        const parts = [
          `${counts.ready} de ${counts.total} ${counts.total === 1 ? 'página lista' : 'páginas listas'}`,
        ];
        if (counts.review > 0) {
          parts.push(`${counts.review} para revisar`);
        }
        if (counts.pending > 0) {
          parts.push(counts.pending === 1 ? '1 pendiente' : `${counts.pending} pendientes`);
        }
        if (counts.error > 0) {
          parts.push(`${counts.error} con error`);
        }
        if (counts.excluded > 0) {
          parts.push(counts.excluded === 1 ? '1 excluida' : `${counts.excluded} excluidas`);
        }
        return parts.join(' · ');
      },
      sectionsLabel: 'Estado por sección',
    },
    sectionStates: {
      ready: 'Lista',
      processing: 'En proceso',
      problems: 'Con problemas',
      excluded: 'Excluida',
    },
    // La tarjeta cuya fuente se corrigió (aviso discreto en la sesión).
    sourceChanged: 'El origen cambió',
  },
  // Ajustes › «Apariencia».
  appearance: {
    title: 'Apariencia',
    legend: 'Tema de la interfaz',
    light: 'Claro',
    dark: 'Oscuro',
    system: 'Según el sistema',
    saveFailed: 'No pude guardar la apariencia. Probá de nuevo.',
  },
  // Los componentes del sistema de diseño. Ningún componente lleva texto escrito adentro: todo
  // lo que se ve sale de acá.
  ui: {
    close: 'Cerrar',
    panelClose: 'Cerrar el panel',
    modes: {
      help: 'PRÁCTICA CON AYUDA',
      autonomous: 'PRÁCTICA AUTÓNOMA',
      evaluation: 'EVALUACIÓN',
    },
    dataLabels: {
      observed: 'Observado',
      estimated: 'Estimado',
      insufficient: 'Datos insuficientes',
    },
    // «Observado · 84 datos».
    dataWithCount: (label: string, count: number) =>
      `${label} · ${count === 1 ? '1 dato' : `${numberFormat.format(count)} datos`}`,
    example: 'EJEMPLO',
    draft: {
      saving: 'Guardando…',
      draftSaved: 'Borrador guardado',
      saved: 'Guardado',
    },
    proposal: {
      title: (minutes: number) => `Sesión recomendada · ${minutes} min`,
      why: (reason: string) => `Por qué: ${reason}`,
      start: 'Empezar',
      shortVersion: 'Versión corta (10 min)',
    },
    commitment: (done: number, goal: number) => `Compromiso semanal: ${done} de ${goal} días`,
    helpBar: {
      label: 'Ayuda',
      hint: 'Pista',
      example: 'Ver un ejemplo',
      source: 'Fuente',
      tutor: 'Preguntar al tutor',
      noIdea: 'No sé por dónde empezar',
    },
    confidence: {
      question: '¿Cuánta confianza tenés?',
      guessing: 'Adivinando',
      probably: 'Creo que sí',
      sure: 'Seguro',
    },
    ideaUnits: {
      label: 'Unidades de idea',
      covered: 'Cubierta',
      partial: 'Parcial',
      missing: 'Falta',
      quoted: (phrase: string) => `Frase citada: “${phrase}”`,
    },
    verdicts: {
      correct: 'Correcto.',
      onTrack: 'Vas bien.',
      notYet: 'Todavía no.',
      unsure: 'No pude evaluarla con seguridad.',
    },
    provisional: 'Provisional',
    correctedNotice: {
      change: (before: string, after: string) => `${before} → ${after}`,
      understood: 'Entendido',
      undo: 'Deshacer',
    },
    rating: {
      question: '¿Cómo estuvo?',
      easy: 'Fácil',
      fair: 'Justo',
      hard: 'Difícil',
    },
    closing: {
      title: (minutes: number) => `Sesión terminada · ${minutes} min`,
      results: 'Tarjetas por resultado',
      count: (label: string, count: number) => `${label}: ${numberFormat.format(count)}`,
      difficulties: 'Dificultades',
      nextStep: 'Próximo paso',
      note: 'Completar la sesión no equivale a dominar el tema',
      finish: 'Terminar',
      saveDoubt: 'Guardar una duda',
      adjustPlan: 'Ajustar el plan',
    },
    mastery: {
      label: 'Estado de dominio',
      notStarted: 'Sin iniciar',
      inPractice: 'En práctica',
      toReview: 'A revisar',
      enough: 'Suficiente para avanzar',
      consolidated: 'Consolidado',
      toVerify: '(por verificar)',
      step: (position: number, total: number) => `Escalón ${position} de ${total}`,
    },
    proposalItem: {
      tag: 'Propuesta',
      accept: 'Aceptar',
      edit: 'Editar',
      discard: 'Descartar',
    },
    stages: {
      label: 'Etapas del procesamiento',
      done: 'Hecho',
      current: 'En curso',
      pending: 'Pendiente',
      saved: 'Archivo guardado',
      extracted: (done: number, total: number) => `Texto extraído (${done} de ${total} páginas)`,
      // En Word, Markdown y texto la extracción cuenta párrafos (Fase 13).
      extractedParagraphs: (count: number) =>
        `Texto extraído (${count} ${count === 1 ? 'párrafo' : 'párrafos'})`,
      sections: 'Secciones detectadas',
      ready: 'Listo',
    },
  },
  cards: {
    title: 'Tarjetas',
    listLabel: 'Tus tarjetas',
    newCard: 'Nueva tarjeta',
    formLabel: 'Nueva tarjeta',
    editTitle: 'Editar tarjeta',
    questionLabel: 'Pregunta',
    answerLabel: 'Respuesta',
    topicLabel: 'Tema',
    noTopic: 'Sin tema',
    save: 'Guardar',
    cancel: 'Cancelar',
    saved: 'Tarjeta guardada',
    edited: 'Cambios guardados',
    questionRequired: 'Escribí la pregunta',
    answerRequired: 'Escribí la respuesta',
    questionTooLong: (max: number) =>
      `La pregunta es demasiado larga: el máximo es ${numberFormat.format(max)} caracteres`,
    answerTooLong: (max: number) =>
      `La respuesta es demasiado larga: el máximo es ${numberFormat.format(max)} caracteres`,
    saveFailed: 'No pude guardar la tarjeta. Probá de nuevo.',
    loadFailed: 'No pude cargar tus tarjetas. Probá de nuevo.',
    retry: 'Reintentar',
    empty: 'Todavía no tenés tarjetas. Tocá «Nueva tarjeta» para crear la primera.',
    emptyFiltered: 'Ninguna tarjeta cumple esos filtros.',
    notReviewed: 'Todavía sin repasar',
    // Fase 15: importada sin historial; entra a los repasos con «Sumar a mis repasos».
    available: 'Disponible',
    nextReview: (longDate: string) => `Próximo repaso: ${longDate}`,
    paused: 'En pausa',
    review: 'Practicar ahora',
    history: 'Historial',
    remove: 'Eliminar',
    removed: 'La tarjeta está en la Papelera.',
    removeFailed: 'No pude eliminar la tarjeta. Probá de nuevo.',
    reviewTitle: 'Repaso',
    showAnswer: 'Mostrar respuesta',
    gradeGroup: '¿Cómo te fue?',
    gradeAgain: 'No la sabía',
    gradeHard: 'Con dudas',
    gradeGood: 'La sabía',
    reviewFailed: 'No pude guardar el repaso. Probá de nuevo.',
    backToCards: 'Volver a las tarjetas',
    // Deshacer el repaso recién hecho (Fase 09).
    undoReview: 'Deshacer',
    reviewAnnulled: (longDate: string) => `Repaso anulado. Próximo repaso: ${longDate}`,
    reviewAnnulledNew: 'Repaso anulado. La tarjeta quedó sin repasar.',
    undoFailed: 'No pude deshacer el repaso. Probá de nuevo.',
    // «¿Por qué hoy?» (Fase 09): la probabilidad, dicha sin decimales.
    whyToday: '¿Por qué hoy?',
    whyTodayNew: 'Es nueva: todavía no la repasaste.',
    whyTodayAhead:
      'La última vez que la viste figura con una fecha posterior a hoy: la fecha volvió atrás.',
    whyTodaySeen: (
      daysSince: number,
      lastResult: 'again' | 'hard' | 'good' | null,
      outOfTen: number,
    ) => {
      const when =
        daysSince === 0
          ? 'La viste hoy'
          : `La viste hace ${daysSince} ${daysSince === 1 ? 'día' : 'días'}`;
      const how =
        lastResult === null
          ? ''
          : `; la última vez ${{ good: 'te salió bien', hard: 'te costó', again: 'no te salió' }[lastResult]}`;
      return `${when}${how}; probabilidad estimada de recordarla: unos ${outOfTen} de cada 10`;
    },
    generalEstimate: 'Estimación general (sin datos tuyos)',
    whyTodayFailed: 'No pude calcularlo. Probá de nuevo.',
    // La lista (Fase 08).
    counter: (shown: number, total: number) => {
      const noun = (count: number) => (count === 1 ? 'tarjeta' : 'tarjetas');
      return shown === total
        ? `${numberFormat.format(total)} ${noun(total)}`
        : `${numberFormat.format(shown)} de ${numberFormat.format(total)} ${noun(total)}`;
    },
    filtersLabel: 'Filtros',
    filterTopic: 'Tema',
    filterState: 'Estado',
    filterKind: 'Tipo',
    allTopics: 'Todos los temas',
    allStates: 'Todos los estados',
    allKinds: 'Todos los tipos',
    kindQa: 'Pregunta y respuesta',
    kindCloze: 'Completar',
    open: (question: string) => `Abrir la tarjeta «${question}»`,
    metaSeparator: ' · ',
    sheetStates: {
      proposed: 'Propuesta',
      reviewed: 'Revisada',
      verified: 'Verificada',
      in_review: 'En revisión',
      retired: 'Retirada',
    },
    // El detalle de una tarjeta.
    detailTitle: 'Tarjeta',
    pathLabel: 'Camino de la tarjeta',
    pathSeparator: ' › ',
    noPath: 'Tarjeta suelta, sin nota',
    questionHeading: 'Pregunta',
    answerHeading: 'Respuesta',
    sheetHeading: 'Ficha',
    stateLine: (state: string) => `Estado: ${state}`,
    formLine: (form: string) => `Tipo de forma: ${form}`,
    editSheet: 'Editar ficha',
    createInverse: 'Crear inversa',
    inverseCreated: 'Creé la tarjeta inversa.',
    inverseExists: 'Esta tarjeta ya tiene su inversa.',
    inverseFailed: 'No pude crear la inversa. Probá de nuevo.',
    pause: 'Pausar esta tarjeta',
    resume: 'Reanudar',
    pausedNotice: 'La tarjeta quedó en pausa: no se puede repasar hasta que la reanudes.',
    resumedNotice: 'Reanudaste la tarjeta.',
    pauseFailed: 'No pude cambiar la pausa. Probá de nuevo.',
    viewInNote: 'Ver en la nota',
    viewInNoteFailed: 'No pude abrir la nota. Probá de nuevo.',
    detachedNotice: 'Esta tarjeta ya no está en ningún renglón de una nota.',
    siblingsNotice: 'Tiene hermanas: otras tarjetas del mismo renglón o su inversa.',
    // La ficha (CA-053).
    sheetTitle: 'Editar ficha',
    referenceAnswerLabel: 'Respuesta de referencia',
    variantsLabel: 'Variantes aceptables (una por renglón)',
    essentialsLabel: 'Componentes esenciales (hasta 4)',
    essentialLabel: (index: number) => `Componente esencial ${index}`,
    hintsLabel: 'Pistas, de la primera a la última (hasta 3)',
    hintLabel: (index: number) => `Pista ${index}`,
    explanationLabel: 'Explicación',
    sourceLabel: 'Fuente',
    formTypeLabel: 'Tipo de forma',
    formTypes: { exact: 'Exacta', meaning: 'Significado' },
    stateLabel: 'Estado de la ficha',
    editedInNote: 'El texto de esta tarjeta se edita en su nota.',
    variantsLine: (list: string) => `Variantes aceptables: ${list}`,
    hintLine: (index: number, hint: string) => `Pista ${index}: ${hint}`,
    essentialsLine: (list: string) => `Componentes esenciales: ${list}`,
    referenceLine: (text: string) => `Respuesta de referencia: ${text}`,
    explanationLine: (text: string) => `Explicación: ${text}`,
    sourceLine: (text: string) => `Fuente: ${text}`,
    // «¿Cambió lo que hay que recordar?» (CA-054).
    meaningTitle: '¿Cambió lo que hay que recordar?',
    meaningBody:
      'Esta tarjeta ya tiene repasos. Si cambió el fondo, la programamos como nueva y el historial anterior queda a la vista.',
    meaningNo: 'No, solo la redacción',
    meaningYes: 'Sí',
    meaningInNote: (question: string) => `La tarjeta «${question}» cambió en la nota.`,
    meaningReset: 'La tarjeta volvió a programarse como nueva.',
    // Borrar un renglón que es tarjeta con historial (CA-052).
    lostTitle: 'Este renglón tiene una tarjeta con historial. ¿Qué hacemos?',
    lostCard: (question: string) => `Tarjeta: ${question}`,
    lostKeep: 'Conservar la tarjeta',
    lostRemove: 'Eliminar la tarjeta',
    lostKept: 'La tarjeta quedó en Tarjetas, sin nota.',
    // «Guardar una duda» desde la pantalla de una tarjeta (CA-076).
    saveDoubt: 'Guardar una duda',
    // «Sumar a mis repasos» (Fase 11): se eligen tarjetas nuevas y, antes de confirmar, se dice
    // cuánto suman al repaso de las próximas 4 semanas.
    activate: 'Sumar a mis repasos',
    activateChosen: (count: number) =>
      count === 1 ? '1 elegida' : `${numberFormat.format(count)} elegidas`,
    activateCost: (count: number, lowMinutes: number, highMinutes: number) => {
      const added = count === 1 ? '1 tarjeta' : `${numberFormat.format(count)} tarjetas`;
      const spread = 'de repaso repartidos en las próximas 4 semanas';
      return lowMinutes === highMinutes
        ? `Agregar ${added} hoy suma cerca de ${minutesPhrase(lowMinutes)} ${spread}`
        : `Agregar ${added} hoy suma entre ${numberFormat.format(lowMinutes)} y ${minutesPhrase(highMinutes)} ${spread}`;
    },
    activateConfirm: 'Confirmar',
    activated: (count: number) =>
      count === 1
        ? 'Listo: 1 tarjeta nueva sumada a tus repasos'
        : `Listo: ${numberFormat.format(count)} tarjetas nuevas sumadas a tus repasos`,
    activateCostFailed: 'No pude calcular cuánto suman. Probá de nuevo.',
    activateFailed: 'No pude sumar las tarjetas. Probá de nuevo.',
    // Fase 16: los ejercicios se listan con su marca y no suman al contador.
    kindExercise: 'Ejercicio',
    exerciseCounter: (count: number) =>
      count === 1 ? '1 ejercicio' : `${numberFormat.format(count)} ejercicios`,
    exerciseMark: 'Ejercicio',
    newExercise: 'Nuevo ejercicio',
    newExerciseTitle: 'Nuevo ejercicio',
    exerciseSaved: 'Ejercicio guardado',
    pendingCheck: (longDate: string) => `Comprobación sin ayuda pendiente: ${longDate}`,
    pendingCheckNoDay: 'Comprobación sin ayuda pendiente',
    activityLine: (type: string) => `Tipo de actividad: ${type}`,
    modeLine: (mode: string) => `Modo: ${mode}`,
    exampleLine: (text: string) => `Ejemplo: ${text}`,
    optionLine: (text: string, correct: boolean, explanation: string) =>
      correct ? `${text} (la correcta)` : `${text}: ${explanation}`,
    stepLine: (index: number, text: string) => `Paso ${index}: ${text}`,
    unitLine: (index: number, text: string) => `Unidad de idea ${index}: ${text}`,
    numericLine: (value: string, tolerance: string, unit: string | null) =>
      `Valor: ${value}${unit === null ? '' : ` ${unit}`} · margen: ${tolerance}`,
  },
  // Fase 16 (H-31 a H-33): «Practicar ahora», los tipos de actividad, la barra de ayuda, el
  // resultado en tres líneas, «Discrepo» y el aviso de evaluación corregida.
  practice: {
    practiceNow: 'Practicar ahora',
    exerciseTitle: 'Ejercicio',
    submit: 'Enviar',
    answerPlaceholder: 'Tu respuesta…',
    answerLabel: 'Tu respuesta',
    numberLabel: 'Tu respuesta, con coma o con punto',
    inUnit: (unit: string) => `En ${unit}`,
    optionsLegend: 'Elegí una opción',
    orderLegend: 'Ordená los pasos',
    moveUp: (step: string) => `Subir «${step}»`,
    moveDown: (step: string) => `Bajar «${step}»`,
    up: 'Subir',
    down: 'Bajar',
    stepPosition: (index: number) => `${index}.`,
    evaluationNotice: 'Esta actividad es una evaluación: las ayudas aparecen después de enviar.',
    // La escalera de pistas (CA-136): el nombre de cada escalón.
    hintNames: ['Pregunta orientadora', 'Pista de concepto', 'Pista de paso'] as const,
    confirmTitle: 'Antes de la solución',
    confirmSolution:
      'La próxima pista muestra la respuesta completa. ¿Querés intentarlo una vez más?',
    tryAgain: 'Intentarlo una vez más',
    seeSolution: 'Ver la solución',
    panel: {
      hints: 'Pistas',
      example: 'Ejemplo',
      source: 'Fuente',
      solution: 'Solución',
      explanation: 'Explicación',
      noSource: 'Esta actividad no tiene fuente.',
      noExplanation: 'Esta actividad todavía no tiene explicación.',
    },
    // La respuesta abierta (CA-129): la respuesta modelo desglosada y una casilla por unidad.
    modelAnswer: 'Respuesta modelo',
    markUnits: 'Marcá las ideas que cubriste',
    unitCovered: (index: number) => `La cubrí: idea ${index}`,
    // CA-130: el resultado se puede bajar, nunca subir.
    changeResult: 'Cambiar resultado',
    // El resultado en tres líneas (CA-134).
    verdicts: {
      correct: 'Correcto.',
      partial: 'Vas bien.',
      incorrect: 'Todavía no.',
      hintConcept: 'Logrado con pista de concepto',
      hintStep: 'Logrado con pista de paso',
      example: 'Logrado con un ejemplo',
      source: 'Logrado con la fuente',
      solution: 'Resuelto con la solución a la vista',
    },
    review: {
      nothing: 'Lo que respondiste coincide con la referencia.',
      orientingUsed: 'Usaste la pregunta orientadora.',
      helpUsed: {
        hintConcept: 'Usaste la pista de concepto.',
        hintStep: 'Usaste la pista de paso.',
        example: 'Miraste un ejemplo.',
        source: 'Miraste la fuente.',
        solution: 'Viste la solución antes de enviar.',
      },
      optionsChance: 'En una pregunta de opciones, acertar no muestra que la sepas sin ayuda.',
      letters: (written: string, expected: string) =>
        `Revisá las letras marcadas: escribiste «${written}» y la respuesta es «${expected}».`,
      number: (expected: string, tolerance: string, unit: string | null) =>
        `La respuesta es ${expected}${unit === null ? '' : ` ${unit}`}, con un margen de ${tolerance}.`,
      unit: (unit: string | null) =>
        unit === null
          ? 'Esta respuesta no lleva unidad.'
          : `Revisá la unidad: la respuesta va en ${unit}.`,
      unreadable: 'No reconocí un número en tu respuesta.',
      optionExplanation: (explanation: string | null) =>
        explanation === null || explanation === '' ? 'Esa opción no era.' : explanation,
      steps: 'Revisá los pasos marcados.',
      missingUnits: (units: readonly string[]) => `Te faltó: ${units.join(' · ')}`,
    },
    actions: {
      next: 'Seguí con la próxima.',
      check: (longDate: string) => `Te la vuelvo a pedir sin ayuda el ${longDate}.`,
      checkNoDay: 'Te la vuelvo a pedir sin ayuda otro día.',
      retryLater: 'Probala otro día sin mirar la solución.',
      retry: 'Probá de nuevo con «Reintentar».',
      explanation: 'Mirá la explicación.',
    },
    buttons: {
      next: 'Siguiente',
      explanation: 'Explicación',
      retry: 'Reintentar',
      disagree: 'Discrepo',
    },
    // Fase 17 (CA-153): tras un fallo, una sola acción con su motivo.
    diagnosis: {
      previousAided: 'Probala sin ayuda: la vez anterior fue con ayuda.',
      previousOptions: 'Probala sin ayuda: la vez anterior fue con opciones.',
      doubtful: 'Mandala a revisión: marcaste esta pregunta como dudosa.',
      missingRequirement: (title: string, state: string) =>
        `Andá al requisito «${title}»: todavía está en «${state}».`,
      confusion: (question: string) =>
        `Practicá la diferencia con «${question}»: tu respuesta es la de esa tarjeta.`,
      forgotten: 'Mirá la explicación: parece un olvido.',
      goToRequirement: 'Ir al requisito',
      sendToReview: 'Mandar a revisión',
      practiceDifference: 'Practicar la diferencia',
    },
    // Fase 18: «¿Qué método usarías?» (CA-161).
    decision: {
      question: '¿Qué método usarías? No lo resuelvas',
      whyHeading: 'El porqué de cada método',
      chosen: 'El que elegiste',
      right: 'El que conviene',
    },
    // Fase 18: el procedimiento por pasos (H-37).
    procedure: {
      exampleHeading: 'Ejemplo resuelto',
      exampleIntro: 'Seguí el ejemplo paso a paso. No se califica.',
      blanksIntro: (count: number) =>
        count === 1
          ? 'Completá el último paso; los demás ya están resueltos.'
          : `Completá los ${count} últimos pasos; los demás ya están resueltos.`,
      wholeIntro: 'Resolvé el problema entero, paso por paso.',
      variantIntro: 'Una variante: el mismo método, en otra situación.',
      stepsLabel: 'Los pasos',
      step: (position: number) => `Paso ${position}`,
      result: (value: string) => `Resultado: ${value}`,
      why: '¿Por qué este paso?',
      previousWhy: (answer: string) => `La vez pasada escribiste: «${answer}»`,
      whyHelp: 'Tu respuesta queda guardada y no se califica.',
      finishExample: 'Terminar el ejemplo',
      numberAnswer: (position: number) => `Paso ${position}: tu resultado`,
      textAnswer: (position: number) => `Paso ${position}: tu respuesta`,
      errorFound: (position: number) => `Hay un error en el paso ${position}; ¿lo encontrás?`,
      retryAnswer: (position: number) => `Paso ${position}: probá de nuevo`,
      retry: (position: number) => `Reintentar el paso ${position}`,
      retryStill: (position: number) =>
        `El paso ${position} todavía no sale. Probá otra vez o mirá la corrección.`,
      retryFixed: (position: number) => `Ahora sí: el paso ${position} quedó bien.`,
      seeCorrection: 'Ver la corrección',
      correctionHeading: 'Corrección',
      yourAnswer: (answer: string) => `Tu respuesta: ${answer}`,
      yourRetry: (answer: string) => `Al reintentar escribiste: ${answer}`,
      expected: (value: string) => `El resultado: ${value}`,
      modelStep: (value: string) => `El paso modelo: ${value}`,
      states: {
        ok: 'Bien',
        fixed: 'Corregido al reintentar',
        wrong: 'Para revisar',
      },
      selfLegend: (position: number) => `Paso ${position}: ¿coincide con el paso modelo?`,
      selfYes: 'Sí, coincide',
      selfNo: 'No, me equivoqué',
      seeResult: 'Ver el resultado',
      review: {
        correct: 'Todos los pasos que completaste salieron bien.',
        partial: (position: number) => `Corregiste el paso ${position} al reintentar.`,
        incorrect: (position: number) => `Revisá el paso ${position}.`,
      },
      // Cómo viene la próxima vez (CA-158, CA-159).
      rungNames: {
        example: 'el ejemplo completo',
        blanks: (count: number) =>
          count === 1 ? 'con el último paso vacío' : `con los ${count} últimos pasos vacíos`,
        whole: 'el problema entero',
        variant: 'una variante del problema',
      },
      next: (name: string) => `La próxima vez, otro día: ${name}.`,
      lessSupport: 'Un paso menos de apoyo: te salió bien en 2 días distintos.',
      moreSupport: 'Un paso más de apoyo: se repitió el mismo error 2 veces seguidas.',
      notCounted: 'Hoy ya había contado un intento: este no cambia cómo viene la próxima.',
      another: 'Otro problema',
      finish: 'Terminar',
      loading: 'Abriendo el procedimiento…',
      loadFailed: 'No pude abrir el procedimiento. Probá de nuevo.',
      failed: 'No pude guardar. Probá de nuevo.',
      closingTitle: 'Práctica terminada',
      closingStudied: 'Viste el ejemplo completo.',
      closingSolved: (count: number) =>
        count === 1 ? 'Resolviste 1 problema.' : `Resolviste ${count} problemas.`,
    },
    // Fase 18: el conjunto mezclado (CA-162).
    set: {
      progress: (position: number, total: number) => `Problema ${position} de ${total}`,
      loading: 'Armando el conjunto…',
      failed: 'No pude abrir el conjunto. Probá de nuevo.',
      notReady: (names: readonly string[]) =>
        `Todavía no practicaste por separado: ${names.join(', ')}. Practicá esos problemas y después volvé.`,
      invalid: {
        namesType:
          'Un enunciado del conjunto nombra un tipo: así no habría que elegir. Corregilo en la ficha de ese problema.',
        subjects: 'El conjunto mezcla materias: sus problemas tienen que ser de una sola.',
        empty: 'Al conjunto le faltan problemas: necesita al menos 2 tipos.',
      },
      closingTitle: 'Conjunto terminado',
      orderHeading: 'Los tipos, en el orden en que salieron',
      orderItem: (typeName: string, result: string) => `${typeName} · ${result}`,
      unanswered: 'Sin contestar',
    },
    // Fase 18: el micro-ejercicio (CA-166).
    micro: {
      heading: 'Micro-ejercicio',
      proposal: (step: string, count: number) =>
        `Se repitió el mismo error en el paso «${step}». Te propongo ${count} ítems cortos sobre ese paso.`,
      proposalProblem: (title: string, count: number) =>
        `Se repitió el mismo error en «${title}». Te propongo ${count} ítems cortos sobre eso.`,
      start: 'Hacer el micro-ejercicio',
      about: (step: string) => `Sobre el paso «${step}»`,
      item: (position: number, total: number) => `Ítem ${position} de ${total}`,
      givens: 'Ya resuelto',
      numberAnswer: 'Tu resultado',
      textAnswer: 'Tu respuesta',
      check: 'Enviar',
      right: 'Correcto.',
      wrong: 'Todavía no.',
      expected: (value: string) => `El resultado: ${value}`,
      selfLegend: '¿Tu respuesta coincide con el paso modelo?',
      selfYes: 'Sí, coincide',
      selfNo: 'No, me equivoqué',
      next: 'Siguiente',
      seeResult: 'Ver el resultado',
      score: (correct: number, total: number) => `Acertaste ${correct} de ${total}.`,
      good: 'Esta sesión cuenta: 85 % o más, sin pistas.',
      notGood: 'Esta sesión no cuenta: hace falta el 85 % o más.',
      progress: (done: number) =>
        `Llevás ${done} de 2 sesiones buenas. Se supera con 2, en días distintos.`,
      passed: 'Superado: 2 sesiones buenas en días distintos.',
      done: 'Terminar',
      failed: 'No pude guardar tu respuesta. Probá de nuevo.',
      loadFailed: 'No pude abrir el micro-ejercicio. Probá de nuevo.',
      loading: 'Armando el micro-ejercicio…',
    },
    // La diferencia letra por letra (CA-131), dicha también en palabras para el lector de pantalla.
    diffLabel: 'Diferencia letra por letra',
    yourAnswer: 'Tu respuesta',
    expected: 'La respuesta',
    letterChanged: (written: string, expected: string) => `«${written}» en lugar de «${expected}»`,
    letterExtra: (written: string) => `«${written}» de más`,
    letterMissing: (expected: string) => `falta «${expected}»`,
    stepOk: (step: string) => `${step} · en su lugar`,
    stepWrong: (step: string) => `${step} · revisalo`,
    correctOrder: 'El orden de la referencia',
    correctOption: (text: string) => `La correcta: ${text}`,
    // «Discrepo» (CA-139): los cuatro motivos.
    reasons: {
      answer_correct: 'Mi respuesta era correcta',
      ambiguous: 'La pregunta era ambigua',
      reference_incomplete: 'La referencia está incompleta',
      reference_incorrect: 'La referencia es incorrecta',
    },
    // El aviso de evaluación corregida (CA-141): «Todavía no → Correcto».
    noticeVerdicts: {
      correct: 'Correcto',
      partial: 'Vas bien',
      incorrect: 'Todavía no',
      notCounted: 'No cuenta',
    },
    effectChanged: (before: string, after: string) => `Próximo repaso: ${before} → ${after}`,
    effectUnchanged: (longDate: string) => `Próximo repaso: sin cambios, sigue el ${longDate}`,
    effectNoReview: 'Próximo repaso: todavía no tiene fecha',
    effectFirst: (longDate: string) => `Próximo repaso: ${longDate}`,
    effectNotCounted: 'Este intento ya no cuenta para tu próximo repaso.',
    effectInReview: 'La tarjeta quedó «En revisión»: no entra en tus repasos hasta que la revises.',
    amendmentUndone: 'Corrección deshecha.',
    editAfterAppeal: 'Corregí la referencia en la ficha.',
    failed: 'No pude guardar tu respuesta. Probá de nuevo.',
    helpFailed: 'No pude abrir la ayuda. Probá de nuevo.',
    loadFailed: 'No pude abrir la actividad. Probá de nuevo.',
    backToCards: 'Volver a las tarjetas',
    // El editor de la ficha (tarea 2).
    editor: {
      typeLabel: 'Tipo de actividad',
      types: {
        card: 'Tarjeta (me califico)',
        short: 'Respuesta corta',
        numeric: 'Numérica',
        options: 'Opciones',
        order: 'Ordenar pasos',
        open: 'Respuesta abierta',
        // Fase 18.
        procedure: 'Procedimiento por pasos',
        decision: 'Elegir el método',
        interleaved: 'Conjunto mezclado',
      },
      // Las familias de variantes (Fase 18).
      withVariants: 'Con variantes (números que cambian)',
      familyLegend: 'La familia de variantes',
      statements: 'Enunciados, uno por renglón (con {dato} donde va cada número)',
      statementsHelp:
        'El primero es el de siempre. Los demás se usan en el último escalón de apoyo.',
      parameters: 'Datos que cambian, uno por renglón: nombre = 10; 20; 30',
      derived: 'Datos que se calculan (opcional): s = ee * raiz(n)',
      formula: 'Fórmula de la respuesta',
      // El procedimiento.
      procedureLegend: 'Los pasos, en orden (de 2 a 8)',
      procedurePrompt: (index: number) => `Paso ${index}: qué hay que hacer`,
      resultType: (index: number) => `Paso ${index}: el resultado es`,
      numberResult: 'Un número',
      textResult: 'Un texto',
      expectedNumber: (index: number) => `Paso ${index}: resultado esperado`,
      expectedHelp:
        'En un número podés escribir una cuenta con los datos y los pasos de antes: s / raiz(n), paso1 * 1,96.',
      stepTolerance: (index: number) => `Paso ${index}: margen`,
      stepUnit: (index: number) => `Paso ${index}: unidad (opcional)`,
      stepExplanation: (index: number) => `Paso ${index}: explicación`,
      keyStep: (index: number) => `El paso ${index} es un paso clave`,
      removeProcedureStep: (index: number) => `Quitar el paso ${index}`,
      // La decisión.
      methodsLegend: 'Los métodos (de 2 a 5; se muestran mezclados)',
      method: (index: number) => `Método ${index}`,
      methodCorrect: (index: number) => `El método ${index} es el que conviene`,
      methodWhy: (index: number) => `El porqué del método ${index}`,
      removeMethod: (index: number) => `Quitar el método ${index}`,
      addMethod: 'Agregar método',
      // El conjunto mezclado.
      typesLegend: 'Los tipos de problema que se confunden (de 2 a 5)',
      typesHelp: 'Ningún enunciado puede nombrar un tipo: así hay que elegir el método.',
      typeName: (index: number) => `Nombre del tipo ${index}`,
      typeProblems: (index: number) => `Problemas del tipo ${index}`,
      removeType: (index: number) => `Quitar el tipo ${index}`,
      addType: 'Agregar tipo',
      noExercises: 'Esta materia todavía no tiene ejercicios para armar un conjunto.',
      shortHelp:
        'Se compara sin mayúsculas, tildes ni espacios. Las variantes aceptables también valen.',
      value: 'Valor',
      tolerance: 'Margen',
      unit: 'Unidad (opcional)',
      option: (index: number) => `Opción ${index}`,
      optionCorrect: (index: number) => `La opción ${index} es la correcta`,
      optionExplanation: (index: number) => `Por qué la opción ${index} no es`,
      optionsLegend: 'Las 3 opciones (se muestran mezcladas)',
      stepsLegend: 'Los pasos, en el orden correcto (de 3 a 8)',
      step: (index: number) => `Paso ${index}`,
      removeStep: (index: number) => `Quitar el paso ${index}`,
      addStep: 'Agregar paso',
      unitsLegend: 'Las unidades de idea de la respuesta modelo (de 2 a 4)',
      unitIdea: (index: number) => `Unidad de idea ${index}`,
      removeUnit: (index: number) => `Quitar la unidad de idea ${index}`,
      addUnit: 'Agregar unidad de idea',
      hintsHelp:
        'Pista 1: pregunta orientadora · Pista 2: pista de concepto · Pista 3: pista de paso',
      example: 'Ejemplo (para «Ver un ejemplo»)',
      mode: 'Modo',
      modes: { practice: 'Práctica', evaluation: 'Evaluación' },
      problems: {
        value: 'Escribí el valor como número.',
        tolerance: 'El margen tiene que ser un número de cero o más.',
        unit: 'La unidad puede tener hasta 20 caracteres.',
        optionsCorrect: 'Marcá una sola opción como la correcta.',
        optionsBlank: 'Completá las tres opciones.',
        optionsExplanation: 'Cada opción equivocada lleva su explicación.',
        stepsCount: 'Ordenar pasos lleva de 3 a 8 pasos.',
        stepsBlank: 'Completá cada paso o quitalo.',
        unitsCount: 'La respuesta abierta lleva de 2 a 4 unidades de idea.',
        unitsBlank: 'Completá cada unidad de idea o quitala.',
        optionsRepeated: 'Hay dos opciones iguales.',
        stepsRepeated: 'Hay dos pasos iguales.',
        // Fase 18.
        optionsCount: 'Revisá cuántas opciones hay.',
        family:
          'Revisá la familia de variantes: cada nombre de los enunciados y las cuentas tiene que estar en los datos, con más de una combinación.',
        formula: 'Hay una cuenta que no se puede calcular. Revisá los nombres y los signos.',
        stepCount: 'Un procedimiento lleva de 2 a 8 pasos.',
        emptyStep: 'Cada paso lleva qué hacer, el resultado esperado y la explicación.',
        keyStep: 'Marcá al menos un paso clave.',
        repeatedId: 'Hay dos pasos iguales.',
        methodsBlank: 'Completá cada método y su porqué.',
        typesCount: 'Un conjunto lleva de 2 a 5 tipos.',
        typesBlank: 'Poné el nombre de cada tipo.',
        typesRepeated: 'Hay dos tipos con el mismo nombre.',
        typesEmpty: 'Cada tipo lleva al menos un problema, y cada problema va en un solo tipo.',
        namesType: 'Un enunciado nombra uno de los tipos. Corregilo en la ficha de ese problema.',
        subjects: 'Los problemas tienen que ser de la misma materia que el conjunto.',
        parameters: 'Escribí cada dato como «nombre = 10; 20; 30».',
        derived: 'Escribí cada cuenta como «nombre = cuenta».',
      },
    },
  },
  // La sesión de estudio (Fase 10, H-16 a H-18).
  study: {
    start: 'Empezar',
    resume: (done: number, total: number) =>
      `Continuar: sesión de hoy (${numberFormat.format(done)} de ${numberFormat.format(total)})`,
    nothingDue: (subject: string) => `Hoy no tenés repasos vencidos en ${subject}.`,
    startFailed: 'No pude armar la sesión. Probá de nuevo.',
    resumeFailed: 'No pude continuar esa sesión (puede ser de otro día). Empezá una nueva.',
    title: 'Sesión de estudio',
    progress: (done: number, total: number) =>
      `${numberFormat.format(done)}/${numberFormat.format(total)}`,
    progressLabel: (done: number, total: number) =>
      `Llevás ${numberFormat.format(done)} de ${numberFormat.format(total)}`,
    pause: 'Pausar',
    more: 'Más',
    flag: 'La tarjeta está mal',
    edit: 'Editar',
    skip: 'Saltar',
    questionLabel: 'Pregunta',
    answerPlaceholder: 'Tu respuesta…',
    answerLabel: 'Tu respuesta (opcional)',
    yourAnswer: 'Tu respuesta',
    referenceAnswer: 'Respuesta de referencia',
    previous: (grade: string) => `Calificaste la anterior: ${grade}`,
    undo: 'Deshacer',
    shortcuts:
      'Teclas: Espacio muestra la respuesta · 1, 2 y 3 califican · Ctrl+Z deshace · Esc pausa',
    shortcutsOk: 'Entendido',
    flagged: 'La tarjeta pasó a «En revisión». No cuenta como olvido.',
    actionFailed: 'No pude guardar. Probá de nuevo.',
    editTitle: 'Editar la tarjeta',
    loadFailed: 'No pude abrir la sesión. Probá de nuevo.',
    loading: 'Cargando la sesión…',
    retry: 'Reintentar',
    closing: {
      flagged: 'En revisión',
      difficultyOne: (topic: string, question: string) => `${topic}: ${question}`,
      difficultyMany: (topic: string, count: number) =>
        `${topic}: ${numberFormat.format(count)} tarjetas que no sabías`,
      nextMore: (count: number) =>
        count === 1
          ? 'Queda 1 repaso para hoy: podés hacer otra sesión cuando quieras.'
          : `Quedan ${numberFormat.format(count)} repasos para hoy: podés hacer otra sesión cuando quieras.`,
      nextTomorrow: (count: number) =>
        count === 0
          ? 'Por hoy no quedan repasos.'
          : `Por hoy no quedan repasos. Mañana vencen ${numberFormat.format(count)}.`,
      loadFailed: 'No pude leer el cierre de la sesión. Probá de nuevo.',
    },
    doubt: {
      title: 'Guardar una duda',
      label: 'Tu duda',
      card: 'Sobre qué tarjeta',
      noCard: 'Sobre la sesión en general',
      save: 'Guardar',
      cancel: 'Cancelar',
      empty: 'Escribí tu duda para guardarla.',
      saved: 'Guardé tu duda. La ves en Progreso › «Dudas y revisiones».',
      failed: 'No pude guardar la duda. Probá de nuevo.',
    },
    adjust: {
      title: 'Ajustar el plan',
      topic: (name: string) => `El tema de esta sesión: ${name}.`,
      shorter: 'Más corto la próxima vez',
      morePractice: 'Más práctica de este tema',
      pauseTopic: 'Pausar este tema',
      cancel: 'Cancelar',
      saved: 'Anotado. Todavía no cambia la propuesta de Estudiar.',
      failed: 'No pude anotarlo. Probá de nuevo.',
    },
    // La propuesta de hoy (Fase 11, H-19 a H-21): lo que entra en los minutos que tenés y por qué.
    proposal: {
      title: (minutes: number) => `Sesión recomendada · ${numberFormat.format(minutes)} min`,
      // «60 repasos y 10 tarjetas nuevas · unos 25 min». Con 5 minutos y repasos que quedan para
      // mañana, los que entran son «los más urgentes».
      headline: (reviews: number, newCards: number, minutes: number, urgentOnly: boolean) => {
        const about = `unos ${numberFormat.format(minutes)} min`;
        if (reviews > 0 && newCards === 0) {
          const kind = urgentOnly
            ? `${reviews === 1 ? 'el más urgente' : 'los más urgentes'}`
            : 'sin tarjetas nuevas';
          return `${reviewsPhrase(reviews)}, ${kind} · ${about}`;
        }
        return `${contentPhrase(reviews, newCards)} · ${about}`;
      },
      initialEstimate: 'estimación inicial',
      // Lo observado (los repasos que vencen hoy) aparte de lo estimado (el tiempo).
      why: (due: number, initialEstimate: boolean) => {
        if (due === 0) {
          return 'Por qué: hoy no vence ningún repaso; sigue lo nuevo (tiempo estimado).';
        }
        const observed =
          due === 1
            ? 'hoy vence 1 repaso (dato)'
            : `hoy vencen ${numberFormat.format(due)} repasos (dato)`;
        return initialEstimate
          ? `Por qué: ${observed} y el tiempo es una estimación inicial.`
          : `Por qué: ${observed} y el tiempo es una estimación.`;
      },
      // Fase 17 (H-35): el requisito sin cumplir, con su motivo.
      requirementBefore: (title: string) => `Antes conviene: ${title}`,
      requirementMaybe: (title: string) => `Quizá te ayude repasar: ${title}`,
      requirementWhy: (objective: string, requirement: string, state: string) =>
        `Por qué: «${objective}» necesita «${requirement}», que todavía está en «${state}».`,
      requirementWhyMaybe: (objective: string, requirement: string) =>
        `Por qué: «${objective}» tiene a «${requirement}» como requisito, sin frenarlo.`,
      requirementPractice: 'Practicar ahora',
      requirementNotNeeded: 'Esto no es necesario para aquello',
      requirementLabel: 'Requisito',
      // La comprobación de un «Ya lo sé» que ya se puede hacer (CA-150).
      checkLabel: 'Comprobación pendiente',
      checkLine: (title: string) => `Comprobación pendiente: ${title}`,
      checkWhy: 'Por qué: marcaste «Ya lo sé»; un acierto sin ayuda lo confirma.',
      checkDo: 'Hacer la comprobación',
      // El freno a las tarjetas nuevas cuando hay repasos atrasados: dice cuánto y cuándo vuelven.
      brake: (band: 'half' | 'few' | 'none', days: number, newCards: number) => {
        const late = `tenés cerca de ${lateDays(days)} de repasos atrasados`;
        if (band === 'none') {
          return `Hoy no agrego tarjetas nuevas: ${late}. Vuelven de a poco cuando baje de 5 días.`;
        }
        if (band === 'few') {
          return newCards > 0
            ? `Hoy agrego pocas tarjetas nuevas: ${late}. Vuelven más cuando baje de 2 días.`
            : `Hoy no agrego tarjetas nuevas: ${late}. Vuelven de a poco cuando baje de 2 días.`;
        }
        return newCards > 0
          ? `Hoy agrego la mitad de las tarjetas nuevas: ${late}. Vuelven completas cuando baje de medio día.`
          : `Hoy no agrego tarjetas nuevas: ${late}. Vuelven completas cuando baje de medio día.`;
      },
      postponedNote: (count: number) =>
        count === 1
          ? 'Hay 1 repaso pospuesto para otro día.'
          : `Hay ${numberFormat.format(count)} repasos pospuestos para otro día.`,
      shortVersion: 'Versión corta (10 min)',
      // «Tengo: 5 10 25 45 min»: los minutos que elegís valen solo esta vez.
      have: 'Tengo:',
      haveUnit: 'min',
      postpone: 'Posponer',
      otherActivity: 'Elegir otra actividad',
      otherActivities: 'Otras actividades',
      close: 'Cerrar',
      reviewsOnly: (reviews: number, minutes: number) =>
        `Solo repasos · ${reviewsPhrase(reviews)} · unos ${numberFormat.format(minutes)} min`,
      newOnly: (newCards: number, minutes: number) =>
        `Solo tarjetas nuevas · ${newCards === 1 ? '1 tarjeta' : `${numberFormat.format(newCards)} tarjetas`} · unos ${numberFormat.format(minutes)} min`,
      topic: (name: string, reviews: number, newCards: number, minutes: number) =>
        `${name} · ${contentPhrase(reviews, newCards)} · unos ${numberFormat.format(minutes)} min`,
      // «Posponer».
      postponeTitle: '¿Para cuándo los posponés?',
      postponeLater: 'Más tarde hoy',
      postponeTomorrow: 'Mañana',
      postponePickDay: 'Elegir día',
      postponeDayLabel: 'Día',
      postponeConfirm: 'Confirmar',
      postponedLater: 'Listo: vuelve más tarde hoy',
      postponedTomorrow: 'Listo: vuelve mañana',
      postponedDay: (date: string) => `Listo: vuelve el ${date}`,
      // Las que ya se pospusieron 3 veces entran igual.
      postponedForced: (count: number) =>
        count === 1
          ? '1 tarjeta entra igual porque ya la pospusiste 3 veces.'
          : `${numberFormat.format(count)} tarjetas entran igual porque ya las pospusiste 3 veces.`,
      postponeFailed: 'No pude posponer los repasos. Probá de nuevo.',
    },
  },
  // Progreso (Fase 10: por ahora, solo «Dudas y revisiones»).
  progress: {
    sectionsLabel: 'Secciones de Progreso',
    reviews: 'Dudas y revisiones',
    // Fase 17: los objetivos, «Mis errores» y «Mejorar la tarjeta».
    objectives: 'Objetivos',
    mistakes: 'Mis errores',
    improve: 'Mejorar la tarjeta',
    newObjective: 'Nuevo objetivo',
    objectivesOf: (subject: string) => `Objetivos de ${subject}`,
    topicObjectives: (topic: string) => `Objetivos de ${topic}`,
    noTopic: 'Sin tema',
    implicitTitle: (topic: string) => `Recordar: ${topic}`,
    noObjectives:
      'Todavía no hay actividades en esta materia. Cuando sumes tarjetas o ejercicios, aparecen acá con su objetivo.',
    noSubject: 'Todavía no tenés materias.',
    kinds: {
      remember: 'Recordar',
      understand: 'Comprender',
      apply: 'Aplicar',
      reason: 'Razonar',
      execute: 'Ejecutar',
    },
    postponedTag: 'Pospuesto',
    activityCount: (count: number) => (count === 1 ? '1 actividad' : `${count} actividades`),
    loadingObjectives: 'Cargando tus objetivos…',
    objectivesFailed: 'No pude leer tus objetivos. Probá de nuevo.',
    form: {
      title: 'Nuevo objetivo',
      topic: 'Tema',
      text: 'Texto',
      textHelp: 'Lo que vas a poder hacer, empezando por la acción: «Interpretar…», «Calcular…».',
      notObservable:
        'Empezá con lo que vas a poder hacer: «Calcular…», «Explicar…», «Reconocer…». Así se puede comprobar.',
      conditions: 'Condiciones (opcional)',
      conditionsHelp: 'Por ejemplo: «sin mirar apuntes» o «con la tabla a mano».',
      kind: 'Tipo',
      activities: 'Actividades',
      activitiesHelp:
        'Las que marques pasan a este objetivo. Lo que ya practicaste sigue contando para el objetivo que tenían.',
      noActivities: 'Este tema todavía no tiene actividades.',
      exercise: 'Ejercicio',
      currently: (title: string) => `Ahora en: ${title}`,
      create: 'Crear objetivo',
      cancel: 'Cancelar',
      textRequired: 'Escribí qué vas a poder hacer.',
      failed: 'No pude crear el objetivo. Probá de nuevo.',
      created: (title: string) => `Objetivo creado: ${title}`,
    },
    panel: {
      label: 'Panel del objetivo',
      kindLine: (kind: string) => `Tipo: ${kind}`,
      conditionsLine: (conditions: string) => `Condiciones: ${conditions}`,
      columnsLabel: 'Evidencias',
      unaided: 'Sin ayuda',
      aided: 'Con ayuda',
      delayed: 'Diferido',
      variants: 'Variantes',
      lastOn: (date: string) => `Última: ${date}`,
      never: 'Ninguna todavía',
      start: 'Qué falta: un intento en cualquiera de sus actividades.',
      toEnough: (remaining: number) =>
        remaining === 1
          ? 'Qué falta para «Suficiente para avanzar»: un acierto sin ayuda más, otro día.'
          : `Qué falta para «Suficiente para avanzar»: ${remaining} aciertos sin ayuda en días distintos.`,
      recover: 'Qué falta para volver a «Suficiente para avanzar»: un acierto sin ayuda otro día.',
      check: (date: string) => `Qué falta: la comprobación sin ayuda, desde el ${date}.`,
      toConsolidated: (remaining: number, from: string | null, needsVariant = false) => {
        // En «Aplicar», además una variante nueva (CA-165).
        if (needsVariant && remaining === 0 && from === null) {
          return 'Qué falta para «Consolidado»: un acierto sin ayuda en una variante nueva.';
        }
        const days =
          remaining <= 1
            ? 'un acierto sin ayuda más'
            : `${remaining} aciertos sin ayuda más, en días distintos`;
        const variant = needsVariant ? ' y uno en una variante nueva' : '';
        if (from === null) {
          return `Qué falta para «Consolidado»: ${days}${variant}.`;
        }
        return remaining <= 1
          ? `Qué falta para «Consolidado»: ${days}, desde el ${from}${variant}.`
          : `Qué falta para «Consolidado»: ${days}, uno desde el ${from}${variant}.`;
      },
      kept: 'Consolidado: los repasos lo mantienen.',
      estimate: (concept: string, outOfTen: number, observations: number) =>
        observations === 1
          ? `Lo que estima Retenia de «${concept}»: unos ${outOfTen} de cada 10, con 1 observación.`
          : `Lo que estima Retenia de «${concept}»: unos ${outOfTen} de cada 10, con ${observations} observaciones.`,
      estimateNone: (concept: string) =>
        `Lo que estima Retenia de «${concept}»: todavía sin observaciones.`,
      estimateNote: 'El estado lo deciden las reglas, no esta estimación.',
      activitiesHeading: 'Actividades',
      noActivities: 'Todavía no tiene actividades.',
      practice: 'Practicar ahora',
      practiceOne: (question: string) => `Practicar ahora: ${question}`,
      link: 'Enlazar actividades',
      previous: (count: number) =>
        count === 1
          ? '1 intento de estas actividades es de cuando eran de otro objetivo: se ve, pero cuenta para aquel.'
          : `${count} intentos de estas actividades son de cuando eran de otro objetivo: se ven, pero cuentan para aquel.`,
      needsHeading: 'Necesita antes',
      neededByHeading: 'Es requisito de',
      noNeeds: 'No necesita nada antes.',
      noNeededBy: 'No es requisito de ningún objetivo.',
      missedSomething: 'Me faltó algo antes',
      markAsRequirement: 'Marcar como requisito de…',
      indispensable: 'Indispensable',
      recommended: 'Recomendable',
      confirmed: 'Confirmado',
      suggested: 'Sugerido',
      requiredState: (state: string) => `Está en «${state}»`,
      confirm: 'Confirmar',
      notNeeded: 'Esto no es necesario para aquello',
      knowAlready: 'Ya lo sé',
      postpone: 'No quiero esto ahora',
      resume: 'Retomar',
      pendingCheck: (date: string) => `Comprobación pendiente desde el ${date}.`,
      doCheck: 'Hacer la comprobación',
      close: 'Cerrar',
      failed: 'No pude hacer eso. Probá de nuevo.',
      loadFailed: 'No pude leer este objetivo. Probá de nuevo.',
      knowAlreadyDone:
        'Anotado como «Suficiente para avanzar (por verificar)». Desde mañana te pido una comprobación corta sin ayuda.',
      postponedDone: 'Pospuesto: no se proponen sus tarjetas nuevas. No se borró nada.',
      resumedDone: 'Retomado.',
      dismissedDone: 'Listo: ese requisito ya no frena.',
      addedDone: 'Requisito guardado.',
      linkedDone: (count: number) =>
        count === 1 ? '1 actividad enlazada.' : `${count} actividades enlazadas.`,
      linkTitle: 'Enlazar actividades',
      save: 'Guardar',
      cancel: 'Cancelar',
      requirementObjective: 'Objetivo',
      requirementKind: 'Tipo de requisito',
      requirementConfirm: 'Lo confirmo',
      requirementConfirmHelp: 'Sin tildar, queda como sugerido: avisa, pero no frena.',
      noCandidates: 'No hay otro objetivo tuyo en esta materia para elegir.',
    },
    mistakesSection: {
      empty: 'Todavía no hay errores anotados. Acá van tus respuestas escritas que no salieron.',
      groupLabel: (topic: string) => `Errores de ${topic}`,
      yourAnswer: (written: string) => `Tu respuesta: ${written}`,
      correct: (correct: string) => `La correcta: ${correct}`,
      type: 'Tipo de error',
      types: {
        distraction: 'Distracción',
        forgotten: 'No lo recordaba',
        confusion: 'Confusión entre conceptos',
        calculation: 'Cálculo',
        missingIdea: 'Faltó una idea',
        stepOrder: 'Orden de los pasos',
        other: 'Otro',
      },
      on: (date: string) => `El ${date}`,
      // Fase 18: en un procedimiento, qué paso fue.
      step: (position: number, value: string) => `Paso ${position}: ${value}`,
      practice: 'Practicar ahora',
      typeSaved: 'Tipo de error guardado.',
      loading: 'Cargando tus errores…',
      loadFailed: 'No pude leer tus errores. Probá de nuevo.',
    },
    improveSection: {
      intro:
        'Estas tarjetas salieron de los repasos porque fallaron varias veces. Cuando la mejorás, vuelve a los repasos.',
      empty: 'Ninguna tarjeta necesita mejoras.',
      total: (failures: number) => `${failures} fallos`,
      thirtyDays: (failures: number) => `${failures} fallos en 30 días`,
      rephrase: 'Reformular',
      split: 'Dividir en dos',
      addHint: 'Agregar una pista',
      viewOriginal: 'Ver en el original',
      noSource: 'Esta tarjeta no tiene fuente.',
      splitTitle: 'Dividir en dos',
      splitHelp:
        'Dos tarjetas más chicas en el mismo tema y objetivo. La original se retira con su historial.',
      part: (index: number) => `Tarjeta ${index}`,
      question: 'Pregunta',
      answer: 'Respuesta',
      splitSave: 'Crear las dos',
      splitDone: 'Listo: dos tarjetas nuevas; la original quedó retirada con su historial.',
      loading: 'Cargando las tarjetas para mejorar…',
      loadFailed: 'No pude leer las tarjetas para mejorar. Probá de nuevo.',
      failed: 'No pude hacer eso. Probá de nuevo.',
    },
    // Fase 18: «Crear tarjeta de contraste» desde un error de confusión (CA-163).
    contrast: {
      create: 'Crear tarjeta de contraste',
      question: (first: string, second: string) => `¿En qué se diferencian ${first} y ${second}?`,
      fillAnswer: 'Completá la diferencia en la ficha, con tus palabras.',
      created: (question: string) => `Tarjeta creada: ${question}`,
      exists: (question: string) => `Ya tenías esa tarjeta: ${question}`,
      open: 'Abrir la tarjeta',
      title: 'Crear tarjeta de contraste',
      help: 'Escribí los dos conceptos que confundiste.',
      first: 'Primer concepto',
      second: 'Segundo concepto',
      preview: (question: string) => `La tarjeta va a preguntar: ${question}`,
      save: 'Crear la tarjeta',
      cancel: 'Cancelar',
      failed: 'No pude crear la tarjeta. Probá de nuevo.',
    },
    doubtsHeading: 'Dudas guardadas',
    noDoubts: 'Todavía no guardaste dudas.',
    fromCard: (question: string) => `De la tarjeta: ${question}`,
    general: 'De una sesión, sin tarjeta',
    savedOn: (date: string) => `Guardada el ${date}`,
    inReviewHeading: 'Tarjetas en revisión',
    noInReview: 'No hay tarjetas en revisión.',
    openCard: 'Abrir la tarjeta',
    goToStudy: 'Ir a Estudiar',
    loadFailed: 'No pude leer tus dudas. Probá de nuevo.',
    loading: 'Cargando tus dudas…',
    retry: 'Reintentar',
  },
  history: {
    title: 'Historial',
    listLabel: 'Repasos de la tarjeta',
    empty: 'Todavía no la repasaste.',
    // El día y el resultado de un repaso. Más adelante suma la ayuda usada.
    row: (date: string, result: string) => `${date} · ${result}`,
    // Fase 09: el repaso deshecho y el segundo del mismo día.
    annulled: 'Anulado',
    sameDay: 'Otro repaso del mismo día: no cambió la fecha',
    earlier: 'Con una fecha anterior al último repaso que contó: no cambió la fecha',
    marked: (row: string, mark: string) => `${row} · ${mark}`,
    adopted: 'Repasos anteriores, sin detalle',
    reset: 'Cambió lo que hay que recordar: volvió a programarse como nueva',
    // Fase 11: «Posponer» deja un renglón más, sin resultado ni «Anulado».
    postponed: (plannedDay: string) => `Aplazada hasta el ${formatShortDate(plannedDay)}`,
    postponedNoDay: 'Aplazada',
    loadFailed: 'No pude cargar el historial. Probá de nuevo.',
    // Fase 16: un intento sobre un ejercicio, con su calificación vigente y las anteriores tachadas.
    unevaluated: 'Sin evaluar',
    notCounted: 'No cuenta',
    retried: 'Reintento: no cambió la fecha',
    earlierGrades: 'Antes:',
    undone: 'corrección deshecha',
  },
  trash: {
    title: 'Papelera',
    listLabel: 'Elementos en la papelera',
    empty: 'La papelera está vacía.',
    expires: (date: string) => `Se elimina para siempre el ${date}`,
    restore: 'Restaurar',
    restored: 'La tarjeta volvió a la lista.',
    notRestored: 'Esa tarjeta ya no está en la papelera.',
    topicNameTaken: 'No pude restaurar el tema: ya hay otro con ese nombre.',
    otherNotRestored: 'Eso ya no está en la papelera.',
    emptyTrash: 'Vaciar papelera',
    confirmEmpty:
      'Todo lo que está en la papelera se elimina para siempre: tarjetas, notas, temas y anotaciones de la Bandeja.',
    confirm: 'Vaciar',
    cancel: 'Cancelar',
    emptied: 'Vaciaste la papelera.',
    loadFailed: 'No pude cargar la papelera. Probá de nuevo.',
    actionFailed: 'No pude completar esto. Probá de nuevo.',
    // Lo que no es tarjeta: de qué tipo es cada cosa y qué se dice al restaurarla.
    kinds: { note: 'Nota', topic: 'Tema', inbox: 'Bandeja' },
    otherRestored: 'Volvió a su lugar.',
    untitled: UNTITLED,
  },
  activity: {
    title: 'Actividad reciente',
    listLabel: 'Tus cambios',
    empty: 'Todavía no hiciste cambios.',
    undo: 'Deshacer',
    undone: 'Listo: deshiciste el cambio.',
    notUndone: 'Ese cambio ya no se puede deshacer.',
    failed: 'No pude deshacer el cambio. Probá de nuevo.',
    loadFailed: 'No pude cargar la actividad. Probá de nuevo.',
    // La fecha y la hora del cambio, y qué cambio fue.
    row: (when: string, what: string) => `${when} · ${what}`,
    // Una tarjeta por su pregunta, o una que se eliminó para siempre.
    cardName: (question: string | null) =>
      question === null ? 'una tarjeta que ya no existe' : `«${question}»`,
    created: (card: string) => `Creaste ${card}`,
    edited: (card: string) => `Editaste ${card}`,
    removed: (card: string) => `Eliminaste ${card}`,
    restored: (card: string) => `Restauraste ${card}`,
    purged: 'Eliminaste para siempre una tarjeta de la papelera',
    undidCreate: (card: string) => `Deshiciste la creación de ${card}`,
    undidEdit: (card: string) => `Deshiciste la edición de ${card}`,
    undidRemove: (card: string) => `Deshiciste la eliminación de ${card}`,
    undidRestore: (card: string) => `Deshiciste la restauración de ${card}`,
    // Notas, temas, materias y Bandeja (Fase 07). `label` nulo: ya no existe; vacío: una nota sin
    // título.
    things: {
      note: (label: string | null) =>
        label === null
          ? 'una nota que ya no existe'
          : `la nota «${label === '' ? UNTITLED : label}»`,
      topic: (label: string | null) =>
        label === null ? 'un tema que ya no existe' : `el tema «${label}»`,
      subject: (label: string | null) =>
        label === null ? 'una materia que ya no existe' : `la materia «${label}»`,
      inbox: (label: string | null) =>
        label === null ? 'un elemento que ya no existe' : `«${label}» de la Bandeja`,
    },
    did: {
      create: 'Creaste',
      rename: 'Renombraste',
      move: 'Moviste',
      archive: 'Archivaste',
      unarchive: 'Desarchivaste',
      remove: 'Eliminaste',
      restore: 'Restauraste',
      activate: 'Activaste',
    },
    undid: {
      create: 'Deshiciste la creación de',
      rename: 'Deshiciste el cambio de nombre de',
      move: 'Deshiciste el movimiento de',
      archive: 'Deshiciste el archivado de',
      unarchive: 'Deshiciste el desarchivado de',
      remove: 'Deshiciste la eliminación de',
      restore: 'Deshiciste la restauración de',
      activate: 'Deshiciste la activación de',
    },
    purgedOther: {
      note: 'Eliminaste para siempre una nota de la papelera',
      topic: 'Eliminaste para siempre un tema de la papelera',
      inbox: 'Eliminaste para siempre un elemento de la papelera',
    },
  },
  settings: {
    title: 'Ajustes',
  },
  data: {
    title: 'Datos y copias',
    verify: 'Verificar datos',
    reindex: 'Reconstruir índice de búsqueda',
    reindexed: (count: number) =>
      count === 1
        ? 'Índice reconstruido: 1 elemento.'
        : `Índice reconstruido: ${numberFormat.format(count)} elementos.`,
    reindexFailed: 'No pude reconstruir el índice. Probá de nuevo.',
    allGood: 'Todo en orden · 0 diferencias',
    differencesFound: (count: number) =>
      count === 1 ? 'Hay 1 diferencia' : `Hay ${numberFormat.format(count)} diferencias`,
    differencesLabel: 'Diferencias',
    differenceDue: (question: string, stored: string, expected: string) =>
      `«${question}»: el próximo repaso guardado es el ${stored}; según el historial es el ${expected}`,
    differenceMemory: (question: string) =>
      `«${question}»: los datos de memoria guardados no coinciden con el historial`,
    differenceMissing: (question: string) => `«${question}»: le falta su agenda de repasos`,
    differenceExtra: 'Hay una agenda de repasos de una tarjeta que ya no existe',
    differenceSearch: (label: string | null) =>
      label === null
        ? 'El índice de búsqueda no coincide con lo que guardaste'
        : `«${label}»: el índice de búsqueda no coincide con lo que guardaste`,
    repair: 'Reparar desde el historial',
    verifyFailed: 'No pude verificar los datos. Probá de nuevo.',
    copiesTitle: 'Copias',
    copiesLabel: 'Tus copias',
    makeCopy: 'Hacer copia ahora',
    openFolder: 'Abrir carpeta de copias',
    noCopies: 'Todavía no hay copias.',
    kinds: {
      auto: 'Automática',
      manual: 'Hecha por vos',
      before_restore: 'Antes de restaurar',
      before_import: 'Antes de importar',
    },
    // La fecha y la hora de la copia, quién la hizo y cuánto ocupa.
    copyRow: (date: string, time: string, kind: string, size: string) =>
      `${date} ${time} · ${kind} · ${size}`,
    verified: 'Verificada',
    unreadableCopy: (size: string) => `Una copia que no se puede abrir · ${size}`,
    restore: 'Restaurar',
    working: 'Un momento…',
    copyMade: 'Copia hecha y verificada.',
    copyFailed: 'No pude hacer la copia. Tus datos siguen como estaban.',
    restored: (date: string, time: string) =>
      `Listo: volviste a la copia del ${date} ${time}. Lo que había antes quedó en la copia «Antes de restaurar».`,
    restoreFailed: 'No pude restaurar esa copia. Tus datos siguen como estaban.',
    openFailed: 'No pude abrir la carpeta de copias.',
    loadFailed: 'No pude cargar las copias. Probá de nuevo.',
  },
  // Importar de Anki y de RemNote (Fase 15, H-29). La vista previa no escribe nada; «Importar»
  // hace primero la copia «Antes de importar».
  imports: {
    title: 'Traer de otros programas',
    fromAnki: 'Importar de Anki',
    fromRemnote: 'Importar de RemNote',
    fromRemnoteFolder: 'Elegir una carpeta de RemNote',
    reading: 'Leyendo el archivo…',
    previewTitle: (fileName: string) => `Vista previa de «${fileName}»`,
    previewLabel: 'Vista previa de la importación',
    nothingWritten: 'Todavía no se escribió nada en Retenia.',
    ankiSummary: (counts: { cards: { fresh: number }; reviews: number; rejected: number }) => {
      const cards = counts.cards.fresh;
      const reviews = counts.reviews;
      const verb = cards === 1 ? 'Entra' : 'Entran';
      const cardWord = cards === 1 ? 'tarjeta' : 'tarjetas';
      const reviewWord = reviews === 1 ? 'repaso' : 'repasos';
      return `${verb} ${numberFormat.format(cards)} ${cardWord} y ${numberFormat.format(reviews)} ${reviewWord} · Rechazadas: ${numberFormat.format(counts.rejected)}`;
    },
    remnoteSummary: (
      counts: { notes: { fresh: number }; cards: { fresh: number } },
      rejected: readonly { reason: keyof typeof IMPORT_REASONS }[],
    ) => {
      const notes = counts.notes.fresh;
      const cards = counts.cards.fresh;
      const reasons = [...new Set(rejected.map((item) => IMPORT_REASONS[item.reason]))];
      const rejectedText =
        rejected.length === 1
          ? '1 rechazada'
          : `${numberFormat.format(rejected.length)} rechazadas`;
      return `${numberFormat.format(notes)} ${notes === 1 ? 'nota' : 'notas'}, ${numberFormat.format(cards)} ${cards === 1 ? 'tarjeta' : 'tarjetas'}, ${rejectedText}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`;
    },
    again: ({ fresh, existing }: { fresh: number; existing: number }) =>
      `${numberFormat.format(fresh)} ${fresh === 1 ? 'nueva' : 'nuevas'} · ${numberFormat.format(existing)} ${existing === 1 ? 'ya estaba' : 'ya estaban'}`,
    importedBefore: (date: string) => `Este archivo ya lo importaste el ${date}.`,
    withoutHistory: 'Sin historial: entran como «Disponibles».',
    withoutHistoryNote:
      'No van a tus repasos hasta que las sumes con «Sumar a mis repasos», en Apuntes › Tarjetas.',
    annotatedTitle: 'Entró distinto',
    annotatedLine: (what: string, note: string) => `${what} · ${note}`,
    notes: {
      plainText: 'entró como texto común',
      latex: 'la fórmula entró como texto',
      unknownLink: 'enlace a un documento que no vino',
    },
    rejectedTitle: 'Rechazadas',
    rejectedLabel: 'Lo que no entró',
    rejectedLine: (what: string, reason: string) => `${what} · ${reason}`,
    reasons: IMPORT_REASONS,
    noneRejected: 'No hay nada rechazado.',
    destination: 'Materia de destino',
    newSubject: 'Nueva materia…',
    newSubjectName: 'Nombre de la materia nueva',
    run: 'Importar',
    cancel: 'Cancelar',
    nothingNew: 'No hay nada nuevo para importar.',
    doneAnki: (cards: number, reviews: number, subject: string) =>
      `Listo: ${cards === 1 ? 'entró 1 tarjeta' : `entraron ${numberFormat.format(cards)} tarjetas`} y ${reviews === 1 ? '1 repaso' : `${numberFormat.format(reviews)} repasos`} en «${subject}».`,
    doneRemnote: (notes: number, cards: number, subject: string) =>
      `Listo: ${notes === 1 ? 'entró 1 nota' : `entraron ${numberFormat.format(notes)} notas`} y ${cards === 1 ? '1 tarjeta' : `${numberFormat.format(cards)} tarjetas`} en «${subject}».`,
    backupMade: 'Antes de escribir hice la copia «Antes de importar».',
    failed: 'No pude importar. Tus datos siguen como estaban.',
    problems: {
      notAnki: 'Este archivo no es una exportación de Anki (.apkg o .colpkg).',
      notRemnote: 'No encontré documentos de RemNote en Markdown en este archivo.',
      tooNew:
        'Este archivo es de una versión de Anki más nueva que Retenia todavía no lee. Exportalo otra vez desde Anki con «Support older Anki versions».',
      damaged: 'Este archivo está dañado: no lo pude leer.',
      unsafe: 'Este archivo tiene partes que no son seguras y no lo abrí.',
    },
    historyTitle: 'Importaciones',
    historyLabel: 'Tus importaciones',
    historyEmpty: 'Todavía no importaste nada.',
    // Lo que entró en una importación ya hecha (sin verbo: ya pasó).
    historyAnki: (counts: { cards: { fresh: number }; reviews: number; rejected: number }) =>
      `${numberFormat.format(counts.cards.fresh)} ${counts.cards.fresh === 1 ? 'tarjeta' : 'tarjetas'} y ${numberFormat.format(counts.reviews)} ${counts.reviews === 1 ? 'repaso' : 'repasos'} · ${counts.rejected === 1 ? '1 rechazada' : `${numberFormat.format(counts.rejected)} rechazadas`}`,
    historyRow: (date: string, kind: string, fileName: string, subject: string) =>
      `${date} · ${kind} · «${fileName}» en «${subject}»`,
    kinds: { anki: 'Anki', remnote: 'RemNote' },
    viewRejected: 'Ver rechazadas',
    hideRejected: 'Ocultar rechazadas',
    saveList: 'Guardar lista',
    listSaved: 'Lista guardada.',
    saveListFailed: 'No pude guardar la lista. Probá de nuevo.',
    rejectedHeader: (fileName: string, date: string) => `Rechazadas de «${fileName}» (${date})`,
    rejectedFileName: (fileName: string) => `Rechazadas de ${fileName}.txt`,
    fromAnkiOrigin: 'De Anki',
    dialogAnki: 'Elegí la exportación de Anki',
    dialogRemnote: 'Elegí la exportación de RemNote',
    filterAnki: 'Mazo o colección de Anki',
    filterRemnote: 'Exportación de RemNote en Markdown',
    filterText: 'Texto',
  },
  // «Exportar todo» e «Importar exportación» (Fase 15, H-30).
  exports: {
    title: 'Tus datos, para llevar',
    exportAll: 'Exportar todo',
    exporting: 'Exportando…',
    countsLine: (counts: { subjects: number; cards: number; reviews: number }) =>
      `${numberFormat.format(counts.subjects)} ${counts.subjects === 1 ? 'materia' : 'materias'} · ${numberFormat.format(counts.cards)} ${counts.cards === 1 ? 'tarjeta' : 'tarjetas'} · ${numberFormat.format(counts.reviews)} ${counts.reviews === 1 ? 'repaso' : 'repasos'}`,
    exported: (fileName: string, counts: string) => `Exportado en «${fileName}»: ${counts}.`,
    exportFailed: 'No pude exportar. Tus datos siguen como estaban.',
    // Objeción 10: un archivo de la carpeta de datos que no estaba (una imagen borrada a mano).
    missingFiles: (count: number) =>
      count === 1
        ? 'Faltaba 1 archivo en la carpeta de datos de Retenia: la exportación va sin él y lo anota en «indice.json».'
        : `Faltaban ${numberFormat.format(count)} archivos en la carpeta de datos de Retenia: la exportación va sin ellos y los anota en «indice.json».`,
    importExport: 'Importar exportación',
    reading: 'Revisando la exportación…',
    notEmpty:
      'Para cargar una exportación entera, Retenia tiene que estar vacío. Tus datos siguen como estaban.',
    previewLine: (date: string, counts: string) => `Exportación del ${date}: ${counts}.`,
    load: 'Cargar',
    loading: 'Cargando…',
    loaded: (counts: string) => `Listo: ${counts}.`,
    loadFailed: 'No pude cargar la exportación. Tus datos siguen como estaban.',
    problems: {
      notExport: 'Este archivo no es una exportación de Retenia.',
      damaged: 'Esta exportación está dañada o se modificó: no la cargué.',
      tooNew: 'Esta exportación es de una versión más nueva de Retenia.',
      unsafe: 'Este archivo tiene partes que no son seguras y no lo abrí.',
      notEmpty:
        'Para cargar una exportación entera, Retenia tiene que estar vacío. Tus datos siguen como estaban.',
    },
    dialogSave: 'Guardá la exportación',
    dialogOpen: 'Elegí una exportación de Retenia',
    fileName: (date: string) => `Retenia ${date}.zip`,
    filter: 'Exportación de Retenia',
  },
};

// «2027-03-15» → «lunes 15/03/2027».
export function formatLongDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Fecha inválida: «${isoDate}»`);
  }
  const [, year, month, day] = match;
  const weekday =
    WEEKDAYS[new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()];
  return `${weekday} ${day}/${month}/${year}`;
}

// «AAAA-MM-DD» → «DD/MM/AAAA».
export function formatShortDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Fecha inválida: «${isoDate}»`);
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

const KB = 1024;
const MB = 1024 * KB;

// El tamaño de un archivo como lo muestra Windows: «48 KB», «1,2 MB», «150 MB».
export function formatSize(bytes: number): string {
  if (bytes < MB) {
    return `${numberFormat.format(Math.max(1, Math.round(bytes / KB)))} KB`;
  }
  const megabytes = bytes / MB;
  return `${megabytes < 10 ? decimalFormat.format(megabytes) : numberFormat.format(Math.round(megabytes))} MB`;
}
