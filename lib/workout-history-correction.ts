import { exerciseHistoryKeys } from '@/lib/exercise-profile';
import type { ExerciseRecord, LibraryExercise, WorkoutSession } from '@/lib/workout-data';

export type HistoryCorrectionRow = {
  record: ExerciseRecord;
  plan?: LibraryExercise;
  missing: boolean;
};

function sameExercise(record: ExerciseRecord, exercise: LibraryExercise) {
  const recordKeys = new Set(exerciseHistoryKeys({ id: record.exerciseId, name: record.exercise }));
  return exerciseHistoryKeys(exercise).some((key) => recordKeys.has(key));
}

function emptyRecord(workout: WorkoutSession, exercise: LibraryExercise): ExerciseRecord {
  return {
    id: `correction-${workout.id}-${exercise.id}`,
    sessionId: workout.id,
    exerciseId: exercise.id,
    exercise: exercise.name,
    date: workout.date,
    type: exercise.type,
    measurement: exercise.measurement,
    loadMode: exercise.loadMode,
    weight: 0,
    reps: 0,
    setsCompleted: 0,
    targetMet: false,
    durationSeconds: 0,
    durationMinutes: 0,
    distanceKm: 0,
    calories: 0,
    completedSets: [],
    estimated: true,
    estimatedOneRepMax: null,
    achievedLevel: null,
  };
}

/** Keep recorded exercises and add editable placeholders for omitted plan exercises. */
export function historyCorrectionRows(
  workout: WorkoutSession,
  records: ExerciseRecord[],
  plannedExercises: LibraryExercise[],
): HistoryCorrectionRow[] {
  const remaining = [...records];
  const rows = plannedExercises.map((plan) => {
    const index = remaining.findIndex((record) => sameExercise(record, plan));
    if (index === -1) return { record: emptyRecord(workout, plan), plan, missing: true };
    const [record] = remaining.splice(index, 1);
    return { record, plan, missing: false };
  });
  return [...rows, ...remaining.map((record) => ({ record, missing: false }))];
}
