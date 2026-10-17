import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { demoTexts } from '../../../preload/contract/demo-texts';
import ui from '../../ui.module.css';
import styles from './lab.module.css';

const t = demoTexts.lab;

// Un bloque del Laboratorio: una región con su título.
export function Block({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={styles.block} aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

export function Elapsed({ ms }: { ms: number }) {
  return <p className={styles.elapsed}>{t.elapsed(ms)}</p>;
}

type ModelsStatus = Awaited<ReturnType<Window['retenia']['demo.lab.modelsStatus']>>;

export interface Models {
  status: ModelsStatus | null;
  download: () => Promise<void>;
}

// El estado de los modelos de voz, que comparten «Voz» y «Transcripción». Mientras se bajan, se
// pregunta cada cuarto de segundo cuánto falta.
export function useModels(): Models {
  const [status, setStatus] = useState<ModelsStatus | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const next = await window.retenia['demo.lab.modelsStatus']({});
      if (!alive.current) {
        return;
      }
      setStatus(next);
      if (next.state === 'downloading') {
        timer.current = setTimeout(() => void poll(), 250);
      }
    } catch {
      // Sin respuesta, el bloque queda como estaba.
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void poll();
    return () => {
      alive.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [poll]);

  const download = useCallback(async () => {
    try {
      await window.retenia['demo.lab.downloadModels']({});
    } finally {
      await poll();
    }
  }, [poll]);

  return { status, download };
}

const PROBLEMS = {
  offline: t.voice.missing,
  corrupt: t.voice.corrupt,
  server: t.voice.server,
  disk: t.voice.disk,
};

// Cómo están los modelos y, si faltan, «Descargar modelos» (CA-024).
export function ModelsState({ models }: { models: Models }) {
  const { status } = models;
  if (!status) {
    return null;
  }
  if (status.state === 'ready') {
    return <p className={styles.status}>{t.voice.ready}</p>;
  }
  if (status.state === 'downloading') {
    const percent = status.totalBytes > 0 ? (status.doneBytes / status.totalBytes) * 100 : 0;
    return (
      <>
        <progress
          className={styles.progress}
          aria-label={t.voice.progressLabel}
          max={status.totalBytes}
          value={status.doneBytes}
        />
        <p className={styles.status}>{t.voice.downloading(percent)}</p>
      </>
    );
  }
  const message = status.state === 'failed' && status.problem ? PROBLEMS[status.problem] : null;
  return (
    <>
      <p className={styles.message}>{message ?? t.voice.missing}</p>
      <div className={ui.actions}>
        <button type="button" className={ui.secondary} onClick={() => void models.download()}>
          {t.voice.download}
        </button>
      </div>
    </>
  );
}
