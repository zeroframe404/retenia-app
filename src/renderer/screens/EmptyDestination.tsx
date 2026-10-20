import { texts } from '../../preload/contract/texts';
import { ScreenFrame } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';

// Un destino del riel cuyo contenido llega en otra fase (Estudiar, Materiales, Idiomas y
// Progreso): su título y un estado vacío diseñado que dice «Todavía no disponible» y lleva a lo que
// sí se puede hacer hoy. La acción es el único botón primario de la pantalla.
export function EmptyDestination({
  title,
  phrase,
  focusTitle,
  onGoToNotes,
}: {
  title: string;
  phrase: string;
  focusTitle?: boolean;
  onGoToNotes: () => void;
}) {
  return (
    <ScreenFrame title={title} focusTitle={focusTitle ?? false}>
      <ViewState
        kind="empty"
        phrase={phrase}
        action={{ text: texts.screens.goToNotes, onClick: onGoToNotes, primary: true }}
      />
    </ScreenFrame>
  );
}
