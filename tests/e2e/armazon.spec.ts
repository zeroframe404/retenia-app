import type { Page } from '@playwright/test';
import { findTextProblems } from '../../src/core/text-rules';
import { expect, test } from './apoyo';
import { goTo, goToDestination, rail } from './pasos';

// El armazón (H-08) de punta a punta, como lo usa una persona: el riel, los atajos, la apariencia,
// la ventana angosta, el zoom y los textos. Selectores por rol y por el texto que se ve; lo único
// que se mira por atributo es el rol del botón primario (`data-button`), que no existe en ARIA.

const DESTINATIONS = [
  'Estudiar',
  'Apuntes',
  'Materiales',
  'Idiomas',
  'Progreso',
  'Ajustes',
] as const;

// Los colores de los tokens, ya resueltos como los da el navegador.
const RGB = {
  light: { brand: 'rgb(36, 67, 179)', paper: 'rgb(243, 244, 246)' },
  dark: { brand: 'rgb(147, 168, 255)', paper: 'rgb(18, 20, 25)' },
};

const primaries = (page: Page) => page.locator('main [data-button="primary"]');

// Todo lo que se lee en pantalla: el texto y las etiquetas que lee el lector de pantalla.
async function readable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = [document.body.innerText];
    for (const element of document.querySelectorAll('[aria-label], [title], [alt]')) {
      for (const attribute of ['aria-label', 'title', 'alt']) {
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

// Lo que se sale de la ventana a los costados o queda cortado (menos el texto largo de una lista,
// que se corta a propósito con puntos suspensivos).
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
      // Lo que solo leen los lectores de pantalla mide 1 píxel y está recortado a propósito.
      if (rect.width <= 2 || rect.height <= 2) {
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

test('[CA-031] el riel tiene «Buscar» y, en orden, Estudiar, Apuntes, Materiales, Idiomas, Progreso y Ajustes', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await expect(page.getByRole('heading', { level: 1, name: 'Retenia' })).toBeVisible();
  await expect(rail(page).getByRole('button')).toHaveText(['BuscarCtrl+K', ...DESTINATIONS]);
  // Abre en Estudiar y lo marca como la pantalla actual.
  await expect(page.getByRole('heading', { level: 2, name: 'Estudiar' })).toBeVisible();
  await expect(rail(page).getByRole('button', { name: 'Estudiar', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('[CA-031] cada pantalla abre con su título y tiene exactamente un botón primario, de color cobalto', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const destination of DESTINATIONS) {
      await goToDestination(page, destination);
      await expect(primaries(page), `${destination} (${scheme})`).toHaveCount(1);
      const background = await primaries(page).evaluate(
        (button) => getComputedStyle(button).backgroundColor,
      );
      expect(background, `${destination} (${scheme})`).toBe(RGB[scheme].brand);
    }
  }
});

test('[CA-031] lo que todavía no existe dice «Todavía no disponible» y «Ir a Apuntes» lleva a Apuntes, donde viven las tarjetas', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  for (const destination of ['Estudiar', 'Materiales', 'Idiomas', 'Progreso'] as const) {
    await goToDestination(page, destination);
    await expect(page.getByText(/^Todavía no disponible\./)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Ir a Apuntes' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Apuntes' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Tarjetas' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('[CA-031] la pantalla provisoria «Tarjetas» ya no está en el riel: vive adentro de Apuntes, con la Papelera y la Actividad reciente', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await expect(rail(page).getByRole('button', { name: 'Tarjetas' })).toHaveCount(0);
  await goTo(page, 'Papelera');
  await goTo(page, 'Actividad reciente');
  await goTo(page, 'Tarjetas');
  await expect(page.getByRole('heading', { level: 2, name: 'Apuntes' })).toBeVisible();
});

test('[CA-032] «Oscuro» cambia toda la interfaz al instante, y la elección sigue al cerrar y abrir', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  await first.page.emulateMedia({ reducedMotion: 'reduce' });
  await goTo(first.page, 'Ajustes');
  const group = first.page.getByRole('group', { name: 'Tema de la interfaz' });
  await expect(group.getByRole('radio', { name: 'Según el sistema' })).toBeChecked();

  await group.getByRole('radio', { name: 'Oscuro' }).check();
  // Al instante: apenas se toca, sin esperar a nada.
  const now = await first.page.evaluate(() => ({
    attribute: document.documentElement.dataset.theme,
    background: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  expect(now).toEqual({ attribute: 'dark', background: RGB.dark.paper, scheme: 'dark' });
  // El marco de la ventana también pasa a oscuro.
  expect(await first.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  await first.close();

  const second = await launchFromStart(dataDir);
  await expect(second.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await second.page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    RGB.dark.paper,
  );
  expect(await second.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
  await goTo(second.page, 'Ajustes');
  await expect(second.page.getByRole('radio', { name: 'Oscuro' })).toBeChecked();

  // «Claro» lo vuelve y también se recuerda.
  await second.page.getByRole('radio', { name: 'Claro' }).check();
  expect(await second.page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    RGB.light.paper,
  );
  await second.close();
  const third = await launchFromStart(dataDir);
  await expect(third.page.locator('html')).toHaveAttribute('data-theme', 'light');
  await goTo(third.page, 'Ajustes');
  await expect(third.page.getByRole('radio', { name: 'Claro' })).toBeChecked();

  // «Según el sistema» suelta el tema: lo decide el sistema.
  await third.page.getByRole('radio', { name: 'Según el sistema' }).check();
  await expect(third.page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await third.close();
  const fourth = await launchFromStart(dataDir);
  await goTo(fourth.page, 'Ajustes');
  await expect(fourth.page.getByRole('radio', { name: 'Según el sistema' })).toBeChecked();
  await expect(fourth.page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(await fourth.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system');
});

test('[CA-032] sin elección, la interfaz sigue al sistema: oscura si el sistema es oscuro, clara si es claro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    RGB.dark.paper,
  );
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    RGB.light.paper,
  );
});

test('[CA-034] sin mouse: Ctrl+1 a Ctrl+6 abren cada destino y el foco queda en su título', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  for (const [index, destination] of DESTINATIONS.entries()) {
    await page.keyboard.press(`Control+${index + 1}`);
    const heading = page.getByRole('heading', { level: 2, name: destination });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
  }
});

interface FocusInfo {
  isBody: boolean;
  name: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineOffset: string;
  inView: boolean;
}

async function focusInfo(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const label =
      element.getAttribute('aria-label') ??
      (element as HTMLInputElement).labels?.[0]?.textContent ??
      element.textContent ??
      '';
    return {
      isBody: element === document.body,
      name: label.trim(),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      inView:
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth,
    };
  });
}

// Lo que tiene que cumplir todo lo que recibe el foco: un contorno de 2 píxeles con 2 de
// separación, a la vista.
function expectVisibleFocus(info: FocusInfo, where: string) {
  expect(info.isBody, `${where}: el foco no está en ningún lado`).toBe(false);
  expect(info.outlineStyle, `${where} (${info.name})`).toBe('solid');
  expect(info.outlineWidth, `${where} (${info.name})`).toBe('2px');
  expect(info.outlineOffset, `${where} (${info.name})`).toBe('2px');
  expect(info.inView, `${where} (${info.name}) está fuera de la ventana`).toBe(true);
}

test('[CA-034] aunque antes se haya usado el mouse, Ctrl+3 deja el contorno del foco a la vista en el título de la pantalla', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  // Primero el mouse, como en la prueba manual: un clic en el riel y otro en un botón.
  await rail(page).getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('button', { name: 'Verificar datos' }).click();
  await page.keyboard.press('Control+3');
  const heading = page.getByRole('heading', { level: 2, name: 'Materiales' });
  await expect(heading).toBeFocused();
  expectVisibleFocus(await focusInfo(page), 'el título de Materiales después de usar el mouse');
  // Lo mismo con Ctrl+K: el cuadro deja el contorno en su primer botón.
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  expectVisibleFocus(await focusInfo(page), 'el cuadro «Buscar» después de usar el mouse');
  await page.keyboard.press('Escape');
  // Y al cerrarlo, el foco que vuelve también se ve.
  expectVisibleFocus(await focusInfo(page), 'el foco que vuelve al cerrar el cuadro');
});

test('[CA-034] sin mouse: con Tab se llega a todo lo de Materiales y siempre se ve dónde está el foco', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.keyboard.press('Control+3');
  await expect(page.getByRole('heading', { level: 2, name: 'Materiales' })).toBeFocused();
  expectVisibleFocus(await focusInfo(page), 'el título de Materiales');

  // De ahí, el siguiente Tab llega a lo que sigue en la pantalla; después da la vuelta por el riel.
  const visited: string[] = [];
  for (let presses = 0; presses < 9; presses += 1) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page);
    expectVisibleFocus(info, `Tab ${presses + 1}`);
    visited.push(info.name);
  }
  expect(visited).toEqual([
    'Ir a Apuntes',
    'BuscarCtrl+K',
    'Estudiar',
    'Apuntes',
    'Materiales',
    'Idiomas',
    'Progreso',
    'Ajustes',
    'Ir a Apuntes',
  ]);
});

test('[CA-034] sin mouse: Enter sobre un botón lo acciona y Esc cierra lo que se abrió, devolviendo el foco', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.keyboard.press('Control+3');
  const heading = page.getByRole('heading', { level: 2, name: 'Materiales' });
  await expect(heading).toBeFocused();
  // Tab hasta «Buscar» y Enter: abre el cuadro.
  for (let presses = 0; presses < 10; presses += 1) {
    await page.keyboard.press('Tab');
    if ((await focusInfo(page)).name.startsWith('Buscar')) {
      break;
    }
  }
  expect((await focusInfo(page)).name).toMatch(/^Buscar/);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await expect(dialog).toBeVisible();
  expectVisibleFocus(await focusInfo(page), 'el cuadro «Buscar»');
  // Tab no se escapa del cuadro: da la vuelta adentro.
  for (let presses = 0; presses < 3; presses += 1) {
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // El foco vuelve a «Buscar», que fue lo que abrió el cuadro.
  expect((await focusInfo(page)).name).toMatch(/^Buscar/);

  // Ctrl+K abre lo mismo desde cualquier lado.
  await page.keyboard.press('Control+K');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('[CA-034] sin mouse: Enter sobre un destino del riel abre su pantalla', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.keyboard.press('Control+6');
  await expect(page.getByRole('heading', { level: 2, name: 'Ajustes' })).toBeFocused();
  // Shift+Tab sube al último botón del riel, «Ajustes»; antes, «Progreso».
  await page.keyboard.press('Shift+Tab');
  expect((await focusInfo(page)).name).toBe('Ajustes');
  await page.keyboard.press('Shift+Tab');
  expect((await focusInfo(page)).name).toBe('Progreso');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Progreso' })).toBeVisible();
});

test('[CA-034] sin mouse: se recorre todo Ajustes con Tab, sin saltear nada, y las opciones de «Apariencia» se mueven con las flechas', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.keyboard.press('Control+6');
  await expect(page.getByRole('heading', { level: 2, name: 'Ajustes' })).toBeFocused();
  // Cuántas paradas de Tab hay: cada control suelto y una por cada grupo de opciones.
  const expected = await page.evaluate(() => {
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((control) => {
      const rect = control.getBoundingClientRect();
      return !(control as HTMLButtonElement).disabled && (rect.width > 0 || rect.height > 0);
    });
    const groups = new Set<string>();
    let single = 0;
    for (const control of controls) {
      if (control instanceof HTMLInputElement && control.type === 'radio') {
        groups.add(control.name);
      } else {
        single += 1;
      }
    }
    return single + groups.size;
  });
  expect(expected).toBeGreaterThan(14);

  // Desde el título, Tab llega al resto de la pantalla y después da la vuelta por el riel.
  const visited: string[] = [];
  let radioStops = 0;
  for (let presses = 0; presses < expected; presses += 1) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page);
    expectVisibleFocus(info, `Tab ${presses + 1}`);
    visited.push(info.name);
    const isRadio = await page.evaluate(
      () => (document.activeElement as HTMLInputElement).type === 'radio',
    );
    if (isRadio) {
      radioStops += 1;
    }
  }
  expect(radioStops).toBe(1);
  expect(
    visited.filter((name, index) => visited.indexOf(name) !== index),
    'paradas repetidas',
  ).toEqual([]);
  expect(new Set(visited).size).toBe(visited.length);
  expect(visited).toContain('Hacer copia ahora');
  expect(visited).toContain('Verificar datos');
  expect(visited).toContain('Galería');
  expect(visited).toContain('Laboratorio');

  // Las opciones se mueven con las flechas y cada una se aplica en el acto.
  await page.getByRole('radio', { name: 'Según el sistema' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expectVisibleFocus(await focusInfo(page), 'la opción «Oscuro»');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Claro' })).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Según el sistema' })).toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test('[CA-035] en una ventana de 400 píxeles de ancho, las seis pantallas no se desplazan a los costados y el riel se compacta', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.setViewportSize({ width: 400, height: 700 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(400);
  for (const destination of DESTINATIONS) {
    await goToDestination(page, destination);
    expect(await sidewaysProblems(page), destination).toEqual([]);
    // El riel compacto sigue teniendo todos los nombres para el lector de pantalla y no tapa nada.
    const railBox = await rail(page).boundingBox();
    expect(railBox?.width ?? 0, destination).toBeLessThan(80);
    await expect(rail(page).getByRole('button', { name: destination, exact: true })).toBeVisible();
  }
  // Apuntes con sus tres secciones, y Ajustes con la demostración y la galería.
  for (const section of ['Papelera', 'Actividad reciente', 'Tarjetas'] as const) {
    await goTo(page, section);
    expect(await sidewaysProblems(page), section).toEqual([]);
  }
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Galería' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Galería' })).toBeVisible();
  expect(await sidewaysProblems(page), 'Galería').toEqual([]);
});

