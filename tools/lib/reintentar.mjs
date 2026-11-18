// El arranque del programa en la máquina de GitHub a veces se corta antes de abrir
// («electron.launch: WebSocket error: read ECONNRESET»). Se reintenta solo el arranque, hasta
// tres veces. Cualquier otro error (una comprobación de la prueba que falla) pasa de largo.
const ATTEMPTS = 3;

/** @param {number} ms */
const defaultPause = (ms) => new Promise((resume) => setTimeout(resume, ms));

/**
 * @template T
 * @param {() => Promise<T>} start
 * @param {{ pause?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function retryLaunch(start, { pause = defaultPause } = {}) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await start();
    } catch (error) {
      last = error;
      const isLaunch = error instanceof Error && error.message.includes('electron.launch');
      if (!isLaunch || attempt === ATTEMPTS) {
        throw error;
      }
      await pause(1000);
    }
  }
  throw last;
}
