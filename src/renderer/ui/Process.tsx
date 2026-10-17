import { Check, Circle, CircleDot, Clock, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { texts } from '../../preload/contract/texts';
import { Icon } from './Icon';
import styles from './Process.module.css';

type StageStatus = 'done' | 'current' | 'pending';

export interface Stage {
  text: string;
  status: StageStatus;
}

const STAGE_STATES: Record<StageStatus, { word: string; icon: typeof Check }> = {
  done: { word: texts.ui.stages.done, icon: Check },
  current: { word: texts.ui.stages.current, icon: CircleDot },
  pending: { word: texts.ui.stages.pending, icon: Circle },
};

// Las etapas de procesar un material: «Archivo guardado» · «Texto extraído (11 de 12 páginas)» ·
// «Secciones detectadas» · «Listo». Nunca un indicador que gira sin fin: cada etapa dice si está
// hecha, en curso o pendiente con palabra e ícono. La hecha va con trazo lleno; la pendiente,
// punteado.
export function EtapasProcesamiento({ stages }: { stages: readonly Stage[] }) {
  return (
    <ol
      className={styles.stages}
      aria-label={texts.ui.stages.label}
      data-component="processing-stages"
    >
      {stages.map((stage) => {
        const { word, icon } = STAGE_STATES[stage.status];
        return (
          <li
            key={stage.text}
            className={styles.stage}
            data-stage={stage.status}
            data-stroke={stage.status === 'done' ? 'solid' : 'dashed'}
            aria-current={stage.status === 'current' ? 'step' : undefined}
          >
            <Icon icon={icon} />
            <span className={styles.stageText}>{stage.text}</span>
            <span className={styles.word}>{word}</span>
          </li>
        );
      })}
    </ol>
  );
}

export type BannerTone = 'info' | 'pending' | 'attention';

const BANNER_ICONS = { info: Info, pending: Clock, attention: TriangleAlert } as const;

// Un aviso de estado de todo el programa o de una vista. «Atención» es solo para fallas del sistema
// que piden una decisión tuya (y se anuncia enseguida); «pendiente» es lo que espera, como algo
// que se reanuda cuando vuelve la conexión, con trazo punteado.
export function BannerEstado({
  tone,
  action,
  children,
}: {
  tone: BannerTone;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={styles.banner}
      role={tone === 'attention' ? 'alert' : 'status'}
      data-component="status-banner"
      data-tone={tone}
      data-stroke={tone === 'pending' ? 'dashed' : 'solid'}
    >
      <Icon icon={BANNER_ICONS[tone]} />
      <p className={styles.message}>{children}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
