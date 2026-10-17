import { demoTexts } from '../../../preload/contract/demo-texts';
import ui from '../../ui.module.css';
import { useModels } from './common';
import styles from './lab.module.css';
import { NoticeBlock, PdfBlock, ScanBlock } from './ReadingBlocks';
import { TranscriptionBlock } from './TranscriptionBlock';
import { VoiceBlock } from './VoiceBlock';

// Ajustes › «Demostración» › «Laboratorio» (H-07, solo en «Retenia (prueba)»): las piezas
// delicadas de Retenia, cada una con su botón y cuánto tardó.
export function LabScreen({ onBack }: { onBack: () => void }) {
  const models = useModels();
  return (
    <section className={ui.screen} aria-labelledby="titulo-laboratorio">
      <div className={ui.header}>
        <h2 id="titulo-laboratorio">{demoTexts.lab.title}</h2>
        <button type="button" className={ui.secondary} onClick={onBack}>
          {demoTexts.lab.back}
        </button>
      </div>
      <p className={styles.intro}>{demoTexts.lab.intro}</p>
      <VoiceBlock models={models} />
      <TranscriptionBlock models={models} />
      <PdfBlock />
      <ScanBlock />
      <NoticeBlock />
    </section>
  );
}
