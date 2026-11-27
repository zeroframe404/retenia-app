import type { z } from 'zod';
import type { demoChannels } from '../../preload/contract/demo';
import type { DemoAi } from './ai';
import type { DemoDate } from './clock';
import type { DemoWorkspace } from './switcher';

type Registry = ReturnType<typeof demoChannels>;

export type DemoHandlers = {
  [K in keyof Registry]: (
    request: z.output<Registry[K]['request']>,
  ) => Promise<z.input<Registry[K]['response']>>;
};

// Cambiar los datos de la demostración cierra una base y abre otra: la compuerta del principal los
// trata como exclusivos (como restaurar una copia).
export const demoExclusiveChannels: readonly (keyof Registry)[] = [
  'demo.useFirstTime',
  'demo.useCast',
];

// Con qué datos está abierta la demostración y cómo cambiarlos.
type DemoData = Pick<DemoWorkspace, 'mode' | 'useFirstTime' | 'useCast' | 'loadVolume'>;

// Los manejadores de los canales que solo existen en «Retenia (prueba)»: la fecha de la cinta y
// los botones de Ajustes › «Demostración». Sin los datos (`data`), «demo.dataMode» responde el
// elenco y los dos cambios de modo fallan. Sin la IA simulada (`ai`), sus interruptores quedan
// apagados y no se pueden prender.
export function createDemoHandlers(demo: DemoDate, data?: DemoData, ai?: DemoAi): DemoHandlers {
  const needAi = (): DemoAi => {
    if (!ai) {
      throw new Error('Acá no hay IA simulada');
    }
    return ai;
  };
  const needData = (): DemoData => {
    if (!data) {
      throw new Error('Acá no se puede cambiar de datos de demostración');
    }
    return data;
  };
  return {
    'demo.state': async () => ({ today: demo.today() }),
    'demo.advanceDays': async ({ days }) => ({ today: demo.advance(days) }),
    'demo.resetDate': async () => ({ today: demo.reset() }),
    'demo.dataMode': async () => ({ mode: data ? data.mode() : 'cast' }),
    'demo.useFirstTime': async () => ({ mode: await needData().useFirstTime() }),
    'demo.useCast': async () => ({ mode: await needData().useCast() }),
    'demo.load10k': async () => needData().loadVolume(),
    'demo.processing': async () => ({ slow: demo.slowProcessing() }),
    'demo.setProcessing': async ({ slow }) => ({ slow: demo.setSlowProcessing(slow) }),
    'demo.ai': async () => ai?.state() ?? { simulated: false, bad: false, slow: false },
    'demo.setAi': async (patch) =>
      needAi().set({
        ...(patch.simulated === undefined ? {} : { simulated: patch.simulated }),
        ...(patch.bad === undefined ? {} : { bad: patch.bad }),
        ...(patch.slow === undefined ? {} : { slow: patch.slow }),
      }),
  };
}
