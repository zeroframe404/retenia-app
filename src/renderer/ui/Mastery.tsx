import { Check, Pencil, X } from 'lucide-react';
import { useId } from 'react';
import { texts } from '../../preload/contract/texts';
import { Boton } from './Boton';
import styles from './Mastery.module.css';

export type Mastery = 'not-started' | 'in-practice' | 'to-review' | 'enough' | 'consolidated';

// Los estados de dominio de un objetivo, en orden: son los cinco escalones de la escala.
const STEPS: readonly { state: Mastery; text: string }[] = [
  { state: 'not-started', text: texts.ui.mastery.notStarted },
  { state: 'in-practice', text: texts.ui.mastery.inPractice },
  { state: 'to-review', text: texts.ui.mastery.toReview },
  { state: 'enough', text: texts.ui.mastery.enough },
  { state: 'consolidated', text: texts.ui.mastery.consolidated },
];

// «Sin iniciar» → «En práctica» → «A revisar» → «Suficiente para avanzar» → «Consolidado», con la
// marca «(por verificar)» cuando el estado salió de una declaración tuya y no de evidencia: en ese
// caso la escala va con trazo punteado. Nunca la palabra «dominado».
export function EstadoDominio({ state, toVerify = false }: { state: Mastery; toVerify?: boolean }) {
  const position = STEPS.findIndex((step) => step.state === state) + 1;
  const text = STEPS[position - 1]?.text ?? '';
  return (
    <div
      className={styles.mastery}
      data-component="mastery-state"
      data-state={state}
      data-stroke={toVerify ? 'dashed' : 'solid'}
    >
      <span className={styles.name}>
        {text}
        {toVerify ? ` ${texts.ui.mastery.toVerify}` : ''}
      </span>
      <span className={styles.scale} aria-hidden="true">
        {STEPS.map((step, index) => (
          <span key={step.state} className={styles.step} data-filled={index < position} />
        ))}
      </span>
      <span className="visually-hidden">{texts.ui.mastery.step(position, STEPS.length)}</span>
    </div>
  );
}

// Una tarjeta que propone la IA: todavía no es tuya, por eso va con trazo punteado y la marca
// «Propuesta». Dice de qué objetivo sale y la cita que la respalda; vos la aceptás, la editás o la
// descartás.
export function PropuestaItem({
  text,
  goal,
  quote,
  onAccept,
  onEdit,
  onDiscard,
}: {
  text: string;
  goal?: string;
  quote?: string;
  onAccept?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
}) {
  const textId = useId();
  return (
    <article
      className={styles.proposal}
      data-component="proposal-item"
      data-stroke="dashed"
      aria-labelledby={textId}
    >
      <span className={styles.tag}>{texts.ui.proposalItem.tag}</span>
      <p id={textId} className={styles.text}>
        {text}
      </p>
      {goal ? <p className={styles.detail}>{goal}</p> : null}
      {quote ? <p className={styles.detail}>{quote}</p> : null}
      <div className={styles.actions}>
        <Boton icon={Check} onClick={onAccept}>
          {texts.ui.proposalItem.accept}
        </Boton>
        <Boton variant="quiet" icon={Pencil} onClick={onEdit}>
          {texts.ui.proposalItem.edit}
        </Boton>
        <Boton variant="quiet" icon={X} onClick={onDiscard}>
          {texts.ui.proposalItem.discard}
        </Boton>
      </div>
    </article>
  );
}
