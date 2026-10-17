import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { MODEL_FILES } from '../../src/main/models/manifest';

// Un servidor local que hace de página de modelos para la punta a punta y el programa instalado:
// sirve los modelos de voz de desarrollo (ya bajados y verificados) con las mismas direcciones
// que la página real, así Retenia baja, verifica la huella y guarda igual que con internet. La
// red es una frontera externa (docs/plan-de-pruebas.md). Entiende «Range», para reanudar.
export async function serveModels(dir: string) {
  const byUrl = new Map(
    MODEL_FILES.map((f) => [`/${f.source}/resolve/${f.revision}/${f.file}`, join(dir, f.path)]),
  );
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const url = decodeURIComponent(request.url ?? '');
    requests.push(url);
    const file = byUrl.get(url);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    const size = statSync(file).size;
    const start = Number(/^bytes=(\d+)-$/.exec(request.headers.range ?? '')?.[1] ?? 0);
    response.writeHead(start > 0 ? 206 : 200, {
      'Content-Length': size - start,
      ...(start > 0 ? { 'Content-Range': `bytes ${start}-${size - 1}/${size}` } : {}),
    });
    createReadStream(file, { start }).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
