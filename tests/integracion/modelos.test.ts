import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MODEL_FILES, MODELS_ORIGIN, type ModelFile } from '../../src/main/models/manifest';
import { createModelStore, ModelsError } from '../../src/main/models/store';

// La descarga única de los modelos de voz (CA-024) contra un servidor local de verdad, que hace
// de la página de modelos: la red es una frontera externa (docs/plan-de-pruebas.md). El servidor
// sabe cortar una descarga a la mitad y entregar un archivo cambiado.

// Bytes con semilla fija, distintos para cada archivo.
function bytes(size: number, seed: number): Buffer {
  const out = Buffer.alloc(size);
  let state = seed;
  for (let i = 0; i < size; i++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out[i] = state >> 16;
  }
  return out;
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const CONTENT: Record<string, Buffer> = {
  'kokoro/modelo.onnx': bytes(200_000, 1),
  'whisper/encoder.onnx': bytes(120_000, 2),
};

function manifest(): ModelFile[] {
  return Object.entries(CONTENT).map(([path, data]) => ({
    path,
    source: 'pruebas/modelos',
    revision: 'a'.repeat(40),
    file: path.split('/').at(-1) ?? path,
    size: data.length,
    sha256: sha256(data),
  }));
}

interface Seen {
  file: string;
  range: string | undefined;
}

interface Fake {
  origin: string;
  seen: Seen[];
  // Lo que el servidor hace con un archivo: entregarlo entero (lo normal), cortarlo después de
  // tantos bytes o entregar otra cosa del mismo tamaño.
  behaviour: Map<string, { cutAfter?: number; tampered?: boolean; status?: number }>;
  close: () => Promise<void>;
}

const servers: Server[] = [];
const folders: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise((done) => server.close(done));
  }
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

