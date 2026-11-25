import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { newId } from '../../src/data/ids';
import type { StudyOverview } from '../../src/preload/contract/study';
import { formatShortDate } from '../../src/preload/contract/texts';
import { App } from '../../src/renderer/App';
import { CardsScreen } from '../../src/renderer/cards/CardsScreen';
import { readRows } from '../apoyo/base-cruda';
import { closeWindows, openWindow, seedSubjects } from './apoyo-ventana';

// La propuesta de Estudiar de la Fase 11 en la ventana entera, contra el puente real y el elenco de
// tarjetas: «Sesión recomendada · N min», lo que entra en cada tiempo de «Tengo:», «Versión corta»,
// «Posponer», «Elegir otra actividad» y el aviso de frenos.
//
// Único doble de este archivo, declarado: en las pruebas del freno y de «estimación inicial»,
// `study.overview` devuelve la propuesta real con el atraso o la bandera que se quiere mirar (armar
// 6 días de atraso de verdad no cambia lo que se prueba, que es cómo se dice). Todo lo demás corre
// contra el puente real y la base real.

afterEach(closeWindows);

// Leer lo de hoy recorre las 180 tarjetas del elenco: con la máquina cargada puede tardar más que
// el segundo que se espera por defecto.
const SLOW = { timeout: 15_000 };

type Opened = ReturnType<typeof openWindow>;
type User = Opened['user'];

// Una copia del elenco sembrado una vez por proceso (lo mismo que sembrar materias y tarjetas).
function withCast(): Opened {
  const opened = openWindow('real', undefined, { withCast: 'tarjetas' });
  return opened;
}

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });
const progress = () => screen.getByRole('status', { name: /^Llevás \d+ de \d+$/ });

// La tarjeta de la propuesta, con su título como nombre.
const proposalCard = (minutes: number) =>
  screen.findByRole('region', { name: `Sesión recomendada · ${minutes} min` }, SLOW);

// «Tengo:» → el tiempo que se elige; espera a que la propuesta cambie.
async function pickMinutes(user: User, minutes: 5 | 10 | 25 | 45) {
  const group = screen.getByRole('group', { name: 'Tengo:' });
  await user.click(within(group).getByRole('button', { name: String(minutes) }));
  await screen.findByRole('heading', { name: `Sesión recomendada · ${minutes} min` }, SLOW);
}

// Se va a Apuntes y se vuelve a Estudiar: la pantalla se arma de nuevo.
async function reopenStudy(user: User) {
  await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
  await screen.findByRole('heading', { level: 2, name: 'Apuntes' });
  await user.click(within(rail()).getByRole('button', { name: 'Estudiar' }));
}

const calls = (opened: Opened, channel: string) =>
  opened.bridge.sent.filter((message) => message.channel === channel);

// La propuesta real con lo que cambia `current` (que se puede cambiar entre una apertura y otra).
function simulateOverview(current: () => (overview: StudyOverview) => StudyOverview) {
  const real = window.retenia['study.overview'];
  window.retenia = {
    ...window.retenia,
    'study.overview': async (request) => current()(await real(request)),
  };
}

