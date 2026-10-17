// Catálogo de textos visibles. Todo lo que se ve en pantalla sale de acá, en castellano
// rioplatense. Lo comparten la ventana y el proceso principal. Los textos de la variante de
// prueba viven en demo-texts.ts.

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const numberFormat = new Intl.NumberFormat('es-AR');
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
  // Apuntes, por ahora, tiene adentro la lista de tarjetas, la Papelera y la Actividad reciente.
  notes: {
    tabsLabel: 'Secciones de Apuntes',
    cards: 'Tarjetas',
    trash: 'Papelera',
    activity: 'Actividad reciente',
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
