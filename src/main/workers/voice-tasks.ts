import { voiceTask } from './protocol';
import { createVoiceEngine, type VoiceEngine } from './voice-engine';

// Lo que hace el proceso de trabajo de voz con cada pedido. Los modelos quedan cargados entre
// pedidos (uno por carpeta de modelos).
export function createVoiceTasks(): (task: unknown) => Promise<unknown> {
  const engines = new Map<string, VoiceEngine>();
  const engineFor = (modelsDir: string) => {
    let engine = engines.get(modelsDir);
    if (!engine) {
      engine = createVoiceEngine(modelsDir);
      engines.set(modelsDir, engine);
    }
    return engine;
  };
  return async (raw) => {
    const task = voiceTask.parse(raw);
    if (task.kind === 'speak') {
      return engineFor(task.modelsDir).speak(task.text, task.voice);
    }
    return { text: engineFor(task.modelsDir).transcribe(task.samples, task.sampleRate) };
  };
}
