import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_BACKUPS_KEPT,
  automaticBackupsToPrune,
  BACKUP_EXTENSION,
  type BackupStamp,
  backupFileName,
  isAutomaticBackupDue,
  newestFirst,
} from '../../src/core/backups';
import { inBuenosAires } from '../apoyo/fechas';

// Las copias de seguridad: cuándo toca una automática, cuáles se conservan y cómo se llaman.

const HOUR_MS = 3_600_000;
const base = inBuenosAires('15/03/2027 10:00');
const stamp = (id: string, kind: BackupStamp['kind'], hoursAfter: number): BackupStamp => ({
  id,
  kind,
  createdAt: new Date(base.getTime() + hoursAfter * HOUR_MS),
});

describe('copias: cuándo se hace una automática', () => {
  it('[CA-021] sin ninguna copia, al abrir hace una', () => {
    expect(isAutomaticBackupDue([], base)).toBe(true);
  });

  it('[CA-021] con la última de hace 23:59 no; de hace 24:00 sí; de hace 25 horas sí', () => {
    const last = [stamp('a', 'auto', 0)];
    expect(isAutomaticBackupDue(last, new Date(base.getTime() + 24 * HOUR_MS - 60_000))).toBe(
      false,
    );
    expect(isAutomaticBackupDue(last, new Date(base.getTime() + 24 * HOUR_MS))).toBe(true);
    expect(isAutomaticBackupDue(last, new Date(base.getTime() + 25 * HOUR_MS))).toBe(true);
  });

  it('[CA-021] cuenta la última copia de cualquier tipo: una hecha a mano hoy alcanza', () => {
    const copies = [stamp('a', 'auto', 0), stamp('m', 'manual', 30)];
    expect(isAutomaticBackupDue(copies, new Date(base.getTime() + 31 * HOUR_MS))).toBe(false);
  });

  it('con el reloj atrasado respecto de la última copia no hace otra', () => {
    expect(isAutomaticBackupDue([stamp('a', 'auto', 48)], base)).toBe(false);
  });
});

describe('copias: cuáles se conservan', () => {
  it(`[CA-021] quedan las ${AUTOMATIC_BACKUPS_KEPT} automáticas más nuevas; se van las más viejas`, () => {
    const automatic = Array.from({ length: 16 }, (_, day) =>
      stamp(`a${String(day).padStart(2, '0')}`, 'auto', day * 24),
    );
    const pruned = automaticBackupsToPrune(automatic);
    expect(pruned.map((backup) => backup.id)).toEqual(['a01', 'a00']);
  });

  it('[CA-021] las copias hechas a mano y las «Antes de restaurar» no se borran nunca solas', () => {
    const copies = [
      ...Array.from({ length: 20 }, (_, day) => stamp(`a${day}`, 'auto', day * 24 + 100)),
      stamp('m', 'manual', 0),
      stamp('r', 'before_restore', 1),
    ];
    const pruned = automaticBackupsToPrune(copies);
    expect(pruned).toHaveLength(6);
    expect(pruned.every((backup) => backup.kind === 'auto')).toBe(true);
  });

  it('con 14 o menos automáticas no se borra nada', () => {
    const automatic = Array.from({ length: 14 }, (_, day) => stamp(`a${day}`, 'auto', day * 24));
    expect(automaticBackupsToPrune(automatic)).toEqual([]);
  });

  it('ordena de la más nueva a la más vieja y, en el mismo instante, por identificador', () => {
    const copies = [
      stamp('0194a', 'auto', 0),
      stamp('0194c', 'manual', 24),
      stamp('0194b', 'before_restore', 24),
    ];
    expect(newestFirst(copies).map((backup) => backup.id)).toEqual(['0194c', '0194b', '0194a']);
    expect(copies.map((backup) => backup.id)).toEqual(['0194a', '0194c', '0194b']);
  });
});

describe('copias: nombre del archivo', () => {
  it('[CA-019] lleva la fecha y la hora de Buenos Aires, el tipo y un pedazo del identificador', () => {
    const id = '0194f2a1-7b3c-7d4e-8f50-61728394a5b6';
    expect(backupFileName({ id, kind: 'manual', createdAt: base })).toBe(
      `2027-03-15-1000-hecha-por-vos-8394a5b6${BACKUP_EXTENSION}`,
    );
    expect(backupFileName({ id, kind: 'auto', createdAt: base })).toBe(
      `2027-03-15-1000-automatica-8394a5b6${BACKUP_EXTENSION}`,
    );
    expect(
      backupFileName({ id, kind: 'before_restore', createdAt: inBuenosAires('16/03/2027 02:30') }),
    ).toBe(`2027-03-16-0230-antes-de-restaurar-8394a5b6${BACKUP_EXTENSION}`);
    expect(BACKUP_EXTENSION).toBe('.retenia-copia');
  });
});
