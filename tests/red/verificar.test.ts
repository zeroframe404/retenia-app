import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readProjectSpec } from '../../tools/lib/especificacion.mjs';
import { closedPhaseTags, currentPhase } from '../../tools/lib/fases.mjs';
import { listTitles } from '../../tools/lib/listado.mjs';
import { npmCliPath, ROOT, run } from '../../tools/lib/proceso.mjs';
import { criteriaInTitle } from '../../tools/lib/resultados.mjs';
import { cleanEnv } from '../apoyo/red';

const GREEN =
  /^VERDE · (\d+) pruebas? · 0 fallas · 0 salteadas · (\d+) de (\d+) criterios? cubiertos?$/;

describe('npm run verificar', () => {
  // Los informes de la corrida medida van donde los deja «npm run verificar» de verdad: en
  // .cache, dentro del proyecto. En el CI la carpeta temporal del sistema está en otro disco,
  // más lento, y la medición no sería la del uso real.
  mkdirSync(join(ROOT, '.cache', 'red'), { recursive: true });
  const runDir = mkdtempSync(join(ROOT, '.cache', 'red', 'medida-'));
  afterAll(() => rmSync(runDir, { recursive: true, force: true }));

  it('[CA-001] «npm run verificar» termina en menos de 2 minutos con una sola línea de veredicto VERDE con las cifras reales', async () => {
    const r = await run(process.execPath, [npmCliPath(), 'run', 'verificar'], {
      cwd: ROOT,
      env: cleanEnv({ RETENIA_RUN_DIR: runDir }),
      timeoutMs: 600_000,
    });
    const lines = r.stdout.trimEnd().split(/\r?\n/);
    const last = lines.at(-1) ?? '';
    expect(lines.filter((l) => /^(VERDE|ROJO) · /.test(l))).toEqual([last]);
    const figures = GREEN.exec(last);
    expect(figures, last).not.toBeNull();
    const [, tests, covered, criteria] = (figures ?? []).map(Number);
    expect(r.code).toBe(0);

    // Menos de 2 minutos en esta PC, medido por la propia red. En el CI (GitHub define CI)
    // el tope es tres veces mayor, como el de los demás topes de rendimiento: sus máquinas
    // son unas diez veces más lentas y la red rápida ya rondaba los 2 minutos (decidido con
    // el dueño el 20/10/2026).
    const result = JSON.parse(readFileSync(join(runDir, 'resultado.json'), 'utf8'));
    expect(result.durationMs).toBeLessThan(process.env.CI ? 360_000 : 120_000);

    // Las pruebas: las del informe real de Vitest de esa corrida.
    const report = JSON.parse(readFileSync(join(runDir, 'pruebas.json'), 'utf8'));
    expect(tests).toBe(report.numPassedTests);
    expect(report.numTotalTests).toBe(report.numPassedTests);

    // Los criterios: los de las fases cerradas y la en curso, contados acá por separado.
    const spec = readProjectSpec(ROOT);
    const phases = [
      ...(await closedPhaseTags(ROOT)).map((t) => t.number),
      await currentPhase(ROOT),
    ];
    const considered = spec.phases
      .filter((p) => phases.includes(p.number))
      .flatMap((p) => p.criteria);
    const { titles } = await listTitles({ env: cleanEnv() });
    const withTest = new Set(titles.flatMap((t) => criteriaInTitle(t.title)));
    expect(criteria).toBe(considered.length);
    expect(covered).toBe(considered.filter((id) => withTest.has(id)).length);
  });
});
