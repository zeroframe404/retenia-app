import './net-guard';
// El proceso de trabajo de materiales (utilityProcess): leer PDF con pdf.js, Word con mammoth y
// reconocer escaneos con tesseract.js, lejos de la ventana y del proceso principal, sin red. Lo
// abre el supervisor con el primer pedido de materiales.
import { runMaterialsTask } from './materials-tasks';
import { serve } from './serve';
import { watchParent } from './watch-parent';

watchParent();
serve(runMaterialsTask, (error) =>
  error instanceof Error && /heap|memory/i.test(error.message) ? 'memory' : 'failed',
);
