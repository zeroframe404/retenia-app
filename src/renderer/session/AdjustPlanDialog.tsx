import { useRef, useState } from 'react';
import type { PlanOption } from '../../preload/contract/study';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './Session.module.css';

// «Ajustar el plan» en el cierre: «Más corto la próxima vez», «Más práctica de este tema» y
// «Pausar este tema». Por ahora se anota como preferencia y el cartel lo dice: se va a usar cuando
// Estudiar arme la propuesta por minutos (Fase 11). Sin un tema en la sesión, solo la primera.
export function AdjustPlanDialog({
  sessionId,
  topic,
  onClose,
  onSaved,
}: {
  sessionId: string;
  topic: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  async function choose(option: PlanOption) {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setProblem('');
    try {
      await window.retenia['study.adjustPlan']({ sessionId, option });
      onSaved();
    } catch {
      setProblem(texts.study.adjust.failed);
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog title={texts.study.adjust.title} onClose={onClose}>
      <div className={styles.options}>
        <Boton disabled={saving} onClick={() => void choose('shorter')}>
          {texts.study.adjust.shorter}
        </Boton>
        {topic === null ? null : (
          <>
            <Boton disabled={saving} onClick={() => void choose('morePractice')}>
              {texts.study.adjust.morePractice}
            </Boton>
            <Boton disabled={saving} onClick={() => void choose('pauseTopic')}>
              {texts.study.adjust.pauseTopic}
            </Boton>
          </>
        )}
      </div>
      {problem === '' ? null : <BannerEstado tone="attention">{problem}</BannerEstado>}
      <div className={styles.dialogActions}>
        <Boton variant="quiet" onClick={onClose}>
          {texts.study.adjust.cancel}
        </Boton>
      </div>
    </Dialog>
  );
}
