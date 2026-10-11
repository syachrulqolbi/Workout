import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type WriteBatch,
} from '@google-cloud/firestore';
import {
  clearWorkoutHistory,
  normalizeWorkoutData,
  type ExerciseRecord,
  type Meal,
  type WorkoutData,
  type WorkoutSession,
} from '@/lib/workout-data';
import {
  applyWorkoutDataChanges, type ClientDataScope, type CollectionMutation, type WorkoutCollectionChanges, type WorkoutDataChanges,
} from '@/lib/workout-patch';
import { isWorkoutDataSummary, summarizeWorkoutData, type WorkoutDataSummary } from '@/lib/workout-summary';

export const WORKOUT_STORAGE_VERSION = 2;
export type WorkoutDataScope = 'main' | 'history' | 'meals';

const COLLECTIONS = {
  workouts: 'workouts',
  exerciseHistory: 'exercise-history',
  meals: 'meals',
} as const;

type StoredItem = DocumentData & { _order?: number; _syncHash?: string };
type DestructiveOperationKind = 'reset-all' | 'clear-history';
type DestructiveOperation = { kind: DestructiveOperationKind; token: string };
export type WorkoutHistoryPage = {
  workouts: WorkoutSession[];
  exerciseHistory: ExerciseRecord[];
  nextBefore: string | null;
  hasMore: boolean;
};

export class RevisionConflictError extends Error {
  constructor() {
    super('Workout data changed in another browser or device.');
  }
}

function numericRevision(value: unknown) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function destructiveOperation(value: unknown): DestructiveOperation | null {
  if (!value || typeof value !== 'object') return null;
  const operation = value as Record<string, unknown>;
  const kind = operation.kind;
  const token = String(operation.token ?? '');
  return (kind === 'reset-all' || kind === 'clear-history') && token ? { kind, token } : null;
}

function itemDocumentId(item: { id: string }) {
  return createHash('sha256').update(item.id).digest('hex');
}

function storedItem(item: { id: string }, order: number, orderAffectsHash: boolean) {
  const _syncHash = createHash('sha256').update(JSON.stringify(orderAffectsHash ? { item, order } : item)).digest('hex');
  return { ...item, _order: order, _syncHash };
}

function decodedItem<T>(value: StoredItem): T {
  const item = { ...value };
  delete item._order;
  delete item._syncHash;
  return item as T;
}

function mainData(data: WorkoutData): WorkoutData {
  return { ...data, workouts: [], exerciseHistory: [], meals: [] };
}

async function readItems<T>(reference: DocumentReference, collectionName: string) {
  const snapshot = await reference.collection(collectionName).get();
  const datedCollection = collectionName === COLLECTIONS.workouts || collectionName === COLLECTIONS.exerciseHistory;
  return snapshot.docs
    .map((document) => ({
      order: Number(document.data()._order ?? 0),
      date: datedCollection ? new Date(String(document.data().date ?? 0)).getTime() : 0,
      item: decodedItem<T>(document.data()),
    }))
    .sort((left, right) => datedCollection && left.date !== right.date ? right.date - left.date : left.order - right.order)
    .map(({ item }) => item);
}

function decodedDatedItems<T>(documents: Array<{ data(): DocumentData }>) {
  return documents.map((document) => decodedItem<T>(document.data()));
}

export async function readWorkoutHistoryPage(reference: DocumentReference, before?: string, limit = 100): Promise<WorkoutHistoryPage> {
  const safeLimit = Math.min(250, Math.max(20, Math.round(limit)));
  let workoutQuery = reference.collection(COLLECTIONS.workouts).orderBy('date', 'desc');
  if (before) workoutQuery = workoutQuery.where('date', '<', before);
  const workoutSnapshot = await workoutQuery.limit(safeLimit + 1).get();
  const hasMore = workoutSnapshot.docs.length > safeLimit;
  const workoutDocuments = workoutSnapshot.docs.slice(0, safeLimit);
  const workouts = decodedDatedItems<WorkoutSession>(workoutDocuments);
  const nextBefore = workouts.at(-1)?.date ?? null;
  if (!nextBefore) return { workouts: [], exerciseHistory: [], nextBefore: null, hasMore: false };

  let historyQuery = reference.collection(COLLECTIONS.exerciseHistory).where('date', '>=', nextBefore).orderBy('date', 'desc');
  if (before) historyQuery = historyQuery.where('date', '<', before);
  const historySnapshot = await historyQuery.get();
  return {
    workouts,
    exerciseHistory: decodedDatedItems<ExerciseRecord>(historySnapshot.docs),
    nextBefore,
    hasMore,
  };
}

