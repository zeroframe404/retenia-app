import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lightbulb, X } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Boton, IconButton } from '../../src/renderer/ui/Boton';
import {
  AvisoEvaluacionCorregida,
  Resultado,
  UnidadesDeIdea,
  type Verdict,
} from '../../src/renderer/ui/Evaluation';
import {
  EtiquetaEjemplo,
  IndicadorBorrador,
  RotuloDato,
  RotuloModo,
} from '../../src/renderer/ui/Labels';
import { EstadoDominio, type Mastery, PropuestaItem } from '../../src/renderer/ui/Mastery';
import { BannerEstado, EtapasProcesamiento } from '../../src/renderer/ui/Process';
import {
  BarraAyuda,
  CierreSesion,
  CompromisoSemanal,
  ConfianzaDeclarada,
  PropuestaSesion,
  ValoracionSesion,
} from '../../src/renderer/ui/Session';

// Los 18 componentes del sistema de diseño, uno por uno: su texto exacto, sus variantes y la regla
// visual central (trazo lleno para lo observado, punteado para lo estimado, lo provisional y las
// propuestas sin aceptar). Lo que se ve de verdad (colores, tamaños, foco) lo mira la punta a
// punta; acá, lo que dice cada uno y cómo se lo marca.

afterEach(cleanup);

const stroke = (element: Element | null) =>
  element?.closest('[data-stroke]')?.getAttribute('data-stroke');

