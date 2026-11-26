import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  MasteryStateValue,
  NextStepValue,
  ObjectivePanel as PanelData,
  RequirementView,
} from '../../preload/contract/objectives';
import { formatShortDate, texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog } from '../ui/Frame';
import { RotuloDato } from '../ui/Labels';
import { EstadoDominio } from '../ui/Mastery';
import { OptionGroup } from '../ui/Options';
import { BannerEstado } from '../ui/Process';
import { ViewState } from '../ui/ViewStates';
import { ActivityChoices, useActivities } from './ActivityChoices';
import styles from './Progress.module.css';

const STATE_TEXT: Record<MasteryStateValue, string> = {
  'not-started': texts.ui.mastery.notStarted,
  'in-practice': texts.ui.mastery.inPractice,
  'to-review': texts.ui.mastery.toReview,
  enough: texts.ui.mastery.enough,
  consolidated: texts.ui.mastery.consolidated,
};

export const stateText = (state: MasteryStateValue) => STATE_TEXT[state];

export function titleOf(objective: { implicit: boolean; title: string; topicName: string | null }) {
  return objective.implicit
    ? texts.progress.implicitTitle(objective.topicName ?? texts.progress.noTopic)
    : objective.title;
}

function nextStepText(step: NextStepValue): string {
  const panel = texts.progress.panel;
  switch (step.kind) {
    case 'start':
      return panel.start;
    case 'toEnough':
      return panel.toEnough(step.remaining);
    case 'recover':
      return panel.recover;
    case 'check':
      return panel.check(formatShortDate(step.from));
    case 'toConsolidated':
      return panel.toConsolidated(
        step.remaining,
        step.delayedFrom === null ? null : formatShortDate(step.delayedFrom),
        step.needsVariant === true,
      );
    case 'kept':
      return panel.kept;
  }
}

type Mode = 'view' | 'link' | 'needs' | 'neededBy';