function storedSummary(value: unknown, data: WorkoutData): WorkoutDataSummary {
  return isWorkoutDataSummary(value) ? value : summarizeWorkoutData(data);
}

function summaryAfterChanges(summary: WorkoutDataSummary, data: WorkoutData, scopes: ClientDataScope[]) {
  const selected = new Set(scopes);
  const next = { ...summary, activeWorkout: Boolean(data.activeWorkout) };
  if (selected.has('history')) {
    const history = summarizeWorkoutData(data);
    next.workoutCount = history.workoutCount;
    next.strengthRecordCount = history.strengthRecordCount;
    next.cardioRecordCount = history.cardioRecordCount;
  }
  if (selected.has('meals')) next.mealCount = data.meals.length;
  return next;
}

async function replaceItems(reference: DocumentReference, collectionName: string, items: Array<{ id: string }>) {
  const collection = reference.collection(collectionName);
  const current = await collection.select('_syncHash').get();
  const wantedIds = new Set(items.map(itemDocumentId));
  const writer = reference.firestore.bulkWriter();
  const orderAffectsHash = collectionName === COLLECTIONS.meals;
  for (const document of current.docs) {
    if (!wantedIds.has(document.id)) void writer.delete(document.ref);
  }
  items.forEach((item, order) => { void writer.set(collection.doc(itemDocumentId(item)), storedItem(item, order, orderAffectsHash)); });
  await writer.close();
}

async function migrateEmbeddedData(reference: DocumentReference, snapshot: DocumentSnapshot, data: WorkoutData) {
  await Promise.all([
    replaceItems(reference, COLLECTIONS.workouts, data.workouts),
    replaceItems(reference, COLLECTIONS.exerciseHistory, data.exerciseHistory),
    replaceItems(reference, COLLECTIONS.meals, data.meals),
  ]);
  await reference.set({
    data: mainData(data),
    storageVersion: WORKOUT_STORAGE_VERSION,
    revision: numericRevision(snapshot.data()?.revision),
    summary: summarizeWorkoutData(data),
  }, { merge: true });
}

export async function readWorkoutDataDocument(reference: DocumentReference, snapshot?: DocumentSnapshot, historyLimit?: number) {
  let document = snapshot ?? await reference.get();
  if (!document.exists) return null;
  const stored = document.data() ?? {};
  const revision = numericRevision(stored.revision);

  if (Number(stored.storageVersion) !== WORKOUT_STORAGE_VERSION) {
    const data = normalizeWorkoutData(stored.data);
    await migrateEmbeddedData(reference, document, data);
    if (!historyLimit) return { data, revision, summary: summarizeWorkoutData(data) };
    document = await reference.get();
  }

  const currentStored = document.data() ?? {};
  const operation = destructiveOperation(currentStored.destructiveOperation);
  const hideHistory = operation?.kind === 'reset-all' || operation?.kind === 'clear-history';
  const hideMeals = operation?.kind === 'reset-all';
  const historyPage = historyLimit && !hideHistory ? await readWorkoutHistoryPage(reference, undefined, historyLimit) : null;
  const [workouts, exerciseHistory, meals] = await Promise.all([
    hideHistory ? Promise.resolve([]) : historyPage ? Promise.resolve(historyPage.workouts) : readItems<WorkoutSession>(reference, COLLECTIONS.workouts),
    hideHistory ? Promise.resolve([]) : historyPage ? Promise.resolve(historyPage.exerciseHistory) : readItems<ExerciseRecord>(reference, COLLECTIONS.exerciseHistory),
    hideMeals ? Promise.resolve([]) : readItems<Meal>(reference, COLLECTIONS.meals),
  ]);
  const data = normalizeWorkoutData({ ...((currentStored.data && typeof currentStored.data === 'object') ? currentStored.data : {}), workouts, exerciseHistory, meals });
  return { data, revision: numericRevision(currentStored.revision), summary: storedSummary(currentStored.summary, data), historyPage };
}

