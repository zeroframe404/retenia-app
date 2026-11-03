import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Clock } from '../../core/clock';
import { openWorkspace, type Workspace } from '../../data/workspace';
import { seedDemoCards, seedDemoOrganization } from './seed';

// Los datos de «Retenia (prueba)» (Ajustes › «Demostración»): el elenco de ejemplo o una base
// vacía, como la primera vez que se abre Retenia. La primera vez vive en una segunda carpeta de
// datos (`primera-vez` dentro de la de la demostración), con su propia base y sus propias copias,
// así volver al elenco no lo toca. El modo queda en `demo-modo.json` y se lee al abrir.

type DemoDataMode = 'cast' | 'first-time';

const modeSchema = z.strictObject({ mode: z.enum(['cast', 'first-time']) });

export interface DemoWorkspace {
  // Un espacio de trabajo que delega en el del modo vigente: quien lo usa no sabe que cambia.
  readonly workspace: Workspace;
  mode(): DemoDataMode;
  // Cierran la base de ahora (después de que terminen los pedidos en curso) y abren la otra.
  useFirstTime(): Promise<DemoDataMode>;
  useCast(): Promise<DemoDataMode>;
  close(): void;
}

function readMode(file: string): DemoDataMode {
  try {
    const parsed = modeSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data.mode : 'cast';
  } catch {
    return 'cast';
  }
}

// Se escribe aparte y se renombra: un corte nunca deja el archivo a medias.
function writeMode(dataDir: string, file: string, mode: DemoDataMode): void {
  mkdirSync(dataDir, { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ mode })}\n`);
  renameSync(temporary, file);
}

export function createDemoWorkspace({
  dataDir,
  clock,
  appVersion,
}: {
  dataDir: string;
  clock: Clock;
  appVersion: string;
}): DemoWorkspace {
  const file = join(dataDir, 'demo-modo.json');

  const openMode = (target: DemoDataMode): Workspace => {
    if (target === 'first-time') {
      return openWorkspace({ dataDir: join(dataDir, 'primera-vez'), clock, appVersion });
    }
    // El elenco: primero las tarjetas y después las materias; cada siembra se hace una sola vez.
    const opened = openWorkspace({ dataDir, clock, appVersion });
    try {
      seedDemoCards(opened.cards);
      seedDemoOrganization(opened);
    } catch (error) {
      opened.close();
      throw error;
    }
    return opened;
  };

  let mode = readMode(file);
  let active = openMode(mode);

  // Los pedidos con archivos que duran (copias) se anotan: cambiar de modo espera a que terminen,
  // y los que llegan mientras se cambia esperan a que termine el cambio.
  const inFlight = new Set<Promise<unknown>>();
  let switching: Promise<unknown> | null = null;

  const track = async <T>(task: (current: Workspace) => Promise<T>): Promise<T> => {
    while (switching !== null) {
      await switching.catch(() => undefined);
    }
    const pending = task(active);
    inFlight.add(pending);
    try {
      return await pending;
    } finally {
      inFlight.delete(pending);
    }
  };

  const change = (target: DemoDataMode): Promise<DemoDataMode> => {
    const before = switching ?? Promise.resolve();
    const run = before
      .catch(() => undefined)
      .then(async () => {
        if (target === mode) {
          return mode;
        }
        while (inFlight.size > 0) {
          await Promise.allSettled([...inFlight]);
        }
        // Se abre la otra primero: si no se puede, la de ahora sigue como estaba.
        const next = openMode(target);
        try {
          writeMode(dataDir, file, target);
        } catch (error) {
          next.close();
          throw error;
        }
        active.close();
        active = next;
        mode = target;
        return mode;
      });
    switching = run;
    const clear = () => {
      if (switching === run) {
        switching = null;
      }
    };
    run.then(clear, clear);
    return run;
  };

  const workspace: Workspace = {
    dataDir,
    get copiesDir() {
      return active.copiesDir;
    },
    get cards() {
      return active.cards;
    },
    get trash() {
      return active.trash;
    },
    get activity() {
      return active.activity;
    },
    get subjects() {
      return active.subjects;
    },
    get topics() {
      return active.topics;
    },
    get notes() {
      return active.notes;
    },
    get inbox() {
      return active.inbox;
    },
    get images() {
      return active.images;
    },
    verifyData: () => active.verifyData(),
    repairData: () => active.repairData(),
    integrityCheck: () => active.integrityCheck(),
    copiesFolder: () => active.copiesFolder(),
    backups: () => track((current) => current.backups()),
    createBackup: (kind) => track((current) => current.createBackup(kind)),
    ensureAutomaticBackup: () => track((current) => current.ensureAutomaticBackup()),
    restoreBackup: (backupId) => track((current) => current.restoreBackup(backupId)),
    close: () => active.close(),
  };

  return {
    workspace,
    mode: () => mode,
    useFirstTime: () => change('first-time'),
    useCast: () => change('cast'),
    close: () => active.close(),
  };
}
