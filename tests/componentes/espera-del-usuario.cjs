// La espera entre dos acciones del usuario simulado (user-event): entre tecla y tecla, y entre un
// clic y lo que sigue, cede el turno con `setTimeout(…, 0)` para que corra lo que quedó pendiente.
// En Windows, mientras ese temporizador espera, Node le pide al sistema que lo despierte, y el
// sistema lo despierta en su próxima vuelta de reloj: unos 15 ms, aunque el temporizador pida 1 ms
// (en Linux o Mac, 1 ms). En la red rápida eran más de 80 s de pruebas de pantalla esperando sin
// hacer nada. Acá la espera es el mismo `setTimeout(…, 0)`; mientras no llega, la cola de eventos
// sigue dando vueltas (con `setImmediate`) en lugar de dormir, así termina cuando el temporizador
// vence, como en Linux. Lo pendiente corre igual que antes, también las lecturas de disco.
// tests/componentes/ganchos-del-usuario.cjs pone este archivo en lugar del de user-event
// (`dist/esm/utils/misc/wait.js`), que es igual salvo por eso. Con otra espera, o con el reloj
// congelado por la prueba (`vi.useFakeTimers`), hace exactamente lo de siempre.

const realSetTimeout = globalThis.setTimeout;
const realSetImmediate = globalThis.setImmediate;

function zeroDelay() {
  return new Promise((resolve) => {
    let done = false;
    realSetTimeout(() => {
      done = true;
      resolve();
    }, 0);
    const keepTurning = () => {
      if (!done) {
        realSetImmediate(keepTurning);
      }
    };
    realSetImmediate(keepTurning);
  });
}

function wait(config) {
  const delay = config.delay;
  if (typeof delay !== 'number') {
    return;
  }
  return Promise.all([
    delay === 0 && globalThis.setTimeout === realSetTimeout
      ? zeroDelay()
      : new Promise((resolve) => globalThis.setTimeout(() => resolve(), delay)),
    config.advanceTimers(delay),
  ]);
}

exports.wait = wait;