export async function readWorkoutMainDocument(reference: DocumentReference, snapshot?: DocumentSnapshot) {
  let document = snapshot ?? await reference.get();
  if (!document.exists) return null;
  let stored = document.data() ?? {};
  if (Number(stored.storageVersion) !== WORKOUT_STORAGE_VERSION) {
    const data = normalizeWorkoutData(stored.data);
    await migrateEmbeddedData(reference, document, data);
    document = await reference.get();
    stored = document.data() ?? {};
  }
  const data = normalizeWorkoutData(stored.data);
  return { data, revision: numericRevision(stored.revision), summary: storedSummary(stored.summary, data) };
}

async function addCollectionDiff(
  batch: WriteBatch,
  reference: DocumentReference,
  collectionName: string,
  items: Array<{ id: string }>,
) {
  const collection = reference.collection(collectionName);
  const current = await collection.select('_syncHash').get();
  const existing = new Map(current.docs.map((document) => [document.id, document]));
  const wanted = new Set<string>();
  const orderAffectsHash = collectionName === COLLECTIONS.meals;
  let writes = 0;

  items.forEach((item, order) => {
    const id = itemDocumentId(item);
    const value = storedItem(item, order, orderAffectsHash);
    wanted.add(id);
    if (existing.get(id)?.data()._syncHash !== value._syncHash) {
      batch.set(collection.doc(id), value);
      writes += 1;
    }
  });
  for (const document of current.docs) {
    if (!wanted.has(document.id)) {
      batch.delete(document.ref);
      writes += 1;
    }
  }
  return writes;
}

async function addCollectionMutation<T extends { id: string }>(
  batch: WriteBatch,
  reference: DocumentReference,
  collectionName: string,
  mutation: CollectionMutation<T> | undefined,
  summary: WorkoutDataSummary,
) {
  if (!mutation) return 0;
  const collection = reference.collection(collectionName);
  const documentIds = [...new Set([...mutation.upserts.map(({ item }) => itemDocumentId(item)), ...mutation.deleteIds.map((id) => itemDocumentId({ id }))])];
  const snapshots = documentIds.length ? await reference.firestore.getAll(...documentIds.map((id) => collection.doc(id))) : [];
  const existing = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const orderAffectsHash = collectionName === COLLECTIONS.meals;
  let writes = 0;

  const adjustExerciseCount = (value: DocumentData, amount: number) => {
    const field = value.type === 'cardio' ? 'cardioRecordCount' : 'strengthRecordCount';
    summary[field] = Math.max(0, summary[field] + amount);
  };

  for (const { item, order } of mutation.upserts) {
    const id = itemDocumentId(item);
    const previous = existing.get(id);
    const previousData = previous?.exists ? previous.data() : undefined;
    const value = storedItem(item, order, orderAffectsHash);
    if (previousData?._syncHash !== value._syncHash) {
      batch.set(collection.doc(id), value);
      writes += 1;
    }
    if (!previousData) {
      if (collectionName === COLLECTIONS.workouts) summary.workoutCount += 1;
      if (collectionName === COLLECTIONS.meals) summary.mealCount += 1;
      if (collectionName === COLLECTIONS.exerciseHistory) adjustExerciseCount(item, 1);
    } else if (collectionName === COLLECTIONS.exerciseHistory && previousData.type !== (item as DocumentData).type) {
      adjustExerciseCount(previousData, -1);
      adjustExerciseCount(item, 1);
    }
  }

  for (const rawId of mutation.deleteIds) {
    const id = itemDocumentId({ id: rawId });
    const previous = existing.get(id);
    const previousData = previous?.exists ? previous.data() : undefined;
    if (!previousData) continue;
    batch.delete(collection.doc(id));
    writes += 1;
    if (collectionName === COLLECTIONS.workouts) summary.workoutCount = Math.max(0, summary.workoutCount - 1);
    if (collectionName === COLLECTIONS.meals) summary.mealCount = Math.max(0, summary.mealCount - 1);
    if (collectionName === COLLECTIONS.exerciseHistory) adjustExerciseCount(previousData, -1);
  }
  return writes;
}