// «AAAA-MM-DD» más `days` días.
function addDays(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

describe('Estudiar: la propuesta de hoy', () => {
  it('[CA-078] muestra «Sesión recomendada · 25 min», la línea «Por qué:», un solo botón primario «Empezar» y, como mucho, dos alternativas a la vista', async () => {
    withCast();
    render(<App />);
    const card = await proposalCard(25);
    expect(within(card).getByRole('heading', { level: 3 }).textContent).toBe(
      'Sesión recomendada · 25 min',
    );
    const why = screen.getAllByText(/^Por qué:/);
    expect(why).toHaveLength(1);
    expect(why[0]?.textContent).toBe(
      'Por qué: hoy vencen 60 repasos (dato) y el tiempo es una estimación.',
    );
    // Con las tarjetas propias que tiene el elenco, no es una estimación inicial.
    expect(screen.queryByText('estimación inicial')).toBeNull();
    // Exactamente un primario en toda la pantalla, y es «Empezar».
    const primaries = [...document.querySelectorAll('[data-button="primary"]')];
    expect(primaries.map((button) => button.textContent)).toEqual(['Empezar']);
    // Alternativas: lo que no es «Empezar», «Posponer» ni los tiempos de «Tengo:».
    const own = new Set(['Empezar', 'Posponer', '5', '10', '25', '45']);
    const alternatives = within(card)
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter((name) => !own.has(name));
    expect(alternatives).toEqual(['Versión corta (10 min)', 'Elegir otra actividad']);
    expect(within(card).getByRole('button', { name: 'Posponer' })).toBeTruthy();
    expect(within(card).getByRole('group', { name: 'Tengo:' })).toBeTruthy();
  });

  it('[CA-078] con una sesión a medias, el único primario es «Continuar: sesión de hoy (0 de 70)» y «Empezar» pasa a secundario', async () => {
    const { user } = withCast();
    render(<App />);
    await proposalCard(25);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Empezar' }));
    await waitFor(() => expect(progress().textContent).toBe('0/70'), SLOW);
    await user.keyboard('{Escape}');
    const resume = await screen.findByRole(
      'button',
      { name: 'Continuar: sesión de hoy (0 de 70)' },
      SLOW,
    );
    expect(
      [...document.querySelectorAll('[data-button="primary"]')].map((button) => button.textContent),
    ).toEqual(['Continuar: sesión de hoy (0 de 70)']);
    expect(resume.getAttribute('data-button')).toBe('primary');
    expect(screen.getByRole('button', { name: 'Empezar' }).getAttribute('data-button')).toBe(
      'secondary',
    );
    expect(screen.getByRole('heading', { name: 'Sesión recomendada · 25 min' })).toBeTruthy();
  });

  it('[CA-079] con 25 minutos: «60 repasos y 10 tarjetas nuevas · unos 25 min»', async () => {
    withCast();
    render(<App />);
    await proposalCard(25);
    expect(screen.getByText('60 repasos y 10 tarjetas nuevas · unos 25 min')).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Tengo:' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => [button.textContent, button.getAttribute('aria-pressed')]),
    ).toEqual([
      ['5', 'false'],
      ['10', 'false'],
      ['25', 'true'],
      ['45', 'false'],
    ]);
    expect(within(group).getByText('min')).toBeTruthy();
  });

  it('[CA-080] con 10 minutos: «45 repasos, sin tarjetas nuevas · unos 10 min»; el foco no se pierde, la pantalla no salta y «Empezar» arma esa sesión', async () => {
    const { user } = withCast();
    render(<App />);
    await proposalCard(25);
    const ten = within(screen.getByRole('group', { name: 'Tengo:' })).getByRole('button', {
      name: '10',
    });
    await user.click(ten);
    expect(
      await screen.findByText('45 repasos, sin tarjetas nuevas · unos 10 min', {}, SLOW),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sesión recomendada · 10 min' })).toBeTruthy();
    // El mismo botón, en el mismo lugar y con el foco.
    const again = within(screen.getByRole('group', { name: 'Tengo:' })).getByRole('button', {
      name: '10',
    });
    expect(again).toBe(ten);
    expect(document.activeElement).toBe(ten);
    expect(ten.getAttribute('aria-pressed')).toBe('true');
    // «Versión corta (10 min)» sigue a la vista con cualquier tiempo elegido.
    expect(screen.getByRole('button', { name: 'Versión corta (10 min)' })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Empezar' }));
    await waitFor(() => expect(progress().textContent).toBe('0/45'), SLOW);
  });

  it('[CA-081] con 5 minutos: «20 repasos, los más urgentes · unos 5 min»', async () => {
    const { user } = withCast();
    render(<App />);
    await proposalCard(25);
    await pickMinutes(user, 5);
    expect(
      await screen.findByText('20 repasos, los más urgentes · unos 5 min', {}, SLOW),
    ).toBeTruthy();
  });

  it('[CA-082] con 45 minutos: «60 repasos y 18 tarjetas nuevas · unos 30 min»', async () => {
    const { user } = withCast();
    render(<App />);
    await proposalCard(25);
    await pickMinutes(user, 45);
    expect(
      await screen.findByText('60 repasos y 18 tarjetas nuevas · unos 30 min', {}, SLOW),
    ).toBeTruthy();
  });

  it('[CA-083] «Versión corta (10 min)» abre directo la sesión de 10 minutos: sin pantalla intermedia ni confirmación', async () => {
    const opened = withCast();
    render(<App />);
    await proposalCard(25);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Versión corta (10 min)' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    await opened.user.click(screen.getByRole('button', { name: 'Versión corta (10 min)' }));
    await waitFor(() => expect(progress().textContent).toBe('0/45'), SLOW);
    expect(screen.queryByRole('dialog')).toBeNull();
    const [start, ...others] = calls(opened, 'study.start');
    expect(others).toEqual([]);
    expect(start?.request).toMatchObject({ minutes: 10 });
    expect(start?.request).not.toHaveProperty('only');
  });

  it('[CA-084] elegir 10 vale solo esta vez: al volver a montar Estudiar, y al abrir Retenia de nuevo, vuelve a 25', async () => {
    const opened = withCast();
    const view = render(<App />);
    await proposalCard(25);
    await pickMinutes(opened.user, 10);
    expect(await screen.findByText(/^45 repasos, sin tarjetas nuevas/, {}, SLOW)).toBeTruthy();

    await reopenStudy(opened.user);
    await proposalCard(25);
    expect(screen.getByText('60 repasos y 10 tarjetas nuevas · unos 25 min')).toBeTruthy();
    expect(
      screen.getByRole('group', { name: 'Tengo:' }).querySelector('[aria-pressed="true"]')
        ?.textContent,
    ).toBe('25');

    // Abrir Retenia de nuevo: la ventana entera se arma otra vez.
    await pickMinutes(opened.user, 5);
    view.unmount();
    render(<App />);
    await proposalCard(25);
    // La última lectura no pidió otros minutos: lo elegido no se guardó en ningún lado.
    await waitFor(() => expect(calls(opened, 'study.overview').at(-1)?.request).toEqual({}));
  });
});

describe('Estudiar: el aviso de frenos', () => {
  // Lo que dice cada tramo, con las cifras que da el cálculo.
  const BRAKES = [
    {
      band: 'none',
      days: 6,
      newCards: 0,
      text: 'Hoy no agrego tarjetas nuevas: tenés cerca de 6 días de repasos atrasados. Vuelven de a poco cuando baje de 5 días.',
    },
    {
      band: 'few',
      days: 3,
      newCards: 4,
      text: 'Hoy agrego pocas tarjetas nuevas: tenés cerca de 3 días de repasos atrasados. Vuelven más cuando baje de 2 días.',
    },
    {
      band: 'few',
      days: 2.4,
      newCards: 0,
      text: 'Hoy no agrego tarjetas nuevas: tenés cerca de 2 días de repasos atrasados. Vuelven de a poco cuando baje de 2 días.',
    },
    {
      band: 'half',
      days: 1.2,
      newCards: 5,
      text: 'Hoy agrego la mitad de las tarjetas nuevas: tenés cerca de 1,2 días de repasos atrasados. Vuelven completas cuando baje de medio día.',
    },
    {
      band: 'half',
      days: 1,
      newCards: 0,
      text: 'Hoy no agrego tarjetas nuevas: tenés cerca de 1 día de repasos atrasados. Vuelven completas cuando baje de medio día.',
    },
  ] as const;

  it('[CA-086] con 6 días de atraso dice la frase exacta, en texto neutro: ni rojo, ni alerta, ni contador', async () => {
    withCast();
    simulateOverview(() => (overview) => ({
      ...overview,
      proposal:
        overview.proposal === null
          ? null
          : { ...overview.proposal, newCards: 0, brake: { band: 'none', days: 6 } },
    }));
    render(<App />);
    await proposalCard(25);
    const notice = screen.getByText(
      'Hoy no agrego tarjetas nuevas: tenés cerca de 6 días de repasos atrasados. Vuelven de a poco cuando baje de 5 días.',
    );
    // No es un aviso de falla ni de atención, y no está dentro de uno.
    expect(
      notice.closest('[role="alert"], [data-tone], [data-component="status-banner"]'),
    ).toBeNull();
    // Los estilos del aviso solo usan los colores neutros del sistema (ninguno es rojo: CA-037).
    const css = readFileSync(
      join(import.meta.dirname, '../../src/renderer/session/Session.module.css'),
      'utf8',
    );
    const block = /\n\.brake\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).not.toBe('');
    const colors = [...block.matchAll(/var\(--color-([a-z-]+)\)/g)].map((match) => match[1]);
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) {
      expect(['tinta', 'superficie-hundida', 'linea']).toContain(color);
    }
    // Un dato en una frase: sin un contador aparte de días.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('[CA-086] cada tramo del freno dice sus días con coma o entero y «día» o «días»; sin freno no hay aviso', async () => {
    const opened = withCast();
    let current: (overview: StudyOverview) => StudyOverview = (overview) => overview;
    simulateOverview(() => current);
    render(<App />);
    await proposalCard(25);
    expect(screen.queryByText(/repasos atrasados/)).toBeNull();
    for (const { band, days, newCards, text } of BRAKES) {
      current = (overview) => ({
        ...overview,
        proposal:
          overview.proposal === null
            ? null
            : { ...overview.proposal, newCards, brake: { band, days } },
      });
      await reopenStudy(opened.user);
      expect(await screen.findByText(text, {}, SLOW)).toBeTruthy();
    }
  });

  it('[CA-086] un repaso pospuesto se avisa en singular y en plural', async () => {
    const opened = withCast();
    let postponed = 1;
    simulateOverview(() => (overview) => ({
      ...overview,
      proposal:
        overview.proposal === null ? null : { ...overview.proposal, postponedCount: postponed },
    }));
    render(<App />);
    await proposalCard(25);
    expect(screen.getByText('Hay 1 repaso pospuesto para otro día.')).toBeTruthy();
    postponed = 7;
    await reopenStudy(opened.user);
    expect(
      await screen.findByText('Hay 7 repasos pospuestos para otro día.', {}, SLOW),
    ).toBeTruthy();
  });
});

