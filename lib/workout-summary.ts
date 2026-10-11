import type { WorkoutData } from '@/lib/workout-data';

export type WorkoutDataSummary = {
  workoutCount: number;
  strengthRecordCount: number;
  cardioRecordCount: number;
  mealCount: number;
  activeWorkout: boolean;
};

export function summarizeWorkoutData(data: WorkoutData): WorkoutDataSummary {
  let strengthRecordCount = 0;
  let cardioRecordCount = 0;
  for (const record of data.exerciseHistory) {
    if (record.type === 'cardio') cardioRecordCount += 1;
    else strengthRecordCount += 1;
  }
  return {
    workoutCount: data.workouts.length,
    strengthRecordCount,
    cardioRecordCount,
    mealCount: data.meals.length,
    activeWorkout: Boolean(data.activeWorkout),
  };
}

export function isWorkoutDataSummary(value: unknown): value is WorkoutDataSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = value as Partial<WorkoutDataSummary>;
  return Number.isInteger(summary.workoutCount) && Number.isInteger(summary.strengthRecordCount)
    && Number.isInteger(summary.cardioRecordCount) && Number.isInteger(summary.mealCount)
    && typeof summary.activeWorkout === 'boolean';
}
