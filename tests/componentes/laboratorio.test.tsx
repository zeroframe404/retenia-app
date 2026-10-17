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
  it('«Demostración» tiene «Laboratorio» y «Simular sin conexión» (simulado)', async () => {
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

  it('muestra sus cinco bloques: voz, transcripción, PDF, escaneo y aviso, y vuelve a Ajustes (simulado)', async () => {
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

  it('[CA-024] sin modelos lo dice; «Descargar modelos» muestra una barra que avanza y al terminar «Modelos listos» (simulado)', async () => {
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

  it('[CA-024] si la descarga falla por falta de conexión, vuelve a pedir que te conectes (simulado)', async () => {
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

  it('[CA-024] si llega un archivo dañado, lo dice y deja volver a descargar (simulado)', async () => {
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

  it('[CA-025] «Decir en voz alta» manda la frase y la voz elegida, deja el audio para escuchar y dice cuánto tardó (simulado)', async () => {
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

  it('[CA-025] sin modelos, «Decir en voz alta» muestra el mensaje para descargarlos (simulado)', async () => {
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

  it('[CA-025] sin frase no manda nada y pide escribirla (simulado)', async () => {
    const { api, user } = fakeLab({ statuses: [ready] });
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    await user.click(within(voice).getByRole('button', { name: 'Decir en voz alta' }));
    expect(await within(voice).findByText('Escribí una frase en inglés.')).toBeTruthy();
    expect(api['demo.lab.speak']).not.toHaveBeenCalled();
  });

  it('[CA-026] «Grabar» y «Detener» muestran «Entendí: “good morning”» y un campo para corregir el texto (simulado)', async () => {
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

  it('[CA-026] al tocar «Grabar» se calla la frase que estaba sonando, para no grabarla encima de la voz (simulado)', async () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { user } = fakeLab({ statuses: [ready] });
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    await user.type(
      within(voice).getByRole('textbox', { name: 'Frase en inglés' }),
      'The weather is nice today',
    );
    await user.click(within(voice).getByRole('button', { name: 'Decir en voz alta' }));
    expect(await within(voice).findByText('Tardó 1,1 s')).toBeTruthy();
    expect(pause).not.toHaveBeenCalled();
    await user.click(within(block('Transcripción')).getByRole('button', { name: 'Grabar' }));
    expect(pause).toHaveBeenCalled();
    expect(pause.mock.contexts[0]).toBe(voice.querySelector('audio'));
    expect(microphone.startRecording).toHaveBeenCalledOnce();
    pause.mockRestore();
  });

  it('[CA-026] si la grabación no tenía voz, dice que no escuchó nada en vez de «Entendí» (simulado)', async () => {
    const { api, user } = fakeLab({ statuses: [ready] });
    api['demo.lab.transcribe'].mockResolvedValueOnce({ ok: true, text: '', ms: 300 });
    render(<LabScreen onBack={() => undefined} />);
    const transcription = block('Transcripción');
    await user.click(within(transcription).getByRole('button', { name: 'Grabar' }));
    await user.click(await within(transcription).findByRole('button', { name: 'Detener' }));
    expect(
      await within(transcription).findByText(
        'No escuché nada. Probá de nuevo, más cerca del micrófono.',
      ),
    ).toBeTruthy();
    expect(within(transcription).queryByText(/^Entendí/)).toBeNull();
  });

  it('[CA-026] un segundo toque en «Grabar» mientras se pide el micrófono no abre otra grabación (simulado)', async () => {
    let open: (value: typeof recording) => void = () => undefined;
    microphone.startRecording.mockImplementationOnce(
      () => new Promise((resolve) => (open = resolve)),
    );
    const { user } = fakeLab({ statuses: [ready] });
    render(<LabScreen onBack={() => undefined} />);
    const transcription = block('Transcripción');
    const button = within(transcription).getByRole('button', { name: 'Grabar' });
    await user.click(button);
    await user.click(button);
    expect(microphone.startRecording).toHaveBeenCalledOnce();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    open(recording);
    expect(await within(transcription).findByRole('button', { name: 'Detener' })).toBeTruthy();
  });

  it('[CA-026] si la grabación llega a pasarse de 30 segundos, se manda solo lo que entra (simulado)', async () => {
    recording.stop.mockResolvedValueOnce(new Float32Array(16000 * 30 + 320));
    const { api, user } = fakeLab({ statuses: [ready] });
    render(<LabScreen onBack={() => undefined} />);
    const transcription = block('Transcripción');
    await user.click(within(transcription).getByRole('button', { name: 'Grabar' }));
    await user.click(await within(transcription).findByRole('button', { name: 'Detener' }));
    expect(await within(transcription).findByText('Entendí: “good morning”')).toBeTruthy();
    const sent = api['demo.lab.transcribe'].mock.calls[0]?.[0] as unknown as {
      samples: Float32Array;
    };
    expect(sent.samples.length).toBe(16000 * 30);
  });

  it('[CA-024] mientras se bajan los modelos, «Grabar» y «Decir en voz alta» piden esperar (simulado)', async () => {
    const downloading: Status = { state: 'downloading', doneBytes: 1000, totalBytes: TOTAL };
    const { api, user } = fakeLab({ statuses: [downloading] });
    api['demo.lab.speak'].mockResolvedValueOnce({ ok: false, problem: 'noModels' } as never);
    render(<LabScreen onBack={() => undefined} />);
    const voice = block('Voz');
    await within(voice).findByRole('progressbar', { name: 'Descarga de los modelos' });
    await user.type(within(voice).getByRole('textbox', { name: 'Frase en inglés' }), 'Hello');
    await user.click(within(voice).getByRole('button', { name: 'Decir en voz alta' }));
    expect(
      await within(voice).findByText('Esperá a que terminen de bajar los modelos.'),
    ).toBeTruthy();
    const transcription = block('Transcripción');
    await user.click(within(transcription).getByRole('button', { name: 'Grabar' }));
    expect(
      await within(transcription).findByText('Esperá a que terminen de bajar los modelos.'),
    ).toBeTruthy();
    expect(microphone.startRecording).not.toHaveBeenCalled();
  });

  it('[CA-027] con el micrófono bloqueado en Windows muestra el aviso y «Cómo habilitarlo» con los pasos (simulado)', async () => {
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

  it('[CA-027] si Windows niega el micrófono recién al pedirlo, muestra el mismo aviso (simulado)', async () => {
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

  it('[CA-028] «Leer PDF de prueba» muestra el texto de la página 1 y la frase resaltada sobre la imagen de la página (simulado)', async () => {
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
    const page = within(pdf).getByRole('figure', { name: 'Página 1 con la frase resaltada' });
    expect(within(page).getAllByRole('img', { name: 'Frase resaltada' })).toHaveLength(1);
    expect(within(pdf).getByText('Tardó 0,3 s')).toBeTruthy();
  });

  it('[CA-029] «Leer página escaneada» muestra el texto reconocido y cuánto tardó (simulado)', async () => {
    const { user } = fakeLab();
    render(<LabScreen onBack={() => undefined} />);
    const scan = block('Escaneo');
    await user.click(within(scan).getByRole('button', { name: 'Leer página escaneada' }));
    expect(await within(scan).findByText(/La hipótesis nula y la alternativa/)).toBeTruthy();
    expect(within(scan).getByText('Tardó 4,2 s')).toBeTruthy();
  });

  it('[CA-030] «Probar aviso» dice que el aviso salió y cuánto tardó (simulado)', async () => {
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
