// Textos de la variante de prueba. Viven aparte del catálogo general para que la versión real
// no los lleve consigo.
export const demoTexts = {
  ribbon: (longDate: string) => `DEMOSTRACIÓN · hoy es ${longDate}`,
  // Ajustes › «Demostración».
  section: 'Demostración',
  advance: { 1: '+1 día', 7: '+7 días', 35: '+35 días' },
  reset: 'Restablecer fecha',
  failed: 'No pude cambiar la fecha. Probá de nuevo.',
};
