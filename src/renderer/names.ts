// Dos nombres son el mismo si solo se distinguen por mayúsculas, espacios de los bordes o espacios
// repetidos. Es la misma regla que aplica el principal (`core/organization`): acá sirve para avisar
// antes de pedir.
function normalize(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR');
}

export function sameName(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
