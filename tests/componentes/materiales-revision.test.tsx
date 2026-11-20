import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createNetGate } from '../../src/main/net-gate';
import { App } from '../../src/renderer/App';
import { sample } from '../apoyo/materiales';
import { closeWindows, openWindow } from './apoyo-ventana';
import './editor-apoyo';
import { readFileSync } from 'node:fs';

// La «Revisión» de un material en la ventana entera (Fase 14, H-27 y H-28), contra el puente real,
// una carpeta de datos real y el PDF y la página web de ejemplo.

const servers: Server[] = [];

afterEach(() => {
  closeWindows();
  for (const server of servers.splice(0)) {
    server.close();
    server.closeAllConnections();
  }
});

const SLOW = { timeout: 30_000 };
const INFERENCE = 'Inferencia — capítulos 1 a 4.pdf';

type User = ReturnType<typeof openWindow>['user'];

async function toMaterials(user: User) {
  const rail = await screen.findByRole('navigation', { name: 'Riel lateral' });
  await user.click(within(rail).getByRole('button', { name: 'Materiales' }));
  await screen.findByRole('heading', { level: 2, name: 'Materiales' });
}

const main = () => within(screen.getByRole('main'));

async function chooseFile(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: 'Agregar material' }));
  const dialog = await screen.findByRole('dialog', { name: 'Agregar material' });
  await user.upload(within(dialog).getByLabelText('Elegir archivo'), new File(['x'], name));
}

async function openInference(options: Parameters<typeof openWindow>[2] = {}) {
  const opened = openWindow('real', undefined, options);
  await opened.api['subjects.create']({ name: 'Estadística básica', makeActive: true });
  render(<App />);
  await toMaterials(opened.user);
  await chooseFile(opened.user, INFERENCE);
  const item = await main().findByRole('button', { name: /Inferencia/ }, SLOW);
  await waitFor(() => expect(item.textContent).toContain('Listo'), SLOW);
  await opened.user.click(item);
  await opened.user.click(await screen.findByRole('button', { name: 'Revisión' }));
  await screen.findByRole('heading', { name: 'Con problemas (2)' }, SLOW);
  return opened;
}

