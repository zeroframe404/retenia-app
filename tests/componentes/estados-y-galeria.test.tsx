import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryScreen } from '../../src/renderer/demo/gallery/GalleryScreen';
import { ViewState, type ViewStateKind } from '../../src/renderer/ui/ViewStates';

// Los seis estados de toda vista y la «Galería» que los muestra, junto con los 18 componentes.

afterEach(cleanup);

const STATES: { kind: ViewStateKind; phrase: string; action: string; role: string | null }[] = [
  { kind: 'empty', phrase: 'Todavía no tenés nada acá.', action: 'Crear la primera', role: null },
  { kind: 'loading', phrase: 'Cargando tus datos…', action: 'Cancelar', role: 'status' },
  {
    kind: 'error',
    phrase: 'No pude cargar esto. Probá de nuevo.',
    action: 'Reintentar',
    role: 'alert',
  },
  { kind: 'success', phrase: 'Listo: guardaste los cambios.', action: 'Seguir', role: 'status' },
  {
    kind: 'no-permission',
    phrase: 'Falta un permiso para seguir.',
    action: 'Cómo habilitarlo',
    role: null,
  },
  {
    kind: 'offline',
    phrase: 'Sin conexión. Se reanuda solo cuando vuelva.',
    action: 'Reintentar',
    role: 'status',
  },
];

describe('los seis estados de una vista', () => {
  it.for(STATES)(
    '[CA-033] «$kind» muestra una frase en castellano y una acción que responde',
    async ({ kind, phrase, action, role }) => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <ViewState kind={kind} phrase={phrase} action={{ text: action, onClick }} />,
      );
      expect(screen.getByText(phrase)).toBeTruthy();
      const button = screen.getByRole('button', { name: action });
      await user.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(
        container.querySelector('[data-component="view-state"]')?.getAttribute('data-state'),
      ).toBe(kind);
      if (role) {
        expect(screen.getByRole(role)).toBeTruthy();
      } else {
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
      }
    },
  );

  it('[CA-033] «cargando» se anuncia ocupado y no tiene nada que gire: la espera se dice con palabras', () => {
    const { container } = render(
      <ViewState
        kind="loading"
        phrase="Cargando tus datos…"
        action={{ text: 'Cancelar', onClick: () => undefined }}
      />,
    );
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.querySelector('.lucide-loader, .lucide-loader-circle')).toBeNull();
  });

  it('la acción principal de la pantalla es la única de color cobalto; las demás, secundarias', () => {
    render(
      <>
        <ViewState
          kind="empty"
          phrase="Una frase."
          action={{ text: 'Principal', onClick: () => undefined, primary: true }}
        />
        <ViewState
          kind="error"
          phrase="Otra frase."
          action={{ text: 'Común', onClick: () => undefined }}
        />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Principal' }).getAttribute('data-button')).toBe(
      'primary',
    );
    expect(screen.getByRole('button', { name: 'Común' }).getAttribute('data-button')).toBe(
      'secondary',
    );
  });

  it('un estado sin acción (una vista real que no pide nada) muestra solo la frase', () => {
    render(<ViewState kind="empty" phrase="La papelera está vacía." />);
    expect(screen.getByText('La papelera está vacía.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('la «Galería»', () => {
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

  it('[CA-033] muestra los 18 componentes, cada uno con su nombre', () => {
    render(<GalleryScreen onBack={() => undefined} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Galería' })).toBeTruthy();
    const region = screen.getByRole('region', { name: 'Componentes' });
    const names = within(region)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual(COMPONENTS);
    expect(names).toHaveLength(18);
  });

  it('[CA-033] muestra los seis estados (vacío, cargando, error, éxito, sin permiso y sin conexión), cada uno con su frase y su acción', () => {
    render(<GalleryScreen onBack={() => undefined} />);
    const region = screen.getByRole('region', { name: 'Los seis estados' });
    const figures = within(region).getAllByRole('figure');
    expect(figures.map((figure) => within(figure).getByText(/^Variante: /).textContent)).toEqual([
      'Variante: Vacío',
      'Variante: Cargando',
      'Variante: Error',
      'Variante: Éxito',
      'Variante: Sin permiso',
      'Variante: Sin conexión',
    ]);
    for (const figure of figures) {
      expect(within(figure).getAllByRole('button')).toHaveLength(1);
      expect(figure.querySelector('p')?.textContent?.length).toBeGreaterThan(5);
    }
  });

  it('muestra también el armazón: cartel breve, lista, panel lateral y diálogo', async () => {
    const user = userEvent.setup();
    render(<GalleryScreen onBack={() => undefined} />);
    const frame = screen.getByRole('region', { name: 'Armazón' });
    expect(
      within(frame)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Cartel breve', 'Lista', 'Panel lateral derecho', 'Diálogo']);
    expect(within(frame).getByRole('complementary', { name: 'Panel de ejemplo' })).toBeTruthy();
    await user.click(within(frame).getByRole('button', { name: 'Abrir el diálogo de ejemplo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Diálogo de ejemplo' });
    await user.keyboard('{Escape}');
    expect(dialog.isConnected).toBe(false);
  });

  it('[CA-037] «Resultado» en su variante «Todavía no.» usa tono neutro con palabra e ícono, y ninguna variante usa el rojo', () => {
    render(<GalleryScreen onBack={() => undefined} />);
    const region = screen.getByRole('region', { name: 'Componentes' });
    const notYet = within(region)
      .getAllByRole('figure')
      .find((figure) => within(figure).queryByText('Variante: Todavía no.'));
    expect(notYet).toBeTruthy();
    const result = within(notYet as HTMLElement).getByRole('status');
    expect(result.getAttribute('data-tone')).toBe('neutral');
    expect(within(result).getByText('Todavía no.')).toBeTruthy();
    expect(result.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // Los tonos que existen en toda la galería: ninguno es de error.
    const tones = new Set(
      [...document.querySelectorAll('[data-tone]')].map((element) =>
        element.getAttribute('data-tone'),
      ),
    );
    expect(tones.has('error')).toBe(false);
    expect(tones.has('danger')).toBe(false);
  });

  it('el botón «Volver a Ajustes» avisa a quien la abrió', async () => {
    const back = vi.fn();
    const user = userEvent.setup();
    render(<GalleryScreen onBack={back} />);
    await user.click(screen.getByRole('button', { name: 'Volver a Ajustes' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
