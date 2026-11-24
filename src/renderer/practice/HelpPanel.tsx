import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog, SidePanel } from '../ui/Frame';
import styles from './Practice.module.css';
import type { HelpController } from './useHelp';

// El panel de la derecha de una actividad: las pistas que ya viste (en orden, con su nombre), el
// ejemplo, la fuente, la solución o la explicación. No es modal: lo que escribiste queda a la vista
// y no se borra (CA-138).
export function HelpPanel({
  help,
  onOpenOriginal,
}: {
  help: HelpController;
  onOpenOriginal?: ((materialId: string) => void) | undefined;
}) {
  const { panel } = help;
  if (panel === null) {
    return null;
  }
  const titles = texts.practice.panel;
  const title =
    panel.kind === 'hints'
      ? titles.hints
      : panel.kind === 'example'
        ? titles.example
        : panel.kind === 'source'
          ? titles.source
          : panel.kind === 'solution'
            ? titles.solution
            : titles.explanation;
  return (
    <SidePanel title={title} onClose={help.closePanel}>
      <div className={styles.panelBody} data-panel={panel.kind}>
        {panel.kind === 'hints' ? (
          <ol className={styles.hints}>
            {panel.hints.map((hint) => (
              <li key={hint.index} className={styles.hint}>
                <span className={styles.hintName}>
                  {texts.practice.hintNames[hint.index] ?? texts.practice.panel.hints}
                </span>
                <span>{hint.text}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {panel.kind === 'example' ? <p>{panel.text}</p> : null}
        {panel.kind === 'source' ? (
          <>
            {panel.text === '' ? null : <p>{panel.text}</p>}
            {panel.cite ? (
              <>
                <blockquote className={styles.quote}>{panel.cite.quote}</blockquote>
                <p className={styles.reference}>{panel.cite.reference}</p>
                {onOpenOriginal ? (
                  <Boton
                    variant="quiet"
                    onClick={() => onOpenOriginal(panel.cite?.materialId ?? '')}
                  >
                    {texts.materials.viewOriginal}
                  </Boton>
                ) : null}
              </>
            ) : null}
            {panel.text === '' && !panel.cite ? <p>{texts.practice.panel.noSource}</p> : null}
          </>
        ) : null}
        {panel.kind === 'solution' ? <Solution solution={panel.solution} /> : null}
        {panel.kind === 'explanation' ? (
          <p>{panel.text === '' ? texts.practice.panel.noExplanation : panel.text}</p>
        ) : null}
      </div>
    </SidePanel>
  );
}

function Solution({
  solution,
}: {
  solution: Extract<NonNullable<HelpController['panel']>, { kind: 'solution' }>['solution'];
}) {
  if (solution.type === 'order') {
    return (
      <ol className={styles.solutionList}>
        {solution.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    );
  }
  if (solution.type === 'open') {
    return (
      <ul className={styles.solutionList}>
        {solution.units.map((unit) => (
          <li key={unit}>{unit}</li>
        ))}
      </ul>
    );
  }
  return <p>{solution.answer}</p>;
}

// Antes de la solución (CA-136): «La próxima pista muestra la respuesta completa. ¿Querés
// intentarlo una vez más?».
export function ConfirmSolution({ help }: { help: HelpController }) {
  if (!help.confirming) {
    return null;
  }
  return (
    <Dialog title={texts.practice.confirmTitle} onClose={help.cancelSolution}>
      <p>{texts.practice.confirmSolution}</p>
      <div className={styles.dialogActions}>
        <Boton variant="primary" onClick={help.cancelSolution}>
          {texts.practice.tryAgain}
        </Boton>
        <Boton onClick={help.confirmSolution}>{texts.practice.seeSolution}</Boton>
      </div>
    </Dialog>
  );
}
