// Cómo viaja el material a la IA (Fase 19, CA-175): delimitado y marcado como contenido a analizar.
// El texto de tus materiales nunca se mezcla con las instrucciones (que salen de archivos fijos del
// programa) ni sirve como respuesta correcta de nada. Si el texto trae algo con forma de la marca
// del fragmento, se neutraliza (el «<» pasa a «‹», una letra por otra: las posiciones de las citas
// no cambian), así no puede cerrar su fragmento ni abrir otro.

const TAG_START = /<(\s*\/?\s*fragmento)/giu;

export function neutralizeFragment(text: string): string {
  return text.replace(TAG_START, '‹$1');
}

const attribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

export function fragmentBlock(materialTitle: string, text: string): string {
  return `<fragmento material="${attribute(materialTitle)}">\n${neutralizeFragment(text)}\n</fragmento>`;
}
