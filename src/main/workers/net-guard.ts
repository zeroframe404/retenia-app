// El guardián sin red del proceso de trabajo de materiales (Fase 13): es lo primero que carga el
// proceso. Desde acá, ningún módulo de red ni de otros programas se puede cargar, y fetch,
// WebSocket y las conexiones de Node quedan anulados. Un material es dato: nada de lo que trae puede
// hacer que este proceso salga a la red.
import { registerHooks } from 'node:module';
import net from 'node:net';

const BLOCKED = new Set([
  'net',
  'tls',
  'http',
  'https',
  'http2',
  'dns',
  'dgram',
  'child_process',
  'cluster',
  'inspector',
]);

const bare = (specifier: string) => specifier.replace(/^node:/, '').split('/')[0] ?? '';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (BLOCKED.has(bare(specifier))) {
      throw new Error(`Sin red: el proceso de materiales no puede cargar «${specifier}»`);
    }
    return nextResolve(specifier, context);
  },
});

const refuse = () => {
  throw new Error('Sin red: el proceso de materiales no puede conectarse');
};

// `net` ya está cargado por Node: se anulan sus conexiones.
net.Socket.prototype.connect = refuse as unknown as typeof net.Socket.prototype.connect;
net.connect = refuse as unknown as typeof net.connect;
net.createConnection = refuse as unknown as typeof net.createConnection;

globalThis.fetch = (async () => refuse()) as unknown as typeof fetch;
globalThis.WebSocket = class {
  constructor() {
    refuse();
  }
} as unknown as typeof WebSocket;
