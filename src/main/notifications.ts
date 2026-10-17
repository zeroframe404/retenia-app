// Los avisos de Windows (docs/arquitectura.md, sección 8): una envoltura de la notificación de
// Electron para que el contrato pueda probar qué se muestra y qué pasa al tocarlo sin depender de
// Windows (el doble está declarado en docs/plan-de-pruebas.md). Tocar el aviso trae Retenia al
// frente. Se guarda una referencia a cada aviso mostrado hasta que lo tocan: si no, Electron lo
// puede soltar y el toque se pierde. Windows avisa «close» también cuando lo saca de la pantalla y
// lo pasa al centro de notificaciones, donde todavía se puede tocar: eso no lo suelta.

export interface NotificationLike {
  show(): void;
  on(event: string, listener: () => void): unknown;
}

export interface Notifier {
  show(content: { title: string; body: string }): Promise<{ shown: boolean }>;
  // Cuántos avisos mostrados siguen esperando un toque.
  held(): number;
}

export function createNotifier({
  create,
  bringToFront,
  timeoutMs = 10_000,
}: {
  create: (options: { title: string; body: string }) => NotificationLike;
  bringToFront: () => void;
  timeoutMs?: number;
}): Notifier {
  const alive = new Set<NotificationLike>();
  return {
    held: () => alive.size,
    show({ title, body }) {
      return new Promise((resolve) => {
        const notification = create({ title, body });
        alive.add(notification);
        let settled = false;
        const settle = (shown: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          if (!shown) {
            alive.delete(notification);
          }
          resolve({ shown });
        };
        // Si Windows no contesta, se toma como que no lo mostró.
        const timer = setTimeout(() => settle(false), timeoutMs);
        notification.on('show', () => settle(true));
        notification.on('failed', () => settle(false));
        notification.on('click', () => {
          alive.delete(notification);
          bringToFront();
        });
        notification.show();
      });
    },
  };
}
