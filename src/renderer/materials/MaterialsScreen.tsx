import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { type AddResult, MAX_FILES, type MaterialSummary } from '../../preload/contract/materials';
import type { Subject } from '../../preload/contract/organization';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { ViewedSubject } from '../subjects/SubjectBar';
import { Boton } from '../ui/Boton';
import { Dialog, ScreenFrame } from '../ui/Frame';
import { BannerEstado, EtapasProcesamiento } from '../ui/Process';
import { AddMaterialDialog, type AddMode } from './AddMaterialDialog';
import { isCancelled, isWorking, partialText, problemText, stagesOf, stateText } from './describe';
import styles from './Materials.module.css';
import { MaterialViewer, type OpenTarget } from './MaterialViewer';
import { ReviewView } from './ReviewView';

// Materiales (H-25): la lista de los materiales de la materia que mirás, cada uno con su estado
// («Recibido», «Procesando n de N», «Listo», «Parcialmente procesado», «Requiere revisión»,
// «Error»). Toda la pantalla acepta soltar archivos. Al tocar un material se ven sus etapas y sus
// acciones; mientras procesa se puede leer el original, seguir usando Retenia o cancelar.

export interface MaterialRequest extends OpenTarget {
  materialId: string;
  nonce: number;
}

type Duplicate = Extract<AddResult, { outcome: 'duplicate' }>;

// Mientras algo se procesa, además de los avisos del principal se vuelve a mirar cada tanto: si un
// aviso se pierde, la lista no queda vieja.
const POLL_MS = 1500;

