import { type Clock, demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase, type ReteniaDatabase } from '../../src/data/database';
import { createHandlers, handleMessage, type Variant } from '../../src/main/bridge';
import { buildApi, type Invoke } from '../../src/preload/api';
import { tempDataFolder } from './base';

export interface TestBridge {
  api: ReturnType<typeof buildApi>;
  handlers: ReturnType<typeof createHandlers>;
  db: ReteniaDatabase;
  file: string;
  // Cada mensaje que salió de la ventana hacia el principal, en orden.
  sent: { channel: string; request: unknown }[];
  close: () => void;
}

// El puente armado como en Retenia: el manejador real del principal con una base real en un
// archivo temporal y, del otro lado, window.retenia. Lo único que falta es Electron en el medio.
export function openBridge({
  clock = demoClock(),
  variant = 'prueba',
}: {
  clock?: Clock;
  variant?: Variant;
} = {}): TestBridge {
  const data = tempDataFolder();
  const db = openDatabase(data.file);
  const handlers = createHandlers({
    clock,
    variant,
    cards: createCardsStore(db, clock),
    dataDir: data.folder,
    version: '0.0.0-prueba',
  });
  const sent: TestBridge['sent'] = [];
  const invoke: Invoke = async (channel, request) => {
    sent.push({ channel, request });
    return handleMessage(handlers, channel, request);
  };
  return {
    api: buildApi(invoke),
    handlers,
    db,
    file: data.file,
    sent,
    close: () => {
      db.close();
      data.remove();
    },
  };
}
