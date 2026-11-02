import { indexLatestExerciseRecords, latestExerciseRecord } from '@/lib/workout-identity';
import { bestWeightedHoldPerformance, isWeightedHoldStandard } from '@/lib/exercise-profile';
import { localDateKey } from '@/lib/workout-ui';
import {
  stableExerciseId, type ActiveWorkout, type DayPlan, type ExerciseRecord, type LibraryExercise, type WorkoutData,
} from '@/lib/workout-data';

type BuildWorkoutOptions = {
  now?: Date;
  createId?: () => string;
  resetAt?: string;
};

const LOAD_PROGRESSION_KG = 5;

function historySinceReset(history: WorkoutData['exerciseHistory'], resetAt = '') {
  const resetTime = resetAt ? new Date(resetAt).getTime() : 0;
  return Number.isFinite(resetTime) && resetTime > 0
    ? history.filter((record) => record.type !== 'strength' || !(new Date(record.date).getTime() < resetTime))
    : history;
}

function finalCompletedSet(record: ExerciseRecord | undefined) {
  if (!record) return undefined;
  const completedSets = Array.isArray(record.completedSets) ? record.completedSets : [];
  return completedSets.at(-1) ?? {
    weight: record.weight,
    reps: record.reps,
    durationSeconds: record.durationSeconds,
    durationMinutes: record.durationMinutes,
    distanceKm: record.distanceKm,
    calories: record.calories,
  };
}

function roundedLoad(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function nextWorkoutWeight(exercise: LibraryExercise, latest: ExerciseRecord | undefined) {
  if (exercise.type !== 'strength' || exercise.measurement !== 'reps' || exercise.loadMode === 'bodyweight') {
    return exercise.weight;
  }
  if (!latest || latest.loadMode !== exercise.loadMode) return exercise.weight;

  const finalSet = finalCompletedSet(latest);
  const finalWeight = Number(finalSet?.weight);
  const finalReps = Number(finalSet?.reps);
  const validWeight = exercise.loadMode === 'assistance' ? finalWeight >= 0 : finalWeight > 0;
  if (!Number.isFinite(finalWeight) || !validWeight) return exercise.weight;

  const reachedTarget = Number.isFinite(finalReps) && finalReps >= exercise.reps;
  if (!reachedTarget) return roundedLoad(finalWeight);
  return exercise.loadMode === 'assistance'
    ? roundedLoad(Math.max(0, finalWeight - LOAD_PROGRESSION_KG))
    : roundedLoad(finalWeight + LOAD_PROGRESSION_KG);
}

/** Returns a display-only plan whose loads use the same rule as a newly started workout. */
export function planWithNextWorkoutWeights(
  plan: DayPlan,
  history: WorkoutData['exerciseHistory'],
  resetAt = '',
): DayPlan {
  const latestByExercise = indexLatestExerciseRecords(historySinceReset(history, resetAt));
  return {
    ...plan,
    exercises: plan.exercises.map((exercise) => {
      const exerciseId = exercise.id || stableExerciseId(exercise.name);
      const latest = latestExerciseRecord(latestByExercise, { id: exerciseId, name: exercise.name });
      return { ...exercise, weight: nextWorkoutWeight(exercise, latest) };
    }),
  };
}

export function buildWorkout(
  plan: DayPlan,
  retake: boolean,
  history: WorkoutData['exerciseHistory'],
  { now = new Date(), createId = () => crypto.randomUUID(), resetAt = '' }: BuildWorkoutOptions = {},
): ActiveWorkout {
  const latestByExercise = indexLatestExerciseRecords(historySinceReset(history, resetAt));

  return {
    date: localDateKey(now), planDay: plan.day, startedAt: now.toISOString(), name: plan.name, focus: plan.focus, retake, restTimer: null,
    exercises: plan.exercises.map((exercise) => {
      const exerciseId = exercise.id || stableExerciseId(exercise.name);
      const latest = latestExerciseRecord(latestByExercise, { id: exerciseId, name: exercise.name });
      const compatibleLatest = latest?.loadMode === exercise.loadMode ? latest : undefined;
      const weightedHoldStandard = isWeightedHoldStandard(exercise.levelStandard) ? exercise.levelStandard : null;
      const latestHoldSets = compatibleLatest?.completedSets.filter((set) => set.durationSeconds > 0) ?? [];
      const latestHoldFallback = compatibleLatest
        ? [{
          weight: compatibleLatest.weight,
          durationSeconds: compatibleLatest.setsCompleted
            ? compatibleLatest.durationSeconds / compatibleLatest.setsCompleted
            : compatibleLatest.durationSeconds,
        }]
        : [];
      const latestHold = weightedHoldStandard
        ? bestWeightedHoldPerformance(weightedHoldStandard, latestHoldSets.length ? latestHoldSets : latestHoldFallback)
        : null;
      const startingWeight = latestHold?.weight ?? nextWorkoutWeight(exercise, compatibleLatest);
      const startingDurationSeconds = latestHold?.durationSeconds ?? exercise.durationSeconds;
      return {
        id: exerciseId, name: exercise.name, type: exercise.type,
        measurement: exercise.measurement, loadMode: exercise.loadMode,
        targetWeight: startingWeight, targetReps: exercise.reps, targetDurationSeconds: startingDurationSeconds,
        targetDurationMinutes: exercise.durationMinutes,
        targetDistanceKm: exercise.distanceKm, restSeconds: exercise.restSeconds,
        category: exercise.category, repRangeMin: exercise.repRangeMin, repRangeMax: exercise.repRangeMax,
        levelStandard: exercise.levelStandard,
        sets: Array.from({ length: exercise.sets }, () => ({
          id: createId(), weight: startingWeight, reps: exercise.reps, durationSeconds: startingDurationSeconds,
          durationMinutes: exercise.durationMinutes,
          distanceKm: exercise.distanceKm, calories: exercise.calories, done: false,
        })),
      };
    }),
  };
}
