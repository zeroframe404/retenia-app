import { describe, expect, it } from 'vitest';
import { seriousFindings } from '../../../tools/lib/auditoria.mjs';

// La auditoría de dependencias solo acepta avisos nombrados en una lista escrita, con fecha de
// revisión. Cualquier otro aviso alto o crítico sigue dando rojo.

const AVISO = 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc';
const OTRO = 'https://github.com/advisories/GHSA-dddd-eeee-ffff';

function informe(vulnerabilities: Record<string, unknown>) {
  return { vulnerabilities };
}

const accepted = [{ url: AVISO, reviewUntil: '2027-01-31' }];
const today = new Date('2026-11-18T12:00:00Z');

describe('auditoría de dependencias con avisos aceptados', () => {
  it('un aviso alto que no está en la lista da rojo', () => {
    const report = informe({ lib: { severity: 'high', via: [{ url: OTRO }] } });
    expect(seriousFindings(report, accepted, today)).toEqual(['lib']);
  });

  it('un aviso aceptado y los paquetes que dependen de él no dan rojo', () => {
    const report = informe({
      raiz: { severity: 'high', via: [{ url: AVISO }] },
      medio: { severity: 'high', via: ['raiz'] },
      punta: { severity: 'high', via: ['medio', 'raiz'] },
    });
    expect(seriousFindings(report, accepted, today)).toEqual([]);
  });

  it('un paquete que además tiene otro aviso alto sin aceptar da rojo', () => {
    const report = informe({
      raiz: { severity: 'high', via: [{ url: AVISO }] },
      mixto: { severity: 'high', via: ['raiz', { url: OTRO }] },
    });
    expect(seriousFindings(report, accepted, today)).toEqual(['mixto']);
  });

  it('pasada la fecha de revisión, el aviso vuelve a dar rojo', () => {
    const report = informe({ raiz: { severity: 'high', via: [{ url: AVISO }] } });
    expect(seriousFindings(report, accepted, new Date('2027-02-01T12:00:00Z'))).toEqual(['raiz']);
  });

  it('los avisos moderados no cuentan', () => {
    const report = informe({ lib: { severity: 'moderate', via: [{ url: OTRO }] } });
    expect(seriousFindings(report, [], today)).toEqual([]);
  });

  it('un aviso crítico aceptado por su dirección tampoco da rojo', () => {
    const report = informe({ raiz: { severity: 'critical', via: [{ url: AVISO }] } });
    expect(seriousFindings(report, accepted, today)).toEqual([]);
  });
});
