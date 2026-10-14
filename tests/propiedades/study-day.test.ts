import fc from 'fast-check';
import { describe, it } from 'vitest';
import { studyDayOf } from '../../src/core/study-day';

const SEED = 20270315;
const DAY_MS = 86_400_000;
// 04:00 de Buenos Aires son las 07:00 UTC (UTC−3 fijo desde 2009).
const CUTOFF_UTC_MS = 7 * 3_600_000;
const FIRST_DAY = Date.UTC(2010, 0, 1) / DAY_MS;
const LAST_DAY = Date.UTC(2100, 11, 31) / DAY_MS;

function isoDate(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

describe('día de estudio', () => {
  it('[CA-002] día de estudio: todo instante entre las 04:00 de un día y las 03:59:59 del siguiente cae en ese día', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: FIRST_DAY, max: LAST_DAY }),
        fc.integer({ min: 0, max: DAY_MS - 1 }),
        (dayNumber, offsetMs) => {
          const instant = new Date(dayNumber * DAY_MS + CUTOFF_UTC_MS + offsetMs);
          return studyDayOf(instant) === isoDate(dayNumber);
        },
      ),
      { seed: SEED, numRuns: 1000 },
    );
  });
});
