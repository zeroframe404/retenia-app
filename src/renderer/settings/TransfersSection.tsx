import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  ExportCountsView,
  ImportKindValue,
  ImportPreview,
  ImportProblem,
  ImportRecordView,
} from '../../preload/contract/imports';
import type { Subject } from '../../preload/contract/organization';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import styles from '../ui/Content.module.css';
import form from '../ui/Form.module.css';
import { ItemList, ListItem, Toast } from '../ui/Frame';
import { ViewState } from '../ui/ViewStates';
import local from './Transfers.module.css';

// Ajustes › «Datos y copias» (Fase 15): «Traer de otros programas» (Anki y RemNote, con su vista
// previa: nada se escribe hasta «Importar») y «Tus datos, para llevar» («Exportar todo» e «Importar
// exportación»). Un pedido por vez. `onChanged` avisa que hay copias nuevas («Antes de importar»).

const NEW_SUBJECT = '__nueva__';

// La fecha (dd/mm/aaaa) de un instante, en Buenos Aires.
function dayOf(instant: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
  return formatShortDate(parts);
}

function summaryOf(preview: ImportPreview): string {
  return preview.kind === 'anki'
    ? texts.imports.ankiSummary(preview.counts)
    : texts.imports.remnoteSummary(preview.counts, preview.rejected);
}

function hasSomethingNew(preview: ImportPreview): boolean {
  return preview.kind === 'anki' ? preview.counts.cards.fresh > 0 : preview.counts.notes.fresh > 0;
}

function RejectedList({ items }: { items: ImportPreview['rejected'] }) {
  return items.length === 0 ? null : (
    <ItemList label={texts.imports.rejectedLabel}>
      {items.map((item, index) => (
        <ListItem
          // biome-ignore lint/suspicious/noArrayIndexKey: dos rechazos pueden decir lo mismo.
          key={`${item.what}-${index}`}
          text={texts.imports.rejectedLine(item.what, texts.imports.reasons[item.reason])}
        />
      ))}
    </ItemList>
  );
}

