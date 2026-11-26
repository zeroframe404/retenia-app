import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  MicroCheck,
  MicroExercise,
  MicroProposal,
  MicroResult,
} from '../../preload/contract/procedures';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ScreenFrame } from '../ui/Frame';
import { OptionGroup } from '../ui/Options';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import styles from './Practice.module.css';

// El micro-ejercicio (Fase 18, CA-166): lo propone el cierre cuando se repite el mismo error. Son
// pocos ítems sobre ese punto, de a uno, con la corrección enseguida y sin pistas.

// La propuesta del cierre (nada si no hay ninguna para hoy).
export function MicroProposalCard({ onStart }: { onStart: (proposal: MicroProposal) => void }) {
  const [proposal, setProposal] = useState<MicroProposal | null>(null);
  const titleId = useId();
  useEffect(() => {
    let live = true;
    window.retenia['micro.proposal']({}).then(
      (loaded) => {
        if (live) {
          setProposal(loaded.proposal);
        }
      },
      // Sin la propuesta, el cierre sigue igual.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  if (proposal === null) {
    return null;
  }
  const text = texts.practice.micro;
  return (
    <section className={styles.proposal} aria-labelledby={titleId}>
      <h3 id={titleId}>{text.heading}</h3>
      <p>
        {proposal.step === null
          ? text.proposalProblem(proposal.title, proposal.items)
          : text.proposal(proposal.step, proposal.items)}
      </p>
      <div className={styles.actions}>
        <Boton onClick={() => onStart(proposal)}>{text.start}</Boton>
      </div>
    </section>
  );
}

export function MicroExerciseView({
  proposal,
  onDone,
}: {
  proposal: MicroProposal;
  onDone: () => void;
}) {
  const [microId] = useState(() => crypto.randomUUID());
  const [exercise, setExercise] = useState<MicroExercise | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [written, setWritten] = useState('');
  const [feedback, setFeedback] = useState<MicroCheck | null>(null);
  const [compared, setCompared] = useState<'yes' | 'no' | null>(null);
  const [result, setResult] = useState<MicroResult | null>(null);
  const [problem, setProblem] = useState('');
  const busy = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const text = texts.practice.micro;

  useEffect(() => {
    let live = true;
    window.retenia['micro.open']({ microId, pointKey: proposal.pointKey }).then(
      (loaded) => {
        if (live) {
          setExercise(loaded);
        }
      },
      () => {
        if (live) {
          setLoadFailed(true);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [microId, proposal.pointKey]);

  // Cada ítem nuevo recibe el foco en su respuesta.
  const loaded = exercise !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `index` dice cuándo cambió el ítem.
  useEffect(() => {
    field.current?.focus();
  }, [index, loaded]);

  const guarded = useCallback(async (action: () => Promise<void>) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setProblem('');
    try {
      await action();
    } catch {
      setProblem(texts.practice.micro.failed);
    } finally {
      busy.current = false;
    }
  }, []);

  if (loadFailed) {
    return (
      <ViewState
        kind="error"
        phrase={text.loadFailed}
        action={{ text: text.done, onClick: onDone }}
      />
    );
  }
  if (exercise === null) {
    return <ViewState kind="loading" phrase={text.loading} />;
  }
  if (result !== null) {
    return (
      <ScreenFrame level={3} title={text.heading}>
        <p>{text.score(result.correct, result.total)}</p>
        <p>{result.good ? text.good : text.notGood}</p>
        <p>{result.passed ? text.passed : text.progress(result.goodSessions)}</p>
        <div className={styles.actions}>
          <Boton variant="primary" onClick={onDone}>
            {text.done}
          </Boton>
        </div>
      </ScreenFrame>
    );
  }

  const item = exercise.items[index];
  if (item === undefined) {
    return <ViewState kind="loading" phrase={text.loading} />;
  }
  const last = index === exercise.items.length - 1;
  const waitingSelf = feedback !== null && feedback.ok === null && compared === null;

  const check = () =>
    guarded(async () => {
      if (written.trim() === '') {
        return;
      }
      setFeedback(await window.retenia['micro.check']({ microId, index: item.index, written }));
    });

  const assess = (value: 'yes' | 'no') =>
    guarded(async () => {
      await window.retenia['micro.self']({ microId, index: item.index, ok: value === 'yes' });
      setCompared(value);
    });

  const advance = () =>
    guarded(async () => {
      if (last) {
        setResult(await window.retenia['micro.finish']({ microId }));
        return;
      }
      setIndex((current) => current + 1);
      setWritten('');
      setFeedback(null);
      setCompared(null);
    });

  return (
    <ScreenFrame level={3} title={text.heading}>
      <div className={styles.activity}>
        {exercise.step === null ? null : <p>{text.about(exercise.step)}</p>}
        <p className={styles.unitHint} aria-live="polite">
          {text.item(index + 1, exercise.items.length)}
        </p>
        {item.statement === '' ? null : <p className={styles.statement}>{item.statement}</p>}
        {item.givens.length === 0 ? null : (
          <section aria-label={text.givens}>
            <h4 className={styles.diffTitle}>{text.givens}</h4>
            <ul className={styles.solutionList}>
              {item.givens.map((given) => (
                <li key={given.position}>{text.given(given.prompt, given.result)}</li>
              ))}
            </ul>
          </section>
        )}
        <p className={styles.prompt}>{item.prompt}</p>
        <form
          className={styles.field}
          onSubmit={(event) => {
            event.preventDefault();
            void (feedback === null ? check() : waitingSelf ? Promise.resolve() : advance());
          }}
        >
          <label htmlFor={inputId}>
            {item.answerType === 'number' ? text.numberAnswer : text.textAnswer}
          </label>
          <input
            ref={field}
            id={inputId}
            className={styles.input}
            type="text"
            inputMode={item.answerType === 'number' ? 'decimal' : 'text'}
            autoComplete="off"
            value={written}
            readOnly={feedback !== null}
            onChange={(event) => setWritten(event.target.value)}
          />
          {item.unit === null ? null : (
            <span className={styles.unitHint}>{texts.practice.inUnit(item.unit)}</span>
          )}
          {feedback === null ? (
            <div className={styles.actions}>
              <Boton type="submit" variant="primary" disabled={written.trim() === ''}>
                {text.check}
              </Boton>
              <Boton variant="quiet" onClick={onDone}>
                {texts.practice.backToCards}
              </Boton>
            </div>
          ) : null}
        </form>
        {feedback === null ? null : (
          <div className={styles.activity} role="status">
            {feedback.ok === null ? null : (
              <p className={styles.verdictLine} data-ok={feedback.ok ? 'true' : 'false'}>
                {feedback.ok ? text.right : text.wrong}
              </p>
            )}
            <p>{text.expected(feedback.expected)}</p>
            <p>{feedback.explanation}</p>
          </div>
        )}
        {feedback !== null && feedback.ok === null ? (
          <OptionGroup
            legend={text.selfLegend}
            options={[
              { value: 'yes' as const, text: text.selfYes, disabled: compared !== null },
              { value: 'no' as const, text: text.selfNo, disabled: compared !== null },
            ]}
            value={compared}
            onChange={(value) => void assess(value)}
          />
        ) : null}
        {feedback === null || waitingSelf ? null : (
          <div className={styles.actions}>
            <Boton variant="primary" onClick={() => void advance()}>
              {last ? text.seeResult : text.next}
            </Boton>
          </div>
        )}
        {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
      </div>
    </ScreenFrame>
  );
}