export function MaterialsScreen({
  subject,
  active,
  subjects,
  focusTitle,
  request,
  onChangeSubject,
  onInboxCount,
  onConfigureAi,
}: {
  subject: Subject | null;
  active: Subject | null;
  subjects: readonly Subject[];
  focusTitle: boolean;
  request: MaterialRequest | null;
  onChangeSubject: () => void;
  onInboxCount?: ((count: number) => void) | undefined;
  // «Configurar» de la IA (Fase 19): lleva a Ajustes › «Inteligencia artificial».
  onConfigureAi?: (() => void) | undefined;
}) {
  const [materials, setMaterials] = useState<MaterialSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{
    materialId: string;
    target: OpenTarget | null;
    // Se abrió desde la revisión: «Volver» lleva de vuelta a ella.
    fromReview?: boolean;
  } | null>(null);
  // La revisión de un material (Fase 14): se abre desde el detalle y vuelve a él.
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddMode | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [progress, setProgress] = useState(0);
  // Lo que pasó al soltar archivos sobre la pantalla, si no se pudo: siempre a la vista.
  const [dropProblem, setDropProblem] = useState<string | null>(null);
  const subjectId = subject?.id ?? null;
  const handled = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!subjectId) {
      setMaterials([]);
      return;
    }
    try {
      setMaterials((await window.retenia['materials.list']({ subjectId })).materials);
    } catch (error: unknown) {
      console.error('La ventana no pudo leer los materiales por el puente', error);
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Los avisos del principal: avanzó, terminó o falló un material.
  useEffect(() => {
    const stop = window.reteniaAvisos?.alRecibir((event) => {
      // Los de la IA los escucha su panel.
      if (!event.type.startsWith('material.')) {
        return;
      }
      setProgress((current) => current + 1);
      void load();
    });
    return () => stop?.();
  }, [load]);

  const working = materials?.some((material) => isWorking(material.state)) ?? false;
  useEffect(() => {
    if (!working) {
      return;
    }
    const timer = setInterval(() => {
      setProgress((current) => current + 1);
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [working, load]);

  // «Ver en el original» desde una tarjeta o un resultado del buscador.
  useEffect(() => {
    if (request && handled.current !== request.nonce) {
      handled.current = request.nonce;
      const { materialId, nonce: _nonce, ...target } = request;
      setViewing({ materialId, target });
    }
  }, [request]);

  const afterAdding = (results: AddResult[]) => {
    setAdding(null);
    setDropProblem(null);
    // Lo que se acaba de agregar se ve en la lista, aunque estuvieras leyendo otro material.
    setViewing(null);
    const offered = results.filter((result): result is Duplicate => result.outcome === 'duplicate');
    setDuplicates((current) => [...current, ...offered]);
    const last = [...results].reverse().find((result) => result.outcome === 'added');
    if (last?.outcome === 'added') {
      setSelectedId(last.materialId);
    }
    void load();
  };

  const decide = async (duplicate: Duplicate, decision: 'open' | 'newVersion' | 'addAnyway') => {
    setDuplicates((current) => current.filter((item) => item.pendingId !== duplicate.pendingId));
    try {
      const { materialId } = await window.retenia['materials.decide']({
        pendingId: duplicate.pendingId,
        decision,
      });
      setSelectedId(materialId);
    } catch (error: unknown) {
      console.error('La ventana no pudo decidir el duplicado por el puente', error);
    }
    void load();
  };

  const act = async (channel: 'materials.cancel' | 'materials.resume', materialId: string) => {
    try {
      await window.retenia[channel]({ materialId });
    } catch (error: unknown) {
      console.error('La ventana no pudo cambiar el material por el puente', error);
    }
    void load();
  };

  const dismiss = async (materialId: string) => {
    try {
      await window.retenia['materials.dismiss']({ materialId });
      setSelectedId(null);
    } catch (error: unknown) {
      console.error('La ventana no pudo quitar el material por el puente', error);
    }
    void load();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0 || !subjectId || !window.reteniaArchivos) {
      return;
    }
    if (files.length > MAX_FILES) {
      setDropProblem(texts.materials.tooManyFiles);
      return;
    }
    window.reteniaArchivos
      .agregar(files, { subjectId })
      .then(({ results }) => afterAdding(results))
      .catch((error: unknown) => {
        console.error('La ventana no pudo agregar los archivos soltados', error);
        setDropProblem(texts.materials.addFailed);
      });
  };

  const [duplicate] = duplicates;
  const selected = materials?.find((material) => material.id === selectedId) ?? null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: soltar archivos es otra forma de «Elegir archivo», que está en «Agregar material».
    <div className={styles.screen} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <ScreenFrame
        title={texts.nav.materials}
        focusTitle={focusTitle}
        actions={
          viewing || reviewing ? null : (
            <Boton variant="primary" onClick={() => setAdding('files')}>
              {texts.materials.add}
            </Boton>
          )
        }
      >
        {subject ? (
          <ViewedSubject viewed={subject} active={active} onChange={onChangeSubject} />
        ) : null}
        {dropProblem ? <BannerEstado tone="info">{dropProblem}</BannerEstado> : null}
        {viewing ? (
          <MaterialViewer
            materialId={viewing.materialId}
            target={viewing.target}
            refreshKey={progress}
            onBack={() => setViewing(null)}
            backLabel={viewing.fromReview ? texts.materials.review.backToReview : undefined}
            onInboxCount={onInboxCount}
            onChanged={() => void load()}
            onConfigureAi={onConfigureAi}
          />
        ) : reviewing ? (
          <ReviewView
            materialId={reviewing}
            refreshKey={progress}
            onBack={() => setReviewing(null)}
            onRead={(target) => setViewing({ materialId: reviewing, target, fromReview: true })}
            onChanged={() => void load()}
          />
        ) : (
          <div className={styles.layout}>
            {materials !== null && materials.length === 0 ? (
              <p className={styles.empty}>{texts.materials.empty}</p>
            ) : null}
            {materials && materials.length > 0 ? (
              <ul className={styles.list} aria-label={texts.materials.listLabel}>
                {materials.map((material) => (
                  <li key={material.id}>
                    <button
                      type="button"
                      className={styles.row}
                      aria-pressed={material.id === selectedId}
                      onClick={() => setSelectedId(material.id)}
                    >
                      <span className={styles.rowTitle}>{material.title}</span>{' '}
                      <span className={styles.rowState} data-state={material.state.kind}>
                        {stateText(material.state)}
                      </span>
                      {material.versionNo > 1 ? (
                        <>
                          {' '}
                          <span className={styles.rowVersion}>
                            {texts.materials.version(material.versionNo)}
                          </span>
                        </>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected ? (
              <MaterialDetailPanel
                material={selected}
                onRead={() => setViewing({ materialId: selected.id, target: null })}
                onReview={() => setReviewing(selected.id)}
                onCancel={() => void act('materials.cancel', selected.id)}
                onResume={() => void act('materials.resume', selected.id)}
                onChooseAnother={() => setAdding('files')}
                onPaste={() => setAdding('paste')}
                onDismiss={() => void dismiss(selected.id)}
              />
            ) : null}
          </div>
        )}
      </ScreenFrame>
      {adding ? (
        <AddMaterialDialog
          subjects={subjects}
          defaultSubjectId={active?.id ?? subjectId}
          initialMode={adding}
          onClose={() => setAdding(null)}
          onAdded={afterAdding}
        />
      ) : null}
      {duplicate ? (
        <Dialog
          title={texts.materials.duplicate(
            duplicate.existing.name,
            formatShortDate(duplicate.existing.day),
          )}
          onClose={() => void decide(duplicate, 'open')}
        >
          <div className={styles.actions}>
            <Boton onClick={() => void decide(duplicate, 'open')}>
              {texts.materials.openExisting}
            </Boton>
            <Boton onClick={() => void decide(duplicate, 'newVersion')}>
              {texts.materials.addAsVersion}
            </Boton>
            <Boton onClick={() => void decide(duplicate, 'addAnyway')}>
              {texts.materials.addAnyway}
            </Boton>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function MaterialDetailPanel({
  material,
  onRead,
  onReview,
  onCancel,
  onResume,
  onChooseAnother,
  onPaste,
  onDismiss,
}: {
  material: MaterialSummary;
  onRead: () => void;
  onReview: () => void;
  onCancel: () => void;
  onResume: () => void;
  onChooseAnother: () => void;
  onPaste: () => void;
  onDismiss: () => void;
}) {
  const problem = problemText(material.state);
  const partial = partialText(material.state);
  const waiting = material.state.kind === 'pendingNetwork';
  return (
    <section className={styles.detail} aria-label={material.title}>
      <h3 className={styles.detailTitle}>{material.title}</h3>
      {waiting ? (
        <>
          <BannerEstado tone="pending">
            {material.state.kind === 'pendingNetwork' && material.state.localOnly
              ? texts.materials.states.pendingLocalOnly
              : texts.materials.states.pendingNetwork}
          </BannerEstado>
          {material.sourceUrl ? <p className={styles.webInfo}>{material.sourceUrl}</p> : null}
          <div className={styles.actions}>
            <Boton variant="quiet" onClick={onDismiss}>
              {texts.materials.dismiss}
            </Boton>
          </div>
        </>
      ) : problem ? (
        <>
          <BannerEstado tone="info">{problem}</BannerEstado>
          <div className={styles.actions}>
            <Boton onClick={onChooseAnother}>{texts.materials.chooseAnother}</Boton>
            <Boton onClick={onPaste}>{texts.materials.pasteInstead}</Boton>
            <Boton variant="quiet" onClick={onDismiss}>
              {texts.materials.dismiss}
            </Boton>
          </div>
        </>
      ) : (
        <>
          <EtapasProcesamiento stages={stagesOf(material)} />
          {partial ? <p className={styles.partial}>{partial}</p> : null}
          {material.kind === 'web' ? (
            <p className={styles.webInfo}>
              {texts.materials.snapshot.savedOn(
                material.sourceUrl,
                material.snapshotDay ? formatShortDate(material.snapshotDay) : '',
              )}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Boton onClick={onRead}>{texts.materials.readOriginal}</Boton>
            <Boton onClick={onReview}>{texts.materials.review.open}</Boton>
            {isWorking(material.state) ? (
              <Boton onClick={onCancel}>{texts.materials.cancel}</Boton>
            ) : null}
            {isCancelled(material.state) ? (
              <Boton onClick={onResume}>{texts.materials.resume}</Boton>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
