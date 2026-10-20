import {
  CircleCheck,
  CircleDashed,
  Inbox,
  LockKeyhole,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import { Boton } from './Boton';
import { Icon } from './Icon';
import styles from './ViewStates.module.css';

// Los seis estados de toda vista: sin datos, cargando, con una falla, terminó bien, falta un permiso
// y sin conexión. Cada uno es una frase en castellano y una acción.
export type ViewStateKind = 'empty' | 'loading' | 'error' | 'success' | 'no-permission' | 'offline';

const STATES = {
  empty: { icon: Inbox, role: undefined, dashed: true },
  loading: { icon: CircleDashed, role: 'status', dashed: true },
  error: { icon: TriangleAlert, role: 'alert', dashed: false },
  success: { icon: CircleCheck, role: 'status', dashed: false },
  'no-permission': { icon: LockKeyhole, role: undefined, dashed: false },
  offline: { icon: WifiOff, role: 'status', dashed: true },
} as const;

export interface StateAction {
  text: string;
  onClick: () => void;
  // La acción principal de la pantalla (la única de color cobalto).
  primary?: boolean;
}

// La acción es opcional solo para quien muestra un estado que no pide nada; los seis de la
// «Galería» la llevan siempre.
export function ViewState({
  kind,
  phrase,
  action,
}: {
  kind: ViewStateKind;
  phrase: string;
  action?: StateAction | undefined;
}) {
  const { icon, role, dashed } = STATES[kind];
  return (
    <div
      className={styles.state}
      role={role}
      aria-busy={kind === 'loading' ? true : undefined}
      data-component="view-state"
      data-state={kind}
      data-stroke={dashed ? 'dashed' : 'solid'}
    >
      <span className={styles.icon}>
        <Icon icon={icon} />
      </span>
      <p className={styles.phrase}>{phrase}</p>
      {action ? (
        <Boton variant={action.primary ? 'primary' : 'secondary'} onClick={action.onClick}>
          {action.text}
        </Boton>
      ) : null}
    </div>
  );
}