describe('Estudiar: «estimación inicial»', () => {
  it('[CA-089] con pocas tarjetas propias aparece «estimación inicial» al lado del contenido y la duración nunca se dice en segundos', async () => {
    const { api } = openWindow();
    const { statistics } = await seedSubjects(api);
    for (const question of ['¿Qué es la media?', '¿Qué es la moda?', '¿Qué es la mediana?']) {
      await api['cards.create']({ question, answer: 'R', subjectId: statistics.id });
    }
    render(<App />);
    const card = await proposalCard(25);
    const tag = within(card).getByText('estimación inicial');
    const headline = within(card).getByText(/^3 tarjetas nuevas · unos \d+ min$/);
    // Son dos elementos aparte, uno al lado del otro, en el mismo renglón.
    expect(tag).not.toBe(headline);
    expect(tag.parentElement).toBe(headline.parentElement);
    expect(
      within(card).getByText(
        'Por qué: hoy no vence ningún repaso; sigue lo nuevo (tiempo estimado).',
      ),
    ).toBeTruthy();
    // Minutos redondeados a 5, nunca segundos.
    expect(card.textContent ?? '').not.toMatch(/segundo|\b\d+\s*(s|seg)\b/i);
  });

  it('[CA-089] con repasos y sin datos suficientes, el «Por qué:» dice que todavía no se conoce tu ritmo; sin la bandera no hay etiqueta', async () => {
    const opened = withCast();
    let initial = true;
    simulateOverview(() => (overview) => ({
      ...overview,
      proposal:
        overview.proposal === null ? null : { ...overview.proposal, initialEstimate: initial },
    }));
    render(<App />);
    await proposalCard(25);
    expect(screen.getByText('estimación inicial')).toBeTruthy();
    expect(
      screen.getByText(
        'Por qué: hoy vencen 60 repasos (dato) y el tiempo es una estimación inicial.',
      ),
    ).toBeTruthy();
    initial = false;
    await reopenStudy(opened.user);
    await screen.findByText(
      'Por qué: hoy vencen 60 repasos (dato) y el tiempo es una estimación.',
      {},
      SLOW,
    );
    expect(screen.queryByText('estimación inicial')).toBeNull();
  });
});

