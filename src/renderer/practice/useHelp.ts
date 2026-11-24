import { useCallback, useRef, useState } from 'react';
import type {
  ActivityHelp,
  ActivityOpening,
  HelpUseValue,
} from '../../preload/contract/activities';
import { texts } from '../../preload/contract/texts';

// La barra de ayuda de una actividad (H-32): qué ayuda se usó y cuándo, qué se ve en el panel de la
// derecha, la pregunta antes de mostrar la solución y el rótulo. Las reglas (qué se prende, el orden
// de las pistas, el nivel) las aplica el principal con el núcleo; acá solo se guarda lo que pasó.

export type PanelContent =
  | { kind: 'hints'; hints: { index: number; text: string }[] }
  | { kind: 'example'; text: string }
  | { kind: 'source'; text: string; cite: Extract<SourceContent, { kind: 'source' }>['cite'] }
  | { kind: 'solution'; solution: Extract<SolutionContent, { kind: 'solution' }>['solution'] }
  | { kind: 'explanation'; text: string };

type HelpContent = Extract<ActivityHelp, { kind: 'help' }>['content'];
type SourceContent = Extract<HelpContent, { kind: 'source' }>;
type SolutionContent = Extract<HelpContent, { kind: 'solution' }>;

export type ModeLabel = ActivityOpening['label'];

export function useHelp({
  cardId,
  openingId,
  opening,
  attemptNo,
  onSolution,
}: {
  cardId: string | null;
  // La apertura: el principal mide desde que se abrió a los cuántos milisegundos se pide cada ayuda.
  openingId: string;
  opening: ActivityOpening | null;
  attemptNo: number;
  // La solución vista (A4): en la tarjeta de siempre es «Mostrar respuesta».
  onSolution?: (() => void) | undefined;
}) {
  const [used, setUsed] = useState<HelpUseValue[]>([]);
  const [label, setLabel] = useState<ModeLabel>(opening?.label ?? 'autonomous');
  const [started, setStarted] = useState(false);
  const [noIdea, setNoIdea] = useState(false);
  const [panel, setPanel] = useState<PanelContent | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState('');
  const asking = useRef(false);
  const hints = useRef<{ index: number; text: string }[]>([]);

  const reset = useCallback((next: ActivityOpening | null) => {
    setUsed([]);
    setLabel(next?.label ?? 'autonomous');
    setStarted(false);
    setNoIdea(false);
    setPanel(null);
    setConfirming(false);
    setProblem('');
    hints.current = [];
  }, []);

  const availability = opening
    ? started
      ? opening.availability.started
      : opening.availability.idle
    : { hint: false, example: false, source: false, noIdea: false };

  async function ask(kind: HelpUseValue['kind'], confirmed = false) {
    if (cardId === null || asking.current) {
      return;
    }
    asking.current = true;
    setProblem('');
    try {
      const response = await window.retenia['activities.help']({
        cardId,
        openingId,
        kind,
        used,
        attemptNo,
        ...(confirmed ? { confirmed } : {}),
      });
      if (response.kind === 'confirmSolution') {
        setConfirming(true);
        return;
      }
      const { use } = response;
      setUsed((current) => [...current, use]);
      setLabel(response.label);
      const { content } = response;
      if (content.kind === 'hint') {
        hints.current = [...hints.current, { index: content.index, text: content.text }];
        setPanel({ kind: 'hints', hints: hints.current });
      } else if (content.kind === 'example') {
        setPanel({ kind: 'example', text: content.text });
      } else if (content.kind === 'source') {
        setPanel({ kind: 'source', text: content.text, cite: content.cite });
      } else {
        setPanel({ kind: 'solution', solution: content.solution });
        onSolution?.();
      }
    } catch {
      setProblem(texts.practice.helpFailed);
    } finally {
      asking.current = false;
    }
  }

  return {
    used,
    label,
    started,
    noIdea,
    availability,
    panel,
    confirming,
    problem,
    // Escribir algo, elegir una opción o mover un paso empieza el intento (CA-135).
    start: () => setStarted(true),
    chooseNoIdea: () => {
      setNoIdea(true);
      setStarted(true);
    },
    hint: () => void ask('hint'),
    example: () => void ask('example'),
    source: () => void ask('source'),
    confirmSolution: () => {
      setConfirming(false);
      void ask('solution', true);
    },
    cancelSolution: () => setConfirming(false),
    showExplanation: (text: string) => setPanel({ kind: 'explanation', text }),
    closePanel: () => setPanel(null),
    reset,
  };
}

export type HelpController = ReturnType<typeof useHelp>;
