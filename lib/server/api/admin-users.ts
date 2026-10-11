import { FieldValue, Timestamp } from '@google-cloud/firestore';
import type { NextRequest } from 'next/server';
import { apiError, apiFailure, apiJson } from '@/lib/server/api-response';
import { requireAdmin, requireUser } from '@/lib/server/auth';
import { getFirestore, workoutAuditCollection, workoutUsersCollection } from '@/lib/server/firestore';
import { normalizeWorkoutData } from '@/lib/workout-data';
import { clearWorkoutHistoryDocument } from '@/lib/server/workout-repository';
import { isWorkoutDataSummary, summarizeWorkoutData, type WorkoutDataSummary } from '@/lib/workout-summary';

function iso(value: unknown) { return value instanceof Timestamp ? value.toDate().toISOString() : null; }

async function getAdmin(request: NextRequest) {
  const user = await requireUser(request);
  requireAdmin(user);
  return user;
}

export async function getAdminUsers(request: NextRequest) {
  try {
    await getAdmin(request);
    const database = getFirestore();
    const usersCollection = database.collection(workoutUsersCollection);
    const [snapshots, countSnapshot] = await Promise.all([
      usersCollection.orderBy('lastActivityAt', 'desc')
        .select('email', 'displayName', 'role', 'lastActivityAt', 'updatedAt', 'summary').limit(500).get(),
      usersCollection.count().get(),
    ]);
    const missingSummary = snapshots.docs.filter((document) => !isWorkoutDataSummary(document.data().summary));
    const fallbackSnapshots = missingSummary.length ? await database.getAll(...missingSummary.map((document) => document.ref)) : [];
    const fallbackSummaries = new Map<string, WorkoutDataSummary>(fallbackSnapshots.map((document) => {
      const data = normalizeWorkoutData(document.data()?.data);
      return [document.id, summarizeWorkoutData(data)];
    }));
    const users = snapshots.docs.map((document) => {
      const stored = document.data();
      const summary = isWorkoutDataSummary(stored.summary) ? stored.summary : fallbackSummaries.get(document.id)
        ?? { workoutCount: 0, strengthRecordCount: 0, cardioRecordCount: 0, mealCount: 0, activeWorkout: false };
      return {
        uid: document.id, email: stored.email ?? '', displayName: stored.displayName ?? '', role: stored.role ?? 'user',
        lastActivityAt: iso(stored.lastActivityAt), updatedAt: iso(stored.updatedAt),
        ...summary,
      };
    });
    const totalCount = countSnapshot.data().count;
    return apiJson({ users, count: users.length, totalCount, truncated: totalCount > users.length });
  } catch (cause) {
    return apiFailure(cause, 'Admin list failed', 'Could not load users.');
  }
}

export async function runAdminAction(request: NextRequest) {
  try {
    const admin = await getAdmin(request);
    const body = await request.json().catch(() => null) as { action?: string; confirmation?: string } | null;
    const database = getFirestore();

    if (body?.action === 'delete-own-history') {
      const target = database.collection(workoutUsersCollection).doc(admin.uid);
      const cleared = await clearWorkoutHistoryDocument(target);
      if (!cleared) return apiError('User not found.', 404);
      await database.collection(workoutAuditCollection).add({ action: 'delete-own-history', actorUid: admin.uid, actorEmail: admin.email, targetUid: admin.uid, createdAt: FieldValue.serverTimestamp() });
      return apiJson({ deleted: 1 });
    }

    if (body?.action === 'delete-all-history') {
      const snapshots = await database.collection(workoutUsersCollection).get();
      if (body.confirmation !== `DELETE ALL HISTORY ${snapshots.size}`) return apiError(`Type DELETE ALL HISTORY ${snapshots.size} to confirm.`, 422);
      for (let index = 0; index < snapshots.docs.length; index += 10) {
        await Promise.all(snapshots.docs.slice(index, index + 10).map((document) => clearWorkoutHistoryDocument(document.ref)));
      }
      await database.collection(workoutAuditCollection).add({ action: 'delete-all-history', actorUid: admin.uid, actorEmail: admin.email, affectedUsers: snapshots.size, createdAt: FieldValue.serverTimestamp() });
      return apiJson({ deleted: snapshots.size });
    }
    return apiError('Unknown admin action.', 400);
  } catch (cause) {
    return apiFailure(cause, 'Admin action failed', 'Admin action failed.');
  }
}
