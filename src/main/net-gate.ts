// La única puerta de Retenia hacia internet (Fase 14): toda salida pasa por acá. Con «Simular sin
// conexión» (Ajustes › «Demostración») la puerta falla como si no hubiera red, sin mandar nada,
// para poder probar y mostrar lo que pasa sin conexión.

export class OfflineError extends Error {
  constructor() {
    super('Sin conexión');
    this.name = 'OfflineError';
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface NetGate {
  isOffline(): boolean;
  setOffline(offline: boolean): void;
  // Avisa cada vez que cambia el estado de la conexión (simulada o real).
  onChange(listener: (offline: boolean) => void): () => void;
  fetch: Fetch;
}

export function createNetGate({
  offline = false,
  fetchImpl = (input, init) => fetch(input, init),
  // Si el sistema dice que no hay red (en Electron, `net.isOnline()`).
  systemOnline = () => true,
}: {
  offline?: boolean;
  fetchImpl?: Fetch;
  systemOnline?: () => boolean;
} = {}): NetGate {
  let simulated = offline;
  const listeners = new Set<(offline: boolean) => void>();
  const isOffline = () => simulated || !systemOnline();
  return {
    isOffline,
    setOffline(next) {
      if (next === simulated) {
        return;
      }
      simulated = next;
      for (const listener of [...listeners]) {
        listener(isOffline());
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async fetch(input, init) {
      if (isOffline()) {
        throw new OfflineError();
      }
      return fetchImpl(input, init);
    },
  };
}
