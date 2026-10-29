import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { findTextProblems } from '../../src/core/text-rules';
import { expect, test } from './apoyo';
import {
  editor,
  goTo,
  goToDestination,
  itemWith,
  openNote,
  openNotes,
  openSubjects,
} from './pasos';

// Lo que exigen las Fases 06 y 38 a cada pantalla, ahora sobre las pantallas de la Fase 07:
// teclado (CA-034), ventana angosta, zoom y escala de Windows (CA-035) y textos limpios (CA-036).

async function readable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = [document.body.innerText];
    for (const element of document.querySelectorAll(
      '[aria-label], [title], [alt], [placeholder]',
    )) {
      for (const attribute of ['aria-label', 'title', 'alt', 'placeholder']) {
        const value = element.getAttribute(attribute);
        if (value) {
          found.push(value);
        }
      }
    }
    return found;
  });
}

async function textProblems(page: Page): Promise<string[]> {
  return (await readable(page)).flatMap((text) =>
    findTextProblems(text).map((problem) => `${problem.rule}: «${problem.found}»`),
  );
}

// Lo que se sale de la ventana a los costados (menos el texto largo de una lista, que se corta
// a propósito con puntos suspensivos).
async function sidewaysProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      problems.push(
        `la ventana se desplaza a los costados (${root.scrollWidth} > ${root.clientWidth})`,
      );
    }
    const main = document.querySelector('main');
    if (main && main.scrollWidth > main.clientWidth) {
      problems.push(
        `la pantalla se desplaza a los costados (${main.scrollWidth} > ${main.clientWidth})`,
      );
    }
    for (const element of document.querySelectorAll('body *')) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) {
        continue;
      }
      // Los trazos de una fórmula (la raíz cuadrada, por ejemplo) los recorta la propia fórmula:
      // lo que cuenta es que la fórmula entera, que sí se mide, no se salga.
      if (element.closest('.katex') !== null && !element.classList.contains('katex')) {
        continue;
      }
      const label = `${element.tagName.toLowerCase()} «${(element.textContent ?? '').trim().slice(0, 30)}»`;
      if (rect.right > window.innerWidth + 1 || rect.left < -1) {
        problems.push(`se sale de la ventana: ${label}`);
      }
      const style = getComputedStyle(element);
      if (
        element.scrollWidth > element.clientWidth + 1 &&
        ['hidden', 'clip'].includes(style.overflowX) &&
        style.textOverflow !== 'ellipsis'
      ) {
        problems.push(`texto cortado: ${label}`);
      }
    }
    return problems;
  });
}

// Las pantallas nuevas, una por una, con lo que se puede abrir en cada una.
type Visit = (page: Page) => Promise<void>;
const SCREENS: readonly [string, Visit][] = [
  ['Estudiar', (page) => goToDestination(page, 'Estudiar')],
  [
    'Estudiar con el cuadro «Cambiar»',
    async (page) => {
      await openSubjects(page);
    },
  ],
  ['Apuntes › Notas', (page) => openNotes(page)],
  ['Apuntes › un tema', (page) => openNotes(page, 'Media y dispersión')],
  ['Apuntes › Sin tema', (page) => openNotes(page, 'Sin tema')],
  ['Apuntes › Archivadas', (page) => openNotes(page, 'Archivadas')],
  [
    'Apuntes › una nota',
    async (page) => {
      await openNotes(page);
      await openNote(page, 'Intervalos de confianza');
      await expect(editor(page).locator('.katex')).toBeVisible();
    },
  ],
  [
    'Apuntes › una nota con «Mencionada en»',
    async (page) => {
      await openNotes(page);
      await openNote(page, 'Intervalos de confianza');
      await page.getByRole('button', { name: 'Mencionada en' }).click();
    },
  ],
  ['Apuntes › Bandeja', (page) => goTo(page, 'Bandeja')],
  [
    'Apuntes › Papelera',
    async (page) => {
      await goTo(page, 'Papelera');
    },
  ],
  [
    'la primera vez',
    async (page) => {
      await goTo(page, 'Ajustes');
      await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
      await expect(page.getByText('¿Qué querés aprender ahora?')).toBeVisible();
    },
  ],
];

