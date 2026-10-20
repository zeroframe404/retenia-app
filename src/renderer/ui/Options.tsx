import { useId } from 'react';
import styles from './Options.module.css';

export interface Option<T extends string> {
  value: T;
  text: string;
}

// Un grupo de opciones excluyentes con aspecto de botones pegados: «Claro / Oscuro / Según el
// sistema», «Adivinando / Creo que sí / Seguro», «Fácil / Justo / Difícil». Son botones de opción
// de verdad (el teclado se mueve con las flechas), con el nombre del grupo como leyenda. Con
// `value` en null no hay ninguna elegida. Cada opción elegida se avisa en el acto.
export function OptionGroup<T extends string>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  name,
}: {
  legend: string;
  // La leyenda sigue ahí para el lector de pantalla cuando el título de al lado ya la dice.
  hideLegend?: boolean;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  name?: string;
}) {
  const generated = useId();
  const group = name ?? generated;
  return (
    <fieldset className={styles.group}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              className={styles.radio}
              name={group}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.text}>{option.text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
