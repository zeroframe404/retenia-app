import { useEffect, useState } from 'react';

// El original de un material, pedido por «retenia-original://<material>» (nunca por una ruta). Se
// guarda en memoria mientras la ventana está abierta: pasar de página no lo vuelve a pedir. Si no
// se puede pedir (en las pruebas de pantallas no hay protocolo), queda null y el visor muestra el
// recuadro de la página sin dibujo.

const cache = new Map<string, Promise<Uint8Array | null>>();

function fetchOriginal(materialId: string): Promise<Uint8Array | null> {
  let pending = cache.get(materialId);
  if (!pending) {
    pending = (async () => {
      try {
        if (typeof fetch !== 'function') {
          return null;
        }
        const response = await fetch(`retenia-original://${materialId}`);
        if (!response.ok) {
          return null;
        }
        return new Uint8Array(await response.arrayBuffer());
      } catch {
        return null;
      }
    })();
    cache.set(materialId, pending);
    void pending.then((bytes) => {
      if (bytes === null) {
        cache.delete(materialId);
      }
    });
  }
  return pending;
}

export function useOriginal(materialId: string | null, enabled: boolean): Uint8Array | null {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    if (!materialId || !enabled) {
      setBytes(null);
      return;
    }
    let alive = true;
    void fetchOriginal(materialId).then((found) => {
      if (alive) {
        setBytes(found);
      }
    });
    return () => {
      alive = false;
    };
  }, [materialId, enabled]);
  return bytes;
}