// El panel de un objetivo (CA-149): su estado, qué falta, las cuatro columnas de evidencia con
// conteo y fecha, lo que estima Retenia (con su respaldo, nunca un porcentaje), sus actividades,
// sus requisitos y «Ya lo sé» / «No quiero esto ahora».
export function ObjectivePanel({
  objectiveId,
  subjectId,
  onClose,
  onChanged,
  onPractice,
}: {
  objectiveId: string;
  subjectId: string;
  onClose: () => void;
  onChanged: () => void;
  onPractice: (cardId: string) => void;
}) {
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      setPanel(await window.retenia['objectives.panel']({ objectiveId }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [objectiveId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(run: () => Promise<unknown>, done: string) {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setProblem('');
    try {
      await run();
      setNotice(done);
      setMode('view');
      await load();
      onChanged();
    } catch {
      setProblem(texts.progress.panel.failed);
    } finally {
      busy.current = false;
    }
  }

  const title = panel ? titleOf(panel.objective) : texts.progress.panel.label;
  return (
    <Dialog title={title} placement="side" onClose={onClose}>
      {failed ? (
        <ViewState
          kind="error"
          phrase={texts.progress.panel.loadFailed}
          action={{ text: texts.progress.retry, onClick: () => void load() }}
        />
      ) : panel === null ? (
        <ViewState kind="loading" phrase={texts.progress.loadingObjectives} />
      ) : mode === 'link' ? (
        <LinkForm
          subjectId={subjectId}
          panel={panel}
          onCancel={() => setMode('view')}
          onSave={(cardIds) =>
            act(
              () =>
                window.retenia['objectives.link']({
                  linkId: crypto.randomUUID(),
                  // En el implícito de un tema, enlazar es devolverlas a «Recordar: tema».
                  objectiveId: panel.objective.implicit ? null : objectiveId,
                  cardIds: [...cardIds],
                }),
              texts.progress.panel.linkedDone(cardIds.size),
            )
          }
        />
      ) : mode === 'needs' || mode === 'neededBy' ? (
        <RequirementForm
          mode={mode}
          panel={panel}
          onCancel={() => setMode('view')}
          onSave={(otherId, kind, confirmed) =>
            act(
              () =>
                window.retenia['objectives.requirements.add']({
                  requirementId: crypto.randomUUID(),
                  objectiveId: mode === 'needs' ? objectiveId : otherId,
                  requiresId: mode === 'needs' ? otherId : objectiveId,
                  kind,
                  status: confirmed ? 'confirmed' : 'suggested',
                }),
              texts.progress.panel.addedDone,
            )
          }
        />
      ) : (
        <PanelView
          panel={panel}
          notice={notice}
          problem={problem}
          onPractice={onPractice}
          onMode={(next) => {
            setNotice('');
            setMode(next);
          }}
          onDismiss={(requirement) =>
            act(
              () =>
                window.retenia['objectives.requirements.dismiss']({
                  requirementId: requirement.requirementId,
                }),
              texts.progress.panel.dismissedDone,
            )
          }
          onConfirm={(requirement) =>
            act(
              () =>
                window.retenia['objectives.requirements.confirm']({
                  requirementId: requirement.requirementId,
                }),
              texts.progress.panel.addedDone,
            )
          }
          onKnowAlready={() =>
            act(
              () => window.retenia['objectives.knowAlready']({ objectiveId }),
              texts.progress.panel.knowAlreadyDone,
            )
          }
          onPostpone={() =>
            act(
              () => window.retenia['objectives.postpone']({ objectiveId }),
              texts.progress.panel.postponedDone,
            )
          }
          onResume={() =>
            act(
              () => window.retenia['objectives.resume']({ objectiveId }),
              texts.progress.panel.resumedDone,
            )
          }
        />
      )}
    </Dialog>
  );
}

function RequirementRow({
  requirement,
  name,
  onDismiss,
  onConfirm,
}: {
  requirement: RequirementView;
  name: string;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const panel = texts.progress.panel;
  return (
    <li>
      <p>{name}</p>
      <div className={styles.row}>
        <span className={styles.tag}>
          {requirement.kind === 'indispensable' ? panel.indispensable : panel.recommended}
        </span>
        <span
          className={styles.tag}
          data-stroke={requirement.status === 'suggested' ? 'dashed' : 'solid'}
        >
          {requirement.status === 'confirmed' ? panel.confirmed : panel.suggested}
        </span>
        <span className={styles.note}>
          {panel.requiredState(stateText(requirement.requiredState))}
        </span>
      </div>
      <div className={styles.actions}>
        {requirement.status === 'suggested' ? (
          <Boton variant="quiet" onClick={onConfirm}>
            {panel.confirm}
          </Boton>
        ) : null}
        <Boton variant="quiet" onClick={onDismiss}>
          {panel.notNeeded}
        </Boton>
      </div>
    </li>
  );
}

function PanelView({
  panel,
  notice,
  problem,
  onPractice,
  onMode,
  onDismiss,
  onConfirm,
  onKnowAlready,
  onPostpone,
  onResume,
}: {
  panel: PanelData;
  notice: string;
  problem: string;
  onPractice: (cardId: string) => void;
  onMode: (mode: Mode) => void;
  onDismiss: (requirement: RequirementView) => void;
  onConfirm: (requirement: RequirementView) => void;
  onKnowAlready: () => void;
  onPostpone: () => void;
  onResume: () => void;
}) {
  const text = texts.progress.panel;
  const { objective, columns, estimate } = panel;
  const firstPracticable = panel.activities.find((activity) => activity.practicable);
  const column = (name: string, value: { count: number; lastDay: string | null }) => (
    <div className={styles.column}>
      <dt>{name}</dt>
      <dd className={styles.count}>{value.count}</dd>
      <dd className={styles.last}>
        {value.lastDay === null ? text.never : text.lastOn(formatShortDate(value.lastDay))}
      </dd>
    </div>
  );
  return (
    <div className={styles.panel}>
      {notice === '' ? null : <BannerEstado tone="info">{notice}</BannerEstado>}
      {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
      <EstadoDominio state={objective.state} toVerify={objective.toVerify} />
      <div className={styles.row}>
        <span className={styles.tag}>{text.kindLine(texts.progress.kinds[objective.kind])}</span>
        {objective.postponed ? (
          <span className={styles.tag}>{texts.progress.postponedTag}</span>
        ) : null}
      </div>
      {objective.conditions === null ? null : (
        <p className={styles.note}>{text.conditionsLine(objective.conditions)}</p>
      )}
      <p>{nextStepText(panel.nextStep)}</p>
      {panel.pendingCheckFrom === null ? null : (
        <div className={styles.actions}>
          <p className={styles.note}>
            {text.pendingCheck(formatShortDate(panel.pendingCheckFrom))}
          </p>
          {firstPracticable && panel.checkAvailable ? (
            <Boton onClick={() => onPractice(firstPracticable.cardId)}>{text.doCheck}</Boton>
          ) : null}
        </div>
      )}
      <section aria-label={text.columnsLabel}>
        <h3>{text.columnsLabel}</h3>
        <dl className={styles.columns}>
          {column(text.unaided, columns.unaided)}
          {column(text.aided, columns.aided)}
          {column(text.delayed, columns.delayed)}
          {column(text.variants, columns.variants)}
        </dl>
      </section>
      <div className={styles.estimate}>
        <RotuloDato kind="estimated" />
        <p>
          {estimate.outOfTen === null
            ? text.estimateNone(estimate.concept)
            : text.estimate(estimate.concept, estimate.outOfTen, estimate.observations)}
        </p>
        <p className={styles.note}>{text.estimateNote}</p>
      </div>
      <section aria-label={text.activitiesHeading} className={styles.group}>
        <h3>{text.activitiesHeading}</h3>
        {panel.activities.length === 0 ? (
          <p className={styles.note}>{text.noActivities}</p>
        ) : (
          <ul className={styles.choices}>
            {panel.activities.map((activity) => (
              <li key={activity.cardId} className={styles.row}>
                <span>
                  {activity.question}
                  {activity.isExercise ? ` · ${texts.progress.form.exercise}` : ''}
                </span>
                {activity.practicable ? (
                  <Boton
                    variant="quiet"
                    aria-label={text.practiceOne(activity.question)}
                    onClick={() => onPractice(activity.cardId)}
                  >
                    {text.practice}
                  </Boton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {panel.previousAttempts > 0 ? (
          <p className={styles.note}>{text.previous(panel.previousAttempts)}</p>
        ) : null}
        <div className={styles.actions}>
          <Boton onClick={() => onMode('link')}>{text.link}</Boton>
        </div>
      </section>
      {objective.implicit ? null : (
        <>
          <section aria-label={text.needsHeading} className={styles.group}>
            <h3>{text.needsHeading}</h3>
            {panel.needs.length === 0 ? (
              <p className={styles.note}>{text.noNeeds}</p>
            ) : (
              <ul className={styles.choices}>
                {panel.needs.map((requirement) => (
                  <RequirementRow
                    key={requirement.requirementId}
                    requirement={requirement}
                    name={requirement.requiresTitle}
                    onDismiss={() => onDismiss(requirement)}
                    onConfirm={() => onConfirm(requirement)}
                  />
                ))}
              </ul>
            )}
            <div className={styles.actions}>
              <Boton onClick={() => onMode('needs')}>{text.missedSomething}</Boton>
            </div>
          </section>
          <section aria-label={text.neededByHeading} className={styles.group}>
            <h3>{text.neededByHeading}</h3>
            {panel.neededBy.length === 0 ? (
              <p className={styles.note}>{text.noNeededBy}</p>
            ) : (
              <ul className={styles.choices}>
                {panel.neededBy.map((requirement) => (
                  <RequirementRow
                    key={requirement.requirementId}
                    requirement={requirement}
                    name={requirement.objectiveTitle}
                    onDismiss={() => onDismiss(requirement)}
                    onConfirm={() => onConfirm(requirement)}
                  />
                ))}
              </ul>
            )}
            <div className={styles.actions}>
              <Boton onClick={() => onMode('neededBy')}>{text.markAsRequirement}</Boton>
            </div>
          </section>
          <div className={styles.actions}>
            {objective.state === 'not-started' ? (
              <Boton onClick={onKnowAlready}>{text.knowAlready}</Boton>
            ) : null}
            {objective.postponed ? (
              <Boton onClick={onResume}>{text.resume}</Boton>
            ) : (
              <Boton variant="quiet" onClick={onPostpone}>
                {text.postpone}
              </Boton>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LinkForm({
  subjectId,
  panel,
  onCancel,
  onSave,
}: {
  subjectId: string;
  panel: PanelData;
  onCancel: () => void;
  onSave: (cardIds: ReadonlySet<string>) => void;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const activities = useActivities(subjectId, panel.objective.topicId);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen.size > 0) {
          onSave(chosen);
        }
      }}
    >
      <h3>{texts.progress.panel.linkTitle}</h3>
      <ActivityChoices
        legend={texts.progress.form.activities}
        help={texts.progress.form.activitiesHelp}
        activities={activities}
        chosen={chosen}
        onChange={setChosen}
        exclude={panel.objective.id}
      />
      <div className={styles.actions}>
        <Boton variant="primary" type="submit" disabled={chosen.size === 0}>
          {texts.progress.panel.save}
        </Boton>
        <Boton variant="quiet" onClick={onCancel}>
          {texts.progress.panel.cancel}
        </Boton>
      </div>
    </form>
  );
}

function RequirementForm({
  mode,
  panel,
  onCancel,
  onSave,
}: {
  mode: 'needs' | 'neededBy';
  panel: PanelData;
  onCancel: () => void;
  onSave: (otherId: string, kind: 'indispensable' | 'recommended', confirmed: boolean) => void;
}) {
  const ids = useId();
  const candidates = mode === 'needs' ? panel.requirementCandidates : panel.dependentCandidates;
  const [otherId, setOtherId] = useState(candidates[0]?.objectiveId ?? '');
  const [kind, setKind] = useState<'indispensable' | 'recommended'>('indispensable');
  const [confirmed, setConfirmed] = useState(true);
  const text = texts.progress.panel;
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        if (otherId !== '') {
          onSave(otherId, kind, confirmed);
        }
      }}
    >
      <h3>{mode === 'needs' ? text.missedSomething : text.markAsRequirement}</h3>
      {candidates.length === 0 ? (
        <p className={styles.note}>{text.noCandidates}</p>
      ) : (
        <>
          <div className={styles.field}>
            <label htmlFor={`${ids}-objetivo`}>{text.requirementObjective}</label>
            <select
              id={`${ids}-objetivo`}
              className={styles.input}
              value={otherId}
              onChange={(event) => setOtherId(event.target.value)}
            >
              {candidates.map((candidate) => (
                <option key={candidate.objectiveId} value={candidate.objectiveId}>
                  {candidate.title}
                </option>
              ))}
            </select>
          </div>
          <OptionGroup
            legend={text.requirementKind}
            options={[
              { value: 'indispensable' as const, text: text.indispensable },
              { value: 'recommended' as const, text: text.recommended },
            ]}
            value={kind}
            onChange={setKind}
          />
          <div className={styles.field}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={confirmed}
                aria-describedby={`${ids}-confirmar-ayuda`}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {text.requirementConfirm}
            </label>
            <p id={`${ids}-confirmar-ayuda`} className={styles.help}>
              {text.requirementConfirmHelp}
            </p>
          </div>
        </>
      )}
      <div className={styles.actions}>
        <Boton variant="primary" type="submit" disabled={candidates.length === 0}>
          {text.save}
        </Boton>
        <Boton variant="quiet" onClick={onCancel}>
          {text.cancel}
        </Boton>
      </div>
    </form>
  );
}
