import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { z } from 'zod';
import { type Clock, type Stopwatch, systemStopwatch } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import type { ThemeChoice } from '../core/theme';
import type { ZoomDirection } from '../core/zoom';
import type { BackupView } from '../data/backups';
import { newId } from '../data/ids';
import type { Workspace } from '../data/workspace';
import {
  type ChannelName,
  channels,
  type HandlerRequest,
  type HandlerResponse,
  type Registry,
} from '../preload/contract';
import type { Backup } from '../preload/contract/backups';
import type { fileChannels } from '../preload/contract/materials';
import { formatShortDate, texts } from '../preload/contract/texts';
import { createActivityTimer } from './activity-timer';
import type { SecretBox } from './ai/key-store';
import { type AiService, createAiService } from './ai/service';
import { createAppearanceStore } from './appearance';
import type { Dialogs } from './imports/dialogs';
import { createTransfersService, type TransfersService } from './imports/service';
import type { MaterialsService } from './materials/service';
import { createNetGate } from './net-gate';
import { createStudyTimer } from './study-timer';

export type Variant = 'prueba' | 'real';

export type Handlers = {
  [K in ChannelName]: (request: HandlerRequest<K>) => Promise<HandlerResponse<K>>;
};

type FileChannels = typeof fileChannels;
// El canal del puente de archivos (`materials.addFiles`), que la ventana no ve.
export type FileHandlers = {
  [K in keyof FileChannels]: (
    request: z.output<FileChannels[K]['request']>,
  ) => Promise<z.input<FileChannels[K]['response']>>;
};

// Sin almacén seguro: la clave no se puede guardar (el puente de las pruebas que no prueban la IA).
const NO_SECURE_STORAGE: SecretBox = {
  isEncryptionAvailable: () => false,
  encryptString: () => {
    throw new Error('Sin almacén seguro');
  },
  decryptString: () => {
    throw new Error('Sin almacén seguro');
  },
};

const CANCELLING_DIALOGS: Dialogs = {
  chooseFile: async () => null,
  chooseFolder: async () => null,
  chooseSave: async () => null,
};

// Una copia tal como la ve la ventana: sin rutas ni nombres de archivo.
function toBackup(view: BackupView): Backup {
  return view.readable
    ? {
        readable: true,
        id: view.id,
        kind: view.kind,
        day: view.day,
        time: view.time,
        sizeBytes: view.sizeBytes,
      }
    : { readable: false, sizeBytes: view.sizeBytes };
}