test('[CA-035] la ventana de verdad no se deja achicar más de 400 píxeles de ancho ni 360 de alto', async ({
  launchFromStart,
}) => {
  const { app } = await launchFromStart();
  // Se pide una ventana más chica que el mínimo (el tamaño del contenido, sin el marco).
  const resize = (width: number, height: number) =>
    app.evaluate(
      ({ BrowserWindow }, [wanted, tall]) => {
        const [window_] = BrowserWindow.getAllWindows();
        window_?.setContentSize(wanted ?? 0, tall ?? 0);
        return window_?.getContentSize();
      },
      [width, height],
    );
  expect(await resize(300, 600)).toEqual([400, 600]);
  expect(await resize(300, 200)).toEqual([400, 360]);
  expect(await resize(900, 500)).toEqual([900, 500]);
});

test('[CA-035] el zoom se maneja con el teclado: Ctrl y + sube a 110 %, 125 % y 150 %, Ctrl y - baja y Ctrl y 0 vuelve al 100 %', async ({
  launchFromStart,
}) => {
  const { app, page } = await launchFromStart();
  const factor = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor(),
    );
  expect(await factor()).toBe(1);
  // Chromium guarda el zoom como un nivel y lo devuelve con un resto de la cuenta (1,7499999…).
  for (const expected of [1.1, 1.25, 1.5]) {
    await page.keyboard.press('Control+Equal');
    await expect.poll(factor).toBeCloseTo(expected, 5);
  }
  await page.keyboard.press('Control+Shift+Equal');
  await expect.poll(factor).toBeCloseTo(1.75, 5);
  await page.keyboard.press('Control+Minus');
  await expect.poll(factor).toBeCloseTo(1.5, 5);
  await page.keyboard.press('Control+0');
  await expect.poll(factor).toBe(1);
  await page.keyboard.press('Control+Minus');
  await expect.poll(factor).toBeCloseTo(0.9, 5);
  await page.keyboard.press('Control+0');
  await expect.poll(factor).toBe(1);
});

