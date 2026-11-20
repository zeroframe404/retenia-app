import { MAX_WEB_BYTES, parseWebAddress } from '../../core/materials/web-address';
import type { NetGate } from '../net-gate';

// Bajar una página web (Fase 14, H-28). La descarga la hace el proceso principal; lo que baja se
// entrega como texto a la cadena de lectura, que corre sin red. Retenia no se salta nada: una
// página que pide iniciar sesión o pagar queda como error, sin cookies, sin pasar por ningún
// intermediario y sin hacerse pasar por otro navegador.

export type Downloaded =
  | { ok: true; html: string }
  // Un motivo por el que esta página no sirve (queda en «Error»).
  | { ok: false; problem: 'webBlocked' | 'webNotPage' | 'tooLarge' | 'webUnreachable' }
  // No hubo forma de conectarse: queda pendiente hasta que haya conexión.
  | { ok: false; pending: true };

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;
const BLOCKED = new Set([401, 402, 403, 407, 451]);

function charsetOf(contentType: string, head: string): string {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/iu.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/iu.exec(head)?.[1];
  return (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
}

function decode(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  try {
    return new TextDecoder(charsetOf(contentType, head)).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function readCapped(response: Response): Promise<Uint8Array | null> {
  if (!response.body) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > MAX_WEB_BYTES) {
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function downloadPage(address: string, net: NetGate): Promise<Downloaded> {
  let url = address;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await net.fetch(url, {
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'es,en;q=0.8',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, pending: true };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      let next: ReturnType<typeof parseWebAddress> = { ok: false };
      try {
        next = location ? parseWebAddress(new URL(location, url).href) : { ok: false };
      } catch {
        next = { ok: false };
      }
      if (!next.ok) {
        return { ok: false, problem: 'webNotPage' };
      }
      url = next.url;
      continue;
    }
    if (BLOCKED.has(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, problem: 'webBlocked' };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, problem: 'webUnreachable' };
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/\b(?:x?html)\b/iu.test(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, problem: 'webNotPage' };
    }
    let bytes: Uint8Array | null;
    try {
      bytes = await readCapped(response);
    } catch {
      return { ok: false, pending: true };
    }
    if (bytes === null) {
      return { ok: false, problem: 'tooLarge' };
    }
    return { ok: true, html: decode(bytes, contentType) };
  }
  return { ok: false, problem: 'webNotPage' };
}
