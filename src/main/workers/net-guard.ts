// El guardián sin red del proceso de trabajo de materiales (Fase 13): es lo primero que carga el
// proceso. Desde acá:
// - ningún módulo de red ni de otros programas se puede cargar por «import» ni por «require»;
// - esos mismos módulos quedan sin sus funciones de conectarse o de abrir programas, así que
//   tampoco sirven si se los pide por otro camino (los módulos de Node son uno solo por proceso);
// - fetch, WebSocket y las conexiones de Node quedan anulados;
// - un hilo nuevo (worker_threads: lo usa el reconocimiento de escaneos) arranca con el mismo
//   guardián antes que su propio código, y no se aceptan hilos de código suelto.
// Un material es dato: nada de lo que trae puede hacer que este proceso salga a la red.
import childProcess from 'node:child_process';
import cluster from 'node:cluster';
import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import inspector from 'node:inspector';
import nodeModule, { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import threads from 'node:worker_threads';

type Loaded = Record<string, Record<string, unknown>>;

// Todo el guardián vive en esta función, sin nada de afuera más que los módulos que recibe: así se
// manda tal cual a cada hilo nuevo, que la corre antes que su propio código.
function installGuard(modules: Loaded): void {
  const BLOCKED = [
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
    'electron',
  ];
  const refuse = (what: string): never => {
    throw new Error(`Sin red: el proceso de materiales no puede usar «${what}»`);
  };
  const NEUTERED: Record<string, string[]> = {
    childProcess: ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'],
    dgram: ['createSocket'],
    http: ['request', 'get', 'createServer'],
    https: ['request', 'get', 'createServer'],
    http2: ['connect', 'createServer', 'createSecureServer'],
    tls: ['connect', 'createServer'],
    dns: ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'reverse'],
    cluster: ['fork', 'setupPrimary', 'setupMaster'],
    inspector: ['open', 'url'],
    net: ['connect', 'createConnection', 'createServer'],
  };
  for (const [name, functions] of Object.entries(NEUTERED)) {
    const loaded = modules[name];
    for (const fn of functions) {
      if (loaded && typeof loaded[fn] === 'function') {
        loaded[fn] = () => refuse(name);
      }
    }
  }
  const socket = (modules.net?.Socket as { prototype: Record<string, unknown> } | undefined)
    ?.prototype;
  if (socket) {
    socket.connect = () => refuse('net');
  }
  const promises = modules.dns?.promises as Record<string, unknown> | undefined;
  for (const fn of ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny']) {
    if (promises && typeof promises[fn] === 'function') {
      promises[fn] = () => refuse('dns');
    }
  }
  const registerHooks = modules.module?.registerHooks as
    | ((hooks: {
        resolve: (
          specifier: string,
          context: unknown,
          next: (specifier: string, context: unknown) => unknown,
        ) => unknown;
      }) => void)
    | undefined;
  registerHooks?.({
    resolve(specifier, context, next) {
      if (BLOCKED.includes(specifier.replace(/^node:/, '').split('/')[0] ?? '')) {
        refuse(specifier);
      }
      return next(specifier, context);
    },
  });
  globalThis.fetch = (async () => refuse('fetch')) as unknown as typeof fetch;
  globalThis.WebSocket = class {
    constructor() {
      refuse('WebSocket');
    }
  } as unknown as typeof WebSocket;
}

installGuard({
  module: nodeModule as unknown as Record<string, unknown>,
  net: net as unknown as Record<string, unknown>,
  childProcess: childProcess as unknown as Record<string, unknown>,
  dgram: dgram as unknown as Record<string, unknown>,
  http: http as unknown as Record<string, unknown>,
  https: https as unknown as Record<string, unknown>,
  http2: http2 as unknown as Record<string, unknown>,
  tls: tls as unknown as Record<string, unknown>,
  dns: dns as unknown as Record<string, unknown>,
  cluster: cluster as unknown as Record<string, unknown>,
  inspector: inspector as unknown as Record<string, unknown>,
});

// Lo que corre primero cada hilo nuevo: carga los mismos módulos y les pone el guardián.
const MODULES_IN_THREAD = Object.entries({
  module: 'node:module',
  net: 'node:net',
  childProcess: 'node:child_process',
  dgram: 'node:dgram',
  http: 'node:http',
  https: 'node:https',
  http2: 'node:http2',
  tls: 'node:tls',
  dns: 'node:dns',
  cluster: 'node:cluster',
  inspector: 'node:inspector',
})
  .map(([name, id]) => `${name}: require(${JSON.stringify(id)})`)
  .join(', ');
const guardInThread = `(${installGuard.toString()})({ ${MODULES_IN_THREAD} });`;

const OriginalWorker = threads.Worker;
class GuardedWorker extends OriginalWorker {
  constructor(
    filename: string | URL,
    options: ConstructorParameters<typeof OriginalWorker>[1] = {},
  ) {
    if (options?.eval) {
      throw new Error('Sin red: el proceso de materiales no arranca hilos de código suelto');
    }
    const target = filename instanceof URL ? fileURLToPath(filename) : String(filename);
    super(`${guardInThread}\nrequire(${JSON.stringify(target)});`, { ...options, eval: true });
  }
}
threads.Worker = GuardedWorker as unknown as typeof OriginalWorker;
syncBuiltinESMExports();