describe('Estudiar: «Posponer»', () => {
  it('[CA-091] «Posponer» › «Mañana» avisa «Listo: vuelve mañana», cambia la propuesta y el historial de la tarjeta lo muestra sin resultado', async () => {
    const opened = withCast();
    const { user, bridge, api } = opened;
    const view = render(<App />);
    await proposalCard(25);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Posponer' }).hasAttribute('disabled')).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Posponer' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Para cuándo los posponés?' });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['Cerrar', 'Más tarde hoy', 'Mañana', 'Elegir día']);
    await user.click(within(dialog).getByRole('button', { name: 'Mañana' }));
    expect(await screen.findByText('Listo: vuelve mañana', {}, SLOW)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    // La propuesta se vuelve a pedir y ya no hay nada para hoy.
    const nothing = await screen.findByText(
      'Hoy no tenés repasos vencidos en Estadística básica.',
      {},
      SLOW,
    );
    // Ya no hay propuesta ni «Posponer»: el foco queda en esa frase, no se pierde.
    await waitFor(() => expect(document.activeElement).toBe(nothing));
    expect(screen.queryByRole('region', { name: /^Sesión recomendada/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Empezar' }).hasAttribute('disabled')).toBe(true);

    // Los 60 repasos quedaron aplazados, sin calificarse.
    const postponed = readRows(
      bridge.file,
      "SELECT card_id FROM observations WHERE kind = 'review.postponed' ORDER BY seq",
    );
    expect(postponed).toHaveLength(60);
    expect(calls(opened, 'study.postpone')).toHaveLength(1);
    expect(calls(opened, 'study.postpone')[0]?.request).toMatchObject({
      minutes: 25,
      when: 'tomorrow',
    });

    // El historial de la primera tarjeta aplazada: un renglón más, sin calificación ni «Anulado».
    const cardId = String(postponed[0]?.card_id);
    const { today } = await api.ping({ message: 'ping' });
    view.unmount();
    render(<CardsScreen cardRequest={{ cardId, nonce: 1 }} />);
    await user.click(await screen.findByRole('button', { name: 'Historial' }));
    const list = await screen.findByRole('list', { name: 'Repasos de la tarjeta' });
    const rows = within(list)
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    const expected = `${formatShortDate(today)} · Aplazada hasta el ${formatShortDate(addDays(today, 1))}`;
    expect(rows).toContain(expected);
    expect(expected).not.toMatch(/La sabía|Con dudas|No la sabía|Anulado/);
  });

  it('[CA-091] «Más tarde hoy» y «Elegir día» avisan cuándo vuelven; el campo de fecha no deja elegir antes de mañana', async () => {
    const opened = withCast();
    const { user, api } = opened;
    render(<App />);
    await proposalCard(25);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Posponer' }).hasAttribute('disabled')).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Posponer' }));
    await user.click(await screen.findByRole('button', { name: 'Más tarde hoy' }));
    expect(await screen.findByText('Listo: vuelve más tarde hoy', {}, SLOW)).toBeTruthy();
    // La propuesta sigue: el foco vuelve a «Posponer».
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Posponer' })),
    );

    const { today } = await api.ping({ message: 'ping' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Posponer' }).hasAttribute('disabled')).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Posponer' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Para cuándo los posponés?' });
    await user.click(within(dialog).getByRole('button', { name: 'Elegir día' }));
    const field = within(dialog).getByLabelText('Día') as HTMLInputElement;
    await waitFor(() => expect(field.getAttribute('min')).toBe(addDays(today, 1)));
    expect(document.activeElement).toBe(field);
    expect(within(dialog).getByRole('button', { name: 'Confirmar' }).hasAttribute('disabled')).toBe(
      true,
    );
    const chosen = addDays(today, 3);
    fireEvent.change(field, { target: { value: chosen } });
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(
      await screen.findByText(`Listo: vuelve el ${formatShortDate(chosen)}`, {}, SLOW),
    ).toBeTruthy();
    const sent = calls(opened, 'study.postpone');
    expect(sent.map((message) => (message.request as { when: string }).when)).toEqual([
      'later',
      'day',
    ]);
    expect(sent[1]?.request).toMatchObject({ day: chosen });
  });

  it('[CA-091] las tarjetas que ya se pospusieron 3 veces entran igual y el cartel lo dice', async () => {
    // Tres días seguidos posponiendo «Mañana» por el camino real: cada repaso suma un aplazamiento.
    // El reloj arranca en el instante de la demostración: el elenco copiado (sembrado una vez por
    // corrida con ese reloj) es lo mismo que sembrarlo acá.
    let offset = 0;
    const opened = openWindow(
      'real',
      { now: () => demoClock(offset).now() },
      { withCast: 'tarjetas' },
    );
    const { user, bridge } = opened;
    for (let time = 0; time < 3; time += 1) {
      bridge.workspace.study.postpone({ requestId: newId(), when: 'tomorrow' });
      offset += 1;
    }
    render(<App />);
    await proposalCard(25);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Posponer' }).hasAttribute('disabled')).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Posponer' }));
    await user.click(await screen.findByRole('button', { name: 'Mañana' }));
    const notice = await screen.findByText(/^Listo: vuelve mañana\./, {}, SLOW);
    expect(notice.textContent).toMatch(
      /^Listo: vuelve mañana\. \d+ tarjetas entran igual porque ya las pospusiste 3 veces\.$/,
    );
  });
});