async function fakeServer(): Promise<Fake> {
  const seen: Seen[] = [];
  const behaviour: Fake['behaviour'] = new Map();
  const server = createServer((request, response) => {
    const file =
      decodeURIComponent(request.url ?? '')
        .split('/')
        .at(-1) ?? '';
    const range = request.headers.range;
    seen.push({ file, range });
    const entry = Object.entries(CONTENT).find(([path]) => path.endsWith(`/${file}`));
    const how = behaviour.get(file) ?? {};
    if (!entry || how.status) {
      response.writeHead(how.status ?? 404).end();
      return;
    }
    const full = how.tampered ? bytes(entry[1].length, 99) : entry[1];
    const start = range ? Number(/^bytes=(\d+)-$/.exec(range)?.[1] ?? 0) : 0;
    const body = full.subarray(start);
    response.writeHead(
      range ? 206 : 200,
      range
        ? {
            'Content-Length': body.length,
            'Content-Range': `bytes ${start}-${full.length - 1}/${full.length}`,
          }
        : { 'Content-Length': body.length },
    );
    if (how.cutAfter !== undefined) {
      behaviour.delete(file);
      response.write(body.subarray(0, how.cutAfter), () => response.destroy());
      return;
    }
    response.end(body);
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    seen,
    behaviour,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

function folder(): string {
  const created = mkdtempSync(join(tmpdir(), 'retenia-modelos-'));
  folders.push(created);
  return created;
}

const TOTAL = Object.values(CONTENT).reduce((sum, data) => sum + data.length, 0);

describe('descarga única de los modelos', () => {
  it('[CA-024] baja los modelos que faltan con un avance que crece, verifica cada huella y quedan listos', async () => {
    const server = await fakeServer();
    const dir = folder();
    const store = createModelStore({ dir, files: manifest(), origin: server.origin });
    expect(store.status()).toEqual({ ready: false, doneBytes: 0, totalBytes: TOTAL });

    const progress: number[] = [];
    await store.download({ onProgress: ({ doneBytes }) => progress.push(doneBytes) });
    expect(progress.length).toBeGreaterThan(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(TOTAL);
    expect(store.status()).toEqual({ ready: true, doneBytes: TOTAL, totalBytes: TOTAL });
    for (const [path, data] of Object.entries(CONTENT)) {
      expect(readFileSync(join(dir, path)).equals(data)).toBe(true);
    }
    // Nada a medias en la carpeta: solo los modelos y el registro de lo verificado.
    expect(readdirSync(dir).sort()).toEqual(['kokoro', 'verificados.json', 'whisper']);
  });

  it('[CA-024] rechaza un modelo cuya huella no coincide: no lo deja en la carpeta y avisa que llegó dañado', async () => {
    const server = await fakeServer();
    server.behaviour.set('encoder.onnx', { tampered: true });
    const dir = folder();
    const store = createModelStore({ dir, files: manifest(), origin: server.origin });
    await expect(store.download({})).rejects.toEqual(new ModelsError('corrupt'));
    expect(existsSync(join(dir, 'whisper', 'encoder.onnx'))).toBe(false);
    expect(readdirSync(dir)).not.toContain('.descargas');
    // El otro sí llegó bien y queda verificado.
    expect(store.status()).toEqual({ ready: false, doneBytes: 200_000, totalBytes: TOTAL });
  });

  it('[CA-024] un modelo cambiado después de bajarlo deja de estar listo y se vuelve a bajar solo ese', async () => {
    const server = await fakeServer();
    const dir = folder();
    const store = createModelStore({ dir, files: manifest(), origin: server.origin });
    await store.download({});
    const altered = Buffer.from(CONTENT['kokoro/modelo.onnx'] ?? Buffer.alloc(0));
    altered[1000] = (altered[1000] ?? 0) ^ 0xff;
    writeFileSync(join(dir, 'kokoro', 'modelo.onnx'), altered);
    expect(store.status().ready).toBe(false);

    server.seen.length = 0;
    await store.download({});
    expect(server.seen.map((s) => s.file)).toEqual(['modelo.onnx']);
    expect(store.status().ready).toBe(true);
    expect(
      readFileSync(join(dir, 'kokoro', 'modelo.onnx')).equals(
        CONTENT['kokoro/modelo.onnx'] ?? Buffer.alloc(0),
      ),
    ).toBe(true);
  });

  it('[CA-024] si se corta la conexión a mitad, la próxima vez sigue desde donde quedó', async () => {
    const server = await fakeServer();
    server.behaviour.set('modelo.onnx', { cutAfter: 64_000 });
    const dir = folder();
    const store = createModelStore({ dir, files: manifest(), origin: server.origin });
    await expect(store.download({})).rejects.toEqual(new ModelsError('offline'));
    expect(store.status().ready).toBe(false);

    server.seen.length = 0;
    await store.download({});
    const resumed = server.seen.find((s) => s.file === 'modelo.onnx');
    expect(resumed?.range).toMatch(/^bytes=\d+-$/);
    expect(Number(/\d+/.exec(resumed?.range ?? '')?.[0])).toBeGreaterThan(0);
    expect(store.status().ready).toBe(true);
    expect(
      readFileSync(join(dir, 'kokoro', 'modelo.onnx')).equals(
        CONTENT['kokoro/modelo.onnx'] ?? Buffer.alloc(0),
      ),
    ).toBe(true);
  });

  it('[CA-024] sin conexión avisa que falta internet y no deja nada a medias', async () => {
    const server = await fakeServer();
    await server.close();
    servers.length = 0;
    const dir = folder();
    const store = createModelStore({ dir, files: manifest(), origin: server.origin });
    await expect(store.download({})).rejects.toEqual(new ModelsError('offline'));
    expect(store.status()).toEqual({ ready: false, doneBytes: 0, totalBytes: TOTAL });
  });

  it('[CA-024] con «Simular sin conexión» avisa que falta internet sin salir a la red', async () => {
    const server = await fakeServer();
    const store = createModelStore({ dir: folder(), files: manifest(), origin: server.origin });
    await expect(store.download({ offline: true })).rejects.toEqual(new ModelsError('offline'));
    expect(server.seen).toEqual([]);
  });

  it('[CA-024] si el servidor no tiene el archivo, lo dice aparte de la falta de conexión', async () => {
    const server = await fakeServer();
    server.behaviour.set('modelo.onnx', { status: 404 });
    const store = createModelStore({ dir: folder(), files: manifest(), origin: server.origin });
    await expect(store.download({})).rejects.toEqual(new ModelsError('server'));
  });

  it('[CA-024] sin lugar en el disco no empieza a bajar', async () => {
    const server = await fakeServer();
    const store = createModelStore({
      dir: folder(),
      files: manifest(),
      origin: server.origin,
      freeSpace: () => 1000,
    });
    await expect(store.download({})).rejects.toEqual(new ModelsError('disk'));
    expect(server.seen).toEqual([]);
  });

  it('[CA-024] el manifiesto real fija cada archivo de Kokoro y de Whisper con su fuente, su tamaño y su huella, entre 300 y 600 MB en total', () => {
    expect(MODELS_ORIGIN).toBe('https://huggingface.co');
    const paths = MODEL_FILES.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('kokoro/model.int8.onnx');
    expect(paths).toContain('kokoro/voices.bin');
    expect(paths).toContain('whisper/small-encoder.int8.onnx');
    expect(paths).toContain('whisper/small-decoder.int8.onnx');
    for (const file of MODEL_FILES) {
      expect(file.source).toMatch(
        /^csukuangfj\/(kokoro-int8-multi-lang-v1_0|sherpa-onnx-whisper-small)$/,
      );
      expect(file.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.size).toBeGreaterThan(0);
    }
    const total = MODEL_FILES.reduce((sum, f) => sum + f.size, 0);
    expect(total).toBeGreaterThan(300_000_000);
    expect(total).toBeLessThan(600_000_000);
  });
});
