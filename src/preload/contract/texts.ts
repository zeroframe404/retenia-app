// Catálogo de textos visibles. Todo lo que se ve en pantalla sale de acá, en castellano
// rioplatense. Lo comparten la ventana y el proceso principal.

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export const texts = {
  appName: 'Retenia',
  demoRibbon: (longDate: string) => `DEMOSTRACIÓN · hoy es ${longDate}`,
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
