import { useCallback, useEffect, useRef, useState } from 'react';
import type { Subject } from '../preload/contract/organization';
import { texts } from '../preload/contract/texts';
import styles from './App.module.css';
import { applyTheme } from './appearance';
import { DemoRibbon } from './demo/DemoRibbon';
import { DemoSection } from './demo/DemoSection';
import { GalleryScreen } from './demo/gallery/GalleryScreen';
import { LabScreen } from './demo/lab/LabScreen';
import { FirstTimeScreen } from './firstTime/FirstTimeScreen';
import { CaptureDialog } from './inbox/CaptureDialog';
import { trackInputMode } from './inputMode';
import { EmptyDestination } from './screens/EmptyDestination';
import { NotesScreen, type NotesSectionName } from './screens/NotesScreen';
import { SearchDialog } from './screens/SearchDialog';
import { SettingsScreen } from './settings/SettingsScreen';
import { isQuickCapture, zoomDirection } from './shortcuts';
import { ActiveSubject } from './subjects/SubjectBar';
import { SubjectsDialog } from './subjects/SubjectsDialog';
import { DESTINATIONS, type Destination, SideRail, Toast } from './ui/Frame';
import { ViewState } from './ui/ViewStates';

// Dentro de Ajustes (solo en la variante de prueba): el Laboratorio y la Galería cuelgan de
// «Demostración». Mientras uno está abierto, el riel sigue marcando «Ajustes».
type SettingsView = 'settings' | 'lab' | 'gallery';

// Cuánto dura el cartel de la ventana («Anotado en la Bandeja.»).
const TOAST_MS = 5000;

// La ventana. Cambiar con qué datos está abierta la demostración la arma de nuevo: toda ella vuelve a
// pedir sus datos.
export function App() {
  const [session, setSession] = useState(0);
  return <Shell key={session} onDataReset={() => setSession((current) => current + 1)} />;
}

