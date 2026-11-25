// Después de guardar una duda o de mandar una tarjeta a revisión, el cartel dice «La ves en Progreso
// › «Dudas y revisiones»»: la próxima vez que se abra Progreso, abre ahí (Fase 17). Si no, abre en
// «Objetivos».
export const PROGRESS_REVIEWS_EVENT = 'retenia:progreso-revisiones';

export function landOnReviews(): void {
  window.dispatchEvent(new Event(PROGRESS_REVIEWS_EVENT));
}
