// La Papelera: lo eliminado se puede restaurar durante 30 días; después se borra para siempre
// (el historial de repasos queda).

export const TRASH_DAYS = 30;

const DAY_MS = 86_400_000;

export function trashExpiry(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_DAYS * DAY_MS);
}

export function isTrashExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
