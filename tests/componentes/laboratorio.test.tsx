import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSection } from '../../src/renderer/demo/DemoSection';
import { LabScreen } from '../../src/renderer/demo/lab/LabScreen';

// La pantalla del Laboratorio (Ajustes › «Demostración» › «Laboratorio»). El puente del
// Laboratorio es un doble que contesta lo que contestarían los procesos de trabajo, y el
// micrófono también (fronteras de voz, docs/plan-de-pruebas.md): la voz, la transcripción, el
// PDF y el escaneo de verdad se prueban en tests/sin-red y en la punta a punta.

const recording = vi.hoisted(() => ({
  stop: vi.fn(async () => new Float32Array(16000 * 2)),
  cancel: vi.fn(),
}));
const microphone = vi.hoisted(() => ({
  startRecording: vi.fn(async () => recording),
}));
vi.mock('../../src/renderer/demo/lab/microphone', () => microphone);

type Status = {
  state: 'missing' | 'downloading' | 'ready' | 'failed';
  doneBytes: number;
  totalBytes: number;
  problem?: 'offline' | 'corrupt' | 'server' | 'disk';
};

const TOTAL = 540_000_000;
const missing: Status = { state: 'missing', doneBytes: 0, totalBytes: TOTAL };
const ready: Status = { state: 'ready', doneBytes: TOTAL, totalBytes: TOTAL };

function fakeLab({
  statuses = [missing] as Status[],
  access = 'granted' as 'granted' | 'denied',
} = {}) {
  let index = 0;
  const api = {
    'demo.lab.modelsStatus': vi.fn(async () => {
      const status = statuses[Math.min(index, statuses.length - 1)] as Status;
      index += 1;
      return status;
    }),
    'demo.lab.downloadModels': vi.fn(async () => ({
      state: 'downloading',
      doneBytes: 0,
      totalBytes: TOTAL,
    })),
    'demo.lab.speak': vi.fn(async () => ({
      ok: true,
      audio: new Uint8Array([82, 73, 70, 70]),
      ms: 1140,
    })),
    'demo.lab.microphone': vi.fn(async () => ({ access })),
    'demo.lab.openMicrophoneSettings': vi.fn(async () => ({})),
    'demo.lab.transcribe': vi.fn(async () => ({ ok: true, text: 'good morning', ms: 480 })),
    'demo.lab.readPdf': vi.fn(async () => ({
      ok: true,
      ms: 320,
      text: 'Capítulo 1 · Población, muestra y estimadores\nUna muestra es una parte de la población',
      width: 595,
      height: 842,
      phrase: 'Una muestra es una parte de la población',
      highlight: [{ x: 68, y: 230, width: 451, height: 11 }],
      pdf: new Uint8Array([37, 80, 68, 70, 45]),
    })),
    'demo.lab.ocrPage': vi.fn(async () => ({
      ok: true,
      ms: 4200,
      text: 'Capítulo 4 · Pruebas de hipótesis\n4.1 La hipótesis nula y la alternativa',
    })),
    'demo.lab.notify': vi.fn(async () => ({ ok: true, ms: 60 })),
    'demo.connection': vi.fn(async () => ({ offline: false })),
    'demo.setConnection': vi.fn(async ({ offline }: { offline: boolean }) => ({ offline })),
  };
  window.retenia = api as unknown as typeof window.retenia;
  return { api, user: userEvent.setup() };
}

