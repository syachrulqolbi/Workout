import type { NextRequest } from 'next/server';
import { apiError, apiFailure, apiJson } from '@/lib/server/api-response';
import { requireUser } from '@/lib/server/auth';
import { getFirestore, workoutUsersCollection } from '@/lib/server/firestore';
import { readWorkoutHistoryPage } from '@/lib/server/workout-repository';

export async function getWorkoutHistory(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const before = request.nextUrl.searchParams.get('before') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}T/.test(before)) return apiError('A valid history cursor is required.', 422);
    const reference = getFirestore().collection(workoutUsersCollection).doc(user.uid);
    const page = await readWorkoutHistoryPage(reference, before, 100);
    return apiJson(page);
  } catch (cause) {
    return apiFailure(cause, 'Workout history request failed', 'Workout history is temporarily unavailable.');
  }
}
