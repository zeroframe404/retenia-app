import './net-guard';
// El proceso de trabajo de importar y exportar (utilityProcess, Fase 15): lee los mazos de Anki y
// las exportaciones de RemNote y de Retenia, y escribe el comprimido de «Exportar todo», lejos de la
// ventana y del proceso principal, sin red. Lo abre el supervisor con el primer pedido.
import { serve } from './serve';
import { runTransferTask } from './transfers-tasks';
import { watchParent } from './watch-parent';

watchParent();
serve(runTransferTask, (error) =>
  error instanceof Error && /heap|memory/i.test(error.message) ? 'memory' : 'failed',
);
