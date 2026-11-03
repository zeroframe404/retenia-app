import type { Subject } from '../../preload/contract/organization';
import { texts } from '../../preload/contract/texts';
import { Boton } from '../ui/Boton';
import { EtiquetaEjemplo } from '../ui/Labels';
import styles from './Subjects.module.css';

// En Estudiar: la materia activa, con su nombre y «Cambiar». Sin materia activa lo dice.
export function ActiveSubject({
  active,
  onChange,
}: {
  active: Subject | null;
  onChange: () => void;
}) {
  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        {active ? (
          <>
            <p className={styles.caption}>{texts.subjects.activeLabel}</p>
            <div className={styles.nameRow}>
              <span className={styles.name} title={active.name}>
                {active.name}
              </span>
              {active.isExample ? <EtiquetaEjemplo /> : null}
            </div>
          </>
        ) : (
          <p className={styles.line}>{texts.subjects.noActive}</p>
        )}
      </div>
      <Boton onClick={onChange}>{texts.subjects.change}</Boton>
    </div>
  );
}

// Arriba de Apuntes, siempre: qué materia estás mirando y cuál es la activa (mirar otra para
// consultarla no la activa).
export function ViewedSubject({
  viewed,
  active,
  onChange,
}: {
  viewed: Subject;
  active: Subject | null;
  onChange: () => void;
}) {
  const same = active?.id === viewed.id;
  const viewing = same
    ? texts.subjects.viewingActive(viewed.name)
    : texts.subjects.viewing(viewed.name);
  const activeLine = active ? texts.subjects.active(active.name) : texts.subjects.noActive;
  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        <div className={styles.nameRow}>
          <p className={styles.line} title={viewing}>
            {viewing}
          </p>
          {viewed.isExample ? <EtiquetaEjemplo /> : null}
        </div>
        {same ? null : (
          <p className={styles.line} title={activeLine}>
            {activeLine}
          </p>
        )}
      </div>
      <Boton onClick={onChange}>{texts.subjects.change}</Boton>
    </div>
  );
}
