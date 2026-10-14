import type { z } from 'zod';
import type { demoChannels } from '../../preload/contract/demo';
import type { DemoDate } from './clock';

type Registry = ReturnType<typeof demoChannels>;

export type DemoHandlers = {
  [K in keyof Registry]: (
    request: z.output<Registry[K]['request']>,
  ) => Promise<z.input<Registry[K]['response']>>;
};

// Los manejadores de los canales que solo existen en «Retenia (prueba)»: la fecha de la cinta y
// los botones de Ajustes › «Demostración».
export function createDemoHandlers(demo: DemoDate): DemoHandlers {
  return {
    'demo.state': async () => ({ today: demo.today() }),
    'demo.advanceDays': async ({ days }) => ({ today: demo.advance(days) }),
    'demo.resetDate': async () => ({ today: demo.reset() }),
  };
}