const SLOW = { timeout: 5_000 };
const block = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:audio-de-prueba');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Laboratorio', () => {
  it('«Demostración» tiene «Laboratorio» y «Simular sin conexión»', async () => {
    const { api, user } = fakeLab();
    const open = vi.fn();
    render(<DemoSection onOpenLab={open} />);
    await user.click(screen.getByRole('button', { name: 'Laboratorio' }));
    expect(open).toHaveBeenCalledOnce();
    const offline = await screen.findByRole('checkbox', { name: 'Simular sin conexión' });
    expect((offline as HTMLInputElement).checked).toBe(false);
    await user.click(offline);
    expect(api['demo.setConnection']).toHaveBeenCalledWith({ offline: true });
  });

  it('muestra sus cinco bloques: voz, transcripción, PDF, escaneo y aviso, y vuelve a Ajustes', async () => {
    const { user } = fakeLab();
    const back = vi.fn();
    render(<LabScreen onBack={back} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Laboratorio' })).toBeTruthy();
    for (const name of ['Voz', 'Transcripción', 'PDF', 'Escaneo', 'Aviso']) {
      expect(block(name)).toBeTruthy();
    }
    await user.click(screen.getByRole('button', { name: 'Volver a Ajustes' }));
    expect(back).toHaveBeenCalledOnce();
  });

  it('[CA-024] sin modelos lo dice; «Descargar modelos» muestra una barra que avanza y al terminar «Modelos listos»', async () => {
    const half: Status = { state: 'downloading', doneBytes: TOTAL / 2, totalBytes: TOTAL };
    const { api, user } = fakeLab({ statuses: [missing, half, half, ready] });
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    expect(
      await within(voice).findByText(
        'Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.',
      ),
    ).toBeTruthy();
    await user.click(within(voice).getByRole('button', { name: 'Descargar modelos' }));
    expect(api['demo.lab.downloadModels']).toHaveBeenCalledOnce();
    const bar = await within(voice).findByRole(
      'progressbar',
      { name: 'Descarga de los modelos' },
      SLOW,
    );
    expect(bar.getAttribute('value')).toBe(String(TOTAL / 2));
    expect(await within(voice).findByText('Bajando los modelos: 50 %', {}, SLOW)).toBeTruthy();
    expect(await within(voice).findByText('Modelos listos', {}, SLOW)).toBeTruthy();
    expect(within(voice).queryByRole('progressbar')).toBeNull();
  });

  it('[CA-024] si la descarga falla por falta de conexión, vuelve a pedir que te conectes', async () => {
    const offline: Status = { ...missing, state: 'failed', problem: 'offline' };
    const { user } = fakeLab({ statuses: [missing, offline] });
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    await user.click(await within(voice).findByRole('button', { name: 'Descargar modelos' }));
    expect(
      await within(voice).findByText(
        'Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.',
        {},
        SLOW,
      ),
    ).toBeTruthy();
    expect(within(voice).getByRole('button', { name: 'Descargar modelos' })).toBeTruthy();
  });

  it('[CA-024] si llega un archivo dañado, lo dice y deja volver a descargar', async () => {
    const corrupt: Status = { ...missing, state: 'failed', problem: 'corrupt' };
    const { user } = fakeLab({ statuses: [missing, corrupt] });
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    await user.click(await within(voice).findByRole('button', { name: 'Descargar modelos' }));
    expect(
      await within(voice).findByText(
        'Un archivo llegó dañado y lo descarté. Tocá «Descargar modelos» de nuevo.',
        {},
        SLOW,
      ),
    ).toBeTruthy();
  });

  it('[CA-025] «Decir en voz alta» manda la frase y la voz elegida, deja el audio para escuchar y dice cuánto tardó', async () => {
    const { api, user } = fakeLab({ statuses: [ready] });
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    expect(await within(voice).findByText('Modelos listos')).toBeTruthy();
    expect(within(voice).getAllByRole('radio')).toHaveLength(4);
    await user.type(
      within(voice).getByRole('textbox', { name: 'Frase en inglés' }),
      'The weather is nice today',
    );
    await user.click(within(voice).getByRole('radio', { name: 'Hombre, Reino Unido' }));
    await user.click(within(voice).getByRole('button', { name: 'Decir en voz alta' }));
    expect(api['demo.lab.speak']).toHaveBeenCalledWith({
      text: 'The weather is nice today',
      voice: 3,
    });
    expect(await within(voice).findByText('Tardó 1,1 s')).toBeTruthy();
    const audio = voice.querySelector('audio');
    expect(audio?.getAttribute('src')).toBe('blob:audio-de-prueba');
    expect(audio?.getAttribute('aria-label')).toBe('Audio de la frase');
  });

  it('[CA-025] sin modelos, «Decir en voz alta» muestra el mensaje para descargarlos', async () => {
    const { api, user } = fakeLab({ statuses: [missing] });
    api['demo.lab.speak'].mockResolvedValueOnce({ ok: false, problem: 'noModels' } as never);
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    await user.type(within(voice).getByRole('textbox', { name: 'Frase en inglés' }), 'Hello');
    await user.click(within(voice).getByRole('button', { name: 'Decir en voz alta' }));
    expect(
      await within(voice).findAllByText(
        'Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.',
      ),
    ).not.toHaveLength(0);
  });

  it('[CA-025] sin frase no manda nada y pide escribirla', async () => {
    const { api, user } = fakeLab({ statuses: [ready] });
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    await user.click(within(voice).getByRole('button', { name: 'Decir en voz alta' }));
    expect(await within(voice).findByText('Escribí una frase en inglés.')).toBeTruthy();
    expect(api['demo.lab.speak']).not.toHaveBeenCalled();
  });

  it('[CA-026] «Grabar» y «Detener» muestran «Entendí: “good morning”» y un campo para corregir el texto', async () => {
    const { api, user } = fakeLab({ statuses: [ready] });
    render(<LabScreen onBack={() => undefined} />);
    const transcription = block('Transcripción');
    await user.click(within(transcription).getByRole('button', { name: 'Grabar' }));
    expect(microphone.startRecording).toHaveBeenCalledOnce();
    await user.click(await within(transcription).findByRole('button', { name: 'Detener' }));
    expect(api['demo.lab.transcribe']).toHaveBeenCalledWith({
      samples: expect.any(Float32Array),
      sampleRate: 16000,
    });
    expect(await within(transcription).findByText('Entendí: “good morning”')).toBeTruthy();
    const field = within(transcription).getByRole('textbox', {
      name: 'Lo que entendí (podés corregirlo)',
    });
    expect((field as HTMLInputElement).value).toBe('good morning');
    await user.clear(field);
    await user.type(field, 'good mornings');
    expect(within(transcription).getByText('Entendí: “good mornings”')).toBeTruthy();
    expect(within(transcription).getByText('Tardó 0,5 s')).toBeTruthy();
  });

  it('[CA-027] con el micrófono bloqueado en Windows muestra el aviso y «Cómo habilitarlo» con los pasos', async () => {
    const { api, user } = fakeLab({ statuses: [ready], access: 'denied' });
    render(<LabScreen onBack={() => undefined} />);
    const transcription = block('Transcripción');
    await user.click(within(transcription).getByRole('button', { name: 'Grabar' }));
    expect(
      await within(transcription).findByText('Sin acceso al micrófono no podemos escucharte'),
    ).toBeTruthy();
    expect(microphone.startRecording).not.toHaveBeenCalled();
    await user.click(within(transcription).getByRole('link', { name: 'Cómo habilitarlo' }));
    expect(
      within(transcription).getByText(
        'Abrí Configuración de Windows › Privacidad y seguridad › Micrófono.',
      ),
    ).toBeTruthy();
    await user.click(
      within(transcription).getByRole('button', { name: 'Abrir la configuración del micrófono' }),
    );
    expect(api['demo.lab.openMicrophoneSettings']).toHaveBeenCalledOnce();
  });

  it('[CA-027] si Windows niega el micrófono recién al pedirlo, muestra el mismo aviso', async () => {
    const { user } = fakeLab({ statuses: [ready] });
    microphone.startRecording.mockRejectedValueOnce(
      Object.assign(new Error('permiso'), { name: 'NotAllowedError' }),
    );
    render(<LabScreen onBack={() => undefined} />);
    const transcription = block('Transcripción');
    await user.click(within(transcription).getByRole('button', { name: 'Grabar' }));
    expect(
      await within(transcription).findByText('Sin acceso al micrófono no podemos escucharte'),
    ).toBeTruthy();
    expect(within(transcription).getByRole('link', { name: 'Cómo habilitarlo' })).toBeTruthy();
  });

  it('[CA-028] «Leer PDF de prueba» muestra el texto de la página 1 y la frase resaltada sobre la imagen de la página', async () => {
    const { user } = fakeLab();
    render(<LabScreen onBack={() => undefined} />);
    const pdf = block('PDF');
    await user.click(within(pdf).getByRole('button', { name: 'Leer PDF de prueba' }));
    expect(
      await within(pdf).findByText(/Capítulo 1 · Población, muestra y estimadores/),
    ).toBeTruthy();
    expect(
      within(pdf).getByText('Frase resaltada: “Una muestra es una parte de la población”'),
    ).toBeTruthy();
    const page = within(pdf).getByRole('img', { name: 'Página 1 con la frase resaltada' });
    expect(within(page).getAllByRole('mark')).toHaveLength(1);
    expect(within(pdf).getByText('Tardó 0,3 s')).toBeTruthy();
  });

  it('[CA-029] «Leer página escaneada» muestra el texto reconocido y cuánto tardó', async () => {
    const { user } = fakeLab();
    render(<LabScreen onBack={() => undefined} />);
    const scan = block('Escaneo');
    await user.click(within(scan).getByRole('button', { name: 'Leer página escaneada' }));
    expect(await within(scan).findByText(/La hipótesis nula y la alternativa/)).toBeTruthy();
    expect(within(scan).getByText('Tardó 4,2 s')).toBeTruthy();
  });

  it('[CA-030] «Probar aviso» dice que el aviso salió y cuánto tardó', async () => {
    const { api, user } = fakeLab();
    render(<LabScreen onBack={() => undefined} />);
    const notice = block('Aviso');
    await user.click(within(notice).getByRole('button', { name: 'Probar aviso' }));
    expect(api['demo.lab.notify']).toHaveBeenCalledOnce();
    expect(
      await within(notice).findByText(
        'Aviso enviado. Minimizá Retenia y tocalo: Retenia vuelve al frente.',
      ),
    ).toBeTruthy();
    expect(within(notice).getByText('Tardó 0,1 s')).toBeTruthy();
  });
});
