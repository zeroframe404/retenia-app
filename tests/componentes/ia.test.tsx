import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRecordedProvider, type RecordedAnswer } from '../../src/ai/adapters/recorded';
import { App } from '../../src/renderer/App';
import { TEST_KEY } from '../apoyo/caja-segura';
import { explanation, FIRST_SENTENCE, MATERIAL_TEXT, TRAP_TEXT } from '../apoyo/ia';
import { closeWindows, openWindow } from './apoyo-ventana';

// Las pantallas de la IA (Fase 19): «Explicame este fragmento» en el visor, su panel, la pregunta
// del permiso, Ajustes › «Inteligencia artificial» y los interruptores de la IA simulada. La IA es
// la simulada (doble declarado): la de la demostración o «como IA remota» con la clave de prueba.

const SLOW = { timeout: 15_000 };
afterEach(closeWindows);

type Opened = ReturnType<typeof openWindow>;

// La IA simulada «como IA remota»: contesta lo que la prueba pone en `script` o una explicación
// que cita la primera oración (con 1.000 de entrada y 500 de salida: USD 0,014).
function remoteAi() {
  const script: RecordedAnswer[] = [];
  const provider = createRecordedProvider({
    kind: 'remote',
    answer: (request) =>
      script.shift() ?? {
        text: explanation({
          quotes: request.user.includes(FIRST_SENTENCE)
            ? [[FIRST_SENTENCE, 'Dice cómo se calcula el error estándar.']]
            : [],
          own: ['Sirve para medir cuánto varía la media.'],
        }),
        usage: { inputTokens: 1000, outputTokens: 500 },
      },
  });
  return { script, provider };
}

async function addMaterial(opened: Opened) {
  const subject = await opened.api['subjects.create']({ name: 'Inferencia', makeActive: true });
  const added = await opened.api['materials.addText']({
    subjectId: subject.id,
    text: MATERIAL_TEXT,
    title: 'Apunte de inferencia',
  });
  await opened.bridge.materials.whenIdle();
  if (added.outcome !== 'added') {
    throw new Error('no se agregó el material');
  }
  return added.materialId;
}

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });

// Con al menos una materia: si no, Retenia abre en la pantalla de la primera vez, sin el riel.
const withSubject = (opened: Opened) =>
  opened.api['subjects.create']({ name: 'Inferencia', makeActive: true });

async function openViewer(opened: Opened) {
  await screen.findByRole('navigation', { name: 'Riel lateral' });
  await opened.user.click(within(rail()).getByRole('button', { name: 'Materiales' }));
  const item = await screen.findByRole('button', { name: /Apunte de inferencia/ }, SLOW);
  await opened.user.click(item);
  await opened.user.click(await screen.findByRole('button', { name: 'Leer el original' }));
  await screen.findByText((content) => content.includes(FIRST_SENTENCE), {}, SLOW);
}

function select(text: string) {
  const element = screen.getByText((content) => content.includes(text));
  const node = element.firstChild as Text;
  const start = node.data.indexOf(text);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, start + text.length);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.mouseUp(element);
}

async function explain(opened: Opened, text = FIRST_SENTENCE) {
  select(text);
  await opened.user.click(await screen.findByRole('button', { name: 'Explicame este fragmento' }));
}

const panel = () => screen.findByRole('complementary', { name: 'Explicación' }, SLOW);

async function toAiSettings(opened: Opened) {
  await screen.findByRole('navigation', { name: 'Riel lateral' });
  await opened.user.click(within(rail()).getByRole('button', { name: 'Ajustes' }));
  return screen.findByRole('heading', { name: 'Inteligencia artificial' }, SLOW);
}

