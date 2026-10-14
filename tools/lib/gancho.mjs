// Lee el JSON que Claude Code le pasa a un gancho por la entrada estándar. No importa nada del
// proyecto, para que el gancho pueda arrancar aunque el resto de la red no cargue.
/** @returns {Promise<any>} */
export async function readHookInput() {
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  if (text.trim() === '') {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
