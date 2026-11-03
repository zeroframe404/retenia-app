// El cierre de la ventana, sin Electron adentro para poder probarlo. El primer cierre se frena y
// se pide guardar; mientras se guarda, otro cierre también se frena (antes se colaba y la ventana
// se cerraba sin terminar de guardar); cuando el guardado termina, o falla, se cierra de verdad.
export function createCloseGuard(flush: () => Promise<void>, closeWindow: () => void) {
  let state: 'open' | 'flushing' | 'flushed' = 'open';
  return {
    onClose(): 'allow' | 'prevent' {
      if (state === 'flushed') {
        return 'allow';
      }
      if (state === 'open') {
        state = 'flushing';
        void flush()
          .catch(() => undefined)
          .finally(() => {
            state = 'flushed';
            closeWindow();
          });
      }
      return 'prevent';
    },
  };
}
