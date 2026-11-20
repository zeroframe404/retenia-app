// Las rutas de los archivos que se sueltan o se eligen en Materiales (Fase 13). Lo que llega de la
// ventana se trata como dato desconocido: solo un arreglo de verdad (las pantallas mandan siempre
// uno) de objetos File de verdad da rutas, y cada ruta la saca Electron (`webUtils.getPathForFile`),
// nunca la ventana. Un archivo armado en la página no tiene ruta y hace fallar todo el pedido.
// Devuelve null si algo no cumple.
export function pathsOfFiles(list: unknown, getPath: (file: File) => string): string[] | null {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const items: unknown[] = list;
  const count = items.length;
  const paths: string[] = [];
  for (let index = 0; index < count; index++) {
    const file = items[index];
    if (!(file instanceof File)) {
      return null;
    }
    let path = '';
    try {
      path = getPath(file);
    } catch {
      return null;
    }
    if (typeof path !== 'string' || path === '') {
      return null;
    }
    paths.push(path);
  }
  return paths;
}
