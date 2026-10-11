import type {
  ExerciseLevelMetric,
  ExerciseRecord,
  LibraryExercise,
} from '@/lib/workout-data';

export type CardioProgressMetric = 'durationMinutes' | 'distanceKm' | 'calories';
export type ExerciseProgressMetric = 'weight' | 'reps' | 'durationSeconds' | CardioProgressMetric;

export type ExerciseProgressDefinition = {
  metric: ExerciseProgressMetric;
  unit: 'kg' | 'reps' | 'sec' | 'min' | 'km' | 'kcal';
  label: string;
  inverse: boolean;
};

type PlannedExercise = Pick<LibraryExercise,
  'type' | 'measurement' | 'loadMode' | 'weight' | 'reps' | 'durationSeconds' | 'durationMinutes' | 'distanceKm' | 'calories' | 'levelStandard'
>;

function strengthMetric(exercise?: PlannedExercise, record?: ExerciseRecord): ExerciseLevelMetric {
  if (exercise?.levelStandard) return exercise.levelStandard.metric;
  if (exercise?.measurement === 'duration' || record?.measurement === 'duration') return 'seconds';
  if (exercise?.loadMode === 'bodyweight' || record?.loadMode === 'bodyweight') return 'reps';
  return 'weight';
}

export function exerciseProgressDefinition(
  exercise?: PlannedExercise,
  record?: ExerciseRecord,
  cardioMetric: CardioProgressMetric = 'durationMinutes',
): ExerciseProgressDefinition {
  const type = exercise?.type ?? record?.type ?? 'strength';
  if (type === 'cardio') {
    if (cardioMetric === 'distanceKm') return { metric: cardioMetric, unit: 'km', label: 'Distance', inverse: false };
    if (cardioMetric === 'calories') return { metric: cardioMetric, unit: 'kcal', label: 'Calories', inverse: false };
    return { metric: cardioMetric, unit: 'min', label: 'Duration', inverse: false };
  }

  const metric = strengthMetric(exercise, record);
  if (metric === 'seconds') return { metric: 'durationSeconds', unit: 'sec', label: 'Best hold', inverse: false };
  if (metric === 'reps') return { metric: 'reps', unit: 'reps', label: 'Best repetitions', inverse: false };
  if (metric === 'assistanceEquivalent' || exercise?.loadMode === 'assistance' || record?.loadMode === 'assistance') {
    return { metric: 'weight', unit: 'kg', label: 'Machine assistance · lower is better', inverse: true };
  }
  return {
    metric: 'weight', unit: 'kg',
    label: exercise?.loadMode === 'perSide' ? 'Max weight per side' : 'Max weight',
    inverse: false,
  };
}

function finite(values: number[]) {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

export function exerciseRecordProgressValue(record: ExerciseRecord, definition: ExerciseProgressDefinition) {
  if (definition.metric === 'weight') {
    const values = finite(record.completedSets.map((set) => set.weight));
    if (!values.length) return Math.max(0, record.weight);
    return definition.inverse ? Math.min(...values) : Math.max(...values);
  }
  if (definition.metric === 'reps') {
    const values = finite(record.completedSets.map((set) => set.reps));
    return values.length ? Math.max(...values) : Math.max(0, record.reps);
  }
  if (definition.metric === 'durationSeconds') {
    const values = finite(record.completedSets.map((set) => set.durationSeconds));
    if (values.length) return Math.max(...values);
    return Math.max(0, record.setsCompleted ? record.durationSeconds / record.setsCompleted : record.durationSeconds);
  }
  return Math.max(0, record[definition.metric]);
}

export function exercisePlanProgressValue(exercise: PlannedExercise, definition: ExerciseProgressDefinition) {
  if (definition.metric === 'weight') return Math.max(0, exercise.weight);
  if (definition.metric === 'reps') return Math.max(0, exercise.reps);
  if (definition.metric === 'durationSeconds') return Math.max(0, exercise.durationSeconds);
  return Math.max(0, exercise[definition.metric]);
}