describe('Boton', () => {
  it('tiene tres variantes (primario, secundario y discreto) marcadas para el estilo y las pruebas', () => {
    render(
      <>
        <Boton variant="primary">Empezar</Boton>
        <Boton>Cancelar</Boton>
        <Boton variant="quiet">Ajustar el plan</Boton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Empezar' }).getAttribute('data-button')).toBe(
      'primary',
    );
    expect(screen.getByRole('button', { name: 'Cancelar' }).getAttribute('data-button')).toBe(
      'secondary',
    );
    expect(
      screen.getByRole('button', { name: 'Ajustar el plan' }).getAttribute('data-button'),
    ).toBe('quiet');
  });

  it('es un botón común (no envía formularios por accidente), se puede deshabilitar y anuncia que está ocupado', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Boton onClick={onClick}>Hacer</Boton>
        <Boton disabled onClick={onClick}>
          No se puede
        </Boton>
        <Boton busy>Guardando</Boton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Hacer' }).getAttribute('type')).toBe('button');
    await user.click(screen.getByRole('button', { name: 'Hacer' }));
    await user.click(screen.getByRole('button', { name: 'No se puede' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Guardando' }).getAttribute('aria-busy')).toBe(
      'true',
    );
  });

  it('un ícono con significado nunca va solo: con texto, el ícono es decorativo; sin texto, lleva etiqueta accesible', () => {
    render(
      <>
        <Boton icon={Lightbulb}>Pista</Boton>
        <IconButton icon={X} label="Cerrar" onClick={() => undefined} />
      </>,
    );
    const withText = screen.getByRole('button', { name: 'Pista' });
    expect(withText.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const alone = screen.getByRole('button', { name: 'Cerrar' });
    expect(alone.getAttribute('title')).toBe('Cerrar');
    expect(alone.textContent).toBe('');
    expect(alone.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('rótulos', () => {
  it('RotuloModo dice PRÁCTICA CON AYUDA, PRÁCTICA AUTÓNOMA o EVALUACIÓN', () => {
    render(
      <>
        <RotuloModo mode="help" />
        <RotuloModo mode="autonomous" />
        <RotuloModo mode="evaluation" />
      </>,
    );
    expect(screen.getByText('PRÁCTICA CON AYUDA')).toBeTruthy();
    expect(screen.getByText('PRÁCTICA AUTÓNOMA')).toBeTruthy();
    expect(screen.getByText('EVALUACIÓN')).toBeTruthy();
  });

  it('RotuloDato: lo observado lleva trazo lleno; lo estimado y los datos insuficientes, punteado, con la cantidad de datos', () => {
    render(
      <>
        <RotuloDato kind="observed" count={84} />
        <RotuloDato kind="estimated" count={30} />
        <RotuloDato kind="insufficient" count={6} />
        <RotuloDato kind="observed" count={1} />
        <RotuloDato kind="estimated" />
      </>,
    );
    expect(stroke(screen.getByText('Observado · 84 datos'))).toBe('solid');
    expect(stroke(screen.getByText('Estimado · 30 datos'))).toBe('dashed');
    expect(stroke(screen.getByText('Datos insuficientes · 6 datos'))).toBe('dashed');
    expect(screen.getByText('Observado · 1 dato')).toBeTruthy();
    expect(stroke(screen.getByText('Estimado'))).toBe('dashed');
  });

  it('EtiquetaEjemplo dice EJEMPLO y va con trazo punteado: lo de ejemplo no es de verdad', () => {
    render(<EtiquetaEjemplo />);
    expect(stroke(screen.getByText('EJEMPLO'))).toBe('dashed');
  });

  it('IndicadorBorrador dice «Guardando…», «Borrador guardado» o «Guardado» y se anuncia sin interrumpir', () => {
    render(
      <>
        <IndicadorBorrador state="saving" />
        <IndicadorBorrador state="draft" />
        <IndicadorBorrador state="saved" />
      </>,
    );
    expect(screen.getByText('Guardando…')).toBeTruthy();
    expect(screen.getByText('Borrador guardado')).toBeTruthy();
    expect(screen.getByText('Guardado')).toBeTruthy();
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });
});

describe('sesión de estudio', () => {
  it('PropuestaSesion: «Sesión recomendada · 25 min», la línea «Por qué:», «Empezar» como único primario y trazo punteado', async () => {
    const onStart = vi.fn();
    const onShort = vi.fn();
    const user = userEvent.setup();
    render(
      <PropuestaSesion
        minutes={25}
        reason="tenés 60 repasos para hoy."
        onStart={onStart}
        onShortVersion={onShort}
      />,
    );
    const card = screen.getByRole('region', { name: 'Sesión recomendada · 25 min' });
    expect(within(card).getByText('Por qué: tenés 60 repasos para hoy.')).toBeTruthy();
    const buttons = within(card).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Empezar',
      'Versión corta (10 min)',
    ]);
    expect(
      buttons.filter((button) => button.getAttribute('data-button') === 'primary'),
    ).toHaveLength(1);
    expect(card.getAttribute('data-stroke')).toBe('dashed');
    await user.click(within(card).getByRole('button', { name: 'Empezar' }));
    await user.click(within(card).getByRole('button', { name: 'Versión corta (10 min)' }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onShort).toHaveBeenCalledTimes(1);
  });

  it('CompromisoSemanal dice «Compromiso semanal: 2 de 3 días» y marca los días cumplidos sin pasarse de la meta', () => {
    const { container, rerender } = render(<CompromisoSemanal done={2} goal={3} />);
    expect(screen.getByText('Compromiso semanal: 2 de 3 días')).toBeTruthy();
    expect(container.querySelectorAll('[data-day="done"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-day="pending"]')).toHaveLength(1);
    expect(container.querySelector('[data-day="pending"]')?.getAttribute('data-stroke')).toBe(
      'dashed',
    );
    rerender(<CompromisoSemanal done={5} goal={3} />);
    expect(screen.getByText('Compromiso semanal: 3 de 3 días')).toBeTruthy();
  });

  it('BarraAyuda: «Pista», «Ver un ejemplo», «Fuente», «Preguntar al tutor» y «No sé por dónde empezar»; la pista se puede deshabilitar', async () => {
    const onHint = vi.fn();
    const onNoIdea = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<BarraAyuda onHint={onHint} onNoIdea={onNoIdea} />);
    const group = screen.getByRole('group', { name: 'Ayuda' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Pista',
      'Ver un ejemplo',
      'Fuente',
      'Preguntar al tutor',
      'No sé por dónde empezar',
    ]);
    await user.click(within(group).getByRole('button', { name: 'Pista' }));
    await user.click(within(group).getByRole('button', { name: 'No sé por dónde empezar' }));
    expect(onHint).toHaveBeenCalledTimes(1);
    expect(onNoIdea).toHaveBeenCalledTimes(1);
    rerender(<BarraAyuda hintDisabled onHint={onHint} />);
    expect((screen.getByRole('button', { name: 'Pista' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('ConfianzaDeclarada pregunta «¿Cuánta confianza tenés?» con «Adivinando», «Creo que sí» y «Seguro»', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ConfianzaDeclarada value={null} onChange={onChange} />);
    const group = screen.getByRole('group', { name: '¿Cuánta confianza tenés?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent)).toEqual([
      'Adivinando',
      'Creo que sí',
      'Seguro',
    ]);
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    await user.click(within(group).getByRole('radio', { name: 'Seguro' }));
    expect(onChange).toHaveBeenCalledWith('sure');
  });

  it('ValoracionSesion pregunta «¿Cómo estuvo?»: un toque en «Fácil», «Justo» o «Difícil» queda registrado y, sin toque, nada', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ValoracionSesion value={null} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    const group = screen.getByRole('group', { name: '¿Cómo estuvo?' });
    await user.click(within(group).getByRole('radio', { name: 'Justo' }));
    await user.click(within(group).getByRole('radio', { name: 'Difícil' }));
    await user.click(within(group).getByRole('radio', { name: 'Fácil' }));
    expect(onChange.mock.calls).toEqual([['fair'], ['hard'], ['easy']]);
  });

  it('CierreSesion: minutos, tarjetas por resultado, como máximo 2 dificultades, 1 próximo paso y la frase exacta', async () => {
    const onFinish = vi.fn();
    const user = userEvent.setup();
    render(
      <CierreSesion
        minutes={13}
        results={[
          { label: 'La sabía', count: 8 },
          { label: 'Con dudas', count: 3 },
          { label: 'No la sabía', count: 2 },
        ]}
        difficulties={['Una', 'Dos', 'Tres']}
        nextStep="Repasá mañana."
        rating={null}
        onRate={() => undefined}
        onFinish={onFinish}
      />,
    );
    const closing = screen.getByRole('region', { name: 'Sesión terminada · 13 min' });
    const results = within(closing).getByRole('list', { name: 'Tarjetas por resultado' });
    expect(
      within(results)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['La sabía: 8', 'Con dudas: 3', 'No la sabía: 2']);
    expect(within(closing).getByText('Una')).toBeTruthy();
    expect(within(closing).getByText('Dos')).toBeTruthy();
    expect(within(closing).queryByText('Tres')).toBeNull();
    expect(within(closing).getByText('Repasá mañana.')).toBeTruthy();
    expect(
      within(closing).getByText('Completar la sesión no equivale a dominar el tema'),
    ).toBeTruthy();
    expect(
      within(closing)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Terminar', 'Guardar una duda', 'Ajustar el plan']);
    await user.click(within(closing).getByRole('button', { name: 'Terminar' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('evaluación', () => {
  const verdicts: [Verdict, string][] = [
    ['correct', 'Correcto.'],
    ['on-track', 'Vas bien.'],
    ['not-yet', 'Todavía no.'],
    ['unsure', 'No pude evaluarla con seguridad.'],
  ];

  it.for(verdicts)('Resultado «%s» dice «%s», qué revisar y una sola acción', ([verdict, text]) => {
    render(
      <Resultado verdict={verdict} review="Revisá la media." action={<Boton>Reintentar</Boton>} />,
    );
    const result = screen.getByRole('status');
    expect(within(result).getByText(text)).toBeTruthy();
    expect(within(result).getByText('Revisá la media.')).toBeTruthy();
    expect(within(result).getAllByRole('button')).toHaveLength(1);
  });

  it('[CA-037] «Todavía no.» usa tono neutro, palabra e ícono: nunca el tono de atención ni de error', () => {
    render(<Resultado verdict="not-yet" review="Revisá la media." />);
    const result = screen.getByRole('status');
    expect(result.getAttribute('data-tone')).toBe('neutral');
    expect(within(result).getByText('Todavía no.')).toBeTruthy();
    const icon = result.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  it('[CA-037] ningún veredicto de acierto o de avance usa el tono de atención: ese es solo para el evaluador que no está seguro', () => {
    const tones = verdicts.map(([verdict]) => {
      const { container, unmount } = render(<Resultado verdict={verdict} review="x" />);
      const tone = container.querySelector('[data-tone]')?.getAttribute('data-tone');
      unmount();
      return tone;
    });
    expect(tones).toEqual(['correct', 'partial', 'neutral', 'attention']);
  });

  it('una nota «Provisional» lleva la palabra y el trazo punteado; la firme, trazo lleno', () => {
    const { container, rerender } = render(<Resultado verdict="not-yet" review="x" provisional />);
    expect(screen.getByText('Provisional')).toBeTruthy();
    expect(container.querySelector('[data-stroke]')?.getAttribute('data-stroke')).toBe('dashed');
    rerender(<Resultado verdict="not-yet" review="x" />);
    expect(screen.queryByText('Provisional')).toBeNull();
    expect(container.querySelector('[data-stroke]')?.getAttribute('data-stroke')).toBe('solid');
  });

  it('UnidadesDeIdea dice cuáles están cubiertas, parciales o faltan, con la frase citada; lo que falta va punteado', () => {
    render(
      <UnidadesDeIdea
        units={[
          { text: 'Primera idea', status: 'covered', quote: 'lo que escribiste' },
          { text: 'Segunda idea', status: 'partial' },
          { text: 'Tercera idea', status: 'missing' },
        ]}
      />,
    );
    const section = screen.getByRole('region', { name: 'Unidades de idea' });
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0] as HTMLElement).getByText('Cubierta')).toBeTruthy();
    expect(
      within(items[0] as HTMLElement).getByText('Frase citada: “lo que escribiste”'),
    ).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('Parcial')).toBeTruthy();
    expect(within(items[2] as HTMLElement).getByText('Falta')).toBeTruthy();
    expect(items.map((item) => item.getAttribute('data-stroke'))).toEqual([
      'solid',
      'solid',
      'dashed',
    ]);
  });

  it('AvisoEvaluacionCorregida dice «Todavía no → Correcto» con su efecto, «Entendido» y «Deshacer»', async () => {
    const onUnderstood = vi.fn();
    const onUndo = vi.fn();
    const user = userEvent.setup();
    render(
      <AvisoEvaluacionCorregida
        before="Todavía no"
        after="Correcto"
        effect="El próximo repaso cambia."
        onUnderstood={onUnderstood}
        onUndo={onUndo}
      />,
    );
    expect(screen.getByText('Todavía no → Correcto')).toBeTruthy();
    expect(screen.getByText('El próximo repaso cambia.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Entendido' }));
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(onUnderstood).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe('dominio y propuestas', () => {
  const states: [Mastery, string, number][] = [
    ['not-started', 'Sin iniciar', 1],
    ['in-practice', 'En práctica', 2],
    ['to-review', 'A revisar', 3],
    ['enough', 'Suficiente para avanzar', 4],
    ['consolidated', 'Consolidado', 5],
  ];

  it.for(states)('EstadoDominio «%s» dice «%s» y es el escalón %i de 5', ([state, text, step]) => {
    const { container } = render(<EstadoDominio state={state} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText(`Escalón ${step} de 5`)).toBeTruthy();
    expect(container.querySelectorAll('[data-filled="true"]')).toHaveLength(step);
  });

  it('EstadoDominio con «(por verificar)» va con trazo punteado: lo declarado no es lo demostrado', () => {
    const { container } = render(<EstadoDominio state="enough" toVerify />);
    expect(screen.getByText('Suficiente para avanzar (por verificar)')).toBeTruthy();
    expect(container.querySelector('[data-stroke]')?.getAttribute('data-stroke')).toBe('dashed');
  });

  it('PropuestaItem: marca «Propuesta», objetivo y cita, con trazo punteado y «Aceptar», «Editar» y «Descartar»', async () => {
    const onAccept = vi.fn();
    const onEdit = vi.fn();
    const onDiscard = vi.fn();
    const user = userEvent.setup();
    render(
      <PropuestaItem
        text="¿Qué es la media muestral?"
        goal="Objetivo: Calcular la media"
        quote="Cita: el promedio"
        onAccept={onAccept}
        onEdit={onEdit}
        onDiscard={onDiscard}
      />,
    );
    const item = screen.getByRole('article', { name: '¿Qué es la media muestral?' });
    expect(within(item).getByText('Propuesta')).toBeTruthy();
    expect(within(item).getByText('Objetivo: Calcular la media')).toBeTruthy();
    expect(within(item).getByText('Cita: el promedio')).toBeTruthy();
    expect(item.getAttribute('data-stroke')).toBe('dashed');
    await user.click(within(item).getByRole('button', { name: 'Aceptar' }));
    await user.click(within(item).getByRole('button', { name: 'Editar' }));
    await user.click(within(item).getByRole('button', { name: 'Descartar' }));
    expect([onAccept, onEdit, onDiscard].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('proceso', () => {
  it('EtapasProcesamiento: cada etapa dice si está hecha, en curso o pendiente, sin indicador que gire sin fin', () => {
    const { container } = render(
      <EtapasProcesamiento
        stages={[
          { text: 'Archivo guardado', status: 'done' },
          { text: 'Texto extraído (11 de 12 páginas)', status: 'current' },
          { text: 'Secciones detectadas', status: 'pending' },
          { text: 'Listo', status: 'pending' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Etapas del procesamiento' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Archivo guardadoHecho',
      'Texto extraído (11 de 12 páginas)En curso',
      'Secciones detectadasPendiente',
      'ListoPendiente',
    ]);
    expect(within(items[0] as HTMLElement).getByText('Hecho')).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText('En curso')).toBeTruthy();
    expect(within(items[2] as HTMLElement).getByText('Pendiente')).toBeTruthy();
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items.map((item) => item.getAttribute('data-stroke'))).toEqual([
      'solid',
      'dashed',
      'dashed',
      'dashed',
    ]);
    // Nada gira ni se anima sin fin: no hay `progressbar` ni ícono de carga.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(container.querySelector('.lucide-loader, .lucide-loader-circle')).toBeNull();
  });

  it('BannerEstado: la información y lo pendiente avisan sin interrumpir; la atención pide una decisión y se anuncia enseguida', () => {
    render(
      <>
        <BannerEstado tone="info">Tus datos están en esta PC.</BannerEstado>
        <BannerEstado tone="pending">Pendiente: se reanuda cuando haya conexión</BannerEstado>
        <BannerEstado tone="attention" action={<Boton>Reintentar</Boton>}>
          No pude guardar la copia.
        </BannerEstado>
      </>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('No pude guardar la copia.')).toBeTruthy();
    expect(within(alert).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(stroke(screen.getByText('Pendiente: se reanuda cuando haya conexión'))).toBe('dashed');
    expect(stroke(screen.getByText('Tus datos están en esta PC.'))).toBe('solid');
  });
});

describe('íconos', () => {
  it('todos los íconos de los componentes son decorativos: ninguno se anuncia solo', () => {
    const { container } = render(
      <>
        <BarraAyuda />
        <IndicadorBorrador state="saved" />
        <Resultado verdict="correct" review="x" />
        <EtapasProcesamiento stages={[{ text: 'Listo', status: 'done' }]} />
        <BannerEstado tone="info">x</BannerEstado>
        <PropuestaItem text="x" />
      </>,
    );
    const icons = [...container.querySelectorAll('svg')];
    expect(icons.length).toBeGreaterThan(8);
    expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
