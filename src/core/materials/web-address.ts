// La dirección de una página web que se pega como material (H-28): solo http y https, sin claves
// en la dirección y sin nada más que la dirección. Sin esquema se supone https.

// El tope de una página web guardada (la que se baja y la que viene de un archivo .html).
export const MAX_WEB_BYTES = 5 * 1024 * 1024;

export type WebAddress = { ok: true; url: string } | { ok: false };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
const HOST_AND_PORT = /^[^\s/:]+:\d+(?:[/?#]|$)/u;
const LOOKS_LIKE_HOST = /^[^\s/?#]+\.[^\s/?#]+/u;

export function parseWebAddress(raw: string): WebAddress {
  const text = raw.trim();
  if (text === '' || /\s/u.test(text)) {
    return { ok: false };
  }
  let candidate: string;
  if (/^https?:\/\//iu.test(text)) {
    candidate = text;
  } else if (HAS_SCHEME.test(text) && !HOST_AND_PORT.test(text)) {
    return { ok: false };
  } else if (HOST_AND_PORT.test(text) || LOOKS_LIKE_HOST.test(text)) {
    candidate = `https://${text}`;
  } else {
    return { ok: false };
  }
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.hostname === '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return { ok: false };
    }
    return { ok: true, url: url.href };
  } catch {
    return { ok: false };
  }
}
