import type { LucideIcon } from 'lucide-react';

// Íconos de trazo de la biblioteca Lucide. Un ícono con significado nunca va solo: este es
// siempre decorativo (el lector de pantalla lo salta), así que quien lo usa pone al lado un texto
// o, si solo se ve el ícono, una etiqueta accesible en el control que lo contiene.
export function Icon({ icon: Glyph }: { icon: LucideIcon }) {
  return <Glyph aria-hidden="true" focusable="false" size={20} strokeWidth={1.75} />;
}
