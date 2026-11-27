import type { ReteniaApi } from '../preload/contract';
import type { ReteniaEvent } from '../preload/contract/events';
import type { AddResult } from '../preload/contract/materials';

declare global {
  // Lo define electron-vite al compilar: «prueba» (demostración) o «real».
  const __VARIANTE__: 'prueba' | 'real';

  interface Window {
    retenia: ReteniaApi;
    // Lo entrega el puente. Antes de cerrar la ventana avisa a quien se registró con `alCerrar`: el
    // programa no se cierra hasta que su promesa se resuelve (así lo escrito a medias se guarda).
    // Devuelve cómo desregistrarse. No existe en las pruebas de pantallas.
    reteniaCierre?: { alCerrar(handler: () => Promise<void> | void): () => void };
    // El puente de archivos (Fase 13): agrega los archivos soltados o elegidos. La ventana nunca ve
    // sus rutas: el puente las saca de cada archivo del disco.
    reteniaArchivos?: {
      agregar(
        files: File[],
        options: { subjectId: string; title?: string | undefined },
      ): Promise<{ results: AddResult[] }>;
    };
    // Los avisos del principal (Fase 13): avanza, termina o falla un material. Devuelve cómo dejar
    // de escuchar.
    reteniaAvisos?: { alRecibir(listener: (event: ReteniaEvent) => void): () => void };
  }
}
