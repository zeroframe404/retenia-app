import { useEffect, useState } from 'react';
import type { ThemeChoice } from '../../preload/contract/appearance';
import { texts } from '../../preload/contract/texts';
import { applyTheme } from '../appearance';
import { ScreenFrame } from '../ui/Frame';
import { OptionGroup } from '../ui/Options';
import { BannerEstado } from '../ui/Process';

// Ajustes › «Apariencia»: «Claro», «Oscuro» y «Según el sistema». Al elegir, toda la ventana
// cambia en el acto y la elección se guarda para la próxima vez que se abra.
export function AppearanceSection() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let active = true;
    window.retenia['appearance.get']({})
      .then((saved) => {
        if (active) {
          setChoice(saved.choice);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function choose(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
    setSaveFailed(false);
    try {
      await window.retenia['appearance.set']({ choice: next });
    } catch {
      setSaveFailed(true);
    }
  }

  return (
    <ScreenFrame level={3} title={texts.appearance.title}>
      <OptionGroup<ThemeChoice>
        legend={texts.appearance.legend}
        hideLegend
        value={choice}
        onChange={(next) => void choose(next)}
        options={[
          { value: 'light', text: texts.appearance.light },
          { value: 'dark', text: texts.appearance.dark },
          { value: 'system', text: texts.appearance.system },
        ]}
      />
      {saveFailed ? (
        <BannerEstado tone="attention">{texts.appearance.saveFailed}</BannerEstado>
      ) : null}
    </ScreenFrame>
  );
}
