import { Timestamp } from '@google-cloud/firestore';
import type { NextRequest } from 'next/server';
import { apiError, apiJson } from '@/lib/server/api-response';
import { getFirestore, workoutAuditCollection, workoutUsersCollection } from '@/lib/server/firestore';
import { verifySchedulerRequest } from '@/lib/server/scheduler-auth';
import { recursivelyDeleteWorkoutUser } from '@/lib/server/workout-repository';

async function verifyScheduler(request: NextRequest) {
  const audience = process.env.CLEANUP_AUDIENCE ?? 'https://workout.sqnsportfolio.com/api/maintenance/cleanup';
  const expectedEmail = process.env.CLEANUP_SERVICE_ACCOUNT ?? 'workout-cleanup@personal-project-414620.iam.gserviceaccount.com';
  return verifySchedulerRequest(request, audience, expectedEmail);
}

export async function cleanupInactiveUsers(request: NextRequest) {
  if (!await verifyScheduler(request)) return apiError('Scheduler authentication required.', 401);
  try {
    const database = getFirestore();
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let deleted = 0;
    while (true) {
      const stale = await database.collection(workoutUsersCollection).where('lastActivityAt', '<', cutoff).limit(400).get();
      if (stale.empty) break;
      for (let index = 0; index < stale.docs.length; index += 10) {
        await Promise.all(stale.docs.slice(index, index + 10).map((document) => recursivelyDeleteWorkoutUser(document.ref)));
      }
      deleted += stale.size;
    }
    await database.collection(workoutAuditCollection).add({ action: 'inactive-cleanup', deletedUsers: deleted, cutoff, createdAt: Timestamp.now() });
    return apiJson({ deleted, cutoff: cutoff.toDate().toISOString() });
  } catch (cause) {
    console.error('Inactive user cleanup failed', cause);
    return apiError('Cleanup failed.', 503);
  }
}
