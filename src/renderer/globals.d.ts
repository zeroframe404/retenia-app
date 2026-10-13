import type { ReteniaApi } from '../preload/contract';

declare global {
  // Lo define electron-vite al compilar: «prueba» (demostración) o «real».
  const __VARIANTE__: 'prueba' | 'real';

  interface Window {
    retenia: ReteniaApi;
  }
}
