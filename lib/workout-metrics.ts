import type { ExerciseEntry, SetEntry } from '@/lib/workout-data';
import { bestWeightedHoldPerformance, isWeightedHoldStandard } from '@/lib/exercise-profile';

export function bestCompletedSet(exercise: ExerciseEntry, sets = exercise.sets.filter((set) => set.done)) {
  if (isWeightedHoldStandard(exercise.levelStandard)) {
    return bestWeightedHoldPerformance(exercise.levelStandard, sets);
  }
  return sets.reduce<SetEntry | null>((best, set) => {
    if (!best) return set;
    if (exercise.measurement === 'duration') return set.durationSeconds > best.durationSeconds ? set : best;
    if (exercise.loadMode === 'assistance') {
      return set.weight < best.weight || (set.weight === best.weight && set.reps > best.reps) ? set : best;
    }
    return set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps) ? set : best;
  }, null);
}

export function completedSetVolume(exercise: ExerciseEntry, set: SetEntry) {
  if (!set.done || exercise.type !== 'strength' || exercise.measurement !== 'reps') return 0;
  if (exercise.loadMode === 'bodyweight' || exercise.loadMode === 'assistance') return 0;
  const multiplier = exercise.loadMode === 'perSide' ? 2 : 1;
  return Math.max(0, set.weight) * Math.max(0, set.reps) * multiplier;
}

export function activeWorkoutVolume(exercises: ExerciseEntry[]) {
  return exercises.reduce((total, exercise) => total
    + exercise.sets.reduce((sum, set) => sum + completedSetVolume(exercise, set), 0), 0);
}
