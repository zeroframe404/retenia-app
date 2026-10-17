import { texts } from '../../preload/contract/texts';
import { Dialog } from '../ui/Frame';

// Ctrl+K o «Buscar»: por ahora abre un cuadro sin búsqueda (el buscador llega en la Fase 12).
export function SearchDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={texts.nav.search} onClose={onClose}>
      <p>{texts.search.notAvailable}</p>
    </Dialog>
  );
}
