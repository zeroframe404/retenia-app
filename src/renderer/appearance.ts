import type { ThemeChoice } from '../preload/contract/appearance';

// Aplica la apariencia elegida a toda la ventana, al instante: «Claro» y «Oscuro» fijan el tema en
// el atributo `data-theme` de la raíz; «Según el sistema» lo saca y el tema lo decide el sistema.
// Los tokens de color (`tokens.css`) leen ese atributo. Mientras cambia, las transiciones se
// apagan por un instante para que todo cambie junto y no se vea un desvanecido a medias.
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  root.dataset.themeSwitching = 'true';
  if (choice === 'system') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = choice;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      delete root.dataset.themeSwitching;
    });
  });
}
