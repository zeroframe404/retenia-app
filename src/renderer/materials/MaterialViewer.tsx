import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MaterialBlockView,
  MaterialBox,
  MaterialDetail,
  MaterialOpen,
  MaterialPage,
  MaterialSelection,
} from '../../preload/contract/materials';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Toast } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import { PdfPage } from '../visor/PdfPage';
import { CreateCardFromQuote } from './CreateCardFromQuote';
import styles from './Materials.module.css';
import { useOriginal } from './original';

// El visor de un material (H-26): a la izquierda la página original, a la derecha su texto por
// secciones. Pasar por un bloque resalta su caja en la página. Elegir texto ofrece «Crear tarjeta
// desde acá» y «Guardar extracto». Los pasajes que citan tus tarjetas van marcados. En Word,
// Markdown y texto no hay hoja: se ve el texto en una sola columna.

export interface OpenTarget {
  cardId?: string;
  blockId?: string;
  text?: string;
  // Abrir en esta página (la de un problema de la revisión, una casilla del mapa).
  unit?: number;
}

const A4 = { width: 595, height: 842 };

// El documento de la instantánea: el fragmento saneado en una página con una política que no deja
// cargar ni ejecutar nada. Hereda además la de la ventana (sin estilos propios, sin scripts), así que
// se ve con el estilo común del navegador: lo que importa es el texto.
function snapshotDocument(fragment: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body>${fragment}</body></html>`;
}
const HIDDEN: readonly MaterialBlockView['type'][] = ['header', 'footer'];

interface Picked {
  selection: MaterialSelection;
  quote: string;
  reference: string;
}

// Dónde cae un punto de la selección dentro de su bloque (cuántas letras desde el principio).
function positionIn(
  container: HTMLElement,
  node: Node,
  offset: number,
): { blockId: string; offset: number } | null {
  const element = (
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  )?.closest<HTMLElement>('[data-block-id]');
  if (!element || !container.contains(element) || !element.dataset.blockId) {
    return null;
  }
  const range = document.createRange();
  range.setStart(element, 0);
  range.setEnd(node, offset);
  return { blockId: element.dataset.blockId, offset: range.toString().length };
}

function referenceFor(page: MaterialPage, block: MaterialBlockView | undefined): string {
  if (page.kind === 'pdf') {
    return texts.materials.pageReference(page.title, page.unit);
  }
  const section = block?.headingPath.at(-1);
  return section ? texts.materials.sectionReference(page.title, section) : page.title;
}

function BlockText({
  block,
  highlighted,
  onHover,
  onPick,
}: {
  block: MaterialBlockView;
  highlighted: boolean;
  onHover: (block: MaterialBlockView | null) => void;
  onPick: (block: MaterialBlockView) => void;
}) {
  const shared = {
    'data-block-id': block.id,
    'data-block-type': block.type,
    'data-highlighted': highlighted ? 'true' : undefined,
    'data-cited': block.cited.length > 0 ? 'true' : undefined,
    onMouseEnter: () => onHover(block),
    onMouseLeave: () => onHover(null),
    onClick: () => onPick(block),
  };
  if (block.type === 'section') {
    const Heading = block.level <= 1 ? 'h3' : 'h4';
    return (
      <Heading className={styles.heading} {...shared}>
        {block.text}
      </Heading>
    );
  }
  return (
    <p className={styles.blockText} data-kind={block.type} {...shared}>
      {block.text}
    </p>
  );
}

export function MaterialViewer({
  materialId,
  target,
  onBack,
  backLabel,
  onInboxCount,
  onChanged,
  refreshKey,
}: {
  materialId: string;
  target: OpenTarget | null;
  onBack: () => void;
  backLabel?: string | undefined;
  onInboxCount?: ((count: number) => void) | undefined;
  // Se excluyó o se volvió a leer una página: la lista de materiales se vuelve a pedir.
  onChanged?: (() => void) | undefined;
  // Cambia cuando el material avanza (un aviso del principal): se vuelve a pedir la página.
  refreshKey: number;
}) {
  const [detail, setDetail] = useState<MaterialDetail | null>(null);
  const [unit, setUnit] = useState<number | null>(null);
  const [page, setPage] = useState<MaterialPage | null>(null);
  const [opened, setOpened] = useState<MaterialOpen | null>(null);
  const [hovered, setHovered] = useState<MaterialBlockView | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [cited, setCited] = useState<MaterialBlockView | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  // Las páginas del original, contadas al abrirlo: sirve mientras Retenia todavía no lo leyó.
  const [pagesInFile, setPagesInFile] = useState(0);
  // Una página web se ve como texto o como la instantánea guardada (Fase 14).
  const [asSnapshot, setAsSnapshot] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    html: string;
    address: string | null;
    savedDay: string;
  } | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const isPdf = detail?.kind === 'pdf';
  const bytes = useOriginal(materialId, isPdf);

  // Al abrir: el material y, si se pidió un pasaje (una cita, una sección), su página.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const found = await window.retenia['materials.get']({ materialId });
        let start = 1;
        if (target && (target.cardId || target.blockId || target.text || target.unit)) {
          const open = await window.retenia['materials.open']({ materialId, ...target });
          if (alive) {
            setOpened(open);
          }
          start = open.unit;
        }
        if (alive) {
          setDetail(found);
          setUnit(start);
        }
      } catch (error: unknown) {
        console.error('La ventana no pudo abrir el material por el puente', error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [materialId, target]);

  const loadPage = useCallback(
    async (current: number) => {
      try {
        const [shown, found] = await Promise.all([
          window.retenia['materials.page']({ materialId, unit: current }),
          window.retenia['materials.get']({ materialId }),
        ]);
        setPage(shown);
        setDetail(found);
      } catch (error: unknown) {
        console.error('La ventana no pudo leer la página por el puente', error);
      }
    },
    [materialId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: también se vuelve a pedir con cada aviso del material.
  useEffect(() => {
    if (unit !== null) {
      void loadPage(unit);
    }
  }, [unit, loadPage, refreshKey]);

  // El pasaje pedido queda a la vista.
  useEffect(() => {
    const id = opened?.blockId;
    if (!id || !page) {
      return;
    }
    const element = textRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
    element?.scrollIntoView?.({ block: 'center' });
  }, [opened, page]);

  const readSelection = () => {
    const selection = document.getSelection();
    const container = textRef.current;
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !container || !page) {
      setPicked(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const from = positionIn(container, range.startContainer, range.startOffset);
    const to = positionIn(container, range.endContainer, range.endOffset);
    const quote = selection.toString().replace(/\s+/g, ' ').trim();
    if (!from || !to || quote === '') {
      setPicked(null);
      return;
    }
    const block = page.blocks.find((candidate) => candidate.id === from.blockId);
    const selected = { from, to };
    setPicked({ selection: selected, quote, reference: referenceFor(page, block) });
    setCited(null);
    // La frase y la referencia que se van a guardar las arma el principal (la página donde empieza
    // la frase en la hoja, aunque su párrafo empiece en la anterior).
    window.retenia['materials.preview']({ materialId, selection: selected }).then(
      (preview) =>
        setPicked((current) =>
          current?.selection === selected ? { ...current, ...preview } : current,
        ),
      (error: unknown) => {
        console.error('La ventana no pudo armar la cita por el puente', error);
      },
    );
  };

  const isWeb = detail?.kind === 'web';
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    let alive = true;
    window.retenia['materials.snapshot']({ materialId }).then(
      (found) => {
        if (alive) {
          setSnapshot(found);
        }
      },
      (error: unknown) => {
        console.error('La ventana no pudo leer la instantánea por el puente', error);
      },
    );
    return () => {
      alive = false;
    };
  }, [materialId, isWeb]);

  // Reprocesar una página o dejarla afuera de lo que se estudia (Fase 14).
  async function pageAction(action: 'reprocess' | 'exclude' | 'include', current: number) {
    try {
      if (action === 'reprocess') {
        await window.retenia['materials.reprocessPage']({ materialId, unit: current });
      } else {
        await window.retenia['materials.excludePages']({
          materialId,
          units: [current],
          excluded: action === 'exclude',
        });
      }
      onChanged?.();
      await loadPage(current);
    } catch (error: unknown) {
      console.error('La ventana no pudo cambiar la página por el puente', error);
    }
  }

  async function saveExcerpt() {
    if (!picked) {
      return;
    }
    try {
      const { count } = await window.retenia['materials.saveExcerpt']({
        materialId,
        selection: picked.selection,
      });
      onInboxCount?.(count);
      setToast(texts.materials.excerptSaved);
      setPicked(null);
    } catch (error: unknown) {
      console.error('La ventana no pudo guardar el extracto por el puente', error);
    }
  }

  if (!detail || unit === null) {
    return null;
  }
  const total = detail.units.length || pagesInFile || 1;
  const visible =
    page?.blocks.filter((block) => !HIDDEN.includes(block.type) && block.text !== '') ?? [];
  const unread = page !== null && page.status === 'pending' && visible.length === 0;
  const readingText = !page?.working
    ? texts.materials.notReadCancelled
    : page.kind === 'pdf'
      ? texts.materials.stillReading
      : texts.materials.stillReadingDocument;
  const openedHere = opened && opened.unit === unit ? opened : null;
  const highlight: MaterialBox[] =
    hovered?.boxes ?? (openedHere?.highlight.length ? openedHere.highlight : (cited?.boxes ?? []));

  return (
    <section className={styles.viewer} aria-label={detail.title}>
      <div className={styles.viewerHeader}>
        <Boton variant="quiet" onClick={onBack}>
          {backLabel ?? texts.materials.back}
        </Boton>
        {isPdf ? (
          <div className={styles.pager}>
            <Boton disabled={unit <= 1} onClick={() => setUnit(unit - 1)}>
              {texts.materials.previousPage}
            </Boton>
            <p className={styles.pageNumber}>{texts.materials.page(unit, total)}</p>
            <Boton disabled={unit >= total} onClick={() => setUnit(unit + 1)}>
              {texts.materials.nextPage}
            </Boton>
          </div>
        ) : null}
        {isWeb ? (
          <div className={styles.pager}>
            <Boton aria-pressed={!asSnapshot} onClick={() => setAsSnapshot(false)}>
              {texts.materials.snapshot.text}
            </Boton>
            <Boton aria-pressed={asSnapshot} onClick={() => setAsSnapshot(true)}>
              {texts.materials.snapshot.view}
            </Boton>
          </div>
        ) : null}
      </div>
      {isWeb && snapshot ? (
        <p className={styles.webInfo}>
          {texts.materials.snapshot.savedOn(snapshot.address, formatShortDate(snapshot.savedDay))}
        </p>
      ) : null}
      {isPdf && page ? (
        <div className={styles.pageToolbar}>
          {page.excluded ? (
            <span className={styles.chip} data-state="excluded">
              {texts.materials.coverage.words.excluded}
            </span>
          ) : null}
          <Boton onClick={() => void pageAction('reprocess', unit)}>
            {texts.materials.review.actions.reprocess}
          </Boton>
          <Boton onClick={() => void pageAction(page.excluded ? 'include' : 'exclude', unit)}>
            {page.excluded
              ? texts.materials.review.actions.includeAgain
              : texts.materials.review.actions.studyWithout}
          </Boton>
        </div>
      ) : null}
      {opened?.notFound ? (
        <BannerEstado tone="pending">{texts.materials.notFound}</BannerEstado>
      ) : null}
      <div className={styles.viewerBody} data-columns={isPdf ? 2 : 1}>
        {isPdf ? (
          <div className={styles.original}>
            <PdfPage
              key={`${materialId}-${unit}`}
              pdf={bytes ?? new Uint8Array()}
              page={unit}
              width={page?.width ?? A4.width}
              height={page?.height ?? A4.height}
              highlight={highlight.filter((box) => box.page === unit)}
              label={texts.materials.pageImage(unit)}
              highlightLabel={texts.materials.highlighted}
              onPageCount={setPagesInFile}
            />
          </div>
        ) : null}
        {isWeb && asSnapshot && snapshot ? (
          <iframe
            className={styles.snapshotFrame}
            title={texts.materials.snapshot.frameLabel}
            // Sin permisos de ningún tipo: ni scripts, ni formularios, ni mismo origen.
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={snapshotDocument(snapshot.html)}
          />
        ) : null}
        <div className={styles.textColumn} hidden={isWeb && asSnapshot}>
          {picked ? (
            <div className={styles.selectionActions}>
              <Boton onClick={() => setCreating(true)}>{texts.materials.createCard}</Boton>
              <Boton onClick={() => void saveExcerpt()}>{texts.materials.saveExcerpt}</Boton>
            </div>
          ) : null}
          {cited ? (
            <section className={styles.citedMenu} aria-label={texts.materials.citedLabel}>
              <ul className={styles.citedList}>
                {cited.cited.map((card) => (
                  <li key={card.cardId}>{card.question}</li>
                ))}
              </ul>
              <Boton
                onClick={() => {
                  // La frase exacta de la primera tarjeta que cita este pasaje.
                  const [first] = cited.cited;
                  setCited(null);
                  if (!first) {
                    return;
                  }
                  window.retenia['materials.open']({ materialId, cardId: first.cardId })
                    .then(setOpened)
                    .catch((error: unknown) => {
                      console.error('La ventana no pudo abrir la cita por el puente', error);
                    });
                }}
              >
                {texts.materials.viewOriginal}
              </Boton>
            </section>
          ) : null}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: la selección de texto con el mouse o el teclado se lee al soltar. */}
          <div
            ref={textRef}
            className={styles.text}
            onMouseUp={readSelection}
            onKeyUp={readSelection}
          >
            {unread ? <p className={styles.reading}>{readingText}</p> : null}
            {visible.map((block) => (
              <BlockText
                key={block.id}
                block={block}
                highlighted={openedHere?.blockId === block.id}
                onHover={(entered) =>
                  setHovered(entered && entered.boxes.length > 0 ? entered : null)
                }
                onPick={(clicked) => {
                  const selection = document.getSelection();
                  if (clicked.cited.length > 0 && (!selection || selection.isCollapsed)) {
                    setCited(clicked);
                    setPicked(null);
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>
      {creating && picked ? (
        <CreateCardFromQuote
          materialId={materialId}
          selection={picked.selection}
          reference={picked.reference}
          quote={picked.quote}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setPicked(null);
            setToast(texts.cards.saved);
            void loadPage(unit);
          }}
        />
      ) : null}
      <div className={styles.toast}>
        <Toast onClose={() => setToast('')}>{toast}</Toast>
      </div>
    </section>
  );
}

// El pasaje de un original, para el panel de la derecha de una sesión (Fase 12): la página con el
// pasaje resaltado (o, en Word, Markdown y texto, el párrafo) y, si la cita ya no está, el aviso.
export function OriginalPassage({
  materialId,
  target,
}: {
  materialId: string;
  target: OpenTarget;
}) {
  const [state, setState] = useState<{ page: MaterialPage; open: MaterialOpen } | null>(null);
  const isPdf = state?.page.kind === 'pdf';
  const bytes = useOriginal(materialId, isPdf);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const open = await window.retenia['materials.open']({ materialId, ...target });
        const page = await window.retenia['materials.page']({ materialId, unit: open.unit });
        if (alive) {
          setState({ page, open });
        }
      } catch (error: unknown) {
        console.error('La ventana no pudo abrir el original por el puente', error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [materialId, target]);
  if (!state) {
    return null;
  }
  const { page, open } = state;
  const block = page.blocks.find((candidate) => candidate.id === open.blockId);
  return (
    <div className={styles.passage}>
      <p className={styles.citeReference}>{referenceFor(page, block)}</p>
      {open.notFound ? (
        <BannerEstado tone="pending">{texts.materials.notFound}</BannerEstado>
      ) : null}
      {isPdf ? (
        <PdfPage
          pdf={bytes ?? new Uint8Array()}
          page={open.unit}
          width={page.width ?? A4.width}
          height={page.height ?? A4.height}
          highlight={open.highlight.filter((box) => box.page === open.unit)}
          label={texts.materials.pageImage(open.unit)}
          highlightLabel={texts.materials.highlighted}
        />
      ) : block ? (
        <p className={styles.blockText} data-highlighted="true">
          {block.text}
        </p>
      ) : null}
    </div>
  );
}