export async function saveWorkoutDataChangesDocument(
  reference: DocumentReference,
  changes: WorkoutDataChanges,
  collections: WorkoutCollectionChanges | undefined,
  baseRevision: number,
  clientScopes: ClientDataScope[],
  serverFields: DocumentData,
) {
  let snapshot = await reference.get();
  if (!snapshot.exists) throw new RevisionConflictError();
  if (Number(snapshot.data()?.storageVersion) !== WORKOUT_STORAGE_VERSION) {
    const embedded = normalizeWorkoutData(snapshot.data()?.data);
    await migrateEmbeddedData(reference, snapshot, embedded);
    snapshot = await reference.get();
  }

  const stored = snapshot.data() ?? {};
  if (destructiveOperation(stored.destructiveOperation)) throw new RevisionConflictError();
  const currentRevision = numericRevision(stored.revision);
  if (currentRevision !== baseRevision || !snapshot.updateTime) throw new RevisionConflictError();

  const currentMain = normalizeWorkoutData(stored.data);
  const mainScopes = collections ? clientScopes.filter((scope) => scope !== 'history' && scope !== 'meals') : clientScopes;
  const data = applyWorkoutDataChanges(currentMain, changes, mainScopes);
  const selected = new Set(clientScopes);
  const batch = reference.firestore.batch();
  let writes = 1;
  const summary = { ...storedSummary(stored.summary, currentMain), activeWorkout: Boolean(data.activeWorkout) };
  if (collections) {
    writes += await addCollectionMutation(batch, reference, COLLECTIONS.workouts, collections.workouts, summary);
    writes += await addCollectionMutation(batch, reference, COLLECTIONS.exerciseHistory, collections.exerciseHistory, summary);
    writes += await addCollectionMutation(batch, reference, COLLECTIONS.meals, collections.meals, summary);
  } else if (selected.has('history')) {
    writes += await addCollectionDiff(batch, reference, COLLECTIONS.workouts, data.workouts);
    writes += await addCollectionDiff(batch, reference, COLLECTIONS.exerciseHistory, data.exerciseHistory);
  }
  if (!collections && selected.has('meals')) writes += await addCollectionDiff(batch, reference, COLLECTIONS.meals, data.meals);
  if (writes > 500) throw new Error('This save changes too many records at once. Please retry in smaller steps.');

  const revision = currentRevision + 1;
  const nextSummary = collections ? summary : summaryAfterChanges(storedSummary(stored.summary, currentMain), data, clientScopes);
  batch.update(reference, {
    ...serverFields,
    data: mainData(data),
    storageVersion: WORKOUT_STORAGE_VERSION,
    revision,
    summary: nextSummary,
    updatedAt: FieldValue.serverTimestamp(),
    lastActivityAt: FieldValue.serverTimestamp(),
  }, { lastUpdateTime: snapshot.updateTime });

  try {
    await batch.commit();
  } catch (cause) {
    if (isPreconditionFailure(cause)) throw new RevisionConflictError();
    throw cause;
  }
  return revision;
}

function isPreconditionFailure(cause: unknown) {
  return Boolean(cause && typeof cause === 'object' && 'code' in cause && (cause.code === 9 || cause.code === 10));
}

export async function saveWorkoutDataDocument(
  reference: DocumentReference,
  data: WorkoutData,
  baseRevision: number,
  scopes: WorkoutDataScope[],
  serverFields: DocumentData,
) {
  let snapshot = await reference.get();
  if (!snapshot.exists) throw new RevisionConflictError();
  if (Number(snapshot.data()?.storageVersion) !== WORKOUT_STORAGE_VERSION) {
    const current = normalizeWorkoutData(snapshot.data()?.data);
    await migrateEmbeddedData(reference, snapshot, current);
    snapshot = await reference.get();
  }

  if (destructiveOperation(snapshot.data()?.destructiveOperation)) throw new RevisionConflictError();
  const currentRevision = numericRevision(snapshot.data()?.revision);
  if (currentRevision !== baseRevision || !snapshot.updateTime) throw new RevisionConflictError();

  const requestedScopes = new Set(scopes.length ? scopes : ['main', 'history', 'meals'] satisfies WorkoutDataScope[]);
  const batch = reference.firestore.batch();
  let writes = 1;
  if (requestedScopes.has('history')) {
    writes += await addCollectionDiff(batch, reference, COLLECTIONS.workouts, data.workouts);
    writes += await addCollectionDiff(batch, reference, COLLECTIONS.exerciseHistory, data.exerciseHistory);
  }
  if (requestedScopes.has('meals')) writes += await addCollectionDiff(batch, reference, COLLECTIONS.meals, data.meals);
  if (writes > 500) throw new Error('This save changes too many records at once. Please retry in smaller steps.');

  const revision = currentRevision + 1;
  batch.update(reference, {
    ...serverFields,
    data: mainData(data),
    storageVersion: WORKOUT_STORAGE_VERSION,
    revision,
    summary: summarizeWorkoutData(data),
    updatedAt: FieldValue.serverTimestamp(),
    lastActivityAt: FieldValue.serverTimestamp(),
  }, { lastUpdateTime: snapshot.updateTime });

  try {
    await batch.commit();
  } catch (cause) {
    if (isPreconditionFailure(cause)) throw new RevisionConflictError();
    throw cause;
  }
  return revision;
}

