import { BookOpen, Lightbulb, MessageCircle, Quote } from 'lucide-react';
import { useId } from 'react';
import { texts } from '../../preload/contract/texts';
import { Boton } from './Boton';
import { OptionGroup } from './Options';
import styles from './Session.module.css';

// Los componentes de la sesión de estudio: la propuesta de Estudiar, el compromiso semanal, la
// barra de ayuda, la confianza, la valoración y el cierre.

// La sesión que Estudiar recomienda: es una propuesta todavía sin aceptar, por eso va con el
// trazo punteado. «Empezar» es el botón primario de la pantalla.
export function PropuestaSesion({
  minutes,
  reason,
  headingLevel = 3,
  onStart,
  onShortVersion,
}: {
  minutes: number;
  reason: string;
  // El nivel del título según dónde se use: debajo de un título de nivel 2, un 3.
  headingLevel?: 3 | 4;
  onStart?: () => void;
  onShortVersion?: () => void;
}) {
  const titleId = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <section
      className={styles.card}
      data-stroke="dashed"
      data-component="session-proposal"
      aria-labelledby={titleId}
    >
      <Heading id={titleId} className={styles.title}>
        {texts.ui.proposal.title(minutes)}
      </Heading>
      <p className={styles.text}>{texts.ui.proposal.why(reason)}</p>
      <div className={styles.actions}>
        <Boton variant="primary" onClick={onStart}>
          {texts.ui.proposal.start}
        </Boton>
        <Boton onClick={onShortVersion}>{texts.ui.proposal.shortVersion}</Boton>
      </div>
    </section>
  );
}

// «Compromiso semanal: 2 de 3 días». Los días cumplidos son lo observado (círculo lleno); los que
// faltan, un círculo punteado. Sin contadores de días seguidos.
export function CompromisoSemanal({ done, goal }: { done: number; goal: number }) {
  const completed = Math.min(done, goal);
  return (
    <div className={styles.commitment} data-component="weekly-commitment">
      <p className={styles.strongText}>{texts.ui.commitment(completed, goal)}</p>
      <span className={styles.days} aria-hidden="true">
        {Array.from({ length: goal }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: son círculos idénticos, solo cambia su orden.
            key={index}
            className={styles.day}
            data-day={index < completed ? 'done' : 'pending'}
            data-stroke={index < completed ? 'solid' : 'dashed'}
          />
        ))}
      </span>
    </div>
  );
}

// «Pista» · «Ver un ejemplo» · «Fuente» · «Preguntar al tutor» y «No sé por dónde empezar». La
// pista puede estar deshabilitada hasta que haya algo escrito.
export function BarraAyuda({
  hintDisabled = false,
  onHint,
  onExample,
  onSource,
  onTutor,
  onNoIdea,
}: {
  hintDisabled?: boolean;
  onHint?: () => void;
  onExample?: () => void;
  onSource?: () => void;
  onTutor?: () => void;
  onNoIdea?: () => void;
}) {
  return (
    <fieldset className={styles.help} data-component="help-bar">
      <legend className="visually-hidden">{texts.ui.helpBar.label}</legend>
      <Boton icon={Lightbulb} disabled={hintDisabled} onClick={onHint}>
        {texts.ui.helpBar.hint}
      </Boton>
      <Boton icon={BookOpen} onClick={onExample}>
        {texts.ui.helpBar.example}
      </Boton>
      <Boton icon={Quote} onClick={onSource}>
        {texts.ui.helpBar.source}
      </Boton>
      <Boton icon={MessageCircle} onClick={onTutor}>
        {texts.ui.helpBar.tutor}
      </Boton>
      <Boton variant="quiet" onClick={onNoIdea}>
        {texts.ui.helpBar.noIdea}
      </Boton>
    </fieldset>
  );
}

export type Confidence = 'guessing' | 'probably' | 'sure';

// «¿Cuánta confianza tenés?» → «Adivinando» · «Creo que sí» · «Seguro». Nunca alimenta el dominio.
export function ConfianzaDeclarada({
  value,
  onChange,
}: {
  value: Confidence | null;
  onChange: (value: Confidence) => void;
}) {
  return (
    <OptionGroup<Confidence>
      legend={texts.ui.confidence.question}
      value={value}
      onChange={onChange}
      options={[
        { value: 'guessing', text: texts.ui.confidence.guessing },
        { value: 'probably', text: texts.ui.confidence.probably },
        { value: 'sure', text: texts.ui.confidence.sure },
      ]}
    />
  );
}

export type Rating = 'easy' | 'fair' | 'hard';

// «¿Cómo estuvo?» → «Fácil» · «Justo» · «Difícil». Un toque queda registrado; sin toque, nada.
export function ValoracionSesion({
  value,
  onChange,
}: {
  value: Rating | null;
  onChange: (value: Rating) => void;
}) {
  return (
    <OptionGroup<Rating>
      legend={texts.ui.rating.question}
      value={value}
      onChange={onChange}
      options={[
        { value: 'easy', text: texts.ui.rating.easy },
        { value: 'fair', text: texts.ui.rating.fair },
        { value: 'hard', text: texts.ui.rating.hard },
      ]}
    />
  );
}

// «Sesión terminada · 13 min»: las tarjetas por resultado, como máximo 2 dificultades, un solo
// próximo paso y la frase que aclara que completar la sesión no es dominar el tema.
export function CierreSesion({
  minutes,
  results,
  difficulties,
  nextStep,
  rating,
  headingLevel = 3,
  onRate,
  onFinish,
  onSaveDoubt,
  onAdjustPlan,
}: {
  minutes: number;
  results: readonly { label: string; count: number }[];
  difficulties: readonly string[];
  nextStep: string;
  rating: Rating | null;
  headingLevel?: 3 | 4;
  onRate: (value: Rating) => void;
  onFinish?: () => void;
  onSaveDoubt?: () => void;
  onAdjustPlan?: () => void;
}) {
  const titleId = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const Subheading = headingLevel === 3 ? 'h4' : 'h5';
  return (
    <section
      className={styles.card}
      data-stroke="solid"
      data-component="session-closing"
      aria-labelledby={titleId}
    >
      <Heading id={titleId} className={styles.title}>
        {texts.ui.closing.title(minutes)}
      </Heading>
      <ul className={styles.results} aria-label={texts.ui.closing.results}>
        {results.map((result) => (
          <li key={result.label} className={styles.result}>
            {texts.ui.closing.count(result.label, result.count)}
          </li>
        ))}
      </ul>
      {difficulties.length > 0 ? (
        <div>
          <Subheading className={styles.subtitle}>{texts.ui.closing.difficulties}</Subheading>
          <ul className={styles.list}>
            {difficulties.slice(0, 2).map((difficulty) => (
              <li key={difficulty}>{difficulty}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <Subheading className={styles.subtitle}>{texts.ui.closing.nextStep}</Subheading>
        <p className={styles.text}>{nextStep}</p>
      </div>
      <p className={styles.note}>{texts.ui.closing.note}</p>
      <ValoracionSesion value={rating} onChange={onRate} />
      <div className={styles.actions}>
        <Boton variant="primary" onClick={onFinish}>
          {texts.ui.closing.finish}
        </Boton>
        <Boton onClick={onSaveDoubt}>{texts.ui.closing.saveDoubt}</Boton>
        <Boton variant="quiet" onClick={onAdjustPlan}>
          {texts.ui.closing.adjustPlan}
        </Boton>
      </div>
    </section>
  );
}
