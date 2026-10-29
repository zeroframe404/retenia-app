import type { z } from 'zod';
import { activityRecentResponse, activityUndoRequest, activityUndoResponse } from './activity';
import { appInfoRequest, appInfoResponse } from './app';
import { appearanceGetRequest, appearanceResponse, appearanceSetRequest } from './appearance';
import {
  backupsCreateResponse,
  backupsListResponse,
  backupsRestoreRequest,
  backupsRestoreResponse,
  differencesResponse,
  openFolderResponse,
} from './backups';
import {
  cardHistorySchema,
  cardIdRequest,
  cardSchema,
  cardsCreateRequest,
  cardsDeleteResponse,
  cardsEditRequest,
  cardsListRequest,
  cardsListResponse,
  cardsReviewRequest,
} from './cards';
import { noRequest } from './common';
import type { demoChannels } from './demo';
import type { labChannels } from './lab';
import {
  imagesReadRequest,
  imagesReadResponse,
  imagesSaveRequest,
  imagesSaveResponse,
  noteIdRequest,
  noteSchema,
  noteSummarySchema,
  notesCreateRequest,
  notesDeleteResponse,
  notesGetResponse,
  notesListRequest,
  notesListResponse,
  notesMentionsResponse,
  notesMoveRequest,
  notesSaveRequest,
  notesSaveResponse,
  notesTitlesRequest,
  notesTitlesResponse,
} from './notes';
import {
  inboxCaptureRequest,
  inboxCaptureResponse,
  inboxDeleteResponse,
  inboxIdRequest,
  inboxListRequest,
  inboxListResponse,
  inboxMoveRequest,
  subjectSchema,
  subjectsActivateRequest,
  subjectsCreateExampleRequest,
  subjectsCreateRequest,
  subjectsListRequest,
  subjectsListResponse,
  topicIdRequest,
  topicSchema,
  topicsCreateRequest,
  topicsDeleteResponse,
  topicsListRequest,
  topicsListResponse,
  topicsRenameRequest,
} from './organization';
import { pingRequest, pingResponse } from './ping';
import {
  trashEmptyResponse,
  trashListResponse,
  trashOrganizationResponse,
  trashRestoreRequest,
  trashRestoreResponse,
} from './trash';
import { flushedRequest, flushedResponse, zoomRequest, zoomResponse } from './window';

// El contrato del puente: por cada canal, el esquema de la petición y el de la respuesta.
// El puente y el proceso principal se arman recorriendo este mapa; no hay listas a mano.
// Los canales de demostración (`demo.*`) no están acá: los suma solo la variante de prueba.
export const channels = {
  ping: { request: pingRequest, response: pingResponse },
  'app.info': { request: appInfoRequest, response: appInfoResponse },
  'appearance.get': { request: appearanceGetRequest, response: appearanceResponse },
  'appearance.set': { request: appearanceSetRequest, response: appearanceResponse },
  'cards.create': { request: cardsCreateRequest, response: cardSchema },
  'cards.list': { request: cardsListRequest, response: cardsListResponse },
  'cards.review': { request: cardsReviewRequest, response: cardSchema },
  'cards.edit': { request: cardsEditRequest, response: cardSchema },
  'cards.history': { request: cardIdRequest, response: cardHistorySchema },
  'cards.delete': { request: cardIdRequest, response: cardsDeleteResponse },
  'subjects.list': { request: subjectsListRequest, response: subjectsListResponse },
  'subjects.create': { request: subjectsCreateRequest, response: subjectSchema },
  'subjects.activate': { request: subjectsActivateRequest, response: subjectsListResponse },
  'subjects.createExample': { request: subjectsCreateExampleRequest, response: subjectSchema },
  'topics.list': { request: topicsListRequest, response: topicsListResponse },
  'topics.create': { request: topicsCreateRequest, response: topicSchema },
  'topics.rename': { request: topicsRenameRequest, response: topicSchema },
  'topics.archive': { request: topicIdRequest, response: topicSchema },
  'topics.unarchive': { request: topicIdRequest, response: topicSchema },
  'topics.delete': { request: topicIdRequest, response: topicsDeleteResponse },
  'notes.list': { request: notesListRequest, response: notesListResponse },
  'notes.create': { request: notesCreateRequest, response: noteSchema },
  'notes.get': { request: noteIdRequest, response: notesGetResponse },
  'notes.save': { request: notesSaveRequest, response: notesSaveResponse },
  'notes.move': { request: notesMoveRequest, response: noteSummarySchema },
  'notes.archive': { request: noteIdRequest, response: noteSummarySchema },
  'notes.unarchive': { request: noteIdRequest, response: noteSummarySchema },
  'notes.delete': { request: noteIdRequest, response: notesDeleteResponse },
  'notes.titles': { request: notesTitlesRequest, response: notesTitlesResponse },
  'notes.mentions': { request: noteIdRequest, response: notesMentionsResponse },
  'images.save': { request: imagesSaveRequest, response: imagesSaveResponse },
  'images.read': { request: imagesReadRequest, response: imagesReadResponse },
  'inbox.list': { request: inboxListRequest, response: inboxListResponse },
  'inbox.capture': { request: inboxCaptureRequest, response: inboxCaptureResponse },
  'inbox.move': { request: inboxMoveRequest, response: noteSummarySchema },
  'inbox.delete': { request: inboxIdRequest, response: inboxDeleteResponse },
  'trash.list': { request: noRequest, response: trashListResponse },
  'trash.listOrganization': { request: noRequest, response: trashOrganizationResponse },
  'trash.restore': { request: trashRestoreRequest, response: trashRestoreResponse },
  'trash.empty': { request: noRequest, response: trashEmptyResponse },
  'activity.recent': { request: noRequest, response: activityRecentResponse },
  'activity.undo': { request: activityUndoRequest, response: activityUndoResponse },
  'backups.list': { request: noRequest, response: backupsListResponse },
  'backups.createNow': { request: noRequest, response: backupsCreateResponse },
  'backups.restore': { request: backupsRestoreRequest, response: backupsRestoreResponse },
  'backups.verifyData': { request: noRequest, response: differencesResponse },
  'backups.repairData': { request: noRequest, response: differencesResponse },
  'backups.openFolder': { request: noRequest, response: openFolderResponse },
  'window.zoom': { request: zoomRequest, response: zoomResponse },
  'window.flushed': { request: flushedRequest, response: flushedResponse },
};

export type Registry = Readonly<Record<string, { request: z.ZodType; response: z.ZodType }>>;

type Channels = typeof channels;
export type ChannelName = keyof Channels;
type DemoRegistry = ReturnType<typeof demoChannels>;
type LabRegistry = ReturnType<typeof labChannels>;

// Lo que ve el manejador del principal (la petición ya validada) y lo que devuelve (antes
// de validar la respuesta).
export type HandlerRequest<K extends ChannelName> = z.output<Channels[K]['request']>;
export type HandlerResponse<K extends ChannelName> = z.input<Channels[K]['response']>;

export type ApiOf<R extends Registry> = {
  [K in keyof R]: (request: z.input<R[K]['request']>) => Promise<z.output<R[K]['response']>>;
};
export type ReteniaApi = ApiOf<Channels> & ApiOf<DemoRegistry> & ApiOf<LabRegistry>;
