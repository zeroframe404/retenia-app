// Regla dura para las fases de IA (H-27, CA-118): un bloque con un problema abierto, de una página
// excluida o marcado como imagen no se ofrece para generar tarjetas. La pantalla y, más adelante,
// toda función que genere tarjetas a partir de un material preguntan acá antes de ofrecerlo.
export function isOfferableForCards({
  openProblem,
  excluded,
  markedAsImage = false,
}: {
  openProblem: boolean;
  excluded: boolean;
  markedAsImage?: boolean;
}): boolean {
  return !openProblem && !excluded && !markedAsImage;
}