async function reserveDestructiveOperation(
  reference: DocumentReference,
  kind: DestructiveOperationKind,
  data: WorkoutData,
  summary: WorkoutDataSummary,
  serverFields: DocumentData,
  expectedRevision?: number,
) {
  const requestedToken = randomUUID();
  return reference.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return null;
    const stored = snapshot.data() ?? {};
    const currentRevision = numericRevision(stored.revision);
    const pending = destructiveOperation(stored.destructiveOperation);
    if (pending) {
      const canResume = pending.kind === kind && (expectedRevision === undefined || expectedRevision === currentRevision || expectedRevision === currentRevision - 1);
      if (!canResume) throw new RevisionConflictError();
      return { revision: currentRevision, operation: pending };
    }
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) throw new RevisionConflictError();
    const revision = currentRevision + 1;
    const operation = { kind, token: requestedToken };
    transaction.update(reference, {
      ...serverFields,
      data: mainData(data),
      storageVersion: WORKOUT_STORAGE_VERSION,
      revision,
      summary,
      destructiveOperation: { ...operation, startedAt: Timestamp.now() },
      updatedAt: FieldValue.serverTimestamp(),
      lastActivityAt: FieldValue.serverTimestamp(),
    });
    return { revision, operation };
  });
}

async function finishDestructiveOperation(reference: DocumentReference, operation: DestructiveOperation) {
  await reference.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) return;
    const pending = destructiveOperation(snapshot.data()?.destructiveOperation);
    if (!pending || pending.token !== operation.token || pending.kind !== operation.kind) throw new RevisionConflictError();
    transaction.update(reference, { destructiveOperation: FieldValue.delete() });
  });
}

export async function replaceWorkoutDataDocument(
  reference: DocumentReference,
  data: WorkoutData,
  baseRevision: number,
  serverFields: DocumentData,
) {
  const reserved = await reserveDestructiveOperation(reference, 'reset-all', data, summarizeWorkoutData(data), serverFields, baseRevision);
  if (!reserved) throw new RevisionConflictError();
  await Promise.all([
    replaceItems(reference, COLLECTIONS.workouts, data.workouts),
    replaceItems(reference, COLLECTIONS.exerciseHistory, data.exerciseHistory),
    replaceItems(reference, COLLECTIONS.meals, data.meals),
  ]);
  await finishDestructiveOperation(reference, reserved.operation);
  return reserved.revision;
}

export async function clearWorkoutHistoryDocument(reference: DocumentReference) {
  const current = await readWorkoutMainDocument(reference);
  if (!current) return null;
  const data = clearWorkoutHistory(current.data);
  const summary = { ...current.summary, workoutCount: 0, strengthRecordCount: 0, cardioRecordCount: 0, activeWorkout: false };
  const reserved = await reserveDestructiveOperation(reference, 'clear-history', data, summary, {
    historyDeletedAt: FieldValue.serverTimestamp(),
  });
  if (!reserved) return null;
  await Promise.all([
    replaceItems(reference, COLLECTIONS.workouts, []),
    replaceItems(reference, COLLECTIONS.exerciseHistory, []),
  ]);
  await finishDestructiveOperation(reference, reserved.operation);
  return { data, revision: reserved.revision };
}

export async function recursivelyDeleteWorkoutUser(reference: DocumentReference) {
  await reference.firestore.recursiveDelete(reference);
}
