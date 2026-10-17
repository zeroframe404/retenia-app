import { useCallback, useEffect, useState } from 'react';
import { texts } from '../preload/contract/texts';
import styles from './App.module.css';
import { applyTheme } from './appearance';
import { DemoRibbon } from './demo/DemoRibbon';
import { DemoSection } from './demo/DemoSection';
import { GalleryScreen } from './demo/gallery/GalleryScreen';
import { LabScreen } from './demo/lab/LabScreen';
import { EmptyDestination } from './screens/EmptyDestination';
import { NotesScreen } from './screens/NotesScreen';
import { SearchDialog } from './screens/SearchDialog';
import { SettingsScreen } from './settings/SettingsScreen';
import { DESTINATIONS, type Destination, SideRail } from './ui/Frame';

// Dentro de Ajustes (solo en la variante de prueba): el Laboratorio y la Galería cuelgan de
// «Demostración». Mientras uno está abierto, el riel sigue marcando «Ajustes».
type SettingsView = 'settings' | 'lab' | 'gallery';

// La ventana: el riel lateral a la izquierda y, a la derecha, la pantalla del destino elegido.
// Ctrl+1 a Ctrl+6 abren cada destino y Ctrl+K abre «Buscar».
export function App() {
  const [destination, setDestination] = useState<Destination>('study');
  const [settingsView, setSettingsView] = useState<SettingsView>('settings');
  const [searching, setSearching] = useState(false);
  // Al llegar a una pantalla por el riel o por un atajo, el foco pasa a su título; al abrir
  // Retenia, no.
  const [navigated, setNavigated] = useState(false);

  const go = useCallback((next: Destination) => {
    setDestination(next);
    setSettingsView('settings');
    setNavigated(true);
  }, []);

  // La apariencia elegida, desde el primer momento (el marco de la ventana ya arrancó con ella).
  useEffect(() => {
    window.retenia['appearance.get']({})
      .then(({ choice }) => applyTheme(choice))
      .catch((error: unknown) => {
        console.error('La ventana no pudo leer la apariencia por el puente', error);
      });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || searching) {
        return;
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearching(true);
        return;
      }
      const target = DESTINATIONS[Number(event.key) - 1];
      if (target && /^[1-9]$/.test(event.key)) {
        event.preventDefault();
        go(target.destination);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, searching]);

  const goToNotes = () => go('notes');
  const demo = __VARIANTE__ === 'prueba';

  return (
    <div className={styles.app}>
      {demo ? <DemoRibbon /> : null}
      <div className={styles.body}>
        <SideRail current={destination} onChange={go} onSearch={() => setSearching(true)} />
        <main className={styles.content} aria-label={texts.appName}>
          {destination === 'study' ? (
            <EmptyDestination
              title={texts.nav.study}
              phrase={texts.screens.study}
              focusTitle={navigated}
              onGoToNotes={goToNotes}
            />
          ) : null}
          {destination === 'notes' ? <NotesScreen focusTitle={navigated} /> : null}
          {destination === 'materials' ? (
            <EmptyDestination
              title={texts.nav.materials}
              phrase={texts.screens.materials}
              focusTitle={navigated}
              onGoToNotes={goToNotes}
            />
          ) : null}
          {destination === 'languages' ? (
            <EmptyDestination
              title={texts.nav.languages}
              phrase={texts.screens.languages}
              focusTitle={navigated}
              onGoToNotes={goToNotes}
            />
          ) : null}
          {destination === 'progress' ? (
            <EmptyDestination
              title={texts.nav.progress}
              phrase={texts.screens.progress}
              focusTitle={navigated}
              onGoToNotes={goToNotes}
            />
          ) : null}
          {destination === 'settings' && settingsView === 'settings' ? (
            <SettingsScreen
              focusTitle={navigated}
              demo={
                demo ? (
                  <DemoSection
                    onOpenLab={() => setSettingsView('lab')}
                    onOpenGallery={() => setSettingsView('gallery')}
                  />
                ) : null
              }
            />
          ) : null}
          {demo && destination === 'settings' && settingsView === 'lab' ? (
            <LabScreen focusTitle onBack={() => setSettingsView('settings')} />
          ) : null}
          {demo && destination === 'settings' && settingsView === 'gallery' ? (
            <GalleryScreen focusTitle onBack={() => setSettingsView('settings')} />
          ) : null}
        </main>
      </div>
      {searching ? <SearchDialog onClose={() => setSearching(false)} /> : null}
    </div>
  );
}
