// El proceso de trabajo de materiales (utilityProcess): leer PDF con pdf.js y reconocer escaneos
// con tesseract.js, lejos de la ventana y del proceso principal. Lo abre el supervisor con el
// primer pedido de materiales.
import { runMaterialsTask } from './materials-tasks';
import { serve } from './serve';

serve(runMaterialsTask, () => 'failed');
