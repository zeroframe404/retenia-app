import type { z } from 'zod';
import type { Clock } from '../../core/clock';
import { studyDayOf } from '../../core/study-day';
import type { demoChannels } from '../../preload/contract/demo';

type Registry = ReturnType<typeof demoChannels>;

export type DemoHandlers = {
  [K in keyof Registry]: (
    request: z.output<Registry[K]['request']>,
  ) => Promise<z.input<Registry[K]['response']>>;
};

// Los manejadores de los canales que solo existen en «Retenia (prueba)».
export function createDemoHandlers({ clock }: { clock: Clock }): DemoHandlers {
  return {
    'demo.state': async () => ({ today: studyDayOf(clock.now()) }),
  };
}
