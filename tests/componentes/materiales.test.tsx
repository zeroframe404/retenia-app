import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import { runRaw } from '../apoyo/base-cruda';
import { closeWindows, openWindow } from './apoyo-ventana';
import './editor-apoyo';

// La pantalla Materiales (Fase 13) en la ventana entera, contra el puente real y una carpeta de
// datos real. Los archivos que se eligen o se sueltan llegan por el puente de archivos (simulado:
// en jsdom no hay archivos del disco; el doble los busca por nombre en datos-de-ejemplo).

afterEach(closeWindows);

const SLOW = { timeout: 15_000 };

async function toMaterials(user: ReturnType<typeof openWindow>['user']) {
  const rail = await screen.findByRole('navigation', { name: 'Riel lateral' });
  await user.click(within(rail).getByRole('button', { name: 'Materiales' }));
  return screen.findByRole('heading', { level: 2, name: 'Materiales' });
}

async function withSubject() {
  const opened = openWindow();
  await opened.api['subjects.create']({ name: 'Estadística básica', makeActive: true });
  render(<App />);
  await toMaterials(opened.user);
  return opened;
}

async function openAddDialog(user: ReturnType<typeof openWindow>['user']) {
  await user.click(screen.getByRole('button', { name: 'Agregar material' }));
  return screen.findByRole('dialog', { name: 'Agregar material' });
}

async function chooseFiles(user: ReturnType<typeof openWindow>['user'], ...names: string[]) {
  const dialog = await openAddDialog(user);
  const input = within(dialog).getByLabelText('Elegir archivo') as HTMLInputElement;
  await user.upload(
    input,
    names.map((name) => new File(['x'], name)),
  );
}

const main = () => within(screen.getByRole('main'));