describe('la Revisión', () => {
  it('[CA-113] muestra «Listo», «Con problemas» (la tabla de la página 7 y la fórmula de la 11) y «No extraído» (la 9), cada problema con un botón', async () => {
    await openInference();
    expect(screen.getByRole('heading', { name: 'Listo' })).toBeTruthy();
    const problems = screen.getByRole('region', { name: /Con problemas/ });
    const items = within(problems).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('Página 7')).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText('Posible tabla')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('Página 11')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('Posible fórmula')).toBeTruthy();
    for (const item of items) {
      for (const name of ['Ver original', 'Corregir texto', 'Marcar como imagen', 'Ignorar']) {
        expect(within(item).getByRole('button', { name })).toBeTruthy();
      }
    }
    const notExtracted = screen.getByRole('region', { name: 'No extraído' });
    expect(within(notExtracted).getByText('Página 9')).toBeTruthy();
    expect(
      within(notExtracted).getByRole('button', { name: 'Intentar reconocimiento' }),
    ).toBeTruthy();
    expect(
      within(notExtracted).getByRole('button', { name: 'Estudiar sin estas páginas' }),
    ).toBeTruthy();
    // Un solo botón principal: el de leer, abajo.
    const primaries = [...document.querySelectorAll('[data-button="primary"]')].map(
      (button) => button.textContent,
    );
    expect(primaries).toEqual(['Leer la sección 1']);
    // Las etapas del material.
    expect(screen.getByRole('list', { name: 'Etapas del procesamiento' })).toBeTruthy();
  });

  it('[CA-114] «Intentar reconocimiento» saca la página 9 de «No extraído» y la deja con texto', async () => {
    const { user } = await openInference();
    await user.click(screen.getByRole('button', { name: 'Intentar reconocimiento' }));
    await waitFor(
      () =>
        expect(screen.getByRole('region', { name: 'No extraído' }).textContent).toContain(
          'Nada por acá.',
        ),
      SLOW,
    );
    await user.click(screen.getByRole('button', { name: 'Leer la sección 1' }));
  });

  it('[CA-115] «Corregir texto»: el original a la vista, el aviso «2 tarjetas usan este texto. ¿Actualizarlas?» y el original sin cambios', async () => {
    const { user, api } = await openInference();
    // Dos tarjetas que usan la tabla, creadas como desde el visor.
    const subject = (await api['subjects.list']({})).subjects[0];
    const [material] = (await api['materials.list']({ subjectId: subject?.id ?? '' })).materials;
    const review = await api['materials.review']({ materialId: material?.id ?? '' });
    const table = review.problems[0];
    const page = await api['materials.page']({ materialId: material?.id ?? '', unit: 7 });
    const block = page.blocks.find((entry) => entry.id === table?.blockId);
    for (const question of ['¿t con 10 gl al 95 %?', '¿t con 20 gl al 95 %?']) {
      await api['materials.createCard']({
        materialId: material?.id ?? '',
        selection: {
          from: { blockId: block?.id ?? '', offset: 0 },
          to: { blockId: block?.id ?? '', offset: block?.text.length ?? 0 },
        },
        question,
        answer: 'Lo que dice la tabla',
      });
    }
    const item = within(screen.getByRole('region', { name: /Con problemas/ })).getAllByRole(
      'listitem',
    )[0] as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Corregir texto' }));
    expect(within(item).getByText('Texto original')).toBeTruthy();
    const field = within(item).getByRole('textbox', {
      name: 'Texto corregido',
    }) as HTMLTextAreaElement;
    await user.clear(field);
    await user.type(field, block?.text.replace('2,228', '2,229') ?? '');
    await user.click(within(item).getByRole('button', { name: 'Guardar corrección' }));
    expect(await screen.findByText('2 tarjetas usan este texto. ¿Actualizarlas?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Actualizarlas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeTruthy();
    // El original no cambia: la página sigue siendo la de siempre y la corrección, aparte.
    expect(within(item).queryByRole('textbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Actualizarlas' }));
    expect(await screen.findByText('Actualicé 2 tarjetas.')).toBeTruthy();
    expect(within(item).getAllByText('Corregido').length).toBeGreaterThan(0);
  });

  it('[CA-117] el mapa de cobertura: una casilla por página con su palabra y el resumen del elenco', async () => {
    const { user } = await openInference();
    await user.click(screen.getByRole('button', { name: 'Mapa de cobertura' }));
    const map = screen.getByRole('list', { name: 'Páginas del material' });
    const cells = within(map).getAllByRole('button');
    expect(cells).toHaveLength(12);
    expect(within(map).getByRole('button', { name: 'Página 7 Revisar' })).toBeTruthy();
    expect(within(map).getByRole('button', { name: 'Página 9 Pendiente' })).toBeTruthy();
    expect(within(map).getByRole('button', { name: 'Página 1 Lista' })).toBeTruthy();
    expect(screen.getByText('9 de 12 páginas listas · 2 para revisar · 1 pendiente')).toBeTruthy();
  });

  it('[CA-118] «Estudiar sin estas páginas» deja la página «Excluida» en el mapa y se puede volver a incluir', async () => {
    const { user } = await openInference();
    // La página 9 queda excluida desde su bloque de «No extraído».
    await user.click(screen.getByRole('button', { name: 'Estudiar sin estas páginas' }));
    await user.click(await screen.findByRole('button', { name: 'Mapa de cobertura' }));
    expect(await screen.findByRole('button', { name: 'Página 9 Excluida' })).toBeTruthy();
    expect(screen.getByText(/1 excluida/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Volver a incluir esta página' }));
    expect(await screen.findByRole('button', { name: 'Página 9 Pendiente' })).toBeTruthy();
  });
});

describe('páginas web en la pantalla', () => {
  async function serve(html: string): Promise<string> {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/pagina`;
  }

  it('[CA-119] «Dirección web»: se pega la dirección y la página llega a «Listo» con su dirección y su fecha', async () => {
    const address = await serve(readFileSync(sample('pagina.html'), 'utf8'));
    const opened = openWindow('real', undefined, { net: createNetGate() });
    await opened.api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    render(<App />);
    await toMaterials(opened.user);
    await opened.user.click(screen.getByRole('button', { name: 'Agregar material' }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar material' });
    await opened.user.click(within(dialog).getByRole('button', { name: 'Dirección web' }));
    await opened.user.type(
      within(dialog).getByRole('textbox', { name: 'Dirección de la página' }),
      address,
    );
    await opened.user.click(within(dialog).getByRole('button', { name: 'Agregar' }));
    const item = await main().findByRole('button', { name: /teorema central/ }, SLOW);
    await waitFor(() => expect(item.textContent).toContain('Listo'), SLOW);
    await opened.user.click(item);
    expect(
      await screen.findByText(`Instantánea de ${address} · guardada el 15/03/2027`),
    ).toBeTruthy();
  });

  it('[CA-121] sin conexión queda «Pendiente: se descarga cuando haya conexión» y se completa sola al volver', async () => {
    const address = await serve(readFileSync(sample('pagina.html'), 'utf8'));
    const net = createNetGate({ offline: true });
    const opened = openWindow('real', undefined, { net });
    await opened.api['subjects.create']({ name: 'Estadística básica', makeActive: true });
    render(<App />);
    await toMaterials(opened.user);
    await opened.user.click(screen.getByRole('button', { name: 'Agregar material' }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar material' });
    await opened.user.click(within(dialog).getByRole('button', { name: 'Pegar texto' }));
    // Una dirección pegada como texto también es una página web.
    await opened.user.type(within(dialog).getByRole('textbox', { name: 'Texto' }), address);
    await opened.user.click(within(dialog).getByRole('button', { name: 'Agregar' }));
    const item = await main().findByRole('button', { name: /127\.0\.0\.1/ }, SLOW);
    await waitFor(
      () => expect(item.textContent).toContain('Pendiente: se descarga cuando haya conexión'),
      SLOW,
    );
    net.setOffline(false);
    await waitFor(
      () =>
        expect(main().getByRole('button', { name: /teorema central/ }).textContent).toContain(
          'Listo',
        ),
      SLOW,
    );
  });
});
