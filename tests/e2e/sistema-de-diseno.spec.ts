import type { Page } from '@playwright/test';
import { isRed } from '../apoyo/color';
import { expect, test } from './apoyo';
import { goTo } from './pasos';

// El sistema de diseño de punta a punta: la «Galería» con todos sus componentes y los seis
// estados, la regla visual central, las tipografías locales, la escala de letra, el foco y el
// movimiento. Lo que se mide es lo que el navegador dibuja de verdad, no lo que dicen los estilos.

const COMPONENTS = [
  'Botón',
  'Rótulo de modo',
  'Rótulo de dato',
  'Etiqueta de ejemplo',
  'Indicador de borrador',
  'Propuesta de sesión',
  'Compromiso semanal',
  'Barra de ayuda',
  'Confianza declarada',
  'Unidades de idea',
  'Resultado',
  'Aviso de evaluación corregida',
  'Valoración de sesión',
  'Cierre de sesión',
  'Estado de dominio',
  'Propuesta de ítem',
  'Etapas de procesamiento',
  'Aviso de estado',
];

const STATES = ['Vacío', 'Cargando', 'Error', 'Éxito', 'Sin permiso', 'Sin conexión'];

async function openGallery(page: Page) {
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Galería' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Galería' })).toBeVisible();
}

test('[CA-033] la «Galería» de Ajustes › «Demostración» muestra los 18 componentes, cada uno con su nombre', async ({
  launch,
}) => {
  const { page } = await launch();
  await openGallery(page);
  const region = page.getByRole('region', { name: 'Componentes' });
  await expect(region.getByRole('heading', { level: 3 })).toHaveText(COMPONENTS);
  await expect(region.getByRole('heading', { level: 3 })).toHaveCount(18);
  // «Volver a Ajustes» devuelve a Ajustes.
  await page.getByRole('button', { name: 'Volver a Ajustes' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Ajustes' })).toBeVisible();
});

test('[CA-033] la «Galería» muestra los seis estados (vacío, cargando, error, éxito, sin permiso y sin conexión), cada uno con una frase y una acción', async ({
  launch,
}) => {
  const { page } = await launch();
  await openGallery(page);
  const region = page.getByRole('region', { name: 'Los seis estados' });
  const figures = region.getByRole('figure');
  await expect(figures).toHaveCount(6);
  for (const [index, name] of STATES.entries()) {
    const figure = figures.nth(index);
    await figure.scrollIntoViewIfNeeded();
    await expect(figure.getByText(`Variante: ${name}`)).toBeVisible();
    await expect(figure.getByRole('button')).toHaveCount(1);
    await expect(figure.getByRole('button')).toBeVisible();
    // La frase es una oración en castellano, completa y a la vista.
    const phrase = await figure.locator('p').first().innerText();
    expect(phrase.trim().length).toBeGreaterThan(10);
    expect(phrase).toMatch(/[.…]$/);
  }
});

test('[CA-033] el panel lateral y el diálogo de la «Galería» se abren y se cierran con Esc', async ({
  launch,
}) => {
  const { page } = await launch();
  await openGallery(page);
  const frame = page.getByRole('region', { name: 'Armazón' });
  await expect(frame.getByRole('complementary', { name: 'Panel de ejemplo' })).toBeVisible();
  await frame.getByRole('button', { name: 'Abrir el diálogo de ejemplo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Diálogo de ejemplo' });
  await expect(dialog).toBeVisible();
  // Lo único que flota lleva sombra marcada; las tarjetas, una leve.
  const shadow = await dialog.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(shadow).not.toBe('none');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(frame.getByRole('button', { name: 'Abrir el diálogo de ejemplo' })).toBeFocused();
});

// Todos los colores que el navegador dibuja en lo que se ve: texto, fondos, bordes, contornos,
// trazos de los íconos y sombras.
async function paintedColors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const properties = [
      'color',
      'backgroundColor',
      'borderTopColor',
      'borderRightColor',
      'borderBottomColor',
      'borderLeftColor',
      'outlineColor',
      'fill',
      'stroke',
      'textDecorationColor',
      'boxShadow',
    ] as const;
    const found = new Set<string>();
    for (const element of document.querySelectorAll('body, body *')) {
      const style = getComputedStyle(element);
      for (const property of properties) {
        const value = style[property];
        for (const match of value.matchAll(/(?:rgba?|color)\([^)]*\)/g)) {
          found.add(match[0]);
        }
      }
    }
    return [...found];
  });
}

