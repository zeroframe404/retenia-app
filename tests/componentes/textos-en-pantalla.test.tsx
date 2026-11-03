import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findTextProblems } from '../../src/core/text-rules';
import { handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { createDemoDate } from '../../src/main/demo/clock';
import { buildApi } from '../../src/preload/api';
import { demoChannels } from '../../src/preload/contract/demo';
import { App } from '../../src/renderer/App';
import { openBridge, type TestBridge } from '../apoyo/puente';

// El barrido de textos sobre las pantallas armadas (CA-036): cada pantalla, con datos de verdad,
// no muestra «undefined», «null», «NaN», «[object Object]», inglés suelto ni texto de relleno, ni
// las palabras prohibidas. Se mira todo lo que se lee: el texto y las etiquetas que lee el
// lector de pantalla.

const bridges: TestBridge[] = [];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

async function openApp() {
  vi.stubGlobal('__VARIANTE__', 'prueba');
  const bridge = openBridge();
  bridges.push(bridge);
  const demo = createDemoDate(bridge.dataDir);
  const demoHandlers = createDemoHandlers(demo);
  const registry = demoChannels();
  const demoApi = buildApi(
    (channel, request) => handleMessage(demoHandlers, channel, request, registry),
    registry,
  );
  window.retenia = {
    ...bridge.api,
    ...demoApi,
    'demo.connection': async () => ({ offline: false }),
    'demo.setConnection': async ({ offline }: { offline: boolean }) => ({ offline }),
  } as unknown as typeof window.retenia;
  const subject = await bridge.api['subjects.create']({
    name: 'Estadística básica',
    makeActive: true,
  });
  const topic = await bridge.api['topics.create']({
    subjectId: subject.id,
    name: 'Media y dispersión',
  });
  const note = await bridge.api['notes.create']({ subjectId: subject.id, topicId: topic.id });
  await bridge.api['notes.save']({ noteId: note.id, title: 'Media y desvío', blocks: note.blocks });
  await bridge.api['inbox.capture']({ text: 'Revisar el teorema central del límite' });
  await bridge.api['cards.create']({ question: '¿Qué mide el desvío estándar?', answer: 'x' });
  const second = await bridge.api['cards.create']({
    question: '¿Qué es la varianza?',
    answer: 'y',
  });
  await bridge.api['cards.delete']({ cardId: second.id });
  return { bridge, user: userEvent.setup() };
}

// Todo lo que se lee en la pantalla actual: el texto y las etiquetas accesibles.
function readable(): string[] {
  const texts = [document.body.textContent ?? ''];
  for (const element of document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
    for (const attribute of ['aria-label', 'title', 'alt', 'placeholder']) {
      const value = element.getAttribute(attribute);
      if (value) {
        texts.push(value);
      }
    }
  }
  return texts;
}

function problems(): string[] {
  return readable().flatMap((text) =>
    findTextProblems(text).map((problem) => `${problem.rule}: «${problem.found}»`),
  );
}

describe('las pantallas no muestran textos prohibidos', () => {
  it('[CA-036] las seis pantallas del riel, con la cinta de demostración', async () => {
    const { user } = await openApp();
    render(<App />);
    expect(await screen.findByText(/^DEMOSTRACIÓN/)).toBeTruthy();
    const rail = screen.getByRole('navigation', { name: 'Riel lateral' });
    for (const name of ['Estudiar', 'Apuntes', 'Materiales', 'Idiomas', 'Progreso', 'Ajustes']) {
      await user.click(within(rail).getByRole('button', { name }));
      await screen.findByRole('heading', { level: 2, name });
      expect(problems(), name).toEqual([]);
    }
  });

  it('[CA-036] las secciones de Apuntes, con notas, Bandeja, tarjetas, Papelera y Actividad reciente de verdad', async () => {
    const { user } = await openApp();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Riel lateral' })).getByRole('button', {
        name: 'Apuntes',
      }),
    );
    expect(await screen.findByRole('button', { name: 'Media y desvío' })).toBeTruthy();
    expect(problems(), 'Notas').toEqual([]);
    const sections = screen.getByRole('navigation', { name: 'Secciones de Apuntes' });
    await user.click(within(sections).getByRole('button', { name: /^Bandeja/ }));
    expect(await screen.findByText('Revisar el teorema central del límite')).toBeTruthy();
    expect(problems(), 'Bandeja').toEqual([]);
    await user.click(within(sections).getByRole('button', { name: 'Tarjetas' }));
    expect(await screen.findByText('¿Qué mide el desvío estándar?')).toBeTruthy();
    expect(problems(), 'Tarjetas').toEqual([]);
    await user.click(within(sections).getByRole('button', { name: 'Papelera' }));
    expect(await screen.findByText('¿Qué es la varianza?')).toBeTruthy();
    expect(problems(), 'Papelera').toEqual([]);
    await user.click(within(sections).getByRole('button', { name: 'Actividad reciente' }));
    expect(await screen.findByRole('list', { name: 'Tus cambios' })).toBeTruthy();
    expect(problems(), 'Actividad reciente').toEqual([]);
  });

  it('[CA-036] el formulario, el repaso, el historial y el cuadro «Buscar»', async () => {
    const { user } = await openApp();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Riel lateral' })).getByRole('button', {
        name: 'Apuntes',
      }),
    );
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
        name: 'Tarjetas',
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Nueva tarjeta' }));
    await user.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribí la pregunta')).toBeTruthy();
    expect(problems(), 'formulario con avisos').toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(await screen.findByRole('button', { name: 'Repasar' }));
    await user.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    expect(problems(), 'repaso').toEqual([]);
    await user.click(screen.getByRole('button', { name: 'La sabía' }));
    expect(await screen.findByText(/^Próximo repaso: /)).toBeTruthy();
    expect(problems(), 'resultado del repaso').toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Volver a las tarjetas' }));
    await user.click(await screen.findByRole('button', { name: 'Historial' }));
    expect(await screen.findByRole('list', { name: 'Repasos de la tarjeta' })).toBeTruthy();
    expect(problems(), 'historial').toEqual([]);
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Buscar' })).toBeTruthy();
    expect(problems(), 'buscar').toEqual([]);
  });

  it('[CA-036] Ajustes › «Demostración» y la «Galería» entera', async () => {
    const { user } = await openApp();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Riel lateral' })).getByRole('button', {
        name: 'Ajustes',
      }),
    );
    expect(await screen.findByRole('heading', { level: 3, name: 'Demostración' })).toBeTruthy();
    expect(problems(), 'Ajustes').toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Galería' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Galería' })).toBeTruthy();
    expect(problems(), 'Galería').toEqual([]);
  });

  it('[CA-036] Estudiar con la materia activa y los cuadros de materias, captura al vuelo, «Mover a…», «Renombrar» y «Detalles»', async () => {
    const { user } = await openApp();
    render(<App />);
    expect(await screen.findByText('Materia activa')).toBeTruthy();
    expect(problems(), 'Estudiar').toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(await screen.findByRole('dialog', { name: 'Tus materias' })).toBeTruthy();
    expect(problems(), 'materias').toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Nueva materia' }));
    await user.click(screen.getByRole('button', { name: 'Crear' }));
    expect(await screen.findByText('Escribí el nombre de la materia')).toBeTruthy();
    expect(problems(), 'materias con aviso').toEqual([]);
    await user.keyboard('{Escape}');

    await user.keyboard('{Control>}{Shift>}n{/Shift}{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Anotar al vuelo' })).toBeTruthy();
    expect(problems(), 'captura').toEqual([]);
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Escribí algo para anotar')).toBeTruthy();
    expect(problems(), 'captura con aviso').toEqual([]);
    await user.keyboard('{Escape}');

    await user.click(
      within(screen.getByRole('navigation', { name: 'Riel lateral' })).getByRole('button', {
        name: 'Apuntes',
      }),
    );
    await user.click(await screen.findByRole('button', { name: /^Media y dispersión/ }));
    await user.click(screen.getByRole('button', { name: 'Detalles' }));
    expect(await screen.findByRole('dialog', { name: /^Detalles de / })).toBeTruthy();
    expect(problems(), 'detalles').toEqual([]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    expect(await screen.findByRole('dialog', { name: 'Renombrar el tema' })).toBeTruthy();
    expect(problems(), 'renombrar').toEqual([]);
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Mover a…' }));
    expect(await screen.findByRole('dialog', { name: 'Mover a…' })).toBeTruthy();
    expect(problems(), 'mover').toEqual([]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Archivar' }));
    expect(await screen.findByText('Nota archivada.')).toBeTruthy();
    expect(problems(), 'con el cartel de deshacer').toEqual([]);
  });

  it('[CA-036] la pantalla de la primera vez, sin y con aviso', async () => {
    vi.stubGlobal('__VARIANTE__', 'real');
    const bridge = openBridge();
    bridges.push(bridge);
    window.retenia = bridge.api as unknown as typeof window.retenia;
    render(<App />);
    expect(await screen.findByText('¿Qué querés aprender ahora?')).toBeTruthy();
    expect(problems(), 'primera vez').toEqual([]);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Agregar mi primer material' }));
    expect(await screen.findByText('Escribí qué querés aprender')).toBeTruthy();
    expect(problems(), 'primera vez con aviso').toEqual([]);
  });

  it('[CA-036] el barrido de pantallas sabe encontrar un problema: «undefined» en pantalla se marca', () => {
    document.body.innerHTML = '<p>Próximo repaso: undefined</p>';
    expect(problems()).toEqual(['valor-tecnico: «undefined»']);
    document.body.innerHTML = '';
  });
});
