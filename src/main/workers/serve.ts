import type { WorkerProblemName } from './protocol';
import { splitRequest } from './protocol';

// La parte común de los dos procesos de trabajo (utilityProcess de Electron): recibe cada pedido
// del principal, lo corre y contesta con el mismo número, sin dejar que un error lo tumbe.
export function serve(
  run: (task: unknown) => Promise<unknown>,
  problemOf: (error: unknown) => WorkerProblemName,
): void {
  const port = process.parentPort;
  port.on('message', (event) => {
    const { id, task } = splitRequest(event.data);
    run(task).then(
      (result) => port.postMessage({ id, ok: true, result }),
      (error: unknown) => {
        // Queda en el registro del programa para diagnosticar; el aviso en castellano y la
        // recuperación llegan en la Fase 39.
        console.error('Retenia: una tarea del proceso de trabajo no terminó', error);
        port.postMessage({ id, ok: false, problem: problemOf(error) });
      },
    );
  });
}
