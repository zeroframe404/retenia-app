import { describe, expect, it } from 'vitest';
import { ACCEPTED_ADVISORIES, seriousVulnerabilities } from '../../tools/lib/auditoria.mjs';

const PICOMATCH = ACCEPTED_ADVISORIES[0]?.id ?? '';

function advisory(id: string, name = 'picomatch') {
  return { name, severity: 'high', url: `https://github.com/advisories/${id}` };
}

describe('auditoría de dependencias: aviso aceptado sin versión corregida', () => {
  it('el aviso de picomatch y lo que depende solo de él no cuentan como serios', () => {
    const report = {
      vulnerabilities: {
        picomatch: { name: 'picomatch', severity: 'high', via: [advisory(PICOMATCH)] },
        knip: { name: 'knip', severity: 'high', via: ['picomatch'] },
        vite: { name: 'vite', severity: 'high', via: ['fdir', 'picomatch'] },
        fdir: { name: 'fdir', severity: 'high', via: ['picomatch'] },
      },
    };
    expect(seriousVulnerabilities(report)).toEqual([]);
  });

  it('un aviso alto distinto sigue contando, aunque venga junto al aceptado', () => {
    const report = {
      vulnerabilities: {
        picomatch: { name: 'picomatch', severity: 'high', via: [advisory(PICOMATCH)] },
        other: { name: 'other', severity: 'high', via: [advisory('GHSA-0000-0000-0000', 'other')] },
        knip: { name: 'knip', severity: 'high', via: ['picomatch', 'other'] },
      },
    };
    expect(seriousVulnerabilities(report).map((item) => item.name)).toEqual(['other', 'knip']);
  });

  it('un aviso crítico nunca se acepta', () => {
    const report = {
      vulnerabilities: {
        picomatch: {
          name: 'picomatch',
          severity: 'critical',
          via: [advisory(PICOMATCH)],
        },
      },
    };
    expect(seriousVulnerabilities(report).map((item) => item.name)).toEqual(['picomatch']);
  });

  it('los avisos moderados y bajos no cuentan', () => {
    const report = {
      vulnerabilities: { x: { name: 'x', severity: 'moderate', via: [advisory('GHSA-1')] } },
    };
    expect(seriousVulnerabilities(report)).toEqual([]);
  });
});
