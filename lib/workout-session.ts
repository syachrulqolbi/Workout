import { indexLatestExerciseRecords, latestExerciseRecord } from '@/lib/workout-identity';
import { localDateKey } from '@/lib/workout-ui';
import { stableExerciseId, type ActiveWorkout, type DayPlan, type WorkoutData } from '@/lib/workout-data';

type BuildWorkoutOptions = {
  now?: Date;
  createId?: () => string;
  resetAt?: string;
};

export function buildWorkout(
  plan: DayPlan,
  retake: boolean,
  history: WorkoutData['exerciseHistory'],
  { now = new Date(), createId = () => crypto.randomUUID(), resetAt = '' }: BuildWorkoutOptions = {},
): ActiveWorkout {
  const resetTime = resetAt ? new Date(resetAt).getTime() : 0;
  const currentHistory = Number.isFinite(resetTime) && resetTime > 0
    ? history.filter((record) => record.type !== 'strength' || !(new Date(record.date).getTime() < resetTime))
    : history;
  const latestByExercise = indexLatestExerciseRecords(currentHistory);

  return {
    date: localDateKey(now), planDay: plan.day, startedAt: now.toISOString(), name: plan.name, focus: plan.focus, retake, restTimer: null,
    exercises: plan.exercises.map((exercise) => {
      const exerciseId = exercise.id || stableExerciseId(exercise.name);
      const latest = latestExerciseRecord(latestByExercise, { id: exerciseId, name: exercise.name });
      const compatibleLatest = latest?.loadMode === exercise.loadMode ? latest : undefined;
      const latestSetWeights = compatibleLatest?.completedSets.map((set) => Number(set.weight)).filter(Number.isFinite) ?? [];
      const latestWeight = exercise.loadMode === 'assistance' && latestSetWeights.length
        ? Math.min(...latestSetWeights)
        : Number(compatibleLatest?.weight);
      const useLatestWeight = exercise.type === 'strength' && exercise.measurement === 'reps'
        && exercise.loadMode !== 'bodyweight' && Number.isFinite(latestWeight)
        && (exercise.loadMode === 'assistance' ? latestWeight >= 0 : latestWeight > 0);
      const startingWeight = useLatestWeight ? latestWeight : exercise.weight;
      return {
        id: exerciseId, name: exercise.name, type: exercise.type,
        measurement: exercise.measurement, loadMode: exercise.loadMode,
        targetWeight: startingWeight, targetReps: exercise.reps, targetDurationSeconds: exercise.durationSeconds,
        targetDurationMinutes: exercise.durationMinutes,
        targetDistanceKm: exercise.distanceKm, restSeconds: exercise.restSeconds,
        category: exercise.category, levelStandard: exercise.levelStandard,
        sets: Array.from({ length: exercise.sets }, () => ({
          id: createId(), weight: startingWeight, reps: exercise.reps, durationSeconds: exercise.durationSeconds,
          durationMinutes: exercise.durationMinutes,
          distanceKm: exercise.distanceKm, calories: exercise.calories, done: false,
        })),
      };
    }),
  };
}
