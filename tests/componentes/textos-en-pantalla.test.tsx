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

  it('[CA-036] las tres secciones de Apuntes, con tarjetas, Papelera y Actividad reciente de verdad', async () => {
    const { user } = await openApp();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Riel lateral' })).getByRole('button', {
        name: 'Apuntes',
      }),
    );
    expect(await screen.findByText('¿Qué mide el desvío estándar?')).toBeTruthy();
    expect(problems(), 'Tarjetas').toEqual([]);
    const sections = screen.getByRole('navigation', { name: 'Secciones de Apuntes' });
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

  it('[CA-036] el barrido de pantallas sabe encontrar un problema: «undefined» en pantalla se marca', () => {
    document.body.innerHTML = '<p>Próximo repaso: undefined</p>';
    expect(problems()).toEqual(['valor-tecnico: «undefined»']);
    document.body.innerHTML = '';
  });
});
