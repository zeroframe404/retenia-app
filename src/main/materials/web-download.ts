import { MAX_WEB_BYTES } from '../../core/materials/web-address';
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

// Un error de la red que dice que una redirección no es segura (otro esquema, demasiadas vueltas):
// la página no sirve; no es que falte conexión.
const UNSAFE_REDIRECT =
  /UNSAFE_REDIRECT|TOO_MANY_REDIRECTS|unknown scheme|scheme must be|Redirect was cancelled|redirect count exceeded/i;

function describeError(error: unknown): string {
  const cause = (error as { cause?: unknown } | null)?.cause;
  return `${String(error)} ${String(cause ?? '')}`;
}

export async function downloadPage(address: string, net: NetGate): Promise<Downloaded> {
  let response: Response;
  try {
    // Las redirecciones las sigue la red (solo a direcciones http o https: una a otro esquema falla
    // sola, y con eso no se pasa a un archivo del disco).
    response = await net.fetch(address, {
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'es,en;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (UNSAFE_REDIRECT.test(describeError(error))) {
      return { ok: false, problem: 'webNotPage' };
    }
    // Sin conexión (simulada o del sistema) espera; con conexión, una dirección que no responde (mal
    // escrita, un servidor caído, uno lento) es un error con su motivo, no una espera sin fin.
    return net.isOffline()
      ? { ok: false, pending: true }
      : { ok: false, problem: 'webUnreachable' };
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
    return net.isOffline()
      ? { ok: false, pending: true }
      : { ok: false, problem: 'webUnreachable' };
  }
  if (bytes === null) {
    return { ok: false, problem: 'tooLarge' };
  }
  return { ok: true, html: decode(bytes, contentType) };
}
