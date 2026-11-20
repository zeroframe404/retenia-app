import type {
  MaterialStateView,
  MaterialSummary,
  StageItem,
} from '../../preload/contract/materials';
import { texts } from '../../preload/contract/texts';
import type { Stage } from '../ui/Process';

// Cómo se dice el estado de un material y cada una de sus etapas.

export function stateText(state: MaterialStateView): string {
  switch (state.kind) {
    case 'received':
      return texts.materials.states.received;
    case 'processing':
      return texts.materials.states.processing(state.read, state.total);
    case 'ready':
      return texts.materials.states.ready;
    case 'partial':
      return texts.materials.states.partial;
    case 'review':
      return texts.materials.states.review;
    case 'error':
      return texts.materials.states.error;
    case 'pendingNetwork':
      return texts.materials.states.pendingNetwork;
  }
}

// El detalle de un material leído en parte: «Leímos 48 de 52 páginas».
export function partialText(state: MaterialStateView): string | null {
  return state.kind === 'partial' ? texts.materials.partialDetail(state.read, state.total) : null;
}

function stageText(stage: StageItem): string {
  switch (stage.id) {
    case 'saved':
      return texts.ui.stages.saved;
    case 'extracted':
      return 'paragraphs' in stage
        ? texts.ui.stages.extractedParagraphs(stage.paragraphs)
        : texts.ui.stages.extracted(stage.withText, stage.total);
    case 'sections':
      return texts.ui.stages.sections;
    case 'ready':
      return texts.ui.stages.ready;
  }
}

export function stagesOf(material: Pick<MaterialSummary, 'stages'>): Stage[] {
  return material.stages.map((stage) => ({ text: stageText(stage), status: stage.status }));
}

export function problemText(state: MaterialStateView): string | null {
  return state.kind === 'error' ? texts.materials.problems[state.problem] : null;
}

// Mientras procesa (o espera en la cola) se puede cancelar.
export const isWorking = (state: MaterialStateView) =>
  (state.kind === 'received' && !state.cancelled) || state.kind === 'processing';

export const isCancelled = (state: MaterialStateView) =>
  (state.kind === 'received' || state.kind === 'partial') && state.cancelled === true;
