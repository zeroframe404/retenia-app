// Catálogo de textos visibles. Todo lo que se ve en pantalla sale de acá, en castellano
// rioplatense. Lo comparten la ventana y el proceso principal. Los textos de la variante de
// prueba viven en demo-texts.ts.

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const numberFormat = new Intl.NumberFormat('es-AR');

export const texts = {
  appName: 'Retenia',
  appNameTest: 'Retenia (prueba)',
  cards: {
    title: 'Tarjetas',
    listLabel: 'Tus tarjetas',
    newCard: 'Nueva tarjeta',
    formLabel: 'Nueva tarjeta',
    questionLabel: 'Pregunta',
    answerLabel: 'Respuesta',
    save: 'Guardar',
    cancel: 'Cancelar',
    saved: 'Tarjeta guardada',
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
    reviewTitle: 'Repaso',
    showAnswer: 'Mostrar respuesta',
    gradeGroup: '¿Cómo te fue?',
    gradeAgain: 'No la sabía',
    gradeHard: 'Con dudas',
    gradeGood: 'La sabía',
    reviewFailed: 'No pude guardar el repaso. Probá de nuevo.',
    backToCards: 'Volver a las tarjetas',
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
