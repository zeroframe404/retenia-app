import type { ReteniaApi } from '../preload/contract';

declare global {
  // Lo define electron-vite al compilar: «prueba» (demostración) o «real».
  const __VARIANTE__: 'prueba' | 'real';

  interface Window {
    retenia: ReteniaApi;
    // Lo entrega el puente. Antes de cerrar la ventana avisa a quien se registró con `alCerrar`: el
    // programa no se cierra hasta que su promesa se resuelve (así lo escrito a medias se guarda).
    // Devuelve cómo desregistrarse. No existe en las pruebas de pantallas.
    reteniaCierre?: { alCerrar(handler: () => Promise<void> | void): () => void };
  }
}