// Pasa «rgb(36, 67, 179)» o «color(srgb 0.14 0.26 0.7 / 0.3)» a «#2443b3»; null si es transparente.
function toHex(color: string): string | null {
  const numbers = (/\(([^)]*)\)/.exec(color)?.[1] ?? '').split(/[\s,/]+/).filter(Boolean);
  let rgb: number[];
  let alpha = 1;
  if (color.startsWith('color(')) {
    rgb = numbers.slice(1, 4).map((n) => Math.round(Number(n) * 255));
    alpha = numbers[4] === undefined ? 1 : Number(numbers[4]);
  } else {
    rgb = numbers.slice(0, 3).map(Number);
    alpha = numbers[3] === undefined ? 1 : Number(numbers[3]);
  }
  if (alpha === 0 || rgb.length < 3 || rgb.some(Number.isNaN)) {
    return null;
  }
  return `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

test('[CA-037] «Resultado» en su variante «Todavía no.» tiene fondo gris neutro, palabra e ícono, y en toda la galería no hay nada rojo', async ({
  launch,
}) => {
  const { page } = await launch();
  await openGallery(page);
  const expectedGray = { light: 'rgb(233, 235, 239)', dark: 'rgb(13, 15, 19)' };
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const figure = page.getByRole('figure', { name: 'Variante: Todavía no.', exact: true });
    await figure.scrollIntoViewIfNeeded();
    const result = figure.getByRole('status');
    await expect(result.getByText('Todavía no.', { exact: true })).toBeVisible();
    await expect(result.locator('svg')).toHaveCount(1);
    await expect(result.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    const look = await result.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, tone: element.getAttribute('data-tone') };
    });
    expect(look, scheme).toEqual({ background: expectedGray[scheme], tone: 'neutral' });

    const colors = await paintedColors(page);
    expect(colors.length).toBeGreaterThan(15);
    const reds = colors.filter((color) => {
      const hex = toHex(color);
      return hex !== null && isRed(hex);
    });
    expect(reds, `colores rojos en la galería (${scheme})`).toEqual([]);
  }
});

test('[CA-037] el control de rojo sabe encontrar uno: un texto rojo a la vista se marca', async ({
  launch,
}) => {
  const { page } = await launch();
  await page.evaluate(() => {
    const note = document.createElement('p');
    note.textContent = 'Algo';
    note.style.color = 'rgb(211, 47, 47)';
    document.querySelector('main')?.append(note);
  });
  const reds = (await paintedColors(page)).filter((color) => {
    const hex = toHex(color);
    return hex !== null && isRed(hex);
  });
  expect(reds).toEqual(['rgb(211, 47, 47)']);
});

test('la regla visual central: lo observado con trazo lleno; lo estimado, lo provisional y las propuestas sin aceptar, punteado', async ({
  launch,
}) => {
  const { page } = await launch();
  await openGallery(page);
  const border = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.borderTopStyle, width: Number.parseFloat(style.borderTopWidth) };
      });
  const root = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--trazo-ancho').trim(),
  );
  expect(root).toBe('1.5px');

  const region = page.getByRole('region', { name: 'Componentes' });
  const observed = region.getByText('Observado · 84 datos');
  const estimated = region.getByText('Estimado · 30 datos');
  const insufficient = region.getByText('Datos insuficientes · 6 datos');
  const example = region.getByText('EJEMPLO', { exact: true });
  const styleOf = (locator: ReturnType<typeof region.getByText>) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.borderTopStyle, width: Number.parseFloat(style.borderTopWidth) };
    });
  expect((await styleOf(observed)).style).toBe('solid');
  for (const dashed of [estimated, insufficient, example]) {
    expect((await styleOf(dashed)).style).toBe('dashed');
  }
  expect((await styleOf(observed)).width).toBeGreaterThanOrEqual(1);

  // Cada pieza marcada con trazo punteado se dibuja punteada y cada una con trazo lleno, llena.
  const mismatches = await page.evaluate(() => {
    const wrong: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('main [data-stroke]')) {
      const style = getComputedStyle(element);
      const expected = element.dataset.stroke === 'dashed' ? 'dashed' : 'solid';
      // Si la pieza misma no tiene borde (la escala de dominio), lo dibujan sus partes.
      const own = Number.parseFloat(style.borderTopWidth) > 0;
      const drawn = own
        ? [element]
        : [...element.querySelectorAll<HTMLElement>('*')].filter(
            (part) => Number.parseFloat(getComputedStyle(part).borderTopWidth) > 0,
          );
      if (
        drawn.length === 0 ||
        drawn.some((part) => getComputedStyle(part).borderTopStyle !== expected)
      ) {
        wrong.push(`${element.dataset.component ?? element.className} (${element.dataset.stroke})`);
      }
    }
    return wrong;
  });
  expect(mismatches).toEqual([]);
  expect((await border('[data-component="session-proposal"]')).style).toBe('dashed');
  expect((await border('[data-component="proposal-item"]')).style).toBe('dashed');
  expect((await border('[data-component="session-closing"]')).style).toBe('solid');
});

test('las tres tipografías son locales y se cargan sin internet: títulos, texto y código', async ({
  launch,
}) => {
  const { page } = await launch();
  const loaded = await page.evaluate(async () => {
    const faces = await Promise.all([
      document.fonts.load('650 24px "Bricolage Grotesque"'),
      document.fonts.load('400 16px "Atkinson Hyperlegible Next"'),
      document.fonts.load('600 16px "Atkinson Hyperlegible Next"'),
      document.fonts.load('700 12px "Atkinson Hyperlegible Next"'),
      document.fonts.load('400 14px "Atkinson Hyperlegible Mono"'),
    ]);
    await document.fonts.ready;
    return faces.map((list) => list.map((face) => `${face.family}:${face.status}`));
  });
  expect(loaded.flat()).toEqual([
    'Bricolage Grotesque:loaded',
    'Atkinson Hyperlegible Next:loaded',
    'Atkinson Hyperlegible Next:loaded',
    'Atkinson Hyperlegible Next:loaded',
    'Atkinson Hyperlegible Mono:loaded',
  ]);
  // Los títulos usan Bricolage Grotesque y el texto, Atkinson Hyperlegible Next.
  const families = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector('h2') as Element).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  }));
  expect(families.title).toMatch(/^"Bricolage Grotesque"/);
  expect(families.body).toMatch(/^"Atkinson Hyperlegible Next"/);
});

test('la escala de letra se dibuja con los tamaños, altos y pesos del plan', async ({ launch }) => {
  const { page } = await launch();
  await openGallery(page);
  const metrics = (locator: ReturnType<typeof page.locator>) =>
    locator.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        size: style.fontSize,
        line: style.lineHeight,
        weight: style.fontWeight,
        transform: style.textTransform,
        spacing: style.letterSpacing,
      };
    });
  expect(await metrics(page.getByRole('heading', { level: 2, name: 'Galería' }))).toMatchObject({
    size: '24px',
    line: '30px',
    weight: '650',
  });
  expect(await metrics(page.getByRole('heading', { level: 3, name: 'Botón' }))).toMatchObject({
    size: '18px',
    line: '26px',
    weight: '600',
  });
  expect(await metrics(page.getByText('PRÁCTICA CON AYUDA'))).toEqual({
    size: '12px',
    line: '16px',
    weight: '700',
    transform: 'uppercase',
    spacing: '0.72px',
  });
  expect(await metrics(page.locator('body'))).toMatchObject({
    size: '16px',
    line: '26px',
    weight: '400',
  });
  // Los controles miden 40 píxeles de alto.
  const heights = await page
    .getByRole('region', { name: 'Componentes' })
    .getByRole('button', { name: 'Empezar' })
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(heights).toBe(40);
});

test('el foco se ve siempre: contorno de 2 píxeles con 2 de separación, en claro y en oscuro', async ({
  launch,
}) => {
  const { page } = await launch();
  await openGallery(page);
  const expectedColor = { light: 'rgb(36, 67, 179)', dark: 'rgb(185, 199, 255)' };
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const button = page
      .getByRole('region', { name: 'Componentes' })
      .getByRole('button', { name: 'Empezar' })
      .first();
    await button.scrollIntoViewIfNeeded();
    // El foco llega con el teclado: Tab al siguiente y Shift+Tab de vuelta.
    await button.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    const ring = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        offset: style.outlineOffset,
        color: style.outlineColor,
      };
    });
    expect(ring, scheme).toEqual({
      style: 'solid',
      width: '2px',
      offset: '2px',
      color: expectedColor[scheme],
    });
  }
});

test('el movimiento dura 120 milisegundos y «reducir movimiento» lo quita', async ({ launch }) => {
  const { page } = await launch();
  await openGallery(page);
  const button = page
    .getByRole('region', { name: 'Componentes' })
    .getByRole('button', {
      name: 'Versión corta (10 min)',
    })
    .first();
  await button.scrollIntoViewIfNeeded();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await button.hover();
  expect(await button.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    '0.12s, 0.12s',
  );
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--movimiento-normal').trim(),
    ),
  ).toBe('200ms');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await button.hover();
  expect(await button.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    '0s, 0s',
  );
});
