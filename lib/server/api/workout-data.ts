import { FieldValue } from '@google-cloud/firestore';
import type { NextRequest } from 'next/server';
import { apiError, apiFailure, apiJson } from '@/lib/server/api-response';
import { ADMIN_EMAIL, requireUser } from '@/lib/server/auth';
import { getFirestore, workoutUsersCollection } from '@/lib/server/firestore';
import { createDefaultWorkoutData, createEmptyWorkoutData, isWorkoutData, normalizeWorkoutData } from '@/lib/workout-data';
import { isClientDataScope, isWorkoutCollectionChanges, isWorkoutDataChanges, type ClientDataScope } from '@/lib/workout-patch';
import {
  RevisionConflictError,
  WORKOUT_STORAGE_VERSION,
  readWorkoutDataDocument,
  readWorkoutMainDocument,
  replaceWorkoutDataDocument,
  saveWorkoutDataChangesDocument,
  saveWorkoutDataDocument,
  type WorkoutDataScope,
} from '@/lib/server/workout-repository';
import { WORKOUT_SCHEMA_VERSION } from '@/lib/workout-schema.mjs';
import { summarizeWorkoutData } from '@/lib/workout-summary';

const MAX_REQUEST_BYTES = 4_000_000;

function profile(user: Awaited<ReturnType<typeof requireUser>>) {
  return {
    uid: user.uid, email: user.email ?? '', displayName: user.name ?? '', photoURL: user.picture ?? '',
    role: user.email?.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user',
  };
}

export async function getWorkoutData(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const database = getFirestore();
    const userRef = database.collection(workoutUsersCollection).doc(user.uid);
    let userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      await database.runTransaction(async (transaction) => {
        const current = await transaction.get(userRef);
        if (current.exists) return;
        const initialData = createDefaultWorkoutData();
        transaction.set(userRef, {
          ...profile(user), data: initialData, summary: summarizeWorkoutData(initialData), schemaVersion: WORKOUT_SCHEMA_VERSION,
          storageVersion: 1, revision: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          lastActivityAt: FieldValue.serverTimestamp(),
        });
      });
      userSnapshot = await userRef.get();
    }

    const stored = await readWorkoutDataDocument(userRef, userSnapshot, 100);
    if (!stored) return apiError('Workout account could not be created.', 503);
    await userRef.set({
      ...profile(user), schemaVersion: WORKOUT_SCHEMA_VERSION,
      storageVersion: WORKOUT_STORAGE_VERSION, lastActivityAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return apiJson({
      data: stored.data, revision: stored.revision, summary: stored.summary,
      historyPage: stored.historyPage ? { nextBefore: stored.historyPage.nextBefore, hasMore: stored.historyPage.hasMore } : null,
      isAdmin: user.email?.toLowerCase() === ADMIN_EMAIL,
    });
  } catch (cause) {
    return apiFailure(cause, 'Authenticated data request failed', 'Database is temporarily unavailable.');
  }
}

export async function putWorkoutData(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => null) as { changes?: unknown; collections?: unknown; data?: unknown; baseRevision?: unknown; scopes?: unknown } | null;
    const baseRevision = Number(body?.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 0) return apiError('A valid data revision is required.', 422);
    const reference = getFirestore().collection(workoutUsersCollection).doc(user.uid);
    const clientScopes = Array.isArray(body?.scopes)
      ? [...new Set(body.scopes.filter(isClientDataScope))] as ClientDataScope[]
      : [];
    const hasScopedChanges = body?.changes !== undefined;
    const requestData = hasScopedChanges ? { changes: body?.changes, collections: body?.collections } : body?.data;
    if (Buffer.byteLength(JSON.stringify(requestData ?? null), 'utf8') > MAX_REQUEST_BYTES) return apiError('Workout data is too large.', 413);

    if (hasScopedChanges) {
      const collections = body?.collections === undefined ? undefined : body.collections;
      if (collections !== undefined && !isWorkoutCollectionChanges(collections, clientScopes)) return apiError('Workout collection changes are invalid.', 422);
      if (!isWorkoutDataChanges(body?.changes, clientScopes, collections)) return apiError('Workout changes are invalid.', 422);
      try {
        const revision = await saveWorkoutDataChangesDocument(reference, body.changes, collections, baseRevision, clientScopes, {
          ...profile(user), schemaVersion: WORKOUT_SCHEMA_VERSION,
        });
        return apiJson({ saved: true, revision });
      } catch (cause) {
        if (!(cause instanceof RevisionConflictError)) throw cause;
        const latest = await readWorkoutDataDocument(reference);
        return apiJson({ error: cause.message, data: latest?.data, revision: latest?.revision }, { status: 409 });
      }
    } else {
      if (!isWorkoutData(body?.data)) return apiError('Workout data is invalid.', 422);
      const data = normalizeWorkoutData(body.data);
      const scopes: WorkoutDataScope[] = Array.isArray(body?.scopes)
        ? [...new Set(body.scopes.filter((scope): scope is WorkoutDataScope => scope === 'main' || scope === 'history' || scope === 'meals'))]
        : [];
      try {
        const revision = await saveWorkoutDataDocument(reference, data, baseRevision, scopes, {
          ...profile(user), schemaVersion: WORKOUT_SCHEMA_VERSION,
        });
        return apiJson({ saved: true, revision });
      } catch (cause) {
        if (!(cause instanceof RevisionConflictError)) throw cause;
        const latest = await readWorkoutDataDocument(reference);
        return apiJson({ error: cause.message, data: latest?.data, revision: latest?.revision }, { status: 409 });
      }
    }
  } catch (cause) {
    return apiFailure(cause, 'Authenticated data request failed', 'Database is temporarily unavailable.');
  }
}

export async function deleteWorkoutData(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => null) as { baseRevision?: unknown } | null;
    const reference = getFirestore().collection(workoutUsersCollection).doc(user.uid);
    const current = await readWorkoutMainDocument(reference);
    if (!current) return apiError('Workout account was not found.', 404);
    const requestedRevision = Number(body?.baseRevision);
    const baseRevision = Number.isInteger(requestedRevision) && requestedRevision >= 0 ? requestedRevision : current.revision;
    const data = createEmptyWorkoutData();
    if (baseRevision !== current.revision) {
      const latest = await readWorkoutDataDocument(reference);
      return apiJson({ error: 'Workout data changed in another browser or device.', data: latest?.data, revision: latest?.revision }, { status: 409 });
    }
    try {
      const revision = await replaceWorkoutDataDocument(reference, data, baseRevision, {
        ...profile(user), schemaVersion: WORKOUT_SCHEMA_VERSION, resetAt: FieldValue.serverTimestamp(),
      });
      return apiJson({ reset: true, data, revision });
    } catch (cause) {
      if (!(cause instanceof RevisionConflictError)) throw cause;
      const latest = await readWorkoutDataDocument(reference);
      return apiJson({ error: cause.message, data: latest?.data, revision: latest?.revision }, { status: 409 });
    }
  } catch (cause) {
    return apiFailure(cause, 'Authenticated data request failed', 'Database is temporarily unavailable.');
  }
}
