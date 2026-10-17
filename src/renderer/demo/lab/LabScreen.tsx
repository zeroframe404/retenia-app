import { useRef } from 'react';
import { demoTexts } from '../../../preload/contract/demo-texts';
import { Boton } from '../../ui/Boton';
import { ScreenFrame } from '../../ui/Frame';
import { useModels } from './common';
import styles from './lab.module.css';
import { NoticeBlock, PdfBlock, ScanBlock } from './ReadingBlocks';
import { TranscriptionBlock } from './TranscriptionBlock';
import { VoiceBlock } from './VoiceBlock';

// Ajustes › «Demostración» › «Laboratorio» (H-07, solo en «Retenia (prueba)»): las piezas
// delicadas de Retenia, cada una con su botón y cuánto tardó. Los cinco bloques valen lo mismo:
// ninguno de sus botones es el principal.
export function LabScreen({ onBack, focusTitle }: { onBack: () => void; focusTitle?: boolean }) {
  const models = useModels();
  // La frase de «Decir en voz alta»: se calla al tocar «Grabar», así no se graba encima.
  const player = useRef<HTMLAudioElement | null>(null);
  return (
    <ScreenFrame
      title={demoTexts.lab.title}
      focusTitle={focusTitle ?? false}
      actions={<Boton onClick={onBack}>{demoTexts.lab.back}</Boton>}
    >
      <p className={styles.intro}>{demoTexts.lab.intro}</p>
      <VoiceBlock models={models} player={player} />
      <TranscriptionBlock models={models} onRecord={() => player.current?.pause()} />
      <PdfBlock />
      <ScanBlock />
      <NoticeBlock />
    </ScreenFrame>
  );
}
