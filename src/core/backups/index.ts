import { compareIds } from '../ledger';
import { localDateTime } from '../study-day';

// Las copias de seguridad: cuándo toca una automática, cuáles se conservan y cómo se llaman.

// «auto»: la que hace Retenia al abrir. «manual»: «Hacer copia ahora». «before_restore»: la
// que se hace sí o sí antes de restaurar otra.
type BackupKind = 'auto' | 'manual' | 'before_restore';

export interface BackupStamp {
  readonly id: string;
  readonly kind: BackupKind;
  readonly createdAt: Date;
}

export const BACKUP_EXTENSION = '.retenia-copia';

// Una automática si la última copia (de cualquier tipo) tiene 24 horas o más. «Más de 24
// horas» se cuenta desde las 24 justas: «+1 día» de la demostración corre el reloj exactamente
// eso, y la copia del día siguiente tiene que aparecer (M04.8).
const AUTOMATIC_BACKUP_INTERVAL_MS = 24 * 3_600_000;

// Se conservan las 14 automáticas más nuevas. Las hechas a mano y las «Antes de restaurar» no
// se borran solas: las borrás vos desde la carpeta de copias.
export const AUTOMATIC_BACKUPS_KEPT = 14;

export function newestFirst<T extends BackupStamp>(backups: readonly T[]): T[] {
  return [...backups].sort((a, b) => {
    const byTime = b.createdAt.getTime() - a.createdAt.getTime();
    return byTime !== 0 ? byTime : compareIds(b.id, a.id);
  });
}

export function isAutomaticBackupDue(backups: readonly BackupStamp[], now: Date): boolean {
  const [latest] = newestFirst(backups);
  return (
    latest === undefined ||
    now.getTime() - latest.createdAt.getTime() >= AUTOMATIC_BACKUP_INTERVAL_MS
  );
}

export function automaticBackupsToPrune<T extends BackupStamp>(
  backups: readonly T[],
  keep: number = AUTOMATIC_BACKUPS_KEPT,
): T[] {
  return newestFirst(backups.filter((backup) => backup.kind === 'auto')).slice(keep);
}

const KIND_SLUGS: Record<BackupKind, string> = {
  auto: 'automatica',
  manual: 'hecha-por-vos',
  before_restore: 'antes-de-restaurar',
};

// «AAAA-MM-DD-HHMM-<tipo>-<8 caracteres>.retenia-copia»: fecha y hora de Buenos Aires, el tipo
// y el final del identificador, para que dos copias del mismo minuto no choquen.
export function backupFileName(backup: BackupStamp): string {
  const { day, time } = localDateTime(backup.createdAt);
  return `${day}-${time.replace(':', '')}-${KIND_SLUGS[backup.kind]}-${backup.id.slice(-8)}${BACKUP_EXTENSION}`;
}