function Preview({
  preview,
  subjects,
  busy,
  onRun,
  onCancel,
}: {
  preview: ImportPreview;
  subjects: Subject[];
  busy: boolean;
  onRun: (
    destination: { kind: 'subject'; subjectId: string } | { kind: 'new'; name: string },
  ) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const active = subjects.find((subject) => subject.status === 'active') ?? subjects[0];
  const [target, setTarget] = useState(active?.id ?? NEW_SUBJECT);
  const [name, setName] = useState('');
  const fresh = hasSomethingNew(preview);
  const existing = preview.kind === 'anki' ? preview.counts.cards : preview.counts.notes;
  const ready = fresh && (target !== NEW_SUBJECT || name.trim() !== '');
  return (
    <section className={local.preview} aria-label={texts.imports.previewLabel}>
      <h5 className={local.title}>{texts.imports.previewTitle(preview.fileName)}</h5>
      <p className={local.summary}>{summaryOf(preview)}</p>
      {existing.existing > 0 ? <p>{texts.imports.again(existing)}</p> : null}
      {preview.importedBefore ? (
        <p>{texts.imports.importedBefore(dayOf(preview.importedBefore))}</p>
      ) : null}
      {preview.counts.withoutHistory > 0 && fresh ? (
        <>
          <p>{texts.imports.withoutHistory}</p>
          <p>{texts.imports.withoutHistoryNote}</p>
        </>
      ) : null}
      <p className={local.note}>{texts.imports.nothingWritten}</p>
      {preview.annotated.length > 0 ? (
        <h6 className={local.subtitle}>{texts.imports.annotatedTitle}</h6>
      ) : null}
      {preview.annotated.length > 0 ? (
        <ItemList label={texts.imports.annotatedTitle}>
          {preview.annotated.map((item, index) => (
            <ListItem
              // biome-ignore lint/suspicious/noArrayIndexKey: dos anotaciones pueden decir lo mismo.
              key={`${item.what}-${index}`}
              text={texts.imports.annotatedLine(item.what, texts.imports.notes[item.note])}
            />
          ))}
        </ItemList>
      ) : null}
      {preview.rejected.length > 0 ? (
        <h6 className={local.subtitle}>{texts.imports.rejectedTitle}</h6>
      ) : null}
      <RejectedList items={preview.rejected} />
      {fresh ? (
        <>
          <div className={form.field}>
            <label htmlFor={`${ids}-destino`}>{texts.imports.destination}</label>
            <select
              id={`${ids}-destino`}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
              <option value={NEW_SUBJECT}>{texts.imports.newSubject}</option>
            </select>
          </div>
          {target === NEW_SUBJECT ? (
            <div className={form.field}>
              <label htmlFor={`${ids}-nueva`}>{texts.imports.newSubjectName}</label>
              <input
                id={`${ids}-nueva`}
                type="text"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p>{texts.imports.nothingNew}</p>
      )}
      <div className={styles.actions}>
        <Boton
          variant="primary"
          disabled={busy || !ready}
          onClick={() =>
            onRun(
              target === NEW_SUBJECT
                ? { kind: 'new', name: name.trim() }
                : { kind: 'subject', subjectId: target },
            )
          }
        >
          {texts.imports.run}
        </Boton>
        <Boton disabled={busy} onClick={onCancel}>
          {texts.imports.cancel}
        </Boton>
      </div>
    </section>
  );
}

// «Importar exportación»: elegir el archivo, ver lo que trae y «Cargar». Solo en un Retenia vacío.
// La usa también la pantalla de la primera vez.
export function LoadExport({ onLoaded }: { onLoaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success' | 'attention';
    text: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    previewId: string;
    counts: ExportCountsView;
    exportedAt: string;
  } | null>(null);
  const working = useRef(false);
  const run = async (task: () => Promise<void>) => {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const choose = () =>
    run(async () => {
      setNotice({ tone: 'info', text: texts.exports.reading });
      setPreview(null);
      try {
        const chosen = await window.retenia['exports.choose']({});
        if (chosen.outcome === 'cancelled') {
          setNotice(null);
        } else if (chosen.outcome === 'problem') {
          setNotice({ tone: 'attention', text: texts.exports.problems[chosen.problem] });
        } else {
          setNotice(null);
          setPreview(chosen);
        }
      } catch {
        setNotice({ tone: 'attention', text: texts.exports.loadFailed });
      }
    });
  const load = (previewId: string) =>
    run(async () => {
      setNotice({ tone: 'info', text: texts.exports.loading });
      try {
        const { counts } = await window.retenia['exports.load']({ previewId });
        setPreview(null);
        setNotice({
          tone: 'success',
          text: texts.exports.loaded(texts.exports.countsLine(counts)),
        });
        onLoaded();
      } catch {
        setNotice({ tone: 'attention', text: texts.exports.loadFailed });
      }
    });
  return (
    <div className={styles.stack}>
      <div className={styles.actions}>
        <Boton disabled={busy} onClick={() => void choose()}>
          {texts.exports.importExport}
        </Boton>
      </div>
      <Toast tone={notice?.tone}>{notice?.text}</Toast>
      {preview ? (
        <section className={styles.stack} aria-label={texts.exports.importExport}>
          <p>
            {texts.exports.previewLine(
              dayOf(preview.exportedAt),
              texts.exports.countsLine(preview.counts),
            )}
          </p>
          <div className={styles.actions}>
            <Boton variant="primary" disabled={busy} onClick={() => void load(preview.previewId)}>
              {texts.exports.load}
            </Boton>
            <Boton
              disabled={busy}
              onClick={() => {
                void window.retenia['imports.cancel']({ previewId: preview.previewId }).catch(
                  () => undefined,
                );
                setPreview(null);
              }}
            >
              {texts.imports.cancel}
            </Boton>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function TransfersSection({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success' | 'attention';
    text: string;
  } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<ImportRecordView[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState('');
  const [exportNotice, setExportNotice] = useState<{
    tone: 'info' | 'success' | 'attention';
    text: string;
  } | null>(null);
  const working = useRef(false);

  const loadRecords = useCallback(async () => {
    try {
      setRecords((await window.retenia['imports.list']({})).imports);
    } catch {
      setRecords([]);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  async function run(task: () => Promise<void>) {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const problemText = (problem: ImportProblem) => texts.imports.problems[problem];

  const choose = (kind: ImportKindValue, folder = false) =>
    run(async () => {
      if (preview) {
        void window.retenia['imports.cancel']({ previewId: preview.previewId }).catch(
          () => undefined,
        );
      }
      setPreview(null);
      setNotice({ tone: 'info', text: texts.imports.reading });
      try {
        const [chosen, listed] = await Promise.all([
          window.retenia['imports.choose']({ kind, ...(folder ? { folder: true } : {}) }),
          window.retenia['subjects.list']({}),
        ]);
        setSubjects(listed.subjects);
        if (chosen.outcome === 'cancelled') {
          setNotice(null);
        } else if (chosen.outcome === 'problem') {
          setNotice({ tone: 'attention', text: problemText(chosen.problem) });
        } else {
          setNotice(null);
          setPreview(chosen.preview);
        }
      } catch {
        setNotice({ tone: 'attention', text: texts.imports.problems.damaged });
      }
    });

  const importNow = (
    destination: { kind: 'subject'; subjectId: string } | { kind: 'new'; name: string },
  ) =>
    run(async () => {
      if (!preview) {
        return;
      }
      const kind = preview.kind;
      setNotice({ tone: 'info', text: texts.data.working });
      try {
        const result = await window.retenia['imports.run']({
          previewId: preview.previewId,
          destination,
        });
        setPreview(null);
        setNotice({
          tone: 'success',
          text: `${
            kind === 'anki'
              ? texts.imports.doneAnki(
                  result.counts.cards.fresh,
                  result.counts.reviews,
                  result.subjectName,
                )
              : texts.imports.doneRemnote(
                  result.counts.notes.fresh,
                  result.counts.cards.fresh,
                  result.subjectName,
                )
          } ${texts.imports.backupMade}`,
        });
        await loadRecords();
        setOpen(result.counts.rejected > 0 ? result.importId : null);
        onChanged();
      } catch {
        setNotice({ tone: 'attention', text: texts.imports.failed });
      }
    });

  const cancel = () => {
    if (preview) {
      void window.retenia['imports.cancel']({ previewId: preview.previewId }).catch(
        () => undefined,
      );
    }
    setPreview(null);
    setNotice(null);
  };

  const saveList = (importId: string) =>
    run(async () => {
      try {
        const { saved } = await window.retenia['imports.saveRejected']({ importId });
        setListNotice(saved ? texts.imports.listSaved : '');
      } catch {
        setListNotice(texts.imports.saveListFailed);
      }
    });

  const exportAll = () =>
    run(async () => {
      setExportNotice({ tone: 'info', text: texts.exports.exporting });
      try {
        const result = await window.retenia['exports.all']({});
        setExportNotice(
          result.outcome === 'cancelled'
            ? null
            : {
                tone: result.missing > 0 ? 'attention' : 'success',
                text: `${texts.exports.exported(
                  result.fileName,
                  texts.exports.countsLine(result.counts),
                )}${result.missing > 0 ? ` ${texts.exports.missingFiles(result.missing)}` : ''}`,
              },
        );
      } catch {
        setExportNotice({ tone: 'attention', text: texts.exports.exportFailed });
      }
    });

  return (
    <>
      <div className={styles.section}>
        <h4>{texts.imports.title}</h4>
        <div className={styles.actions}>
          <Boton disabled={busy} onClick={() => void choose('anki')}>
            {texts.imports.fromAnki}
          </Boton>
          <Boton disabled={busy} onClick={() => void choose('remnote')}>
            {texts.imports.fromRemnote}
          </Boton>
          <Boton variant="quiet" disabled={busy} onClick={() => void choose('remnote', true)}>
            {texts.imports.fromRemnoteFolder}
          </Boton>
        </div>
        <Toast tone={notice?.tone}>{notice?.text}</Toast>
        {preview ? (
          <Preview
            key={preview.previewId}
            preview={preview}
            subjects={subjects}
            busy={busy}
            onRun={(destination) => void importNow(destination)}
            onCancel={cancel}
          />
        ) : null}
        <h4>{texts.imports.historyTitle}</h4>
        {records !== null && records.length === 0 ? (
          <ViewState kind="empty" phrase={texts.imports.historyEmpty} />
        ) : null}
        {records !== null && records.length > 0 ? (
          <ItemList label={texts.imports.historyLabel}>
            {records.map((record) => (
              <ListItem
                key={record.importId}
                text={`${texts.imports.historyRow(
                  dayOf(record.at),
                  texts.imports.kinds[record.kind],
                  record.fileName,
                  record.subjectName,
                )} · ${
                  record.kind === 'anki'
                    ? texts.imports.historyAnki(record.counts)
                    : texts.imports.remnoteSummary(record.counts, record.rejected)
                }`}
                actions={
                  record.rejected.length > 0 ? (
                    <Boton
                      onClick={() => setOpen(open === record.importId ? null : record.importId)}
                    >
                      {open === record.importId
                        ? texts.imports.hideRejected
                        : texts.imports.viewRejected}
                    </Boton>
                  ) : undefined
                }
              >
                {open === record.importId ? (
                  <div className={styles.stack}>
                    <RejectedList items={record.rejected} />
                    <div className={styles.actions}>
                      <Boton disabled={busy} onClick={() => void saveList(record.importId)}>
                        {texts.imports.saveList}
                      </Boton>
                    </div>
                    <Toast>{listNotice}</Toast>
                  </div>
                ) : null}
              </ListItem>
            ))}
          </ItemList>
        ) : null}
      </div>
      <div className={styles.section}>
        <h4>{texts.exports.title}</h4>
        <div className={styles.actions}>
          <Boton disabled={busy} onClick={() => void exportAll()}>
            {texts.exports.exportAll}
          </Boton>
        </div>
        <Toast tone={exportNotice?.tone}>{exportNotice?.text}</Toast>
        <LoadExport onLoaded={onChanged} />
      </div>
    </>
  );
}
