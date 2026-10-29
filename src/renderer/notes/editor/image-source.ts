// Los bytes de una imagen se piden al principal una sola vez por huella: el resto de las veces sale
// de una memoria de la ventana. Se muestran como datos en línea (la política de contenido de la
// ventana ya permite `data:` en imágenes).
const caches = new WeakMap<object, Map<string, Promise<string>>>();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export function imageSource(sha: string): Promise<string> {
  const api = window.retenia;
  let cache = caches.get(api);
  if (cache === undefined) {
    cache = new Map();
    caches.set(api, cache);
  }
  const known = cache.get(sha);
  if (known) {
    return known;
  }
  const loading = api['images.read']({ sha }).then(
    ({ mime, bytes }) => `data:${mime};base64,${toBase64(bytes)}`,
  );
  cache.set(sha, loading);
  const store = cache;
  // Lo que falló no queda en la memoria: la próxima vez se vuelve a pedir.
  loading.catch(() => {
    if (store.get(sha) === loading) {
      store.delete(sha);
    }
  });
  return loading;
}
