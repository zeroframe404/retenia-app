import { type RefObject, useEffect, useId, useState } from 'react';
import { demoTexts } from '../../../preload/contract/demo-texts';
import ui from '../../ui.module.css';
import { Block, Elapsed, type Models, ModelsState } from './common';
import styles from './lab.module.css';

const t = demoTexts.lab;

// «Voz»: bajar los modelos una vez (CA-024) y decir una frase en inglés con una de las cuatro
// voces (CA-025). El audio queda para volver a escucharlo.
export function VoiceBlock({
  models,
  player,
}: {
  models: Models;
  player: RefObject<HTMLAudioElement | null>;
}) {
  const group = useId();
  const [phrase, setPhrase] = useState('');
  const [voice, setVoice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [spoken, setSpoken] = useState<{ url: string; ms: number } | null>(null);

  // Cada audio nuevo libera el anterior.
  useEffect(
    () => () => {
      if (spoken) {
        URL.revokeObjectURL(spoken.url);
      }
    },
    [spoken],
  );

  async function speak() {
    const text = phrase.trim();
    if (text === '') {
      setProblem(t.voice.emptyPhrase);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const answer = await window.retenia['demo.lab.speak']({ text, voice });
      if (answer.ok) {
        const url = URL.createObjectURL(new Blob([answer.audio.slice()], { type: 'audio/wav' }));
        setSpoken({ url, ms: answer.ms });
      } else {
        setProblem(answer.problem === 'noModels' ? t.voice.missing : t.voice.failed);
      }
    } catch {
      setProblem(t.voice.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Block title={t.voice.title}>
      <ModelsState models={models} />
      <label className={styles.label}>
        {t.voice.phrase}
        <input
          className={styles.input}
          type="text"
          lang="en"
          maxLength={500}
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
        />
      </label>
      <fieldset className={styles.voices}>
        <legend>{t.voice.voices}</legend>
        {t.voice.voiceNames.map((name, index) => (
          <label key={name}>
            <input
              type="radio"
              name={group}
              checked={voice === index}
              onChange={() => setVoice(index)}
            />
            {name}
          </label>
        ))}
      </fieldset>
      <div className={ui.actions}>
        <button type="button" className={ui.primary} disabled={busy} onClick={() => void speak()}>
          {t.voice.speak}
        </button>
      </div>
      {busy ? <p className={styles.status}>{t.voice.speaking}</p> : null}
      {problem ? <p className={styles.message}>{problem}</p> : null}
      {spoken && !busy ? (
        <>
          <Elapsed ms={spoken.ms} />
          {/* biome-ignore lint/a11y/useMediaCaption: es la voz leyendo la frase que se ve arriba. */}
          <audio
            ref={player}
            className={styles.audio}
            controls
            autoPlay
            src={spoken.url}
            aria-label={t.voice.player}
          />
        </>
      ) : null}
    </Block>
  );
}
