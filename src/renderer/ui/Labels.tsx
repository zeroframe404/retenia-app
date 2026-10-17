import { Check, CircleDashed } from 'lucide-react';
import { texts } from '../../preload/contract/texts';
import { Icon } from './Icon';
import styles from './Labels.module.css';

// Los rótulos chicos: de qué modo es la actividad, qué tan firme es un dato, si algo es de ejemplo
// y si lo escrito ya se guardó. Todos usan el trazo de la regla visual central: lleno para lo
// observado, punteado para lo estimado, lo provisional y lo que todavía no es de verdad
// (`data-stroke` = «solid» o «dashed»).

export type Mode = 'help' | 'autonomous' | 'evaluation';

const MODES: Record<Mode, string> = {
  help: texts.ui.modes.help,
  autonomous: texts.ui.modes.autonomous,
  evaluation: texts.ui.modes.evaluation,
};

// «PRÁCTICA CON AYUDA» · «PRÁCTICA AUTÓNOMA» · «EVALUACIÓN».
export function RotuloModo({ mode }: { mode: Mode }) {
  return (
    <span className={styles.label} data-label="mode" data-mode={mode} data-stroke="solid">
      {MODES[mode]}
    </span>
  );
}

export type DataKind = 'observed' | 'estimated' | 'insufficient';

const DATA_LABELS: Record<DataKind, string> = {
  observed: texts.ui.dataLabels.observed,
  estimated: texts.ui.dataLabels.estimated,
  insufficient: texts.ui.dataLabels.insufficient,
};

// «Observado» es lo que pasó de verdad (trazo lleno); «Estimado» es lo que el programa calcula y
// «Datos insuficientes» (menos de 10 datos) no muestra porcentaje: los dos con trazo punteado.
export function RotuloDato({ kind, count }: { kind: DataKind; count?: number }) {
  const label = DATA_LABELS[kind];
  return (
    <span
      className={styles.label}
      data-label="data"
      data-kind={kind}
      data-stroke={kind === 'observed' ? 'solid' : 'dashed'}
    >
      {count === undefined ? label : texts.ui.dataWithCount(label, count)}
    </span>
  );
}

// La materia de ejemplo y todo lo que carga: no suma progreso, por eso va punteada.
export function EtiquetaEjemplo() {
  return (
    <span className={styles.label} data-label="example" data-stroke="dashed">
      {texts.ui.example}
    </span>
  );
}

export type DraftState = 'saving' | 'draft' | 'saved';

const DRAFT_LABELS: Record<DraftState, string> = {
  saving: texts.ui.draft.saving,
  draft: texts.ui.draft.draftSaved,
  saved: texts.ui.draft.saved,
};

// «Borrador guardado» (lo que escribís y todavía no enviaste), «Guardado» (el apunte) o
// «Guardando…» mientras tanto. El lector de pantalla lo anuncia sin interrumpir.
export function IndicadorBorrador({ state }: { state: DraftState }) {
  return (
    <span className={styles.draft} role="status" data-draft={state}>
      <Icon icon={state === 'saving' ? CircleDashed : Check} />
      {DRAFT_LABELS[state]}
    </span>
  );
}