describe('«Explicame este fragmento»', () => {
  it('[CA-167] sin IA conectada dice «Para usar esto hay que conectar la IA» y «Configurar» lleva a la sección de la IA', async () => {
    const opened = openWindow('real');
    await addMaterial(opened);
    render(<App />);
    await openViewer(opened);
    await explain(opened);
    const side = await panel();
    expect(within(side).getByText('Para usar esto hay que conectar la IA')).toBeTruthy();
    await opened.user.click(within(side).getByRole('button', { name: 'Configurar' }));
    expect(
      await screen.findByRole('heading', { name: 'Inteligencia artificial' }, SLOW),
    ).toBeTruthy();
  });

  it('[CA-174] (simulado) con la IA simulada, la explicación se abre en el panel separada en «Según tu material» y «Aporte del modelo, no verificado», marcada y con su costo', async () => {
    const opened = openWindow('prueba', undefined, { ai: {} });
    await addMaterial(opened);
    await window.retenia['demo.setAi']({ simulated: true });
    render(<App />);
    await openViewer(opened);
    await explain(opened);
    const side = await panel();
    expect(
      await within(side).findByRole('heading', { name: 'Según tu material' }, SLOW),
    ).toBeTruthy();
    expect(
      within(side).getByRole('heading', { name: 'Aporte del modelo, no verificado' }),
    ).toBeTruthy();
    expect(
      within(side).getByText(
        'Respuesta de la IA: las citas se comprobaron letra por letra en tu material.',
      ),
    ).toBeTruthy();
    expect(within(side).getByText(`«${FIRST_SENTENCE}»`)).toBeTruthy();
    expect(within(side).getByText('IA simulada: sin costo.')).toBeTruthy();
  });

  it('[CA-175] (simulado) en el párrafo de la trampa, explica de qué habla el texto', async () => {
    const opened = openWindow('prueba', undefined, { ai: {} });
    await addMaterial(opened);
    await window.retenia['demo.setAi']({ simulated: true });
    render(<App />);
    await openViewer(opened);
    await explain(opened, TRAP_TEXT);
    const side = await panel();
    expect(await within(side).findByText(`«${TRAP_TEXT}»`, {}, SLOW)).toBeTruthy();
    expect(within(side).getByText(/Es una orden escrita dentro del apunte/)).toBeTruthy();
  });

  it('[CA-173] (simulado) con «IA simulada: responder mal» dice «No pude completar esto. Reintentá.»', async () => {
    const opened = openWindow('prueba', undefined, { ai: {} });
    await addMaterial(opened);
    await window.retenia['demo.setAi']({ simulated: true, bad: true });
    render(<App />);
    await openViewer(opened);
    await explain(opened);
    const side = await panel();
    expect(
      await within(side).findByText('No pude completar esto. Reintentá.', {}, SLOW),
    ).toBeTruthy();
    expect(within(side).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(within(side).queryByRole('heading', { name: 'Según tu material' })).toBeNull();
  });

  it('[CA-172] (simulado) la primera vez pregunta el permiso con sus tres opciones; «Solo esta vez» muestra la explicación con su costo', async () => {
    const { provider } = remoteAi();
    const opened = openWindow('real', undefined, { ai: { remote: () => provider } });
    await addMaterial(opened);
    await opened.api['ai.testConnection']({ key: TEST_KEY });
    render(<App />);
    await openViewer(opened);
    await explain(opened);
    const question = await screen.findByRole(
      'dialog',
      { name: '¿Permitir enviar fragmentos de este material a la IA?' },
      SLOW,
    );
    for (const name of ['Solo esta vez', 'Siempre para este material', 'No']) {
      expect(within(question).getByRole('button', { name })).toBeTruthy();
    }
    expect(provider.calls).toHaveLength(0);
    await opened.user.click(within(question).getByRole('button', { name: 'Solo esta vez' }));
    await opened.bridge.ai.drain();
    const side = await panel();
    expect(
      await within(side).findByText('Costo de esta consulta: USD 0,01', {}, SLOW),
    ).toBeTruthy();
    expect(provider.calls).toHaveLength(1);
  });

  it('[CA-176] (simulado) sin conexión queda «Pendiente: se reanuda cuando haya conexión» y llega sola cuando vuelve', async () => {
    const opened = openWindow('prueba', undefined, { ai: {} });
    await addMaterial(opened);
    await window.retenia['demo.setAi']({ simulated: true });
    opened.net?.setOffline(true);
    render(<App />);
    await openViewer(opened);
    await explain(opened);
    const side = await panel();
    expect(
      await within(side).findByText('Pendiente: se reanuda cuando haya conexión', {}, SLOW),
    ).toBeTruthy();
    opened.net?.setOffline(false);
    await opened.bridge.ai.drain();
    expect(
      await within(side).findByRole('heading', { name: 'Según tu material' }, SLOW),
    ).toBeTruthy();
  });

  it('[CA-170] (simulado) con «Modo solo local» dice que está activado y no manda nada', async () => {
    const { provider } = remoteAi();
    const opened = openWindow('real', undefined, { ai: { remote: () => provider } });
    await addMaterial(opened);
    await opened.api['ai.testConnection']({ key: TEST_KEY });
    await opened.api['ai.setLocalOnly']({ on: true });
    render(<App />);
    await openViewer(opened);
    await explain(opened);
    const side = await panel();
    expect(
      await within(side).findByText(
        'El modo solo local está activado: no se envía nada a la IA.',
        {},
        SLOW,
      ),
    ).toBeTruthy();
    expect(provider.calls).toHaveLength(0);
  });
});

describe('Ajustes › «Inteligencia artificial»', () => {
  it('[CA-168] (simulado) pegar la clave y tocar «Probar conexión» dice «Conexión correcta», la guarda y no la deja en la pantalla', async () => {
    const { provider } = remoteAi();
    const opened = openWindow('real', undefined, { ai: { remote: () => provider } });
    await withSubject(opened);
    render(<App />);
    const heading = await toAiSettings(opened);
    const section = within(heading.closest('section') as HTMLElement);
    const field = section.getByLabelText('Tu clave de Anthropic') as HTMLInputElement;
    expect(field.type).toBe('password');
    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.getAttribute('spellcheck')).toBe('false');
    await opened.user.type(field, TEST_KEY);
    await opened.user.click(section.getByRole('button', { name: 'Probar conexión' }));
    expect(await section.findByText('Conexión correcta', {}, SLOW)).toBeTruthy();
    expect(section.getByText('Clave guardada en el almacén seguro de Windows.')).toBeTruthy();
    expect(
      (section.queryByLabelText('Tu clave de Anthropic') as HTMLInputElement | null)?.value ?? '',
    ).toBe('');
    expect(document.body.innerHTML).not.toContain(TEST_KEY);
  });

  it('[CA-169] (simulado) muestra el contador del mes y, al llegar al tope, «Llegaste al tope de este mes»', async () => {
    const { provider, script } = remoteAi();
    const opened = openWindow('real', undefined, { ai: { remote: () => provider } });
    const materialId = await addMaterial(opened);
    await opened.api['ai.testConnection']({ key: TEST_KEY });
    const page = await opened.api['materials.page']({ materialId, unit: 1 });
    const selectionOf = (text: string) => {
      const block = page.blocks.find((candidate) => candidate.text.includes(text));
      const offset = block?.text.indexOf(text) ?? 0;
      return {
        from: { blockId: block?.id ?? '', offset },
        to: { blockId: block?.id ?? '', offset: offset + text.length },
      };
    };
    // Cinco consultas de USD 2 (500.000 unidades de entrada a USD 4 el millón): USD 10 de 10.
    for (const text of [
      'Error estándar',
      FIRST_SENTENCE,
      'Con n = 25 y s = 10, da 2.',
      TRAP_TEXT,
      'Cuando la muestra crece, la estimación varía menos.',
    ]) {
      script.push({ text: explanation({ own: ['Un aporte.'] }), usage: { inputTokens: 500_000 } });
      await opened.api['ai.explain']({
        materialId,
        selection: selectionOf(text),
        permission: 'once',
      });
      await opened.bridge.ai.drain();
    }
    expect((await opened.api['ai.status']({})).spentMicros).toBe(10_000_000);
    render(<App />);
    const heading = await toAiSettings(opened);
    const section = within(heading.closest('section') as HTMLElement);
    expect(section.getByText('Este mes: USD 10,00 de 10')).toBeTruthy();
    expect(section.getByText('Llegaste al tope de este mes')).toBeTruthy();
  });

  it('[CA-169] el contador dice «Este mes: USD 10,00 de 10» con el tope alcanzado', () => {
    expect(texts.ai.counter(10_000_000, 1000)).toBe('Este mes: USD 10,00 de 10');
    expect(texts.ai.counter(8_000_000, 1000)).toBe('Este mes: USD 8,00 de 10');
    expect(texts.ai.counter(4_000, 1)).toBe('Este mes: USD 0,00 de 0,01');
    expect(texts.ai.warning(80)).toBe('Ya usaste el 80 % del tope de este mes.');
  });

  it('[CA-171] (simulado) «Qué se envió» muestra el renglón con la fecha, la función, el material, los fragmentos y el costo', async () => {
    const { provider } = remoteAi();
    const opened = openWindow('real', undefined, { ai: { remote: () => provider } });
    await addMaterial(opened);
    await opened.api['ai.testConnection']({ key: TEST_KEY });
    render(<App />);
    await openViewer(opened);
    await explain(opened);
    const question = await screen.findByRole(
      'dialog',
      { name: '¿Permitir enviar fragmentos de este material a la IA?' },
      SLOW,
    );
    await opened.user.click(within(question).getByRole('button', { name: 'Solo esta vez' }));
    await opened.bridge.ai.drain();
    await panel();
    const heading = await toAiSettings(opened);
    const section = within(heading.closest('section') as HTMLElement);
    expect(
      await section.findByText(
        '15/03/2027 · Explicar un fragmento · 1 fragmento de “Apunte de inferencia” · USD 0,01',
        {},
        SLOW,
      ),
    ).toBeTruthy();
  });

  it('cada función muestra su estado y se puede suspender', async () => {
    const opened = openWindow('real', undefined, { ai: {} });
    await withSubject(opened);
    render(<App />);
    const heading = await toAiSettings(opened);
    const section = within(heading.closest('section') as HTMLElement);
    expect(section.getByText('Explicar un fragmento · Habilitada')).toBeTruthy();
    await opened.user.click(section.getByRole('button', { name: 'Suspender' }));
    expect(await section.findByText('Explicar un fragmento · Suspendida')).toBeTruthy();
    await opened.user.click(section.getByRole('button', { name: 'Habilitar' }));
    expect(await section.findByText('Explicar un fragmento · Habilitada')).toBeTruthy();
  });

  it('[CA-170] «Modo solo local» se prende y se apaga desde la sección', async () => {
    const opened = openWindow('real', undefined, { ai: {} });
    await withSubject(opened);
    render(<App />);
    const heading = await toAiSettings(opened);
    const section = within(heading.closest('section') as HTMLElement);
    const toggle = section.getByRole('checkbox', { name: 'Modo solo local' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await opened.user.click(toggle);
    await waitFor(async () => expect((await opened.api['ai.status']({})).localOnly).toBe(true));
    expect(opened.net?.isOffline()).toBe(true);
  });
});

describe('Ajustes › «Demostración»: la IA simulada', () => {
  it('[CA-167] los tres interruptores están en la demostración y no en la versión real', async () => {
    const opened = openWindow('prueba', undefined, { ai: {} });
    await withSubject(opened);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await opened.user.click(within(rail()).getByRole('button', { name: 'Ajustes' }));
    for (const name of [
      'IA simulada',
      'IA simulada: responder mal',
      'IA simulada: tardar 12 segundos',
    ]) {
      expect(await screen.findByRole('checkbox', { name }, SLOW)).toBeTruthy();
    }
    await opened.user.click(screen.getByRole('checkbox', { name: 'IA simulada' }));
    await waitFor(async () => expect((await window.retenia['demo.ai']({})).simulated).toBe(true));
  });
});

import { texts } from '../../src/preload/contract/texts';
