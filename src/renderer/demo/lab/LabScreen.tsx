import { useRef } from 'react';
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
  // La frase de «Decir en voz alta»: se calla al tocar «Grabar», así no se graba encima.
  const player = useRef<HTMLAudioElement | null>(null);
  return (
    <section className={ui.screen} aria-labelledby="titulo-laboratorio">
      <div className={ui.header}>
        <h2 id="titulo-laboratorio">{demoTexts.lab.title}</h2>
        <button type="button" className={ui.secondary} onClick={onBack}>
          {demoTexts.lab.back}
        </button>
      </div>
      <p className={styles.intro}>{demoTexts.lab.intro}</p>
      <VoiceBlock models={models} player={player} />
      <TranscriptionBlock models={models} onRecord={() => player.current?.pause()} />
      <PdfBlock />
      <ScanBlock />
      <NoticeBlock />
    </section>
  );
}
