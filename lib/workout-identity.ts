import { exerciseHistoryKeys } from '@/lib/exercise-profile';
import { type ExerciseRecord, type WorkoutSession } from '@/lib/workout-data';

type ExerciseIdentity = { id?: string; name: string };

export function indexLatestExerciseRecords(history: ExerciseRecord[]) {
  const records = new Map<string, ExerciseRecord>();
  for (const record of history) {
    for (const key of exerciseHistoryKeys({ id: record.exerciseId, name: record.exercise })) {
      const current = records.get(key);
      if (!current || new Date(record.date).getTime() > new Date(current.date).getTime()) records.set(key, record);
    }
  }
  return records;
}

export function latestExerciseRecord(index: Map<string, ExerciseRecord>, exercise: ExerciseIdentity) {
  for (const key of exerciseHistoryKeys(exercise)) {
    const record = index.get(key);
    if (record) return record;
  }
  return undefined;
}

export function canonicalPlanName(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\band\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function workoutMatchesPlan(session: WorkoutSession, planDay: number, planName: string) {
  return session.planDay === planDay
    || (session.planDay === null && canonicalPlanName(session.name) === canonicalPlanName(planName));
}
