import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import styles from './Boton.module.css';
import { Icon } from './Icon';

// Cada pantalla tiene exactamente un botón primario (de color cobalto); los demás son secundarios
// (con borde) o discretos (solo texto). El rol se marca en `data-button`, que es lo que miran el
// estilo y las pruebas.
type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface BotonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  // Mientras trabaja: el lector de pantalla lo anuncia ocupado.
  busy?: boolean;
}

export function Boton({
  variant = 'secondary',
  icon,
  busy,
  type = 'button',
  children,
  ...rest
}: BotonProps) {
  return (
    <button
      type={type}
      className={styles.button}
      data-button={variant}
      aria-busy={busy ? true : undefined}
      {...rest}
    >
      {icon ? <Icon icon={icon} /> : null}
      <span>{children}</span>
    </button>
  );
}

// Un botón que solo muestra un ícono: la etiqueta accesible es obligatoria (un ícono con
// significado nunca va solo) y también sale como ayuda al apoyar el mouse.
export function IconButton({
  icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      data-button="quiet"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon icon={icon} />
    </button>
  );
}
