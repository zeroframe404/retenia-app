// Lo último que usó la persona: el teclado o el mouse, anotado en `data-input` de la raíz. El
// navegador muestra el contorno del foco solo cuando cree que se usa el teclado, y no lo cuenta
// cuando la tecla viene con Ctrl: después de un clic, Ctrl y 3 movía el foco al título de la
// pantalla sin ningún contorno. `tokens.css` usa esta marca para mostrarlo siempre que lo último
// haya sido una tecla (cualquiera) y dejar al navegador decidir cuando fue un clic.
export function trackInputMode(root: HTMLElement = document.documentElement): () => void {
  const keyboard = () => {
    root.dataset.input = 'keyboard';
  };
  const pointer = () => {
    root.dataset.input = 'pointer';
  };
  window.addEventListener('keydown', keyboard, true);
  window.addEventListener('pointerdown', pointer, true);
  return () => {
    window.removeEventListener('keydown', keyboard, true);
    window.removeEventListener('pointerdown', pointer, true);
  };
}
