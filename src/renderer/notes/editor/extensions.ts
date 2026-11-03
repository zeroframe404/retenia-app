import StarterKit from '@tiptap/starter-kit';
import { Formulas } from './formula-plugin';
import { Image, ImageInput } from './image';
import { Mention } from './mention';
import { MentionSuggestion, type MentionSuggestionOptions } from './mention-plugin';
import { Row, RowList, RowsDocument } from './rows';
import { UniqueBlockIds } from './unique-ids';

export interface EditorCallbacks {
  onOpenNote: (noteId: string) => void;
  onImageError: () => void;
  suggestion: MentionSuggestionOptions;
}

// Las piezas del editor: de Tiptap solo se usan el párrafo, el texto, el historial (Ctrl+Z y
// Ctrl+Y) y el cursor de soltado. Todo lo demás (negrita, títulos, citas, listas numeradas,
// saltos forzados…) está apagado: una nota son renglones de texto, enlaces e imágenes.
export function createExtensions({ onOpenNote, onImageError, suggestion }: EditorCallbacks) {
  return [
    RowsDocument,
    RowList,
    Row,
    StarterKit.configure({
      document: false,
      bulletList: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      blockquote: false,
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      hardBreak: false,
      link: false,
      gapcursor: false,
      trailingNode: false,
      dropcursor: { color: 'var(--color-marca)', width: 2 },
    }),
    Mention.configure({ onOpen: onOpenNote }),
    Image,
    UniqueBlockIds,
    Formulas,
    ImageInput.configure({ onError: onImageError }),
    MentionSuggestion.configure(suggestion),
  ];
}
