// El proceso de trabajo de voz (utilityProcess): Kokoro y Whisper con sherpa-onnx, lejos de la
// ventana y del proceso principal. Lo abre el supervisor con el primer pedido de voz.
import { serve } from './serve';
import { VoiceModelsMissing } from './voice-engine';
import { createVoiceTasks } from './voice-tasks';

serve(createVoiceTasks(), (error) => (error instanceof VoiceModelsMissing ? 'noModels' : 'failed'));
