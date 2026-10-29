import { describe, expect, it } from 'vitest';
import { demoTexts } from '../../src/preload/contract/demo-texts';
import { formatShortDate, formatSize, texts } from '../../src/preload/contract/texts';
import { catalogEntries } from '../apoyo/catalogo';

// El catálogo es el único lugar de los textos visibles (CLAUDE.md, secciones g y «Reglas del
// producto»): castellano rioplatense con voseo, vocabulario del sistema, sin emojis y sin
// textos técnicos. Cada función del catálogo se prueba con los argumentos de ejemplo de
// tests/apoyo/catalogo.ts; una función nueva sin ejemplo hace fallar la prueba.
const entries = catalogEntries();

const FORBIDDEN_WORDS =
  /\b(racha|rachas|dominado|dominada|dominados|dominadas|deuda|deudas|backlog)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
// Tuteo y jerga que no van en pantalla.
const TUTEO = /\b(tú|tienes|puedes|quieres|escribe|pulsa|haz|elige|selecciona|introduce|guarda)\b/i;
const TECHNICAL =
  /\b(undefined|null|NaN|SQLite|Zod|IPC|stack|exception|excepción|Error:|TypeError|payload|token|JSON|API)\b|\[object/;

describe('catálogo de textos', () => {
  it('tiene textos', () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it.for(entries)(
    '$path no usa palabras prohibidas, emojis, tuteo ni jerga técnica',
    ({ text }) => {
      expect(text.trim(), 'texto vacío').not.toBe('');
      expect(text).not.toMatch(FORBIDDEN_WORDS);
      expect(text).not.toMatch(EMOJI);
      expect(text).not.toMatch(TUTEO);
      expect(text).not.toMatch(TECHNICAL);
    },
  );

  it('los textos de la Fase 03 son exactamente los del plan', () => {
    expect(texts.cards.title).toBe('Tarjetas');
    expect(texts.cards.newCard).toBe('Nueva tarjeta');
    expect(texts.cards.questionLabel).toBe('Pregunta');
    expect(texts.cards.answerLabel).toBe('Respuesta');
    expect(texts.cards.save).toBe('Guardar');
    expect(texts.cards.saved).toBe('Tarjeta guardada');
    expect(texts.cards.questionRequired).toBe('Escribí la pregunta');
    expect(texts.cards.review).toBe('Repasar');
    expect(texts.cards.showAnswer).toBe('Mostrar respuesta');
    expect(texts.cards.gradeAgain).toBe('No la sabía');
    expect(texts.cards.gradeHard).toBe('Con dudas');
    expect(texts.cards.gradeGood).toBe('La sabía');
    expect(texts.cards.nextReview('miércoles 17/03/2027')).toBe(
      'Próximo repaso: miércoles 17/03/2027',
    );
    expect(demoTexts.ribbon('lunes 15/03/2027')).toBe('DEMOSTRACIÓN · hoy es lunes 15/03/2027');
  });

  it('los textos de la Fase 04 son exactamente los de las pruebas manuales', () => {
    // La barra provisoria de la Fase 04 la reemplazó el riel de la Fase 06: sus cuatro nombres
    // siguen siendo los mismos, ahora «Tarjetas», «Papelera» y «Actividad reciente» como secciones
    // de Apuntes y «Ajustes» en el riel.
    expect(texts.notes.cards).toBe('Tarjetas');
    expect(texts.notes.trash).toBe('Papelera');
    expect(texts.notes.activity).toBe('Actividad reciente');
    expect(texts.nav.settings).toBe('Ajustes');
    expect(texts.cards.history).toBe('Historial');
    expect(texts.cards.edit).toBe('Editar');
    expect(texts.cards.remove).toBe('Eliminar');
    expect(texts.history.title).toBe('Historial');
    expect(texts.history.row('15/03/2027', texts.cards.gradeGood)).toBe('15/03/2027 · La sabía');
    expect(texts.history.row('22/03/2027', texts.cards.gradeHard)).toBe('22/03/2027 · Con dudas');
    expect(texts.trash.title).toBe('Papelera');
    expect(texts.trash.restore).toBe('Restaurar');
    expect(texts.trash.emptyTrash).toBe('Vaciar papelera');
    expect(texts.trash.confirmEmpty).toBe(
      'Todo lo que está en la papelera se elimina para siempre: tarjetas, notas, temas y anotaciones de la Bandeja.',
    );
    expect(texts.trash.confirm).toBe('Vaciar');
    expect(texts.trash.expires('14/04/2027')).toBe('Se elimina para siempre el 14/04/2027');
    expect(texts.activity.title).toBe('Actividad reciente');
    expect(texts.activity.undo).toBe('Deshacer');
    expect(texts.activity.edited(texts.activity.cardName('¿Qué es la varianza? PRUEBA'))).toBe(
      'Editaste «¿Qué es la varianza? PRUEBA»',
    );
    expect(texts.settings.title).toBe('Ajustes');
    expect(texts.data.title).toBe('Datos y copias');
    expect(texts.data.verify).toBe('Verificar datos');
    expect(texts.data.allGood).toBe('Todo en orden · 0 diferencias');
    expect(texts.data.repair).toBe('Reparar desde el historial');
    expect(texts.data.makeCopy).toBe('Hacer copia ahora');
    expect(texts.data.openFolder).toBe('Abrir carpeta de copias');
    expect(texts.data.verified).toBe('Verificada');
    expect(texts.data.restore).toBe('Restaurar');
    expect(texts.data.kinds).toEqual({
      auto: 'Automática',
      manual: 'Hecha por vos',
      before_restore: 'Antes de restaurar',
    });
    expect(demoTexts.section).toBe('Demostración');
    expect(demoTexts.advance).toEqual({ 1: '+1 día', 7: '+7 días', 35: '+35 días' });
    expect(demoTexts.reset).toBe('Restablecer fecha');
  });

  it('los textos de la Fase 05 son exactamente los de las pruebas manuales y los criterios', () => {
    const lab = demoTexts.lab;
    expect(lab.open).toBe('Laboratorio');
    expect(lab.title).toBe('Laboratorio');
    expect(lab.voice.download).toBe('Descargar modelos');
    expect(lab.voice.ready).toBe('Modelos listos');
    expect(lab.voice.missing).toBe(
      'Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.',
    );
    expect(lab.voice.speak).toBe('Decir en voz alta');
    expect(lab.transcription.record).toBe('Grabar');
    expect(lab.transcription.stop).toBe('Detener');
    expect(lab.heard('good morning')).toBe('Entendí: “good morning”');
    expect(lab.transcription.blocked).toBe('Sin acceso al micrófono no podemos escucharte');
    expect(lab.transcription.howTo).toBe('Cómo habilitarlo');
    expect(lab.pdf.read).toBe('Leer PDF de prueba');
    expect(lab.scan.read).toBe('Leer página escaneada');
    expect(lab.notice.send).toBe('Probar aviso');
    expect(`${lab.notificationTitle} · ${lab.notificationBody}`).toBe(
      'Retenia · Esto es una prueba',
    );
    expect(demoTexts.offline).toBe('Simular sin conexión');
  });

  it('cuánto tardó se dice en segundos con coma decimal, y nunca «0 s»', () => {
    expect(demoTexts.lab.elapsed(1140)).toBe('Tardó 1,1 s');
    expect(demoTexts.lab.elapsed(4200)).toBe('Tardó 4,2 s');
    expect(demoTexts.lab.elapsed(12)).toBe('Tardó 0,1 s');
    expect(demoTexts.lab.elapsed(75_000)).toBe('Tardó 75 s');
    expect(demoTexts.lab.voice.downloading(49.6)).toBe('Bajando los modelos: 50 %');
  });

  it('las diferencias se cuentan en singular y en plural', () => {
    expect(texts.data.differencesFound(1)).toBe('Hay 1 diferencia');
    expect(texts.data.differencesFound(3)).toBe('Hay 3 diferencias');
  });

  it('una tarjeta que ya no existe se nombra sin comillas', () => {
    expect(texts.activity.cardName(null)).toBe('una tarjeta que ya no existe');
    expect(texts.activity.created(texts.activity.cardName(null))).toBe(
      'Creaste una tarjeta que ya no existe',
    );
  });
});

describe('formatos de fecha y tamaño', () => {
  it('«2027-03-15» se escribe 15/03/2027', () => {
    expect(formatShortDate('2027-03-15')).toBe('15/03/2027');
    expect(() => formatShortDate('15/03/2027')).toThrow();
  });

  it('los tamaños van en KB o MB con coma decimal', () => {
    expect(formatSize(0)).toBe('1 KB');
    expect(formatSize(512)).toBe('1 KB');
    expect(formatSize(49_152)).toBe('48 KB');
    expect(formatSize(1_258_291)).toBe('1,2 MB');
    expect(formatSize(157_286_400)).toBe('150 MB');
  });
});
