import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  DiffSegmentView,
  MaterialReview,
  ReviewProblem,
} from '../../preload/contract/materials';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import form from '../ui/Form.module.css';
import { BannerEstado, EtapasProcesamiento } from '../ui/Process';
import { stagesOf } from './describe';
import styles from './Materials.module.css';
import type { OpenTarget } from './MaterialViewer';

// «Revisión» de un material (H-27): lo que salió bien, lo que puede haberse leído mal y lo que no
// se pudo leer, en tres bloques, con una acción para cada cosa. Las señales son avisos («posible
// tabla»), nunca veredictos. Lo que corregís no toca el original.

const t = texts.materials.review;

// Una parte del texto con las cifras, los signos y las unidades que cambiaron resaltados.
function Differences({ segments }: { segments: DiffSegmentView[] }) {
  return (
    <p className={styles.compare}>
      {segments.map((segment, index) =>
        segment.changed ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: las partes son una lista fija sin identificador propio.
          <mark key={index} className={styles.changed} data-kind={segment.kind}>
            {segment.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: las partes son una lista fija sin identificador propio.
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

// Corregir el texto de un bloque: el original a la vista (solo lectura) y el texto corregido.
function CorrectionEditor({
  problem,
  onSave,
  onCancel,
}: {
  problem: ReviewProblem;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [draft, setDraft] = useState(problem.current);
  const field = useRef<HTMLTextAreaElement>(null);
  // El foco va al texto corregido al abrir el editor.
  useEffect(() => {
    field.current?.focus();
  }, []);
  return (
    <div className={styles.editor}>
      <div className={form.field}>
        <span>{t.originalText}</span>
        <pre className={styles.rawText}>{problem.original}</pre>
      </div>
      <div className={form.field}>
        <label htmlFor={`${ids}-corregido`}>{t.correctedText}</label>
        <textarea
          id={`${ids}-corregido`}
          rows={Math.min(14, Math.max(4, problem.original.split('\n').length + 1))}
          value={draft}
          ref={field}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      <div className={styles.actions}>
        <Boton disabled={draft.trim() === ''} onClick={() => onSave(draft)}>
          {t.saveCorrection}
        </Boton>
        <Boton variant="quiet" onClick={onCancel}>
          {t.cancelCorrection}
        </Boton>
      </div>
    </div>
  );
}

export function ReviewView({
  materialId,
  refreshKey,
  onBack,
  onRead,
  onChanged,
}: {
  materialId: string;
  refreshKey: number;
  onBack: () => void;
  // Abrir el visor: en una página (la de un problema) o en una sección.
  onRead: (target: OpenTarget) => void;
  // Algo cambió (una corrección, una página excluida): la lista de materiales se vuelve a pedir.
  onChanged: () => void;
}) {
  const [review, setReview] = useState<MaterialReview | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [asking, setAsking] = useState<{
    correctionId: string;
    cards: { cardId: string; question: string }[];
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [showMap, setShowMap] = useState(false);

  const load = useCallback(async () => {
    try {
      setReview(await window.retenia['materials.review']({ materialId }));
    } catch (error: unknown) {
      console.error('La ventana no pudo leer la revisión por el puente', error);
    }
  }, [materialId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: también se vuelve a pedir con cada aviso del material.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      const result = await work();
      onChanged();
      return result;
    } catch (error: unknown) {
      console.error('La ventana no pudo hacer el cambio por el puente', error);
      return null;
    }
  }

  async function correct(problem: ReviewProblem, text: string) {
    if (!problem.blockId) {
      return;
    }
    const result = await run(() =>
      window.retenia['materials.correctText']({
        materialId,
        blockId: problem.blockId as string,
        text,
      }),
    );
    if (!result) {
      return;
    }
    setEditing(null);
    setNotice(result.cards.length === 0 ? t.savedCorrection : '');
    setAsking(result.cards.length > 0 ? result : null);
    await load();
  }

  async function updateDerived(update: boolean) {
    if (!asking) {
      return;
    }
    const result = await run(() =>
      window.retenia['materials.updateDerived']({ correctionId: asking.correctionId, update }),
    );
    setAsking(null);
    setNotice(result && update ? t.derivedUpdated(result.updated) : t.savedCorrection);
  }

  async function resolve(problem: ReviewProblem, resolution: 'image' | 'ignored' | null) {
    const next = await run(() =>
      window.retenia['materials.resolveProblem']({
        materialId,
        problemId: problem.id,
        resolution,
      }),
    );
    if (next) {
      setReview(next);
      setNotice('');
    }
  }

  async function decideConflict(problem: ReviewProblem, keep: boolean) {
    if (!problem.correctionId) {
      return;
    }
    const next = await run(() =>
      window.retenia['materials.resolveConflict']({
        correctionId: problem.correctionId as string,
        keep,
      }),
    );
    if (next) {
      setReview(next);
    }
  }

  async function page(
    channel: 'materials.ocrPage' | 'materials.reprocessPage',
    unit: number,
  ): Promise<void> {
    await run(() => window.retenia[channel]({ materialId, unit }));
    await load();
  }

  async function exclude(units: number[], excluded: boolean) {
    const next = await run(() =>
      window.retenia['materials.excludePages']({ materialId, units, excluded }),
    );
    if (next) {
      setReview(next);
    }
  }

  if (!review) {
    return null;
  }
  const openProblems = review.problems.filter(
    (problem) => problem.resolution === null || problem.resolution === 'conflict',
  ).length;

  return (
    <section className={styles.review} aria-label={`${review.title} · ${t.title}`}>
      <div className={styles.viewerHeader}>
        <Boton variant="quiet" onClick={onBack}>
          {t.back}
        </Boton>
        <Boton aria-expanded={showMap} onClick={() => setShowMap((open) => !open)}>
          {showMap ? texts.materials.coverage.close : texts.materials.coverage.open}
        </Boton>
      </div>
      <h3 className={styles.detailTitle}>{review.title}</h3>
      <EtapasProcesamiento stages={stagesOf(review)} />
      {notice ? <BannerEstado tone="info">{notice}</BannerEstado> : null}
      {asking ? (
        <section className={styles.derived} aria-label={t.derivedAsk(asking.cards.length)}>
          <BannerEstado tone="pending">{t.derivedAsk(asking.cards.length)}</BannerEstado>
          <ul className={styles.citedList}>
            {asking.cards.map((card) => (
              <li key={card.cardId}>{card.question}</li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Boton onClick={() => void updateDerived(true)}>
              {t.derivedUpdate(asking.cards.length)}
            </Boton>
            <Boton variant="quiet" onClick={() => void updateDerived(false)}>
              {t.derivedLater}
            </Boton>
          </div>
        </section>
      ) : null}

      {showMap ? (
        <section
          className={styles.coverage}
          aria-label={texts.materials.coverage.open}
          data-component="coverage-map"
        >
          <p className={styles.coverageSummary}>
            {texts.materials.coverage.summary(review.coverage.summary)}
          </p>
          <ul className={styles.cells} aria-label={texts.materials.coverage.label}>
            {review.coverage.pages.map((entry) => {
              const word = texts.materials.coverage.words[entry.word];
              return (
                <li key={entry.unit}>
                  <button
                    type="button"
                    className={styles.cell}
                    data-word={entry.word}
                    aria-label={`${t.pageLabel(entry.unit)} ${word}`}
                    onClick={() => onRead({ unit: entry.unit })}
                  >
                    <span className={styles.cellNumber}>{t.pageLabel(entry.unit)}</span>
                    <span className={styles.cellWord}>{word}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {review.coverage.sections.length > 0 ? (
            <>
              <h4 className={styles.blockHeading}>{texts.materials.coverage.sectionsLabel}</h4>
              <ul className={styles.sectionStates}>
                {review.coverage.sections.map((section) => (
                  <li key={section.blockId} className={styles.sectionState}>
                    <span>{section.title}</span>
                    <span className={styles.chip} data-state={section.state}>
                      {texts.materials.sectionStates[section.state]}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <section className={styles.group} aria-labelledby={`${materialId}-listo`}>
        <h4 id={`${materialId}-listo`} className={styles.blockHeading}>
          {t.ready}
        </h4>
        <p className={styles.partial}>{t.readySections(review.ready.sections)}</p>
      </section>

      <section className={styles.group} aria-labelledby={`${materialId}-problemas`}>
        <h4 id={`${materialId}-problemas`} className={styles.blockHeading}>
          {t.problems}
          {openProblems > 0 ? ` (${openProblems})` : ''}
        </h4>
        {review.problems.length === 0 ? <p className={styles.partial}>{t.nothingHere}</p> : null}
        <ul className={styles.problemList}>
          {review.problems.map((problem) => (
            <li key={problem.id} className={styles.problem} data-resolution={problem.resolution}>
              <div className={styles.problemHead}>
                <span className={styles.pageTag}>{t.pageLabel(problem.unit)}</span>
                {problem.signals.map((signal) => (
                  <span key={signal} className={styles.chip}>
                    {t.signals[signal]}
                  </span>
                ))}
                {problem.resolution ? (
                  <span className={styles.chip} data-state="resolved">
                    {t.resolutions[problem.resolution]}
                  </span>
                ) : null}
              </div>
              {problem.excerpt ? <p className={styles.excerpt}>{problem.excerpt}</p> : null}
              {problem.conflict ? (
                <div className={styles.conflict}>
                  <p>{t.conflict.explain}</p>
                  <h5 className={styles.miniHeading}>{t.conflict.mine}</h5>
                  <Differences segments={problem.conflict.differences} />
                  <h5 className={styles.miniHeading}>{t.conflict.current}</h5>
                  <pre className={styles.rawText}>{problem.conflict.current}</pre>
                  <div className={styles.actions}>
                    <Boton onClick={() => void decideConflict(problem, true)}>
                      {t.conflict.keepMine}
                    </Boton>
                    <Boton onClick={() => void decideConflict(problem, false)}>
                      {t.conflict.useNew}
                    </Boton>
                  </div>
                </div>
              ) : null}
              {editing === problem.id ? (
                <CorrectionEditor
                  problem={problem}
                  onSave={(text) => void correct(problem, text)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className={styles.actions}>
                  {problem.actions.includes('viewOriginal') ? (
                    <Boton
                      onClick={() =>
                        onRead(
                          problem.blockId
                            ? { blockId: problem.blockId, unit: problem.unit }
                            : { unit: problem.unit },
                        )
                      }
                    >
                      {t.actions.viewOriginal}
                    </Boton>
                  ) : null}
                  {problem.actions.includes('correctText') && problem.resolution !== 'conflict' ? (
                    <Boton onClick={() => setEditing(problem.id)}>{t.actions.correctText}</Boton>
                  ) : null}
                  {problem.resolution === null || problem.resolution === 'conflict' ? (
                    <>
                      {problem.actions.includes('markAsImage') ? (
                        <Boton onClick={() => void resolve(problem, 'image')}>
                          {t.actions.markAsImage}
                        </Boton>
                      ) : null}
                      {problem.actions.includes('ignore') ? (
                        <Boton onClick={() => void resolve(problem, 'ignored')}>
                          {t.actions.ignore}
                        </Boton>
                      ) : null}
                    </>
                  ) : (
                    <Boton variant="quiet" onClick={() => void resolve(problem, null)}>
                      {t.actions.undo}
                    </Boton>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.group} aria-labelledby={`${materialId}-noextraido`}>
        <h4 id={`${materialId}-noextraido`} className={styles.blockHeading}>
          {t.notExtracted}
        </h4>
        {review.notExtracted.length === 0 ? (
          <p className={styles.partial}>{t.nothingHere}</p>
        ) : null}
        <ul className={styles.problemList}>
          {review.notExtracted.map((entry) => (
            <li key={entry.unit} className={styles.problem}>
              <div className={styles.problemHead}>
                <span className={styles.pageTag}>{t.pageLabel(entry.unit)}</span>
                <span className={styles.chip}>{t.reasons[entry.reason]}</span>
              </div>
              {entry.working ? <p className={styles.excerpt}>{t.recognizing}</p> : null}
              <div className={styles.actions}>
                {entry.actions.includes('recognize') ? (
                  <Boton onClick={() => void page('materials.ocrPage', entry.unit)}>
                    {t.actions.recognize}
                  </Boton>
                ) : null}
                {entry.actions.includes('reprocess') ? (
                  <Boton onClick={() => void page('materials.reprocessPage', entry.unit)}>
                    {t.actions.reprocess}
                  </Boton>
                ) : null}
                {entry.actions.includes('studyWithout') ? (
                  <Boton onClick={() => void exclude([entry.unit], true)}>
                    {t.actions.studyWithout}
                  </Boton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {review.excluded.length > 0 ? (
        <section className={styles.group} aria-labelledby={`${materialId}-excluidas`}>
          <h4 id={`${materialId}-excluidas`} className={styles.blockHeading}>
            {t.excluded}
          </h4>
          <ul className={styles.problemList}>
            {review.excluded.map((unit) => (
              <li key={unit} className={styles.problem}>
                <div className={styles.problemHead}>
                  <span className={styles.pageTag}>{t.pageLabel(unit)}</span>
                  <span className={styles.chip} data-state="excluded">
                    {texts.materials.coverage.words.excluded}
                  </span>
                </div>
                <div className={styles.actions}>
                  <Boton onClick={() => void exclude([unit], false)}>
                    {t.actions.includeAgain}
                  </Boton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.actions}>
        <Boton
          variant="primary"
          onClick={() =>
            onRead(review.firstSection ? { blockId: review.firstSection.blockId } : {})
          }
        >
          {review.firstSection ? t.readFirst : t.readAll}
        </Boton>
      </div>
    </section>
  );
}
