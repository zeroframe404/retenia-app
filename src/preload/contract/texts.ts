// Catálogo de textos visibles. Todo lo que se ve en pantalla sale de acá, en castellano
// rioplatense. Lo comparten la ventana y el proceso principal. Los textos de la variante de
// prueba viven en demo-texts.ts.

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const numberFormat = new Intl.NumberFormat('es-AR');

// Cómo se llama una nota que no tiene título.
const UNTITLED = 'Sin título';
const decimalFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

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
    study: 'Todavía no disponible. Acá vas a ver qué estudiar hoy.',
    materials: 'Todavía no disponible. Acá vas a guardar tus PDF, textos y páginas web.',
    languages: 'Todavía no disponible. Acá vas a seguir el curso de inglés, de cero a C2.',
    progress: 'Todavía no disponible. Acá vas a ver cuánto conservás y qué podés hacer.',
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
      // El nombre del tema con cuántas notas tiene: «Media y dispersión · 2».
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
    // La materia con su estado: «Estadística básica · En mantenimiento».
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
  // Ctrl+K: por ahora abre un cuadro sin búsqueda.
  search: {
    notAvailable: 'La búsqueda todavía no está disponible.',
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
    notReviewed: 'Todavía sin repasar',
    nextReview: (longDate: string) => `Próximo repaso: ${longDate}`,
    review: 'Repasar',
    history: 'Historial',
    edit: 'Editar',
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
  },
  history: {
    title: 'Historial',
    listLabel: 'Repasos de la tarjeta',
    empty: 'Todavía no la repasaste.',
    // El día y el resultado de un repaso. Más adelante suma la ayuda usada.
    row: (date: string, result: string) => `${date} · ${result}`,
    adopted: 'Repasos anteriores, sin detalle',
    loadFailed: 'No pude cargar el historial. Probá de nuevo.',
  },
  trash: {
    title: 'Papelera',
    listLabel: 'Tarjetas en la papelera',
    empty: 'La papelera está vacía.',
    expires: (date: string) => `Se elimina para siempre el ${date}`,
    restore: 'Restaurar',
    restored: 'La tarjeta volvió a la lista.',
    notRestored: 'Esa tarjeta ya no está en la papelera.',
    emptyTrash: 'Vaciar papelera',
    confirmEmpty: 'Las tarjetas de la papelera se eliminan para siempre.',
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