describe('la pantalla Materiales', () => {
  it('sin materiales: lo dice, y «Agregar material» es el único botón principal', async () => {
    await withSubject();
    expect(main().getByText('Todavía no hay materiales en esta materia.')).toBeTruthy();
    const primaries = [...document.querySelectorAll('[data-variant="primary"]')].map(
      (button) => button.textContent,
    );
    expect(primaries).toEqual(['Agregar material']);
  });

  it('«Agregar material»: arrastrar, «Elegir archivo» y «Pegar texto»; la materia activa preseleccionada y «Más opciones» plegado', async () => {
    const { user } = await withSubject();
    const dialog = await openAddDialog(user);
    expect(within(dialog).getByText('Arrastrá archivos acá')).toBeTruthy();
    expect(within(dialog).getByLabelText('Elegir archivo')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Pegar texto' })).toBeTruthy();
    const subject = within(dialog).getByRole('combobox', { name: 'Materia' }) as HTMLSelectElement;
    expect(subject.selectedOptions[0]?.textContent).toBe('Estadística básica');
    const more = within(dialog).getByRole('button', { name: 'Más opciones' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(within(dialog).queryByLabelText('Título (opcional)')).toBeNull();
    await user.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getByLabelText('Título (opcional)')).toBeTruthy();
  });

  it('[CA-107] «Pegar texto» con tres párrafos llega a «Listo» y se lee por secciones', async () => {
    const { user } = await withSubject();
    const dialog = await openAddDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Pegar texto' }));
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Texto' }),
      'Promedios en campana{Enter}{Enter}Los promedios se reparten en forma de campana.{Enter}{Enter}Eso permite calcular márgenes de error.{Enter}{Enter}Sin conocer la forma de la población.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Agregar' }));
    const item = await main().findByRole('button', { name: /Promedios en campana/ }, SLOW);
    await waitFor(() => expect(item.textContent).toContain('Listo'), SLOW);
    await user.click(item);
    const stages = await screen.findByRole('list', { name: 'Etapas del procesamiento' });
    expect(within(stages).getByText('Archivo guardado')).toBeTruthy();
    expect(within(stages).getByText('Texto extraído (4 párrafos)')).toBeTruthy();
    expect(within(stages).getByText('Secciones detectadas')).toBeTruthy();
    expect(within(stages).getByText('Listo')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Leer el original' }));
    expect(await screen.findByRole('heading', { name: 'Promedios en campana' })).toBeTruthy();
    expect(screen.getByText('Eso permite calcular márgenes de error.')).toBeTruthy();
  });

  it('[CA-108] (simulado) «no-es-un-pdf.pdf»: el mensaje, «Elegir otro» y «Pegar el texto», sin rojo', async () => {
    const { user } = await withSubject();
    await chooseFiles(user, 'no-es-un-pdf.pdf');
    const item = await main().findByRole('button', { name: /no-es-un-pdf/ }, SLOW);
    expect(item.textContent).toContain('Error');
    await user.click(item);
    const message = await screen.findByText('No pudimos leer este PDF (protegido o dañado)');
    expect(message.closest('[data-tone]')?.getAttribute('data-tone')).not.toBe('error');
    expect(screen.getByRole('button', { name: 'Elegir otro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pegar el texto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitar de la lista' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Pegar el texto' }));
    expect(await screen.findByRole('textbox', { name: 'Texto' })).toBeTruthy();
  });

  it('[CA-106] (simulado) el mismo archivo otra vez: el aviso con el nombre, la fecha y las tres opciones', async () => {
    const { user } = await withSubject();
    await chooseFiles(user, 'notas.md');
    await main().findByRole('button', { name: /notas/ }, SLOW);
    await chooseFiles(user, 'notas.md');
    const dialog = await screen.findByRole('dialog', {
      name: 'Parece que ya agregaste “notas.md” el 15/03/2027',
    });
    for (const name of ['Abrir el existente', 'Agregar como nueva versión', 'Agregar igual']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    }
    await user.click(within(dialog).getByRole('button', { name: 'Agregar igual' }));
    await waitFor(
      () => expect(main().getAllByRole('button', { name: /notas/ })).toHaveLength(2),
      SLOW,
    );
  });

  it('[CA-109] (simulado) mientras procesa: «Leer el original» y «Cancelar»; cancelar conserva el original y «Seguir procesando» termina', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const opened = openWindow('real', undefined, {
      holdExtraction: () => gate,
    });
    await opened.api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    render(<App />);
    const { user } = opened;
    await toMaterials(user);
    await chooseFiles(user, 'notas.md');
    const item = await main().findByRole('button', { name: /notas/ }, SLOW);
    await waitFor(() => expect(item.textContent).toContain('Procesando 0 de 1'), SLOW);
    await user.click(item);
    expect(screen.getByRole('button', { name: 'Leer el original' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('button', { name: 'Seguir procesando' })).toBeTruthy();
    release();
    await user.click(screen.getByRole('button', { name: 'Seguir procesando' }));
    await waitFor(
      () => expect(main().getByRole('button', { name: /notas/ }).textContent).toContain('Listo'),
      SLOW,
    );
  });
});

describe('el visor y la fuente anclada', () => {
  async function readNotes() {
    const opened = await withSubject();
    await chooseFiles(opened.user, 'notas.md');
    const item = await main().findByRole('button', { name: /notas/ }, SLOW);
    await waitFor(() => expect(item.textContent).toContain('Listo'), SLOW);
    await opened.user.click(item);
    await opened.user.click(screen.getByRole('button', { name: 'Leer el original' }));
    await screen.findByRole('heading', { name: 'Dispersión' });
    return opened;
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

  it('[CA-110] (simulado) elegir una frase ofrece «Crear tarjeta desde acá»; la tarjeta trae la frase como cita y su ficha «Ver en el original»', async () => {
    const { user, api } = await readNotes();
    const phrase = 'El desvío estándar mide cuánto se alejan los datos de la media.';
    select(phrase);
    await user.click(await screen.findByRole('button', { name: 'Crear tarjeta desde acá' }));
    const panel = await screen.findByRole('dialog', { name: 'Crear tarjeta desde acá' });
    expect(within(panel).getByText('notas · Dispersión')).toBeTruthy();
    expect(within(panel).getByText(phrase)).toBeTruthy();
    expect(
      (within(panel).getByRole('textbox', { name: 'Respuesta' }) as HTMLTextAreaElement).value,
    ).toBe(phrase);
    await user.type(
      within(panel).getByRole('textbox', { name: 'Pregunta' }),
      '¿Qué mide el desvío?',
    );
    await user.click(within(panel).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [card] = (await api['cards.list']({})).cards;
    const detail = await api['cards.get']({ cardId: card?.id ?? '' });
    expect(detail.sheet.source).toBe('notas · Dispersión');
    expect(detail.cite).toMatchObject({ quote: phrase, status: 'located' });
  });

  it('[CA-112] (simulado) «Guardar extracto» manda la frase a la Bandeja con su referencia', async () => {
    const { user, api } = await readNotes();
    select('La moda es el valor que más se repite.');
    await user.click(await screen.findByRole('button', { name: 'Guardar extracto' }));
    expect(await screen.findByText('Extracto guardado en la Bandeja')).toBeTruthy();
    const { items } = await api['inbox.list']({});
    expect(items[0]).toMatchObject({
      text: 'La moda es el valor que más se repite.',
      source: 'notas · Medidas de centro',
    });
  });

  it('la Bandeja muestra el extracto con su referencia debajo', async () => {
    const { user } = await readNotes();
    select('La moda es el valor que más se repite.');
    await user.click(await screen.findByRole('button', { name: 'Guardar extracto' }));
    await screen.findByText('Extracto guardado en la Bandeja');
    const rail = screen.getByRole('navigation', { name: 'Riel lateral' });
    await user.click(within(rail).getByRole('button', { name: /Bandeja/ }));
    expect(await screen.findByText('notas · Medidas de centro')).toBeTruthy();
  });
});

describe('la tarjeta con cita', () => {
  async function cardWithCite() {
    const opened = await withSubject();
    const { api, bridge, user } = opened;
    const [subject] = (await api['subjects.list']({})).subjects;
    const added = await api['materials.addText']({
      subjectId: subject?.id ?? '',
      text: 'Medidas\n\nLa media es el centro de gravedad de la muestra.',
    });
    if (added.outcome !== 'added') {
      throw new Error('no se agregó');
    }
    await bridge.materials.whenIdle();
    const page = await api['materials.page']({ materialId: added.materialId, unit: 1 });
    const block = page.blocks.find((each) => each.type === 'paragraph');
    const { cardId } = await api['materials.createCard']({
      materialId: added.materialId,
      selection: {
        from: { blockId: block?.id ?? '', offset: 0 },
        to: { blockId: block?.id ?? '', offset: 8 },
      },
      question: '¿Qué es la media?',
      answer: 'El centro.',
    });
    return { ...opened, user, cardId, materialId: added.materialId };
  }

  async function openTheCard(user: ReturnType<typeof openWindow>['user']) {
    const rail = screen.getByRole('navigation', { name: 'Riel lateral' });
    await user.click(within(rail).getByRole('button', { name: 'Apuntes' }));
    await user.click(await screen.findByRole('tab', { name: 'Tarjetas' }));
    await user.click(
      await screen.findByRole('button', { name: 'Abrir la tarjeta «¿Qué es la media?»' }),
    );
    await screen.findByRole('heading', { name: 'Tarjeta' });
  }

  it('[CA-110] la ficha muestra la fuente y «Ver en el original» abre el visor con el pasaje', async () => {
    const { user } = await cardWithCite();
    await openTheCard(user);
    expect(screen.getByText('Fuente: Medidas · Medidas')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Ver en el original' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Materiales' })).toBeTruthy();
    const marked = await screen.findByText('La media es el centro de gravedad de la muestra.');
    expect(marked.closest('[data-highlighted="true"]')).not.toBeNull();
  });

  it('una cita que ya no se encuentra dice «Fuente a reubicar», sin color de error', async () => {
    const { user, bridge, materialId } = await cardWithCite();
    runRaw(
      bridge.file,
      "UPDATE material_blocks SET normalized_text = 'Otro texto.' WHERE material_id = ?",
      materialId,
    );
    await openTheCard(user);
    const notice = screen.getByText('Fuente a reubicar');
    expect(notice.closest('[data-tone]')?.getAttribute('data-tone')).not.toBe('error');
    await user.click(screen.getByRole('button', { name: 'Ver en el original' }));
    expect(await screen.findByText('No encontramos esta cita en el original')).toBeTruthy();
  });
});

describe('Ajustes › «Demostración»', () => {
  it('«Procesar despacio» está al lado de «Simular sin conexión», con su explicación', async () => {
    const { user } = openWindow('prueba');
    render(<App />);
    const rail = await screen.findByRole('navigation', { name: 'Riel lateral' });
    await user.click(within(rail).getByRole('button', { name: 'Ajustes' }));
    const box = await screen.findByRole('checkbox', { name: 'Procesar despacio' });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(
      screen.getByText(
        'Agrega una demora de 2 segundos por página para probar el cierre a mitad de camino.',
      ),
    ).toBeTruthy();
    await user.click(box);
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true));
  });
});
