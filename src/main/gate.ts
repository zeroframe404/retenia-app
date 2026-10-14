// La compuerta de los pedidos de la ventana. Casi todos son comunes y pueden correr a la vez;
// restaurar una copia es exclusivo: cierra la base, la reemplaza y la vuelve a abrir, así que
// espera a que terminen los que están en curso y los que llegan después esperan a que termine.
// Los que esperan siguen en el orden en que llegaron.

export interface Gate {
  shared<T>(task: () => Promise<T> | T): Promise<T>;
  exclusive<T>(task: () => Promise<T> | T): Promise<T>;
}

export function createGate(): Gate {
  let readers = 0;
  let writing = false;
  const waiting: { exclusive: boolean; start: () => void }[] = [];

  const pump = () => {
    while (waiting.length > 0) {
      const next = waiting[0];
      if (next === undefined || writing) {
        return;
      }
      if (next.exclusive) {
        if (readers > 0) {
          return;
        }
        writing = true;
      } else {
        readers += 1;
      }
      waiting.shift();
      next.start();
    }
  };

  const run = async <T>(exclusive: boolean, task: () => Promise<T> | T): Promise<T> => {
    await new Promise<void>((start) => {
      waiting.push({ exclusive, start });
      pump();
    });
    try {
      return await task();
    } finally {
      if (exclusive) {
        writing = false;
      } else {
        readers -= 1;
      }
      pump();
    }
  };

  return {
    shared: (task) => run(false, task),
    exclusive: (task) => run(true, task),
  };
}
