import { useState } from 'react';
import type { MicroProposal } from '../../preload/contract/procedures';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { ScreenFrame } from '../ui/Frame';
import { MicroExerciseView, MicroProposalCard } from './MicroExercise';
import styles from './Practice.module.css';

// El cierre de un ejercicio suelto (Fase 18, CA-166): solo aparece cuando se repitió un error y
// hay un micro-ejercicio para proponer.
export function PracticeClosing({ onClose }: { onClose: () => void }) {
  const [micro, setMicro] = useState<MicroProposal | null>(null);
  if (micro !== null) {
    return <MicroExerciseView proposal={micro} onDone={onClose} />;
  }
  return (
    <ScreenFrame level={3} title={texts.practice.procedure.closingTitle}>
      <MicroProposalCard onStart={setMicro} />
      <div className={styles.actions}>
        <Boton variant="primary" onClick={onClose}>
          {texts.practice.backToCards}
        </Boton>
      </div>
    </ScreenFrame>
  );
}
