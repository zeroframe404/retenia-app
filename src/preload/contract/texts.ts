// Catálogo de textos visibles. Todo lo que se ve en pantalla sale de acá, en castellano
// rioplatense. Lo comparten la ventana y el proceso principal. Los textos de la variante de
// prueba viven en demo-texts.ts.

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const numberFormat = new Intl.NumberFormat('es-AR');
const decimalFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

export const texts = {
  appName: 'Retenia',
  appNameTest: 'Retenia (prueba)',
  // La barra de secciones provisoria (el riel llega en la Fase 06).
  nav: {
    label: 'Secciones',
    cards: 'Tarjetas',
    trash: 'Papelera',
    activity: 'Actividad reciente',
    settings: 'Ajustes',
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
    // «15/03/2027 · La sabía». Más adelante suma la ayuda usada.
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
    // «22/03/2027 10:00 · Editaste «¿Qué es la varianza?»».
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
    // «22/03/2027 10:00 · Hecha por vos · 48 KB».
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

// «2027-03-15» → «15/03/2027».
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
