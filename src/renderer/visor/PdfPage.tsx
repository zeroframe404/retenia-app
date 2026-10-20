import { useEffect, useRef } from 'react';
import styles from './PdfPage.module.css';

// Una página de un PDF dibujada en la ventana (pdf.js, la parte de dibujo, que es la única que
// la ventana usa: docs/arquitectura.md, sección 2), con rectángulos resaltados encima. El PDF
// llega como bytes por el puente y nada de lo que trae adentro se ejecuta. Si no se puede
// dibujar, el resaltado igual se ve sobre el recuadro de la página.

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DISPLAY_WIDTH = 480;

export function PdfPage({
  pdf,
  page,
  width,
  height,
  highlight,
  label,
  highlightLabel,
}: {
  pdf: Uint8Array;
  page: number;
  width: number;
  height: number;
  highlight: HighlightRect[];
  label: string;
  highlightLabel: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = DISPLAY_WIDTH / width;

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | null = null;
    void (async () => {
      try {
        // pdf.js y su hilo se cargan recién al dibujar la primera página.
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const loading = pdfjs.getDocument({
          data: pdf.slice(),
          enableXfa: false,
          disableFontFace: true,
          useSystemFonts: false,
        });
        destroy = () => loading.destroy();
        const file = await loading.promise;
        const shown = await file.getPage(page);
        const target = canvas.current;
        const context = target?.getContext('2d');
        if (cancelled || !target || !context) {
          return;
        }
        const ratio = window.devicePixelRatio || 1;
        const viewport = shown.getViewport({ scale: scale * ratio });
        target.width = Math.round(viewport.width);
        target.height = Math.round(viewport.height);
        await shown.render({ canvas: target, viewport }).promise;
      } catch {
        // Sin dibujo: queda el recuadro de la página con el resaltado.
      }
    })();
    return () => {
      cancelled = true;
      void destroy?.();
    };
  }, [pdf, page, scale]);

  return (
    <figure
      aria-label={label}
      className={styles.page}
      // En una ventana angosta la página se achica sin deformarse: el resaltado va en porcentajes.
      style={{ width: DISPLAY_WIDTH, aspectRatio: `${width} / ${height}` }}
    >
      <canvas ref={canvas} className={styles.canvas} />
      {highlight.map((rect) => (
        <span
          key={`${rect.x}-${rect.y}`}
          role="img"
          aria-label={highlightLabel}
          className={styles.mark}
          style={{
            left: `${(rect.x / width) * 100}%`,
            top: `${(rect.y / height) * 100}%`,
            width: `${(rect.width / width) * 100}%`,
            height: `${(rect.height / height) * 100}%`,
          }}
        />
      ))}
    </figure>
  );
}
