import { join } from 'node:path';
import { cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { AiProvider } from '../../src/ai/provider';
import type { Clock } from '../../src/core/clock';
import type { SecretBox } from '../../src/main/ai/key-store';
import { handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { createDemoAi, type DemoAi } from '../../src/main/demo/ai';
import { createDemoDate } from '../../src/main/demo/clock';
import { createNetGate, type NetGate } from '../../src/main/net-gate';
import { buildApi } from '../../src/preload/api';
import { demoChannels } from '../../src/preload/contract/demo';
import { testSecretBox } from '../apoyo/caja-segura';
import { sample } from '../apoyo/materiales';
import { openBridge, type TestBridge } from '../apoyo/puente';

// La ventana entera (App) contra el puente real y una carpeta de datos real, para las pruebas de
// las pantallas de Apuntes, materias, primera vez y Bandeja. Cada prueba abre la suya.

const bridges: TestBridge[] = [];

export function openWindow(
  variant: 'prueba' | 'real' = 'real',
  clock?: Clock,
  {
    withCast = false,
    holdExtraction,
    net,
    ai,
  }: {
    withCast?: boolean | 'tarjetas';
    holdExtraction?: () => Promise<void>;
    net?: NetGate;
    // La IA (Fase 19), con sus dobles declarados: el almacén seguro de prueba, la IA simulada «como
    // IA remota» con tu clave (`remote`) y, en la variante de prueba, la de la demostración.
    ai?: { remote?: (apiKey: string) => AiProvider; box?: SecretBox };
  } = {},
) {
  vi.stubGlobal('__VARIANTE__', variant);
  let demoAi: DemoAi | null = null;
  const aiNet = ai ? (net ?? createNetGate()) : net;
  const bridge = openBridge({
    ...(clock === undefined ? {} : { clock }),
    withCast,
    ...(holdExtraction ? { holdExtraction } : {}),
    ...(aiNet ? { net: aiNet } : {}),
    ...(ai
      ? {
          ai: {
            box: ai.box ?? testSecretBox(),
            ...(ai.remote ? { remote: ai.remote } : {}),
            simulated: () => demoAi?.provider() ?? null,
          },
        }
      : {}),
  });
  bridges.push(bridge);
  // El puente de archivos (simulado): en jsdom un archivo elegido no tiene ruta en el disco, así
  // que el doble lo busca por su nombre en datos-de-ejemplo. El de verdad la saca con
  // `webUtils.getPathForFile` (src/preload/index.ts).
  window.reteniaArchivos = {
    agregar: (files, { subjectId, title }) =>
      bridge.files['materials.addFiles']({
        paths: files.map((file) => sample(file.name)),
        subjectId,
        ...(title ? { title } : {}),
      }),
  };
  window.reteniaAvisos = { alRecibir: (listener) => bridge.subscribe(listener) };
  let api: unknown = bridge.api;
  if (variant === 'prueba') {
    const demo = createDemoDate(bridge.dataDir);
    demoAi = createDemoAi({
      dataDir: bridge.dataDir,
      samplesDir: join(import.meta.dirname, '..', '..', 'datos-de-ejemplo'),
      isOffline: () => aiNet?.isOffline() ?? false,
    });
    const demoHandlers = createDemoHandlers(demo, undefined, demoAi);
    const registry = demoChannels();
    const demoApi = buildApi(
      (channel, request) => handleMessage(demoHandlers, channel, request, registry),
      registry,
    );
    api = {
      ...bridge.api,
      ...demoApi,
      'demo.connection': async () => ({ offline: false }),
      'demo.setConnection': async ({ offline }: { offline: boolean }) => ({ offline }),
    };
  }
  window.retenia = api as typeof window.retenia;
  return { bridge, api: bridge.api, user: userEvent.setup(), net: aiNet };
}

// Un puente más con su propia carpeta de datos: para probar el cambio de datos de la demostración.
export function openExtraBridge(): TestBridge {
  const bridge = openBridge();
  bridges.push(bridge);
  return bridge;
}

export function closeWindows() {
  cleanup();
  vi.unstubAllGlobals();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
}

type Api = TestBridge['api'];

// «Estadística básica» (activa) y «Historia argentina» (en mantenimiento).
export async function seedSubjects(api: Api) {
  const statistics = await api['subjects.create']({ name: 'Estadística básica', makeActive: true });
  const history = await api['subjects.create']({ name: 'Historia argentina', makeActive: false });
  return { statistics, history };
}

// Una nota con título (nace con un renglón vacío; el título se guarda con `notes.save`).
export async function seedNote(
  api: Api,
  {
    subjectId,
    topicId = null,
    title,
  }: { subjectId: string; topicId?: string | null; title: string },
) {
  const note = await api['notes.create']({ subjectId, topicId });
  await api['notes.save']({ noteId: note.id, title, blocks: note.blocks });
  return note;
}
