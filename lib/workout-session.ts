import { indexLatestExerciseRecords, latestExerciseRecord } from '@/lib/workout-identity';
import { localDateKey } from '@/lib/workout-ui';
import { stableExerciseId, type ActiveWorkout, type DayPlan, type WorkoutData } from '@/lib/workout-data';

type BuildWorkoutOptions = {
  now?: Date;
  createId?: () => string;
};

export function buildWorkout(
  plan: DayPlan,
  retake: boolean,
  history: WorkoutData['exerciseHistory'],
  { now = new Date(), createId = () => crypto.randomUUID() }: BuildWorkoutOptions = {},
): ActiveWorkout {
  const latestByExercise = indexLatestExerciseRecords(history);

  return {
    date: localDateKey(now), planDay: plan.day, startedAt: now.toISOString(), name: plan.name, focus: plan.focus, retake, restTimer: null,
    exercises: plan.exercises.map((exercise) => {
      const exerciseId = exercise.id || stableExerciseId(exercise.name);
      const latest = latestExerciseRecord(latestByExercise, { id: exerciseId, name: exercise.name });
      const latestSetWeights = latest?.completedSets.map((set) => Number(set.weight)).filter(Number.isFinite) ?? [];
      const latestWeight = exercise.loadMode === 'assistance' && latestSetWeights.length
        ? Math.min(...latestSetWeights)
        : Number(latest?.weight);
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