// Los manejadores de cada canal. Piden a la carpeta de trabajo el almacén vigente en cada
// pedido: después de restaurar una copia, la base es otra. `openFolder` abre una carpeta con el
// Explorador de Windows (shell.openPath: devuelve un texto vacío si pudo).
export function createHandlers({
  clock,
  variant,
  workspace,
  version,
  openFolder,
  onAppearanceChange,
  zoom,
  onFlushed,
  stopwatch = systemStopwatch(),
  materials,
  transfers: givenTransfers,
  dialogs = CANCELLING_DIALOGS,
  ai: givenAi,
}: {
  clock: Clock;
  variant: Variant;
  workspace: Workspace;
  version: string;
  openFolder: (path: string) => Promise<string>;
  // Para que el principal cambie el marco de la ventana cuando se elige otra apariencia.
  onAppearanceChange?: (choice: ThemeChoice) => void;
  // Cambia el zoom de la ventana y devuelve el factor que quedó (sin ventana, 1).
  zoom?: (direction: ZoomDirection) => number;
  // La pantalla avisa que ya guardó lo pendiente: el cierre de la ventana espera este aviso.
  onFlushed?: () => void;
  // Mide los tiempos de la sesión de estudio (en las pruebas, uno fijo).
  stopwatch?: Stopwatch;
  // Los materiales (Fase 13): la cola y su proceso de trabajo.
  materials: MaterialsService;
  // Importar y exportar (Fase 15) y los diálogos de Windows para elegir los archivos. Sin ellos (las
  // pruebas de otros canales), no se lee ningún archivo y todo diálogo vuelve cancelado.
  transfers?: TransfersService;
  dialogs?: Dialogs;
  // La IA (Fase 19). Sin ella (las pruebas de otros canales), una IA apagada: sin almacén seguro y
  // con la puerta a internet cerrada, así nada puede salir.
  ai?: AiService;
}): Handlers {
  const backups = async () => (await workspace.backups()).map(toBackup);
  const transfers =
    givenTransfers ??
    createTransfersService({
      workspace,
      execute: () => Promise.reject(new Error('Sin proceso de trabajo para importar')),
    });
  const ai =
    givenAi ??
    createAiService({
      store: () => workspace.ai,
      clock,
      dataDir: workspace.dataDir,
      box: NO_SECURE_STORAGE,
      net: createNetGate({ offline: true }),
      newId,
      fragmentOf: (input) => materials.fragment(input),
      remote: () => {
        throw new Error('Este puente no tiene IA');
      },
    });
  const appearance = createAppearanceStore(workspace.dataDir);
  const timer = createStudyTimer(clock, stopwatch, (sessionId) =>
    workspace.study.inactivityCapMs(sessionId),
  );
  const activityTimer = createActivityTimer(clock, stopwatch);
  const ok = { ok: true } as const;
  return {
    ping: async () => ({ message: 'pong', variant, today: studyDayOf(clock.now()) }),
    'app.info': async () => ({ version, variant, dataDir: workspace.dataDir }),
    'appearance.get': async () => ({ choice: appearance.get() }),
    'appearance.set': async ({ choice }) => {
      appearance.set(choice);
      onAppearanceChange?.(choice);
      return { choice };
    },
    'cards.create': async (request) => workspace.cards.create(request),
    'cards.list': async (request) => workspace.cards.listWithTotal(request),
    'cards.get': async (request) => workspace.cards.get(request),
    'cards.markMeaningChanged': async (request) => workspace.cards.markMeaningChanged(request),
    'cards.setPaused': async (request) => workspace.cards.setPaused(request),
    'cards.createInverse': async (request) => workspace.cards.createInverse(request),
    'cards.review': async (request) => workspace.cards.review(request),
    'cards.undoReview': async (request) => workspace.cards.undoReview(request),
    'cards.whyToday': async (request) => workspace.cards.whyToday(request),
    'cards.edit': async (request) => workspace.cards.edit(request),
    'activities.validate': async (request) => workspace.cards.validateActivity(request),
    'activities.start': async (request) => {
      activityTimer.open(request.openingId);
      return workspace.activities.start(request);
    },
    'activities.help': async (request) => {
      const response = workspace.activities.help(request);
      return response.kind === 'help'
        ? { ...response, use: { ...response.use, atMs: activityTimer.elapsed(request.openingId) } }
        : response;
    },
    'activities.mark': async ({ openingId }) => {
      activityTimer.firstInput(openingId);
      return ok;
    },
    'activities.submit': async (request) =>
      workspace.activities.submit({ ...request, ...activityTimer.submitted(request.openingId) }),
    'activities.propose': async (request) => workspace.activities.propose(request),
    'activities.finalize': async (request) => workspace.activities.finalize(request),
    'activities.appeal': async (request) => workspace.activities.appeal(request),
    'activities.undoAmendment': async (request) => workspace.activities.undoAmendment(request),
    'activities.acknowledge': async (request) => {
      workspace.activities.acknowledge(request);
      return ok;
    },
    'activities.notices': async (request) => workspace.activities.notices(request),
    // Fase 18: el procedimiento, el conjunto intercalado y el micro-ejercicio.
    'procedure.open': async (request) => {
      activityTimer.open(request.openingId);
      return workspace.procedures.open(request);
    },
    'procedure.studied': async (request) => workspace.procedures.studied(request),
    'procedure.check': async (request) =>
      workspace.procedures.check({ ...request, ...activityTimer.submitted(request.openingId) }),
    'procedure.retry': async (request) => workspace.procedures.retry(request),
    'procedure.correction': async (request) => workspace.procedures.correction(request),
    'procedure.finish': async (request) => workspace.procedures.finish(request),
    'sets.open': async (request) => workspace.sets.open(request),
    'sets.summary': async (request) => workspace.sets.summary(request),
    'micro.proposal': async () => workspace.micro.proposal(),
    'micro.open': async (request) => workspace.micro.open(request),
    'micro.check': async (request) => workspace.micro.check(request),
    'micro.self': async (request) => {
      workspace.micro.self(request);
      return ok;
    },
    'micro.finish': async (request) => workspace.micro.finish(request),
    'cards.history': async (request) => workspace.cards.history(request),
    'cards.delete': async (request) => workspace.cards.remove(request),
    'cards.activationCost': async (request) => workspace.cards.activationCost(request),
    'cards.activate': async (request) => workspace.cards.activate(request),
    'study.overview': async (request) => workspace.study.overview(request),
    'study.start': async ({ sessionId, minutes, only }) => {
      timer.begin(sessionId);
      return workspace.study.start({ sessionId, minutes, only });
    },
    'study.postpone': async (request) => workspace.study.postpone(request),
    'study.view': async (request) => workspace.study.view(request),
    'study.resume': async ({ sessionId }) => {
      timer.begin(sessionId);
      return workspace.study.resume({ sessionId });
    },
    'study.mark': async ({ activityId, mark }) => {
      timer.mark(activityId, mark);
      return ok;
    },
    'study.grade': async (request) =>
      workspace.study.grade({
        ...request,
        marks: timer.take(request.activityId),
        activeMs: timer.step(request.sessionId),
      }),
    'study.undo': async (request) =>
      workspace.study.undo({ ...request, activeMs: timer.step(request.sessionId) }),
    'study.skip': async (request) =>
      workspace.study.skip({ ...request, activeMs: timer.step(request.sessionId) }),
    'study.exerciseDone': async (request) =>
      workspace.study.exerciseDone({ ...request, activeMs: timer.step(request.sessionId) }),
    'study.flag': async (request) =>
      workspace.study.flag({ ...request, activeMs: timer.step(request.sessionId) }),
    'study.pause': async ({ sessionId }) => {
      workspace.study.pause({ sessionId, activeMs: timer.stop(sessionId) });
      return ok;
    },
    'study.saveDraft': async (request) => {
      workspace.study.saveDraft(request);
      return ok;
    },
    'study.summary': async (request) => workspace.study.summary(request),
    'study.rate': async (request) => {
      workspace.study.rate(request);
      return ok;
    },
    'study.adjustPlan': async (request) => {
      workspace.study.adjustPlan(request);
      return ok;
    },
    'study.dismissShortcuts': async () => {
      workspace.study.dismissShortcuts();
      return ok;
    },
    'doubts.create': async (request) => {
      workspace.doubts.create(request);
      return ok;
    },
    'doubts.reviews': async () => workspace.doubts.reviews(),
    'objectives.list': async (request) => workspace.objectives.list(request),
    'objectives.create': async (request) => workspace.objectives.create(request),
    'objectives.activities': async (request) => workspace.objectives.activities(request),
    'objectives.link': async (request) => workspace.objectives.link(request),
    'objectives.panel': async (request) => workspace.objectives.panel(request),
    'objectives.requirements.add': async (request) => {
      workspace.objectives.addRequirement(request);
      return ok;
    },
    'objectives.requirements.confirm': async (request) => {
      workspace.objectives.confirmRequirement(request);
      return ok;
    },
    'objectives.requirements.dismiss': async (request) => {
      workspace.objectives.dismissRequirement(request);
      return ok;
    },
    'objectives.knowAlready': async (request) => {
      workspace.objectives.knowAlready(request);
      return ok;
    },
    'objectives.postpone': async (request) => {
      workspace.objectives.postpone(request);
      return ok;
    },
    'objectives.resume': async (request) => {
      workspace.objectives.resume(request);
      return ok;
    },
    'progress.errors': async (request) => workspace.progress.errors(request),
    'progress.errors.contrast': async (request) => workspace.progress.contrast(request),
    'progress.errors.setType': async (request) => {
      workspace.progress.setErrorType(request);
      return ok;
    },
    'progress.improveCard.list': async (request) => workspace.progress.improveCards(request),
    'progress.improveCard.split': async (request) => workspace.progress.split(request),
    'subjects.list': async () => workspace.subjects.list(),
    'subjects.create': async (request) => workspace.subjects.create(request),
    'subjects.activate': async (request) => workspace.subjects.activate(request),
    'subjects.createExample': async () => workspace.subjects.createExample(),
    'topics.list': async (request) => workspace.topics.list(request),
    'topics.create': async (request) => workspace.topics.create(request),
    'topics.rename': async (request) => workspace.topics.rename(request),
    'topics.archive': async (request) => workspace.topics.archive(request),
    'topics.unarchive': async (request) => workspace.topics.unarchive(request),
    'topics.delete': async (request) => workspace.topics.remove(request),
    'notes.list': async (request) => workspace.notes.list(request),
    'notes.create': async (request) => workspace.notes.create(request),
    'notes.get': async (request) => workspace.notes.get(request),
    'notes.save': async (request) => workspace.notes.save(request),
    'notes.move': async (request) => workspace.notes.move(request),
    'notes.archive': async (request) => workspace.notes.archive(request),
    'notes.unarchive': async (request) => workspace.notes.unarchive(request),
    'notes.delete': async (request) => workspace.notes.remove(request),
    'notes.titles': async (request) => workspace.notes.titles(request),
    'notes.mentions': async (request) => workspace.notes.mentions(request),
    'images.save': async (request) => workspace.images.save(request),
    'images.read': async (request) => workspace.images.read(request),
    'search.query': async (request) => workspace.search.query(request),
    'search.opened': async (request) => {
      workspace.search.opened(request);
      return {};
    },
    'search.rebuild': async () => workspace.search.rebuild(),
    'materials.addText': (request) => materials.addText(request),
    'materials.decide': (request) => materials.decide(request),
    'materials.list': async (request) => materials.list(request),
    'materials.get': async (request) => materials.get(request),
    'materials.cancel': async (request) => materials.cancel(request),
    'materials.resume': async (request) => materials.resume(request),
    'materials.dismiss': async (request) => materials.dismiss(request),
    'materials.page': async (request) => materials.page(request),
    'materials.open': async (request) => materials.open(request),
    'materials.createCard': async (request) => materials.createCard(request),
    'materials.saveExcerpt': async (request) => materials.saveExcerpt(request),
    'materials.preview': async (request) => materials.preview(request),
    // Fase 14: páginas web, revisión, reconocimiento y correcciones.
    'materials.addUrl': (request) => materials.addUrl(request),
    'materials.snapshot': async (request) => materials.snapshot(request),
    'materials.review': async (request) => materials.review(request),
    'materials.ocrPage': async (request) => materials.ocrPage(request),
    'materials.reprocessPage': async (request) => materials.reprocessPage(request),
    'materials.excludePages': async (request) => materials.excludePages(request),
    'materials.resolveProblem': async (request) => materials.resolveProblem(request),
    'materials.correctText': async (request) => materials.correctText(request),
    'materials.updateDerived': async (request) => materials.updateDerived(request),
    'materials.resolveConflict': async (request) => materials.resolveConflict(request),
    'materials.sourceChange': async (request) => materials.sourceChange(request),
    // La IA (Fase 19): todo pasa por la compuerta; ningún canal toca tarjetas, repasos ni dominio.
    'ai.status': async () => ai.status(),
    'ai.testConnection': async (request) => ai.testConnection(request),
    'ai.deleteKey': async () => ai.deleteKey(),
    'ai.setCap': async (request) => ai.setCap(request),
    'ai.setLocalOnly': async (request) => ai.setLocalOnly(request),
    'ai.setFunctionState': async (request) => ai.setFunctionState(request),
    'ai.sentLog': async () => ai.sentLog(),
    'ai.permissions': async () => ai.permissions(),
    'ai.revokePermission': async (request) => ai.revokePermission(request),
    'ai.explain': async (request) => ai.explain(request),
    'ai.outcome': async (request) => ai.outcome(request),
    'ai.cancel': async (request) => ai.cancel(request),
    'inbox.list': async () => workspace.inbox.list(),
    'inbox.capture': async (request) => workspace.inbox.capture(request),
    'inbox.move': async (request) => workspace.inbox.move(request),
    'inbox.delete': async (request) => workspace.inbox.remove(request),
    'trash.list': async () => ({ items: workspace.trash.list() }),
    'trash.listOrganization': async () => workspace.trash.listOrganization(),
    'trash.restore': async (request) => workspace.trash.restore(request),
    'trash.empty': async () => workspace.trash.empty(),
    'activity.recent': async () => ({ items: workspace.activity.recent() }),
    'activity.undo': async (request) => workspace.activity.undo(request),
    'backups.list': async () => ({ backups: await backups() }),
    'backups.createNow': async () => {
      const created = await workspace.createBackup('manual');
      return { created: toBackup(created), backups: await backups() };
    },
    'backups.restore': async ({ backupId }) => {
      const { restored } = await workspace.restoreBackup(backupId);
      return { restoredFrom: { day: restored.day, time: restored.time }, backups: await backups() };
    },
    'backups.verifyData': async () => ({ differences: workspace.verifyData() }),
    'backups.repairData': async () => ({ differences: workspace.repairData() }),
    'window.zoom': async ({ direction }) => ({ factor: zoom ? zoom(direction) : 1 }),
    'window.flushed': async () => {
      // Cerrar la ventana equivale a pausar la sesión de estudio que esté en curso.
      try {
        workspace.study.pauseOpen(timer.stopAny());
      } finally {
        onFlushed?.();
      }
      return {};
    },
    'imports.choose': async ({ kind, folder }) => {
      const path =
        kind === 'remnote' && folder === true
          ? await dialogs.chooseFolder({ title: texts.imports.dialogRemnote })
          : await dialogs.chooseFile(
              kind === 'anki'
                ? {
                    title: texts.imports.dialogAnki,
                    filters: [{ name: texts.imports.filterAnki, extensions: ['apkg', 'colpkg'] }],
                  }
                : {
                    title: texts.imports.dialogRemnote,
                    filters: [
                      { name: texts.imports.filterRemnote, extensions: ['zip', 'md', 'markdown'] },
                    ],
                  },
            );
      if (path === null) {
        return { outcome: 'cancelled' as const };
      }
      return transfers.preview({ kind, path });
    },
    'imports.run': async (request) => transfers.run(request),
    'imports.cancel': async ({ previewId }) => {
      transfers.cancel(previewId);
      return { ok: true as const };
    },
    'imports.list': async () => ({ imports: transfers.list() }),
    'imports.saveRejected': async ({ importId }) => {
      const record = transfers.list().find((item) => item.importId === importId);
      if (!record) {
        throw new Error('No encontré esa importación');
      }
      const path = await dialogs.chooseSave({
        title: texts.imports.saveList,
        defaultName: texts.imports.rejectedFileName(record.fileName.replace(/\.[^.]*$/, '')),
        filters: [{ name: texts.imports.filterText, extensions: ['txt'] }],
      });
      if (path === null) {
        return { saved: false };
      }
      // Con su marca de UTF-8, así el Bloc de notas lo abre bien.
      writeFileSync(
        path,
        `${String.fromCharCode(0xfeff)}${transfers.rejectedList(importId)}`,
        'utf8',
      );
      return { saved: true };
    },
    'exports.all': async () => {
      const file = await dialogs.chooseSave({
        title: texts.exports.dialogSave,
        defaultName: texts.exports.fileName(
          formatShortDate(studyDayOf(clock.now())).replaceAll('/', '-'),
        ),
        filters: [{ name: texts.exports.filter, extensions: ['zip'] }],
      });
      if (file === null) {
        return { outcome: 'cancelled' as const };
      }
      const { counts, missing } = await transfers.exportAll({ file });
      return { outcome: 'exported' as const, fileName: basename(file), counts, missing };
    },
    'exports.canLoad': async () => ({ empty: transfers.isEmpty() }),
    'exports.choose': async () => {
      if (!transfers.isEmpty()) {
        return { outcome: 'problem' as const, problem: 'notEmpty' as const };
      }
      const path = await dialogs.chooseFile({
        title: texts.exports.dialogOpen,
        filters: [{ name: texts.exports.filter, extensions: ['zip'] }],
      });
      if (path === null) {
        return { outcome: 'cancelled' as const };
      }
      return transfers.previewExport({ path });
    },
    'exports.load': async (request) => transfers.loadExport(request),
    'backups.openFolder': async () => {
      const problem = await openFolder(workspace.copiesFolder());
      if (problem !== '') {
        throw new Error('No pude abrir la carpeta de copias');
      }
      return {};
    },
  };
}

