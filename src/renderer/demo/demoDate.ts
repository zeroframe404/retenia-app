import { useSyncExternalStore } from 'react';

// La fecha de la demostración que comparten la cinta y Ajustes › «Demostración»: cuando un botón
// la corre, la cinta cambia al instante.

let today: string | null = null;
const listeners = new Set<() => void>();

export function setDemoToday(value: string): void {
  today = value;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDemoToday(): string | null {
  return useSyncExternalStore(subscribe, () => today);
}
