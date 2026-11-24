import type { Activity } from './types';

// La «Respuesta» que se guarda de un ejercicio que no es de respuesta corta: un resumen de la
// referencia, que sale siempre de la actividad (es lo que se busca, se exporta y se muestra como
// solución). La respuesta corta usa la que escribiste.
export function referenceText(activity: Activity): string | null {
  switch (activity.type) {
    case 'short':
      return null;
    case 'numeric':
      return `${String(activity.value).replace('.', ',')}${activity.unit === null ? '' : ` ${activity.unit}`}`;
    case 'options':
      return activity.options.find((option) => option.correct)?.text ?? null;
    case 'order':
      return activity.steps.map((step) => step.text).join(' · ');
    case 'open':
      return activity.units.map((unit) => unit.text).join(' · ');
  }
}
