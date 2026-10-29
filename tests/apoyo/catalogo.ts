import { demoTexts } from '../../src/preload/contract/demo-texts';
import { texts } from '../../src/preload/contract/texts';

// Cada función del catálogo de textos se prueba con los argumentos de ejemplo de acá abajo; una
// función nueva sin ejemplo hace fallar las pruebas que recorren el catálogo.
const SAMPLES: Record<string, unknown[]> = {
  'texts.cards.questionTooLong': [100000],
  'texts.cards.answerTooLong': [100000],
  'texts.cards.nextReview': ['miércoles 17/03/2027'],
  'texts.history.row': ['15/03/2027', 'La sabía'],
  'texts.trash.expires': ['14/04/2027'],
  'texts.activity.row': ['22/03/2027 10:00', 'Editaste «¿Qué es la varianza?»'],
  'texts.activity.cardName': ['¿Qué es la varianza?'],
  'texts.activity.created': ['«¿Capital de Francia?»'],
  'texts.activity.edited': ['«¿Qué es la varianza?»'],
  'texts.activity.removed': ['«¿Qué es la varianza?»'],
  'texts.activity.restored': ['«¿Qué es la varianza?»'],
  'texts.activity.undidCreate': ['«¿Capital de Francia?»'],
  'texts.activity.undidEdit': ['«¿Qué es la varianza?»'],
  'texts.activity.undidRemove': ['«¿Qué es la varianza?»'],
  'texts.activity.undidRestore': ['«¿Qué es la varianza?»'],
  'texts.data.differencesFound': [2],
  'texts.data.differenceDue': ['¿Qué es la varianza?', '30/04/2027', '17/03/2027'],
  'texts.data.differenceMemory': ['¿Qué es la varianza?'],
  'texts.data.differenceMissing': ['¿Qué es la varianza?'],
  'texts.data.copyRow': ['22/03/2027', '10:00', 'Hecha por vos', '48 KB'],
  'texts.data.unreadableCopy': ['48 KB'],
  'texts.data.restored': ['22/03/2027', '10:00'],
  'texts.ui.dataWithCount': ['Observado', 84],
  'texts.ui.proposal.title': [25],
  'texts.ui.proposal.why': ['tenés 60 repasos para hoy.'],
  'texts.ui.commitment': [2, 3],
  'texts.ui.ideaUnits.quoted': ['el 95 % tiene que ver con cómo se arma el intervalo'],
  'texts.ui.correctedNotice.change': ['Todavía no', 'Correcto'],
  'texts.ui.closing.title': [13],
  'texts.ui.closing.count': ['La sabía', 8],
  'texts.ui.mastery.step': [2, 5],
  'texts.ui.stages.extracted': [11, 12],
  'texts.notes.topics.withCount': ['Media y dispersión', 2],
  'texts.notes.topics.detailsTitle': ['Regresión'],
  'texts.notes.topics.notesCount': [3],
  'texts.notes.topics.nameTooLong': [120],
  'texts.notes.list.inTopic': ['Regresión'],
  'texts.notes.toast.moved': ['Regresión'],
  'texts.notes.toast.alreadyIn': ['Regresión'],
  'texts.notes.toast.topicCreated': ['Regresión'],
  'texts.notes.toast.topicRenamed': ['Regresión lineal'],
  'texts.notes.editor.mentionOption': ['Media y desvío', 'Media y dispersión'],
  'texts.notes.editor.mentionOpen': ['Media y desvío'],
  'texts.subjects.viewing': ['Historia argentina'],
  'texts.subjects.viewingActive': ['Estadística básica'],
  'texts.subjects.active': ['Estadística básica'],
  'texts.subjects.row': ['Historia argentina', 'En mantenimiento'],
  'texts.subjects.activated': ['Química orgánica'],
  'texts.subjects.nameTooLong': [120],
  'texts.firstTime.nameTooLong': [120],
  'texts.inbox.moved': ['Regresión'],
  'texts.inbox.captureTooLong': [1000],
  'texts.inbox.railLabel': [3],
  'texts.activity.things.note': ['Intervalos de confianza'],
  'texts.activity.things.topic': ['Regresión'],
  'texts.activity.things.subject': ['Química orgánica'],
  'texts.activity.things.inbox': ['Revisar el supuesto de normalidad'],
  'demoTexts.ribbon': ['lunes 15/03/2027'],
  'demoTexts.gallery.variant': ['Primario'],
  'demoTexts.lab.elapsed': [1140],
  'demoTexts.lab.heard': ['good morning'],
  'demoTexts.lab.voice.downloading': [50],
  'demoTexts.lab.transcription.recording': [2],
  'demoTexts.lab.pdf.phrase': ['Una muestra es una parte de la población'],
};

export interface CatalogEntry {
  path: string;
  text: string;
}

function collect(value: unknown, path: string, out: CatalogEntry[]): void {
  if (typeof value === 'string') {
    out.push({ path, text: value });
  } else if (typeof value === 'function') {
    const args = SAMPLES[path];
    if (!args) {
      throw new Error(`El texto ${path} es una función y falta su ejemplo en SAMPLES`);
    }
    out.push({ path, text: String((value as (...a: unknown[]) => unknown)(...args)) });
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      collect(inner, `${path}.${key}`, out);
    }
  }
}

// Todos los textos del catálogo (el general y el de la variante de prueba), con su ruta; las
// funciones, ya armadas con su ejemplo.
export function catalogEntries(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  collect(texts, 'texts', entries);
  collect(demoTexts, 'demoTexts', entries);
  return entries;
}
