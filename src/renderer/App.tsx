import { useCallback, useEffect, useRef, useState } from 'react';
import type { Subject } from '../preload/contract/organization';
import type { SearchHit } from '../preload/contract/search';
import type { SessionView } from '../preload/contract/study';
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
import { type MaterialRequest, MaterialsScreen } from './materials/MaterialsScreen';
import { FLUSH_NOTES } from './notes/flush';
import { PROGRESS_REVIEWS_EVENT } from './progress/landing';
import { EmptyDestination } from './screens/EmptyDestination';
import {
  type CardRequest,
  type NoteRequest,
  NotesScreen,
  type NotesSectionName,
  type TopicRequest,
} from './screens/NotesScreen';
import { ResultPanel } from './search/ResultPanel';
import { SearchDialog } from './search/SearchDialog';
import {
  type ObjectiveRequest,
  ProgressScreen,
  type ProgressSectionName,
} from './session/ProgressScreen';
import { SessionScreen } from './session/SessionScreen';
import { StudyScreen } from './session/StudyScreen';
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
  // Fase 17: la sección de Progreso. Abre en «Objetivos»; después de guardar una duda o de mandar
  // una tarjeta a revisión, en «Dudas y revisiones» (lo dice el cartel).
  const [progressSection, setProgressSection] = useState<ProgressSectionName>('objectives');
  const landReviews = useRef(false);
  // «Ir al requisito» (Fase 17): el objetivo que hay que abrir en Progreso.
  const [objectiveRequest, setObjectiveRequest] = useState<ObjectiveRequest | null>(null);
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
  // «Ver en la nota» de una tarjeta: la nota que hay que abrir, en su renglón.
  const [noteRequest, setNoteRequest] = useState<NoteRequest | null>(null);
  // «Abrir la tarjeta» desde Progreso: la tarjeta que hay que abrir en Apuntes › «Tarjetas».
  const [cardRequest, setCardRequest] = useState<CardRequest | null>(null);
  // Un resultado del buscador que se abre en Apuntes, en un tema.
  const [topicRequest, setTopicRequest] = useState<TopicRequest | null>(null);
  // Durante una sesión, un resultado del buscador se abre en un panel a la derecha.
  const [panelHit, setPanelHit] = useState<SearchHit | null>(null);
  // Durante una sesión, «Ver en el original» de la tarjeta se abre en el mismo panel (Fase 13).
  const [panelOriginal, setPanelOriginal] = useState<{ materialId: string; cardId: string } | null>(
    null,
  );
  // «Ver en el original» (Fase 13): el material que hay que abrir, en su pasaje.
  const [materialRequest, setMaterialRequest] = useState<MaterialRequest | null>(null);
  // La sesión de estudio abierta (Fase 10): ocupa la ventana entera, sin el riel.
  const [studying, setStudying] = useState<SessionView | null>(null);
  const studyingRef = useRef(false);
  studyingRef.current = studying !== null;
  const requests = useRef(0);
  const [toast, setToast] = useState('');
  const content = useRef<HTMLElement>(null);
  const subjectsLoaded = useRef(false);

  const go = useCallback((next: Destination) => {
    setDestination(next);
    setSettingsView('settings');
    if (next === 'notes') {
      setNotesSection('notes');
    }
    if (next === 'progress') {
      setProgressSection(landReviews.current ? 'reviews' : 'objectives');
      landReviews.current = false;
    }
    setNavigated(true);
  }, []);

  useEffect(() => {
    const onReviews = () => {
      landReviews.current = true;
    };
    window.addEventListener(PROGRESS_REVIEWS_EVENT, onReviews);
    return () => window.removeEventListener(PROGRESS_REVIEWS_EVENT, onReviews);
  }, []);

  const openInbox = useCallback(() => {
    setDestination('notes');
    setSettingsView('settings');
    setNotesSection('inbox');
    setNavigated(true);
  }, []);

  // «Buscar»: antes de abrirlo se guarda lo que se esté escribiendo en una nota.
  const openSearch = useCallback(() => {
    window.dispatchEvent(new Event(FLUSH_NOTES));
    setSearching(true);
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
      // «Buscar» también se abre durante la sesión: el resultado va a un panel, sin salir.
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
        return;
      }
      // Durante la sesión de estudio no se va a otro destino: primero se pausa.
      if (studyingRef.current) {
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
  }, [go, openSearch]);

  const goToNotes = () => go('notes');

  const openNoteFromCard = (noteId: string, blockId: string | null) => {
    requests.current += 1;
    setNoteRequest({ noteId, blockId, nonce: requests.current });
    setNotesSection('notes');
  };

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

  // «Abrir la tarjeta» desde Progreso: Apuntes › «Tarjetas» de su materia, con la tarjeta abierta.
  const openCard = (subjectId: string | null, cardId: string) => {
    if (subjectId !== null) {
      setViewedId(subjectId);
    }
    requests.current += 1;
    setCardRequest({ cardId, nonce: requests.current });
    setDestination('notes');
    setSettingsView('settings');
    setNotesSection('cards');
    setNavigated(true);
  };

  // «Ver en el original» (H-26): Materiales, con el visor en la página de la cita.
  const openOriginal = (target: Omit<MaterialRequest, 'nonce'>) => {
    requests.current += 1;
    setMaterialRequest({ ...target, nonce: requests.current });
    setDestination('materials');
    setSettingsView('settings');
    setNavigated(true);
  };

  // «Practicar ahora» desde Progreso o desde Estudiar (Fase 17): la actividad sola, en Apuntes ›
  // «Tarjetas», fuera de la cola del día.
  const practiceCard = (cardId: string) => {
    requests.current += 1;
    setCardRequest({ cardId, nonce: requests.current, practice: true });
    setDestination('notes');
    setSettingsView('settings');
    setNotesSection('cards');
    setNavigated(true);
  };

  // «Reformular» y «Agregar una pista» de «Mejorar la tarjeta» (Fase 17): la ficha, para editarla.
  const editCard = (cardId: string, improve: 'rephrase' | 'hint') => {
    requests.current += 1;
    setCardRequest({ cardId, nonce: requests.current, edit: improve });
    setDestination('notes');
    setSettingsView('settings');
    setNotesSection('cards');
    setNavigated(true);
  };

  // «Ver en el original» de una tarjeta, desde «Mejorar la tarjeta».
  const openCardOriginal = (cardId: string) => {
    window.retenia['cards.get']({ cardId }).then(
      (card) => {
        if (card.cite) {
          openOriginal({ materialId: card.cite.materialId, cardId });
        }
      },
      (error: unknown) => console.error('La ventana no pudo leer la tarjeta por el puente', error),
    );
  };

  // «Ir al requisito» tras un fallo (Fase 17): el panel del objetivo, en Progreso.
  const openObjective = (objectiveId: string) => {
    requests.current += 1;
    setObjectiveRequest({ objectiveId, nonce: requests.current });
    setProgressSection('objectives');
    setDestination('progress');
    setSettingsView('settings');
    setNavigated(true);
  };

  // «Practicar ahora» desde el buscador (Fase 16): la actividad sola, fuera de la cola del día.
  const practiceHit = (hit: SearchHit) => {
    setSearching(false);
    if (hit.subjectId !== null) {
      setViewedId(hit.subjectId);
    }
    requests.current += 1;
    setCardRequest({ cardId: hit.entityId, nonce: requests.current, practice: true });
    setDestination('notes');
    setSettingsView('settings');
    setNotesSection('cards');
    setNavigated(true);
  };

  // Un resultado del buscador (H-23): lleva a la pantalla donde vive o, en una sesión, lo muestra en
  // un panel a la derecha sin salir de la actividad.
  const openHit = (hit: SearchHit) => {
    setSearching(false);
    if (studyingRef.current) {
      setPanelHit(hit);
      return;
    }
    if (hit.kind === 'card') {
      openCard(hit.subjectId, hit.entityId);
    } else if (hit.kind === 'doubt' && hit.parentId !== null) {
      openCard(hit.subjectId, hit.parentId);
    } else if (hit.kind === 'doubt') {
      go('progress');
    } else if (hit.kind === 'topic') {
      if (hit.subjectId !== null) {
        setViewedId(hit.subjectId);
      }
      requests.current += 1;
      setTopicRequest({ topicId: hit.entityId, nonce: requests.current });
      setDestination('notes');
      setSettingsView('settings');
      setNotesSection('notes');
      setNavigated(true);
    } else if (hit.kind === 'material' || hit.kind === 'section') {
      const materialId = hit.kind === 'material' ? hit.entityId : (hit.parentId ?? '');
      openOriginal(hit.kind === 'section' ? { materialId, blockId: hit.entityId } : { materialId });
    } else if (hit.kind === 'note' || hit.kind === 'block') {
      if (hit.subjectId !== null) {
        setViewedId(hit.subjectId);
      }
      const noteId = hit.kind === 'note' ? hit.entityId : (hit.parentId ?? '');
      requests.current += 1;
      setNoteRequest({
        noteId,
        blockId: hit.kind === 'block' ? hit.entityId : null,
        nonce: requests.current,
      });
      setDestination('notes');
      setSettingsView('settings');
      setNotesSection('notes');
      setNavigated(true);
    }
  };

  // Al cerrar el panel de un resultado, el foco vuelve al campo de respuesta.
  const closePanel = () => {
    setPanelHit(null);
    setPanelOriginal(null);
    setTimeout(() => document.querySelector<HTMLElement>('textarea')?.focus(), 0);
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

  if (studying) {
    return (
      <div className={styles.app}>
        {__VARIANTE__ === 'prueba' ? <DemoRibbon /> : null}
        <div className={styles.sessionBody}>
          <SessionScreen
            initial={studying}
            onExit={() => {
              setStudying(null);
              setDestination('study');
              setNavigated(true);
            }}
            onToast={setToast}
            onOpenOriginal={setPanelOriginal}
          />
        </div>
        {searching ? <SearchDialog onClose={() => setSearching(false)} onOpen={openHit} /> : null}
        {panelHit ? <ResultPanel hit={panelHit} onClose={closePanel} /> : null}
        {panelOriginal && !panelHit ? (
          <ResultPanel original={panelOriginal} onClose={closePanel} />
        ) : null}
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
        {toasts}
      </div>
    );
  }

  const needsSubjects =
    destination === 'study' || destination === 'notes' || destination === 'materials';
  return (
    <div className={styles.app}>
      {__VARIANTE__ === 'prueba' ? <DemoRibbon /> : null}
      <div className={styles.body}>
        <SideRail
          current={destination}
          onChange={go}
          onSearch={openSearch}
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
            <StudyScreen
              focusTitle={navigated}
              activeSubjectId={active?.id ?? null}
              onStudy={setStudying}
              onPractice={practiceCard}
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
              noteRequest={noteRequest}
              onOpenNoteFromCard={openNoteFromCard}
              onOpenOriginal={(materialId, cardId) => openOriginal({ materialId, cardId })}
              onNoteRequestHandled={() => setNoteRequest(null)}
              cardRequest={cardRequest}
              onOpenObjective={openObjective}
              topicRequest={topicRequest}
              onTopicRequestHandled={() => setTopicRequest(null)}
            />
          ) : null}
          {destination === 'materials' && subjects !== null ? (
            <MaterialsScreen
              focusTitle={navigated}
              subject={viewed}
              active={active}
              subjects={subjects}
              request={materialRequest}
              onChangeSubject={() => setChangingSubject(true)}
              onInboxCount={setInboxCount}
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
            <ProgressScreen
              focusTitle={navigated}
              subjectId={viewed?.id ?? active?.id ?? null}
              section={progressSection}
              onSectionChange={setProgressSection}
              objectiveRequest={objectiveRequest}
              onOpenCard={openCard}
              onPractice={practiceCard}
              onEditCard={editCard}
              onOpenOriginal={openCardOriginal}
              onGoToStudy={() => go('study')}
            />
          ) : null}
          {destination === 'settings' && settingsView === 'settings' ? (
            <SettingsScreen
              focusTitle={navigated}
              onSubjectsChanged={reloadShared}
              demo={
                __VARIANTE__ === 'prueba' ? (
                  <DemoSection
                    onOpenLab={() => setSettingsView('lab')}
                    onOpenGallery={() => setSettingsView('gallery')}
                    onDataChanged={onDataReset}
                    onSubjectsChanged={reloadShared}
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
      {searching ? (
        <SearchDialog
          onClose={() => setSearching(false)}
          onOpen={openHit}
          onPractice={practiceHit}
        />
      ) : null}
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