test('[CA-035] con zoom al 150 % (Ctrl y + tres veces), las seis pantallas no se desplazan a los costados ni cortan texto', async ({
  launchFromStart,
}) => {
  const { app, page } = await launchFromStart();
  const factor = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor(),
    );
  for (let presses = 0; presses < 3; presses += 1) {
    await page.keyboard.press('Control+Equal');
  }
  await expect.poll(factor).toBeCloseTo(1.5, 5);
  // Una ventana ancha (el riel completo) y una angosta (el riel compacto).
  for (const width of [1100, 600]) {
    await page.setViewportSize({ width, height: 720 });
    expect(await page.evaluate(() => Math.round(window.innerWidth * 1.5))).toBe(width);
    for (const destination of DESTINATIONS) {
      await goToDestination(page, destination);
      expect(await sidewaysProblems(page), `${destination} a ${width} px`).toEqual([]);
    }
    await goTo(page, 'Tarjetas');
    expect(await sidewaysProblems(page), `Tarjetas a ${width} px`).toEqual([]);
  }
  await page.keyboard.press('Control+0');
  await expect.poll(factor).toBe(1);
});

test('[CA-035] con la escala de Windows al 125 % (simulada), las seis pantallas no se desplazan a los costados ni cortan texto', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, [
    '--force-device-scale-factor=1.25',
  ]);
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1.25);
  for (const width of [1100, 400]) {
    await page.setViewportSize({ width, height: 720 });
    for (const destination of DESTINATIONS) {
      await goToDestination(page, destination);
      expect(await sidewaysProblems(page), `${destination} a ${width} px`).toEqual([]);
    }
    await goTo(page, 'Tarjetas');
    expect(await sidewaysProblems(page), `Tarjetas a ${width} px`).toEqual([]);
  }
});