describe('Estudiar: «Elegir otra actividad»', () => {
  it('[CA-094] muestra como máximo 3 alternativas y la propuesta queda igual: no se pide otra', async () => {
    const opened = withCast();
    const { user } = opened;
    render(<App />);
    const card = await proposalCard(25);
    const before = card.textContent;
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Elegir otra actividad' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    const overviews = calls(opened, 'study.overview').length;
    const toggle = screen.getByRole('button', { name: 'Elegir otra actividad' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    const group = screen.getByRole('group', { name: 'Otras actividades' });
    const options = within(group).getAllByRole('button');
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(3);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Mirar la lista no cambia la propuesta ni pide otros minutos.
    expect(screen.getByRole('heading', { name: 'Sesión recomendada · 25 min' })).toBeTruthy();
    expect(screen.getByText('60 repasos y 10 tarjetas nuevas · unos 25 min')).toBeTruthy();
    expect(calls(opened, 'study.overview')).toHaveLength(overviews);
    // «Cerrar» la esconde y el foco vuelve al botón que la abrió.
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('group', { name: 'Otras actividades' })).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect((await proposalCard(25)).textContent).toBe(before);
    expect(calls(opened, 'study.overview')).toHaveLength(overviews);
  });

  it('[CA-094] cada alternativa empieza esa sesión: «Solo repasos» arma una sesión con esos repasos', async () => {
    const opened = withCast();
    const { user } = opened;
    render(<App />);
    await proposalCard(25);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Elegir otra actividad' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Elegir otra actividad' }));
    const group = screen.getByRole('group', { name: 'Otras actividades' });
    const only = within(group).getByRole('button', {
      name: /^Solo repasos · \d+ repasos · unos \d+ min$/,
    });
    const reviews = /^Solo repasos · (\d+) repasos/.exec(only.textContent ?? '')?.[1];
    await user.click(only);
    await waitFor(() => expect(progress().textContent).toBe(`0/${reviews}`), SLOW);
    const [start] = calls(opened, 'study.start');
    expect(start?.request).toMatchObject({ minutes: 25, only: { kind: 'reviewsOnly' } });
  });
});
