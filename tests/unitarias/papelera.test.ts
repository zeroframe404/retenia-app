import { describe, expect, it } from 'vitest';
import { isTrashExpired, TRASH_DAYS, trashExpiry } from '../../src/core/trash';
import { inBuenosAires } from '../apoyo/fechas';

describe('papelera: 30 días', () => {
  it('[CA-022] lo eliminado el 15/03/2027 10:00 queda en la papelera hasta el 14/04/2027 10:00', () => {
    expect(TRASH_DAYS).toBe(30);
    expect(trashExpiry(inBuenosAires('15/03/2027 10:00'))).toEqual(
      inBuenosAires('14/04/2027 10:00'),
    );
  });

  it('[CA-022] vence justo a los 30 días, ni un minuto antes', () => {
    const expires = trashExpiry(inBuenosAires('15/03/2027 10:00'));
    expect(isTrashExpired(expires, inBuenosAires('14/04/2027 09:59'))).toBe(false);
    expect(isTrashExpired(expires, inBuenosAires('14/04/2027 10:00'))).toBe(true);
    expect(isTrashExpired(expires, inBuenosAires('19/04/2027 10:00'))).toBe(true);
  });

  it('no depende de la fecha que recibe: el vencimiento es una fecha nueva', () => {
    const deleted = inBuenosAires('15/03/2027 10:00');
    const expires = trashExpiry(deleted);
    expires.setUTCFullYear(1999);
    expect(deleted).toEqual(inBuenosAires('15/03/2027 10:00'));
  });
});