// El riel lateral a la izquierda y, a la derecha, la pantalla del destino elegido. Ctrl+1 a Ctrl+6
// abren cada destino, Ctrl+K abre «Buscar» y Ctrl+Mayús+N anota al vuelo. Sin ninguna materia es
// la primera vez: una sola pregunta, sin riel.
function Shell({ onDataReset }: { onDataReset: () => void }) {
  const [destination, setDestination] = useState<Destination>('study');
  const [settingsView, setSettingsView] = useState<SettingsView>('settings');
  const [notesSection, setNotesSection] = useState<NotesSectionName>('notes');
  const [searching, setSearching] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [changingSubject, setChangingSubject] = useState(false);
  // Al llegar a una pantalla por el riel o por un atajo, el foco pasa a su título; al abrir
  // Retenia, no.
  const [navigated, setNavigated] = useState(false);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [subjectsFailed, setSubjectsFailed] = useState(false);
  // La materia que se mira en Apuntes. No se guarda: al abrir Retenia se mira la activa, y mirar
  // otra para consultarla no la activa.
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [toast, setToast] = useState('');
  const content = useRef<HTMLElement>(null);
  const subjectsLoaded = useRef(false);

  const go = useCallback((next: Destination) => {
    setDestination(next);
    setSettingsView('settings');
    if (next === 'notes') {
      setNotesSection('notes');
    }
    setNavigated(true);
  }, []);

  const openInbox = useCallback(() => {
    setDestination('notes');
    setSettingsView('settings');
    setNotesSection('inbox');
    setNavigated(true);
  }, []);

  const loadSubjects = useCallback(async () => {
    try {
      setSubjects((await window.retenia['subjects.list']({})).subjects);
      subjectsLoaded.current = true;
      setSubjectsFailed(false);
    } catch {
      if (!subjectsLoaded.current) {
        setSubjectsFailed(true);
      }
    }
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      setInboxCount((await window.retenia['inbox.list']({})).count);
    } catch (error: unknown) {
      console.error('La ventana no pudo leer la Bandeja por el puente', error);
    }
  }, []);

  // Algo cambió lo que muestran el riel y Estudiar (deshacer una activación, restaurar de la
  // Papelera): se vuelve a leer.
  const reloadShared = useCallback(() => {
    void loadSubjects();
    void loadInbox();
  }, [loadSubjects, loadInbox]);

  useEffect(() => {
    void loadSubjects();
    void loadInbox();
  }, [loadSubjects, loadInbox]);

  // La apariencia elegida, desde el primer momento (el marco de la ventana ya arrancó con ella).
  useEffect(() => {
    window.retenia['appearance.get']({})
      .then(({ choice }) => applyTheme(choice))
      .catch((error: unknown) => {
        console.error('La ventana no pudo leer la apariencia por el puente', error);
      });
  }, []);

  // El contorno del foco se ve siempre que lo último que se usó fue el teclado.
  useEffect(() => trackInputMode(), []);

  // El cartel de la ventana se va solo.
  useEffect(() => {
    if (toast === '') {
      return;
    }
    const timer = setTimeout(() => setToast(''), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Cada pantalla arranca desde arriba, aunque la anterior estuviera desplazada.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se vuelve arriba cuando cambia la pantalla.
  useEffect(() => {
    if (content.current) {
      content.current.scrollTop = 0;
    }
  }, [destination, settingsView]);

  const firstTime = subjects !== null && subjects.length === 0;
  const firstTimeRef = useRef(firstTime);
  firstTimeRef.current = firstTime;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      // El zoom: Retenia no tiene menú, así que las teclas las atrapa la ventana y el principal
      // cambia el zoom (con el cuadro «Buscar» abierto también anda).
      const direction = zoomDirection(event.key);
      if (direction !== null) {
        event.preventDefault();
        window.retenia['window.zoom']({ direction }).catch((error: unknown) => {
          console.error('La ventana no pudo cambiar el zoom por el puente', error);
        });
        return;
      }
      // En la primera vez hay una sola pregunta: no hay destinos que abrir.
      if (firstTimeRef.current) {
        return;
      }
      const modalOpen = document.querySelector('[aria-modal="true"]') !== null;
      // Anotar al vuelo, desde cualquier pantalla; con otro cuadro abierto no se abre uno más.
      if (isQuickCapture(event)) {
        event.preventDefault();
        if (!modalOpen) {
          setCapturing(true);
        }
        return;
      }
      // Con un cuadro abierto (el de «Buscar» o cualquier otro) los atajos de las pantallas esperan.
      if (event.shiftKey || modalOpen) {
        return;
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearching(true);
        return;
      }
      // Por la tecla física («Digit1»): en un teclado donde el número exige Mayús (como el francés)
      // Ctrl y 1 anda igual.
      const digit =
        /^Digit([1-9])$/.exec(event.code)?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : '');
      const target = DESTINATIONS[Number(digit) - 1];
      if (target && digit !== '') {
        event.preventDefault();
        go(target.destination);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go]);

  const goToNotes = () => go('notes');

  const active = subjects?.find((subject) => subject.status === 'active') ?? null;
  const viewed = subjects
    ? (subjects.find((subject) => subject.id === viewedId) ?? active ?? subjects[0] ?? null)
    : null;

  // «Abrir» una materia para consultarla: se mira, pero no se activa.
  const openSubject = (subject: Subject) => {
    setViewedId(subject.id);
    setChangingSubject(false);
    setDestination('notes');
    setSettingsView('settings');
    setNotesSection('notes');
    setNavigated(true);
  };

  const toasts = (
    <div className={styles.toasts}>
      <Toast onClose={() => setToast('')}>{toast}</Toast>
    </div>
  );

  if (firstTime) {
    return (
      <div className={styles.app}>
        {__VARIANTE__ === 'prueba' ? <DemoRibbon /> : null}
        <FirstTimeScreen
          onCreated={(subject, next) => {
            setSubjects([subject]);
            subjectsLoaded.current = true;
            go(next);
          }}
          onDataChanged={onDataReset}
        />
        {toasts}
      </div>
    );
  }

  const needsSubjects = destination === 'study' || destination === 'notes';
  return (
    <div className={styles.app}>
      {__VARIANTE__ === 'prueba' ? <DemoRibbon /> : null}
      <div className={styles.body}>
        <SideRail
          current={destination}
          onChange={go}
          onSearch={() => setSearching(true)}
          inboxCount={inboxCount}
          onOpenInbox={openInbox}
        />
        <main ref={content} className={styles.content} aria-label={texts.appName}>
          {needsSubjects && subjectsFailed && subjects === null ? (
            <ViewState
              kind="error"
              phrase={texts.subjects.loadFailed}
              action={{
                text: texts.subjects.retry,
                onClick: () => void loadSubjects(),
                primary: true,
              }}
            />
          ) : null}
          {destination === 'study' && subjects !== null ? (
            <EmptyDestination
              title={texts.nav.study}
              phrase={texts.screens.study}
              focusTitle={navigated}
              onGoToNotes={goToNotes}
              before={<ActiveSubject active={active} onChange={() => setChangingSubject(true)} />}
            />
          ) : null}
          {destination === 'notes' && subjects !== null && viewed ? (
            <NotesScreen
              focusTitle={navigated}
              subject={viewed}
              active={active}
              section={notesSection}
              onSectionChange={setNotesSection}
              inboxCount={inboxCount}
              onInboxCount={setInboxCount}
              onChangeSubject={() => setChangingSubject(true)}
              onViewSubject={setViewedId}
              onDataChanged={reloadShared}
            />
          ) : null}
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
                __VARIANTE__ === 'prueba' ? (
                  <DemoSection
                    onOpenLab={() => setSettingsView('lab')}
                    onOpenGallery={() => setSettingsView('gallery')}
                    onDataChanged={onDataReset}
                  />
                ) : null
              }
            />
          ) : null}
          {__VARIANTE__ === 'prueba' && destination === 'settings' && settingsView === 'lab' ? (
            <LabScreen focusTitle onBack={() => setSettingsView('settings')} />
          ) : null}
          {__VARIANTE__ === 'prueba' && destination === 'settings' && settingsView === 'gallery' ? (
            <GalleryScreen focusTitle onBack={() => setSettingsView('settings')} />
          ) : null}
        </main>
      </div>
      {searching ? <SearchDialog onClose={() => setSearching(false)} /> : null}
      {capturing ? (
        <CaptureDialog
          onClose={() => setCapturing(false)}
          onCaptured={(count) => {
            setInboxCount(count);
            setCapturing(false);
            setToast(texts.inbox.captured);
          }}
        />
      ) : null}
      {changingSubject && subjects ? (
        <SubjectsDialog
          subjects={subjects}
          onClose={() => setChangingSubject(false)}
          onChanged={setSubjects}
          onOpen={openSubject}
        />
      ) : null}
      {toasts}
    </div>
  );
}
