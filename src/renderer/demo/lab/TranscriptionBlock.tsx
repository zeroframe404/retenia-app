import { useEffect, useRef, useState } from 'react';
import { demoTexts } from '../../../preload/contract/demo-texts';
import ui from '../../ui.module.css';
import { Block, Elapsed, type Models } from './common';
import styles from './lab.module.css';
import { type Recording, startRecording } from './microphone';

const t = demoTexts.lab;
const MAX_SECONDS = 30;

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; seconds: number }
  | { kind: 'transcribing' }
  | { kind: 'heard'; text: string; ms: number }
  | { kind: 'problem'; message: string }
  | { kind: 'blocked' };

// Lo que significa cada error del micrófono: bloqueado por Windows o por el permiso (CA-027), o
// que no hay ninguno conectado.
function microphoneProblem(error: unknown): State {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotReadableError') {
    return { kind: 'blocked' };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { kind: 'problem', message: t.transcription.noMicrophone };
  }
  return { kind: 'problem', message: t.transcription.failed };
}

// «Transcripción»: «Grabar» pide el micrófono recién ahí; «Detener» manda lo grabado al proceso
// de voz y muestra «Entendí: “…”» con un campo para corregirlo (CA-026).
export function TranscriptionBlock({ models }: { models: Models }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const recording = useRef<Recording | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = () => {
    if (ticker.current) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
  };

  // Al salir del Laboratorio se corta todo: el contador y la grabación.
  useEffect(
    () => () => {
      if (ticker.current) {
        clearInterval(ticker.current);
      }
      recording.current?.cancel();
    },
    [],
  );

  async function stop() {
    const current = recording.current;
    recording.current = null;
    stopTicker();
    if (!current) {
      return;
    }
    setState({ kind: 'transcribing' });
    try {
      const samples = await current.stop();
      const answer = await window.retenia['demo.lab.transcribe']({ samples, sampleRate: 16000 });
      if (!answer.ok) {
        setState({
          kind: 'problem',
          message: answer.problem === 'noModels' ? t.voice.missing : t.transcription.failed,
        });
      } else if (answer.text === '') {
        setState({ kind: 'problem', message: t.transcription.nothing });
      } else {
        setState({ kind: 'heard', text: answer.text, ms: answer.ms });
      }
    } catch {
      setState({ kind: 'problem', message: t.transcription.failed });
    }
  }

  async function record() {
    if (models.status?.state !== 'ready') {
      setState({ kind: 'problem', message: t.voice.missing });
      return;
    }
    try {
      const { access } = await window.retenia['demo.lab.microphone']({});
      if (access === 'denied') {
        setState({ kind: 'blocked' });
        return;
      }
      recording.current = await startRecording();
    } catch (error) {
      setState(microphoneProblem(error));
      return;
    }
    setState({ kind: 'recording', seconds: 0 });
    // Cuenta los segundos (sin leer la hora) y corta solo a los 30.
    let seconds = 0;
    ticker.current = setInterval(() => {
      seconds += 1;
      setState({ kind: 'recording', seconds });
      if (seconds >= MAX_SECONDS) {
        void stop();
      }
    }, 1000);
  }

  return (
    <Block title={t.transcription.title}>
      <div className={ui.actions}>
        {state.kind === 'recording' ? (
          <button type="button" className={ui.primary} onClick={() => void stop()}>
            {t.transcription.stop}
          </button>
        ) : (
          <button
            type="button"
            className={ui.primary}
            disabled={state.kind === 'transcribing'}
            onClick={() => void record()}
          >
            {t.transcription.record}
          </button>
        )}
      </div>
      {state.kind === 'recording' ? (
        <p className={styles.status}>{t.transcription.recording(state.seconds)}</p>
      ) : null}
      {state.kind === 'transcribing' ? (
        <p className={styles.status}>{t.transcription.transcribing}</p>
      ) : null}
      {state.kind === 'heard' ? (
        <>
          <p className={styles.heard}>{t.heard(state.text)}</p>
          <label className={styles.label}>
            {t.transcription.field}
            <input
              className={styles.input}
              type="text"
              lang="en"
              value={state.text}
              onChange={(event) => setState({ ...state, text: event.target.value })}
            />
          </label>
          <Elapsed ms={state.ms} />
        </>
      ) : null}
      {state.kind === 'problem' ? <p className={styles.message}>{state.message}</p> : null}
      {state.kind === 'blocked' ? (
        <>
          <p className={styles.message}>{t.transcription.blocked}</p>
          <p className={styles.status}>
            <a className={styles.link} href="#pasos-del-microfono">
              {t.transcription.howTo}
            </a>
          </p>
          {/* Los pasos aparecen al llegar a ellos con el enlace (lab.module.css, «:target»). */}
          <div id="pasos-del-microfono" className={styles.howTo}>
            <ol className={styles.steps}>
              {t.transcription.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className={ui.actions}>
              <button
                type="button"
                className={ui.secondary}
                onClick={() => void window.retenia['demo.lab.openMicrophoneSettings']({})}
              >
                {t.transcription.openSettings}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </Block>
  );
}