test('[CA-036] ninguna pantalla muestra «undefined», «null», «NaN», «[object Object]», inglés suelto ni relleno, ni las palabras prohibidas', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  for (const destination of DESTINATIONS) {
    await goToDestination(page, destination);
    expect(await textProblems(page), destination).toEqual([]);
  }
  for (const section of ['Papelera', 'Actividad reciente', 'Tarjetas'] as const) {
    await goTo(page, section);
    expect(await textProblems(page), section).toEqual([]);
  }
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Galería' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Galería' })).toBeVisible();
  expect(await textProblems(page), 'Galería').toEqual([]);
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  expect(await textProblems(page), 'Buscar').toEqual([]);
});

test('[CA-036] el control sabe encontrar un problema: «undefined» a la vista se marca', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.evaluate(() => {
    const note = document.createElement('p');
    note.textContent = 'Próximo repaso: undefined';
    document.querySelector('main')?.append(note);
  });
  expect(await textProblems(page)).toEqual(['valor-tecnico: «undefined»']);
});

test('el nombre «Retenia» va escrito con la tipografía de títulos, sin logotipo', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const brand = page.getByRole('heading', { level: 1, name: 'Retenia' });
  await expect(brand).toBeVisible();
  expect(await brand.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(
    /^"Bricolage Grotesque"/,
  );
  expect(await page.locator('img, picture, canvas').count()).toBe(0);
});

test('cada pantalla arranca desde arriba, aunque la anterior estuviera desplazada', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.setViewportSize({ width: 960, height: 400 });
  await goToDestination(page, 'Ajustes');
  const main = page.getByRole('main');
  await main.evaluate((element) => {
    element.scrollTop = 300;
  });
  expect(await main.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await goToDestination(page, 'Estudiar');
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
});

test('[CA-035] un título de lista larguísimo se corta con puntos suspensivos pero se puede leer entero apoyando el mouse', async ({
  launch,
}) => {
  const { page } = await launch();
  await page.setViewportSize({ width: 960, height: 640 });
  const question = `¿${'Qué mide el desvío estándar de una muestra '.repeat(4)}?`;
  await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await page.getByRole('textbox', { name: 'Pregunta' }).fill(question);
  await page.getByRole('textbox', { name: 'Respuesta' }).fill('x');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const title = page.getByRole('listitem').first().locator('p').first();
  await expect(title).toHaveAttribute('title', question);
  expect(await title.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
});
