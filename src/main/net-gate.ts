// La única puerta de Retenia hacia internet (Fase 14): toda salida pasa por acá. Con «Simular sin
// conexión» (Ajustes › «Demostración») la puerta falla como si no hubiera red, sin mandar nada,
// para poder probar y mostrar lo que pasa sin conexión. Desde la Fase 19, con «Modo solo local»
// (Ajustes › «Inteligencia artificial») tampoco sale nada: ni la IA, ni las páginas web, ni las
// descargas. Para lo que espera conexión es lo mismo que no tenerla, y sigue solo al apagarlo.

export class OfflineError extends Error {
  constructor(message = 'Sin conexión') {
    super(message);
    this.name = 'OfflineError';
  }
}

// «Modo solo local» prendido: nada sale de la PC.
export class LocalOnlyError extends OfflineError {
  constructor() {
    super('Modo solo local');
    this.name = 'LocalOnlyError';
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface NetGate {
  isOffline(): boolean;
  isLocalOnly(): boolean;
  setOffline(offline: boolean): void;
  setLocalOnly(localOnly: boolean): void;
  // Avisa cada vez que cambia el estado de la conexión (simulada, real o por «Modo solo local»).
  onChange(listener: (offline: boolean) => void): () => void;
  fetch: Fetch;
}

export function createNetGate({
  offline = false,
  localOnly = false,
  fetchImpl = (input, init) => fetch(input, init),
  // Si el sistema dice que no hay red (en Electron, `net.isOnline()`).
  systemOnline = () => true,
}: {
  offline?: boolean;
  localOnly?: boolean;
  fetchImpl?: Fetch;
  systemOnline?: () => boolean;
} = {}): NetGate {
  let simulated = offline;
  let local = localOnly;
  const listeners = new Set<(offline: boolean) => void>();
  const isOffline = () => local || simulated || !systemOnline();
  const notify = () => {
    for (const listener of [...listeners]) {
      listener(isOffline());
    }
  };
  return {
    isOffline,
    isLocalOnly: () => local,
    setOffline(next) {
      if (next === simulated) {
        return;
      }
      simulated = next;
      notify();
    },
    setLocalOnly(next) {
      if (next === local) {
        return;
      }
      local = next;
      notify();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async fetch(input, init) {
      if (local) {
        throw new LocalOnlyError();
      }
      if (isOffline()) {
        throw new OfflineError();
      }
      return fetchImpl(input, init);
    },
  };
}
