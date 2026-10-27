import { canonicalV2DisplayName, strengthStandardForExercise } from '@/lib/strength-standards';
import { STRENGTH_STANDARD_VERSION } from '@/lib/strength-calculations';
import { stableExerciseId, type ExerciseEntry, type LibraryExercise, type WorkoutData } from '@/lib/workout-data';

const repRanges = new Map<string, [number, number]>([
  ['exercise-iso-lateral-bench-press',[6,8]], ['exercise-iso-lateral-wide-pulldown',[6,8]],
  ['exercise-iso-lateral-shoulder-press',[6,8]], ['exercise-chest-fly-machine',[10,15]],
  ['exercise-lateral-raise',[12,15]], ['exercise-face-pull',[12,15]], ['exercise-wrist-curl',[12,15]],
  ['exercise-hammer-curl',[10,12]], ['exercise-machine-ab-crunch',[10,15]], ['exercise-seated-leg-press',[6,8]],
  ['exercise-pendulum-x-squat',[6,8]], ['exercise-hip-thrust',[6,8]], ['exercise-seated-leg-curl',[10,12]],
  ['exercise-lying-leg-curl',[10,12]], ['exercise-leg-extension',[8,10]], ['exercise-loaded-back-extension',[8,12]],
  ['exercise-hip-abductor',[12,15]], ['exercise-hip-adductor',[12,15]], ['exercise-calf-raise',[12,15]],
  ['exercise-iso-lateral-super-incline-press',[6,8]], ['exercise-close-grip-seated-row',[6,8]],
  ['exercise-rear-delt-fly',[12,15]], ['exercise-bicep-curl',[10,12]], ['exercise-tricep-press',[10,12]],
  ['exercise-dragon-fly',[1,5]], ['exercise-pull-up',[6,8]], ['exercise-iso-lateral-high-row',[6,8]],
  ['exercise-iso-lateral-low-row',[6,8]], ['exercise-hi-lo-cable-chest-fly',[12,15]],
  ['exercise-shrugs',[12,15]], ['exercise-cable-woodchopper',[12,12]],
]);

function migrateExercise<T extends LibraryExercise | ExerciseEntry>(exercise: T): T {
  const id = exercise.id || stableExerciseId(exercise.name);
  const name = canonicalV2DisplayName(id, exercise.name);
  const standard = strengthStandardForExercise(id, name, exercise.levelStandard);
  const range = repRanges.get(id);
  const plannedReps = 'targetReps' in exercise ? exercise.targetReps : exercise.reps;
  return {
    ...exercise,
    id,
    name,
    ...(exercise.measurement === 'reps' ? {
      repRangeMin: range?.[0] ?? exercise.repRangeMin ?? plannedReps,
      repRangeMax: range?.[1] ?? exercise.repRangeMax ?? plannedReps,
    } : {}),
    levelStandard: standard,
  } as T;
}

export function migrateStrengthStandardsV2(input: WorkoutData): WorkoutData {
  if (input.standardsVersion === STRENGTH_STANDARD_VERSION
    && input.dayPlans.every((plan) => plan.exercises.every((exercise) => exercise.type === 'cardio' || exercise.levelStandard === null || exercise.levelStandard?.version === STRENGTH_STANDARD_VERSION))) return input;
  return {
    ...input,
    standardsVersion: STRENGTH_STANDARD_VERSION,
    dayPlans: input.dayPlans.map((plan) => ({ ...plan, exercises: plan.exercises.map(migrateExercise) })),
    activeWorkout: input.activeWorkout ? {
      ...input.activeWorkout,
      exercises: input.activeWorkout.exercises.map(migrateExercise),
    } : null,
  };
}
