import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { type Clock, demoClock } from '../../core/clock';
import { studyDayOf } from '../../core/study-day';

// La fecha de «Retenia (prueba)»: el lunes 15/03/2027 más los días sumados con «+1 día», «+7 días»
// y «+35 días» en Ajustes › «Demostración»; «Restablecer fecha» vuelve a cero. Los días quedan en
// ajustes.json de la carpeta de datos, así sobreviven al cierre; «npm run datos:reiniciar»
// vacía la carpeta y la fecha vuelve sola. El reloj es vivo: lee los días en cada consulta, así
// lo que se guarda después de tocar un botón ya tiene la fecha nueva.

export interface DemoDate {
  readonly clock: Clock;
  today(): string;
  advance(days: 1 | 7 | 35): string;
  reset(): string;
  // «Procesar despacio» (Fase 13): una demora visible por página al leer un material. También queda
  // en ajustes.json, así sobrevive a cerrar Retenia a mitad de camino.
  slowProcessing(): boolean;
  setSlowProcessing(on: boolean): boolean;
}

const offsetSchema = z.number().int().nonnegative();

function readSettings(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createDemoDate(dataDir: string): DemoDate {
  const file = join(dataDir, 'ajustes.json');
  const stored = offsetSchema.safeParse(readSettings(file).demoDayOffset);
  let offset = stored.success ? stored.data : 0;
  let slow = readSettings(file).demoSlowProcessing === true;
  const clock: Clock = { now: () => demoClock(offset).now() };
  const today = () => studyDayOf(clock.now());
  // Se escribe aparte y se renombra: un corte nunca deja el archivo a medias.
  const save = (change: Record<string, unknown>) => {
    mkdirSync(dataDir, { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ ...readSettings(file), ...change })}\n`);
    renameSync(temporary, file);
  };
  return {
    clock,
    today,
    advance(days) {
      offset += days;
      save({ demoDayOffset: offset });
      return today();
    },
    slowProcessing: () => slow,
    setSlowProcessing(on) {
      slow = on;
      save({ demoSlowProcessing: slow });
      return slow;
    },
    reset() {
      offset = 0;
      save({ demoDayOffset: offset });
      return today();
    },
  };
}