type AnyHandlers = Readonly<Record<string, (request: never) => Promise<unknown>>>;

// Lo que corre del lado del principal al recibir un mensaje del puente: valida la petición
// antes de tocar nada y la respuesta antes de devolverla. Nunca registra el contenido.
// El registro de canales es el del contrato; la variante de prueba le suma los suyos.
// Los manejadores del puente de archivos (`materials.addFiles`): aparte de los demás, porque la
// ventana no tiene ese canal (solo lo usa el puente con las rutas de los archivos soltados).
export function createFileHandlers(materials: MaterialsService): FileHandlers {
  return { 'materials.addFiles': (request) => materials.addFiles(request) };
}

export async function handleMessage(
  handlers: AnyHandlers,
  channel: string,
  rawRequest: unknown,
  registry: Registry = channels,
): Promise<unknown> {
  const schema = Object.hasOwn(registry, channel) ? registry[channel] : undefined;
  const handler = Object.hasOwn(handlers, channel) ? handlers[channel] : undefined;
  if (!schema || !handler) {
    throw new Error('Canal desconocido');
  }
  const request = schema.request.safeParse(rawRequest);
  if (!request.success) {
    throw new Error(`Petición rechazada en el canal «${channel}»`);
  }
  const response = schema.response.safeParse(await handler(request.data as never));
  if (!response.success) {
    throw new Error(`Respuesta rechazada en el canal «${channel}»`);
  }
  return response.data;
}
