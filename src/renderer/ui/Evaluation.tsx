import { CircleAlert, CircleCheck, CircleDashed, CircleDot, Minus } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { texts } from '../../preload/contract/texts';
import { Boton } from './Boton';
import styles from './Evaluation.module.css';
import { Icon } from './Icon';

type UnitStatus = 'covered' | 'partial' | 'missing';

export interface IdeaUnit {
  text: string;
  status: UnitStatus;
  // La frase de la respuesta que la respalda, si la hay.
  quote?: string;
}

const UNIT_LABELS: Record<UnitStatus, string> = {
  covered: texts.ui.ideaUnits.covered,
  partial: texts.ui.ideaUnits.partial,
  missing: texts.ui.ideaUnits.missing,
};

const UNIT_ICONS = { covered: CircleCheck, partial: Minus, missing: CircleDashed } as const;

// Las unidades de idea de la respuesta modelo: cuáles cubriste, cuáles a medias y cuáles faltan,
// cada una con la frase tuya que la respalda. Lo que falta va con trazo punteado: no hay nada
// observado ahí. El estado se dice con palabra e ícono, no solo con color.
export function UnidadesDeIdea({
  units,
  headingLevel = 3,
  hideHeading = false,
}: {
  units: readonly IdeaUnit[];
  headingLevel?: 3 | 4;
  // El título sigue ahí para el lector de pantalla cuando el de al lado ya dice lo mismo.
  hideHeading?: boolean;
}) {
  const titleId = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <section aria-labelledby={titleId} data-component="idea-units">
      <Heading id={titleId} className={hideHeading ? 'visually-hidden' : styles.title}>
        {texts.ui.ideaUnits.label}
      </Heading>
      <ol className={styles.units}>
        {units.map((unit) => (
          <li
            key={unit.text}
            className={styles.unit}
            data-unit={unit.status}
            data-stroke={unit.status === 'missing' ? 'dashed' : 'solid'}
          >
            <span className={styles.status}>
              <Icon icon={UNIT_ICONS[unit.status]} />
              {UNIT_LABELS[unit.status]}
            </span>
            <span className={styles.unitText}>{unit.text}</span>
            {unit.quote ? (
              <span className={styles.quote}>{texts.ui.ideaUnits.quoted(unit.quote)}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export type Verdict = 'correct' | 'on-track' | 'not-yet' | 'unsure';

const VERDICTS: Record<
  Verdict,
  { text: string; icon: typeof CircleCheck; tone: 'correct' | 'partial' | 'neutral' | 'attention' }
> = {
  correct: { text: texts.ui.verdicts.correct, icon: CircleCheck, tone: 'correct' },
  'on-track': { text: texts.ui.verdicts.onTrack, icon: CircleDot, tone: 'partial' },
  // «Todavía no.» nunca va en rojo: tinta neutra, palabra e ícono.
  'not-yet': { text: texts.ui.verdicts.notYet, icon: CircleDashed, tone: 'neutral' },
  // Una falla del evaluador que pide una decisión tuya: el único caso de «atención».
  unsure: { text: texts.ui.verdicts.unsure, icon: CircleAlert, tone: 'attention' },
};

// El resultado, siempre en tres líneas: el veredicto, qué revisar y una sola acción siguiente.
// Una nota «Provisional» (la corrección de la IA hasta que se resuelve) lleva trazo punteado.
export function Resultado({
  verdict,
  review,
  action,
  provisional = false,
}: {
  verdict: Verdict;
  review: string;
  action?: ReactNode;
  provisional?: boolean;
}) {
  const { text, icon, tone } = VERDICTS[verdict];
  return (
    <section
      className={styles.result}
      role="status"
      data-component="result"
      data-verdict={verdict}
      data-tone={tone}
      data-stroke={provisional ? 'dashed' : 'solid'}
    >
      <p className={styles.verdict}>
        <Icon icon={icon} />
        {text}
      </p>
      <p className={styles.review}>{review}</p>
      {provisional ? <p className={styles.provisional}>{texts.ui.provisional}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}

// «Todavía no → Correcto»: la evaluación cambió después de una corrección. Dice qué cambia en el
// próximo repaso y deja «Entendido» o «Deshacer».
export function AvisoEvaluacionCorregida({
  before,
  after,
  effect,
  onUnderstood,
  onUndo,
}: {
  before: string;
  after: string;
  effect: string;
  onUnderstood?: () => void;
  onUndo?: () => void;
}) {
  return (
    <section className={styles.notice} role="status" data-component="corrected-evaluation">
      <p className={styles.change}>{texts.ui.correctedNotice.change(before, after)}</p>
      <p className={styles.review}>{effect}</p>
      <div className={styles.actions}>
        <Boton onClick={onUnderstood}>{texts.ui.correctedNotice.understood}</Boton>
        <Boton variant="quiet" onClick={onUndo}>
          {texts.ui.correctedNotice.undo}
        </Boton>
      </div>
    </section>
  );
}
