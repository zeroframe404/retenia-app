import { useId, useState } from 'react';
import type { MaterialSelection } from '../../preload/contract/materials';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import form from '../ui/Form.module.css';
import { Dialog } from '../ui/Frame';
import { BannerEstado } from '../ui/Process';
import styles from './Materials.module.css';

// «Crear tarjeta desde acá» (H-26, CA-110): la frase elegida va como cita (sin editar) y también
// empieza como respuesta; vos escribís la pregunta. La tarjeta guarda de dónde salió: el material,
// su versión, la página y la frase.
export function CreateCardFromQuote({
  materialId,
  selection,
  reference,
  quote,
  onClose,
  onSaved,
}: {
  materialId: string;
  selection: MaterialSelection;
  reference: string;
  quote: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ids = useId();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(quote);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function save() {
    if (busy) {
      return;
    }
    if (question.trim() === '') {
      setProblem(texts.cards.questionRequired);
      return;
    }
    if (answer.trim() === '') {
      setProblem(texts.cards.answerRequired);
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      await window.retenia['materials.createCard']({ materialId, selection, question, answer });
      onSaved();
    } catch {
      setProblem(texts.cards.saveFailed);
      setBusy(false);
    }
  }

  return (
    <Dialog title={texts.materials.createCard} placement="side" onClose={onClose}>
      <div className={styles.addForm}>
        <figure className={styles.cite}>
          <figcaption className={styles.citeReference}>{reference}</figcaption>
          <blockquote className={styles.citeQuote}>{quote}</blockquote>
        </figure>
        <div className={form.field}>
          <label htmlFor={`${ids}-pregunta`}>{texts.materials.question}</label>
          <textarea
            id={`${ids}-pregunta`}
            rows={3}
            value={question}
            autoFocus
            onChange={(event) => setQuestion(event.target.value)}
          />
        </div>
        <div className={form.field}>
          <label htmlFor={`${ids}-respuesta`}>{texts.materials.answer}</label>
          <textarea
            id={`${ids}-respuesta`}
            rows={4}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </div>
        {problem === '' ? null : <BannerEstado tone="info">{problem}</BannerEstado>}
        <div className={styles.actions}>
          <Boton variant="primary" busy={busy} onClick={() => void save()}>
            {texts.materials.save}
          </Boton>
        </div>
      </div>
    </Dialog>
  );
}