// Cada visita abre Retenia con su propia carpeta de datos: «la primera vez» deja anotado ese modo y
// la visita siguiente no vería el riel.
function folders(dataDir: string): () => string {
  let count = 0;
  return () => {
    count += 1;
    const folder = join(dataDir, `visita-${count}`);
    mkdirSync(folder, { recursive: true });
    return folder;
  };
}

test('[CA-035] en una ventana de 400 píxeles de ancho, las pantallas nuevas no se desplazan a los costados', async ({
  launchFromStart,
  dataDir,
}) => {
  const folder = folders(dataDir);
  for (const [name, visit] of SCREENS) {
    const { page, close } = await launchFromStart(folder());
    await page.setViewportSize({ width: 400, height: 700 });
    await visit(page);
    expect(await sidewaysProblems(page), name).toEqual([]);
    await close();
  }
});

test('[CA-035] con zoom al 150 % y con la escala de Windows al 125 % (simulados), las pantallas nuevas no se desplazan a los costados', async ({
  launchFromStart,
  dataDir,
}) => {
  const folder = folders(dataDir);
  // 960 píxeles de ventana a 150 % de zoom son 640 de ancho útil; a 125 % de escala, 768.
  for (const [width, label] of [
    [640, 'zoom 150 %'],
    [768, 'escala 125 %'],
  ] as const) {
    for (const [name, visit] of SCREENS) {
      const { page, close } = await launchFromStart(folder());
      await page.setViewportSize({ width, height: 720 });
      await visit(page);
      expect(await sidewaysProblems(page), `${name} (${label})`).toEqual([]);
      await close();
    }
  }
});

test('[CA-036] ninguna pantalla nueva muestra «undefined», «null», «NaN», «[object Object]», inglés suelto ni relleno, ni las palabras prohibidas', async ({
  launchFromStart,
  dataDir,
}) => {
  const folder = folders(dataDir);
  for (const [name, visit] of SCREENS) {
    const { page, close } = await launchFromStart(folder());
    await visit(page);
    expect(await textProblems(page), name).toEqual([]);
    await close();
  }
});

test('[CA-034] sin mouse: se llega a todo en Apuntes con Tab, Enter y Esc, y siempre se ve dónde está el foco', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.mouse.move(0, 0);
  await page.keyboard.press('Control+2');
  await expect(page.getByRole('heading', { level: 2, name: 'Apuntes' })).toBeVisible();

  const focus = () =>
    page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const style = getComputedStyle(element);
      return {
        name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40),
        outline: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
        inEditor: element.closest('[contenteditable="true"]') !== null,
      };
    });

  // Con Tab se recorre todo y cada parada tiene su contorno (en un campo de texto o en el editor
  // el contorno lo marca el propio campo).
  const stops = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const now = await focus();
    stops.add(now.name);
    expect(now.outline === 'none', `sin contorno en «${now.name}»`).toBe(false);
    expect(now.width, `contorno fino en «${now.name}»`).toBeGreaterThanOrEqual(2);
  }
  expect([...stops]).toEqual(expect.arrayContaining(['Nueva nota', 'Nuevo tema']));

  // Enter sobre «Nueva nota» la crea y deja el foco en el título.
  await page.getByRole('button', { name: 'Nueva nota' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Título' })).toBeFocused();
  // Del título, Tab llega al editor; ahí no hay nada que anidar, así que el foco sigue su camino:
  // el editor no es una trampa de teclado.
  await page.keyboard.press('Tab');
  expect((await focus()).inEditor).toBe(true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect((await focus()).inEditor).toBe(false);
});

test('[CA-034] sin mouse: Esc cierra el cuadro «Mover a…» y el foco vuelve al botón que lo abrió', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  const button = itemWith(page, 'Media y desvío').getByRole('button', { name: 'Mover a…' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Mover a…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Mover a…' })).toHaveCount(0);
  await expect(button).toBeFocused();
});
