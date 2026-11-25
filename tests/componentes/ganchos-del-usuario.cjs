// Para las pruebas de pantalla (vitest.config.ts lo carga con --require en cada proceso de
// pruebas): cuando user-event pide su espera entre acciones (`dist/esm/utils/misc/wait.js`), Node
// le da tests/componentes/espera-del-usuario.cjs, que no duerme 15 ms en Windows (ahí está el
// porqué). Todo lo demás se resuelve como siempre.
const { registerHooks } = require('node:module');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const USER_EVENT_WAIT = /\/@testing-library\/user-event\/dist\/esm\/utils\/misc\/wait\.js$/;
const replacement = pathToFileURL(join(__dirname, 'espera-del-usuario.cjs')).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (USER_EVENT_WAIT.test(resolved.url)) {
      return { url: replacement, format: 'commonjs', shortCircuit: true };
    }
    return resolved;
  },
});
