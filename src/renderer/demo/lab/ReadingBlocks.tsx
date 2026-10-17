import { useState } from 'react';
import { demoTexts } from '../../../preload/contract/demo-texts';
import ui from '../../ui.module.css';
import { type HighlightRect, PdfPage } from '../../visor/PdfPage';
import { Block, Elapsed } from './common';
import styles from './lab.module.css';

const t = demoTexts.lab;

type Run<T> = { kind: 'idle' } | { kind: 'busy' } | { kind: 'failed' } | ({ kind: 'done' } & T);

// Un botón que corre una tarea del Laboratorio una vez por vez y guarda su resultado.
function useRun<T>(): [Run<T>, (task: () => Promise<({ ok: true } & T) | { ok: false }>) => void] {
  const [run, setRun] = useState<Run<T>>({ kind: 'idle' });
  const start = (task: () => Promise<({ ok: true } & T) | { ok: false }>) => {
    setRun({ kind: 'busy' });
    task().then(
      (answer) => setRun(answer.ok ? { ...answer, kind: 'done' } : { kind: 'failed' }),
      () => setRun({ kind: 'failed' }),
    );
  };
  return [run, start];
}

interface PdfAnswer {
  ms: number;
  text: string;
  width: number;
  height: number;
  phrase: string;
  highlight: HighlightRect[];
  pdf: Uint8Array;
}

// «PDF»: el texto de la página 1 del PDF de ejemplo y, sobre la imagen de la página, la frase
// resaltada (CA-028).
export function PdfBlock() {
  const [run, start] = useRun<PdfAnswer>();
  return (
    <Block title={t.pdf.title}>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.primary}
          disabled={run.kind === 'busy'}
          onClick={() => start(() => window.retenia['demo.lab.readPdf']({}))}
        >
          {t.pdf.read}
        </button>
      </div>
      {run.kind === 'busy' ? <p className={styles.status}>{t.pdf.reading}</p> : null}
      {run.kind === 'failed' ? <p className={styles.message}>{t.pdf.failed}</p> : null}
      {run.kind === 'done' ? (
        <>
          <Elapsed ms={run.ms} />
          <h4>{t.pdf.pageText}</h4>
          <p className={styles.text}>{run.text}</p>
          <p className={styles.status}>{t.pdf.phrase(run.phrase)}</p>
          <PdfPage
            pdf={run.pdf}
            page={1}
            width={run.width}
            height={run.height}
            highlight={run.highlight}
            label={t.pdf.pageImage}
            highlightLabel={t.pdf.highlight}
          />
        </>
      ) : null}
    </Block>
  );
}

// «Escaneo»: el texto reconocido de la página 9, que es una imagen sin texto (CA-029).
export function ScanBlock() {
  const [run, start] = useRun<{ ms: number; text: string }>();
  return (
    <Block title={t.scan.title}>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.primary}
          disabled={run.kind === 'busy'}
          onClick={() => start(() => window.retenia['demo.lab.ocrPage']({}))}
        >
          {t.scan.read}
        </button>
      </div>
      {run.kind === 'busy' ? <p className={styles.status}>{t.scan.reading}</p> : null}
      {run.kind === 'failed' ? <p className={styles.message}>{t.scan.failed}</p> : null}
      {run.kind === 'done' ? (
        <>
          <Elapsed ms={run.ms} />
          <h4>{t.scan.text}</h4>
          <p className={styles.text}>{run.text}</p>
        </>
      ) : null}
    </Block>
  );
}

// «Aviso»: un aviso de Windows «Retenia · Esto es una prueba»; al tocarlo, Retenia pasa al
// frente (CA-030).
export function NoticeBlock() {
  const [run, start] = useRun<{ ms: number }>();
  return (
    <Block title={t.notice.title}>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.primary}
          disabled={run.kind === 'busy'}
          onClick={() => start(() => window.retenia['demo.lab.notify']({}))}
        >
          {t.notice.send}
        </button>
      </div>
      {run.kind === 'busy' ? <p className={styles.status}>{t.notice.sending}</p> : null}
      {run.kind === 'failed' ? <p className={styles.message}>{t.notice.failed}</p> : null}
      {run.kind === 'done' ? (
        <>
          <p className={styles.status}>{t.notice.sent}</p>
          <Elapsed ms={run.ms} />
        </>
      ) : null}
    </Block>
  );
}
