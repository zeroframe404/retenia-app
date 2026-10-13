import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { leerEspecificacionDelProyecto } from '../../tools/lib/especificacion.mjs';
import { faseEnCurso, tagsDeFasesCerradas } from '../../tools/lib/fases.mjs';
import { listarTitulos } from '../../tools/lib/listado.mjs';
import { correr, RAIZ, rutaDeNpm } from '../../tools/lib/proceso.mjs';
import { criteriosDelTitulo } from '../../tools/lib/resultados.mjs';
import { entornoLimpio } from '../apoyo/red';

const VERDE =
  /^VERDE · (\d+) pruebas? · 0 fallas · 0 salteadas · (\d+) de (\d+) criterios? cubiertos?$/;

describe('npm run verificar', () => {
  const corrida = mkdtempSync(join(tmpdir(), 'retenia-verificar-'));
  afterAll(() => rmSync(corrida, { recursive: true, force: true }));

  it('[CA-001] «npm run verificar» termina en menos de 2 minutos con una sola línea de veredicto VERDE con las cifras reales', async () => {
    const r = await correr(process.execPath, [rutaDeNpm(), 'run', 'verificar'], {
      cwd: RAIZ,
      env: entornoLimpio({ RETENIA_RED_DIR: corrida }),
      limiteMs: 300_000,
    });
    const renglones = r.salida.trimEnd().split(/\r?\n/);
    const ultima = renglones.at(-1) ?? '';
    expect(renglones.filter((x) => /^(VERDE|ROJO) · /.test(x))).toEqual([ultima]);
    const cifras = VERDE.exec(ultima);
    expect(cifras, ultima).not.toBeNull();
    const [, pruebas, cubiertos, criterios] = (cifras ?? []).map(Number);
    expect(r.codigo).toBe(0);

    // Menos de 2 minutos, medido por la propia red.
    const resultado = JSON.parse(readFileSync(join(corrida, 'resultado.json'), 'utf8'));
    expect(resultado.duracionMs).toBeLessThan(120_000);

    // Las pruebas: las del informe real de Vitest de esa corrida.
    const informe = JSON.parse(readFileSync(join(corrida, 'pruebas.json'), 'utf8'));
    expect(pruebas).toBe(informe.numPassedTests);
    expect(informe.numTotalTests).toBe(informe.numPassedTests);

    // Los criterios: los de las fases cerradas y la en curso, contados acá por separado.
    const especificacion = leerEspecificacionDelProyecto(RAIZ);
    const fases = [
      ...(await tagsDeFasesCerradas(RAIZ)).map((t: { numero: string }) => t.numero),
      await faseEnCurso(RAIZ),
    ];
    const considerados = especificacion.fases
      .filter((f: { numero: string }) => fases.includes(f.numero))
      .flatMap((f: { criterios: string[] }) => f.criterios);
    const { titulos } = await listarTitulos({ env: entornoLimpio() });
    const conPrueba = new Set(
      titulos.flatMap((t: { titulo: string }) => criteriosDelTitulo(t.titulo)),
    );
    expect(criterios).toBe(considerados.length);
    expect(cubiertos).toBe(considerados.filter((id: string) => conPrueba.has(id)).length);
  });
});
