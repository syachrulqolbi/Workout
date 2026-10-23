export type ExerciseType = 'strength' | 'cardio';
export type ExerciseMeasurement = 'reps' | 'duration' | 'distance';
export type ExerciseLoadMode = 'total' | 'perSide' | 'assistance' | 'bodyweight' | 'duration';
export type ExerciseLevelMetric = 'weight' | 'reps' | 'seconds' | 'assistanceEquivalent' | 'weightedHold';
export type ExerciseLevelStandard = {
  thresholds: number[];
  metric: ExerciseLevelMetric;
  unit: 'kg' | 'reps' | 'sec' | 'level';
  holdSeconds?: number[];
};

export type CompletedSetRecord = {
  weight: number;
  reps: number;
  durationSeconds: number;
  durationMinutes: number;
  distanceKm: number;
  calories: number;
};

export type WorkoutSession = {
  id: string;
  date: string;
  planDay: number | null;
  name: string;
  focus: string;
  duration: number;
  exercises: number;
  sets: number;
  volume: number;
  cardioMinutes: number;
  distanceKm: number;
  calories: number;
};

export type ExerciseRecord = {
  id: string;
  sessionId: string;
  exerciseId: string;
  exercise: string;
  date: string;
  type: ExerciseType;
  measurement: ExerciseMeasurement;
  loadMode: ExerciseLoadMode;
  weight: number;
  reps: number;
  setsCompleted: number;
  targetMet: boolean;
  durationSeconds: number;
  durationMinutes: number;
  distanceKm: number;
  calories: number;
  completedSets: CompletedSetRecord[];
  estimated: boolean;
};

export type SetEntry = {
  id: string;
  weight: number;
  reps: number;
  durationSeconds: number;
  durationMinutes: number;
  distanceKm: number;
  calories: number;
  done: boolean;
};

export type ExerciseEntry = {
  id: string;
  name: string;
  type: ExerciseType;
  measurement: ExerciseMeasurement;
  loadMode: ExerciseLoadMode;
  targetWeight: number;
  targetReps: number;
  targetDurationSeconds: number;
  targetDurationMinutes: number;
  targetDistanceKm: number;
  restSeconds: number;
  category?: string;
  levelStandard?: ExerciseLevelStandard | null;
  sets: SetEntry[];
};
export type LibraryExercise = {
  id: string;
  name: string;
  type: ExerciseType;
  measurement: ExerciseMeasurement;
  loadMode: ExerciseLoadMode;
  weight: number;
  reps: number;
  sets: number;
  durationSeconds: number;
  durationMinutes: number;
  distanceKm: number;
  calories: number;
  restSeconds: number;
  category?: string;
  priority?: boolean;
  levelStandard?: ExerciseLevelStandard | null;
};
export type DayPlan = { day: number; name: string; focus: string; estimatedTime?: string; exercises: LibraryExercise[] };

export type Meal = {
  id: string;
  date: string;
  recurring: boolean;
  completedDates: string[];
  type: string;
  name: string;
  note: string;
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  sugar: number;
  done: boolean;
};

export type ActiveRestTimer = {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  setCount: number;
  endsAt: number;
  duration: number;
};

export type ActiveWorkout = {
  date: string;
  planDay: number;
  startedAt: string;
  name: string;
  focus: string;
  exercises: ExerciseEntry[];
  retake: boolean;
  restTimer: ActiveRestTimer | null;
};

export type WorkoutData = {
  workouts: WorkoutSession[];
  exerciseHistory: ExerciseRecord[];
  dayPlans: DayPlan[];
  datePlanOverrides: Record<string, number>;
  meals: Meal[];
  activeWorkout: ActiveWorkout | null;
  levelResetAt: string;
};

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_MS = 86_400_000;

function dateKeyTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  return new Date(`${value}T12:00:00Z`).getTime();
}

function compactDateKeys(values: string[], maximum: number, reference = new Date()) {
  const referenceTime = new Date(`${reference.toISOString().slice(0, 10)}T12:00:00Z`).getTime();
  return [...new Set(values)]
    .map((date) => ({ date, time: dateKeyTime(date) }))
    .filter(({ time }) => Number.isFinite(time) && time >= referenceTime - 540 * DAY_MS && time <= referenceTime + 730 * DAY_MS)
    .sort((left, right) => Math.abs(left.time - referenceTime) - Math.abs(right.time - referenceTime))
    .slice(0, maximum)
    .map(({ date }) => date)
    .sort();
}

export function compactDatePlanOverrides(overrides: Record<string, number>, reference = new Date()) {
  const kept = new Set(compactDateKeys(Object.keys(overrides), 240, reference));
  return Object.fromEntries(Object.entries(overrides).filter(([date]) => kept.has(date)));
}

export function compactMealCompletionDates(dates: string[], reference = new Date()) {
  return compactDateKeys(dates, 730, reference);
}

const strength = (name: string, weight: number, reps: number, sets: number): LibraryExercise => ({
  id: stableExerciseId(name), name, type: 'strength', measurement: 'reps', loadMode: weight > 0 ? 'total' : 'bodyweight',
  weight, reps, sets, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0, restSeconds: 90,
});
const cardio = (name: string, durationMinutes: number, distanceKm = 0, calories = 0): LibraryExercise => ({
  id: stableExerciseId(name), name, type: 'cardio', measurement: distanceKm > 0 ? 'distance' : 'duration', loadMode: 'duration',
  weight: 0, reps: 0, sets: 1, durationSeconds: 0, durationMinutes, distanceKm, calories, restSeconds: 0,
});

const planSeeds: Array<Omit<DayPlan, 'day'>> = [
  { name: 'Push strength', focus: 'Chest, shoulders & triceps', exercises: [
    strength('Barbell bench press', 60, 6, 4), strength('Seated shoulder press', 22, 8, 3),
    strength('Cable triceps pressdown', 22, 12, 3),
  ] },
  { name: 'Lower strength', focus: 'Quads, hamstrings & glutes', exercises: [
    strength('Back squat', 80, 6, 4), strength('Romanian deadlift', 70, 8, 3),
    strength('Walking lunge', 18, 10, 3),
  ] },
  { name: 'Mobility reset', focus: 'Hips, spine & shoulders', exercises: [
    strength('World’s greatest stretch', 0, 8, 2), strength('Thoracic rotation', 0, 10, 2),
    strength('Farmer carry', 24, 4, 3),
  ] },
  { name: 'Pull strength', focus: 'Back, rear delts & biceps', exercises: [
    strength('Deadlift', 100, 5, 4), strength('Chest-supported row', 40, 8, 3),
    strength('Incline dumbbell curl', 12, 10, 3),
  ] },
  { name: 'Upper volume', focus: 'Chest, back & arms', exercises: [
    strength('Incline bench press', 55, 8, 4), strength('Lat pulldown', 52, 10, 3),
    strength('Lateral raise', 8, 15, 3),
  ] },
  { name: 'Conditioning', focus: 'Full body & work capacity', exercises: [
    strength('Kettlebell swing', 20, 15, 4), cardio('Rowing machine', 20, 4),
    strength('Sled push', 50, 4, 4),
  ] },
  { name: 'Recovery', focus: 'Easy movement & preparation', exercises: [
    cardio('Incline walk', 30, 3), cardio('Full-body mobility', 15),
  ] },
];

export function createDefaultDayPlans(): DayPlan[] {
  return planSeeds.map((plan, day) => ({ ...plan, day, exercises: plan.exercises.map((exercise) => ({ ...exercise })) }));
}

export function createDefaultWorkoutData(): WorkoutData {
  return { workouts: [], exerciseHistory: [], dayPlans: createDefaultDayPlans(), datePlanOverrides: {}, meals: [], activeWorkout: null, levelResetAt: '' };
}

export function createEmptyWorkoutData(): WorkoutData {
  return {
    workouts: [], exerciseHistory: [], datePlanOverrides: {}, meals: [], activeWorkout: null,
    dayPlans: DAY_NAMES.map((_, day) => ({ day, name: 'Rest day', focus: 'Add exercises to build this day', exercises: [] })), levelResetAt: '',
  };
}

export function clearWorkoutHistory(data: WorkoutData): WorkoutData {
  return { ...data, workouts: [], exerciseHistory: [], activeWorkout: null };
}

export function hasSafeWorkoutPayload(value: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (typeof value === 'string') return value.length <= 4_000;
  if (Array.isArray(value)) return value.length <= 20_000 && value.every((item) => hasSafeWorkoutPayload(item, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 250 && entries.every(([key, item]) => key.length <= 100 && hasSafeWorkoutPayload(item, depth + 1));
}

export function hasWorkoutCollectionLimits(value: unknown) {
  const data = record(value);
  const dayPlans = Array.isArray(data.dayPlans) ? data.dayPlans : [];
  const exerciseHistory = Array.isArray(data.exerciseHistory) ? data.exerciseHistory : [];
  const active = record(data.activeWorkout);
  const activeExercises = Array.isArray(active.exercises) ? active.exercises : [];
  return dayPlans.length <= 7
    && dayPlans.every((plan) => {
      const exercises = record(plan).exercises;
      return !Array.isArray(exercises) || exercises.length <= 100;
    })
    && exerciseHistory.every((entry) => {
      const completedSets = record(entry).completedSets;
      return !Array.isArray(completedSets) || completedSets.length <= 100;
    })
    && activeExercises.length <= 100
    && activeExercises.every((entry) => {
      const sets = record(entry).sets;
      return !Array.isArray(sets) || sets.length <= 100;
    });
}

export function isWorkoutData(value: unknown): value is WorkoutData {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasSafeWorkoutPayload(value) || !hasWorkoutCollectionLimits(value)) return false;
  const data = value as Partial<WorkoutData>;
  return Array.isArray(data.workouts) && Array.isArray(data.exerciseHistory) && Array.isArray(data.dayPlans)
    && data.workouts.length <= 5_000 && data.exerciseHistory.length <= 20_000 && data.dayPlans.length <= 7
    && (data.datePlanOverrides === undefined || (typeof data.datePlanOverrides === 'object' && data.datePlanOverrides !== null && !Array.isArray(data.datePlanOverrides)))
    && Array.isArray(data.meals) && data.meals.length <= 5_000
    && (data.activeWorkout === null || typeof data.activeWorkout === 'object');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function planDay(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : fallback;
}

function planDayFromDate(value: unknown) {
  const date = new Date(`${String(value ?? new Date().toISOString().slice(0, 10)).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? 0 : (date.getUTCDay() + 6) % 7;
}

function storedExerciseId(value: unknown, name: string) {
  const id = String(value ?? '').trim();
  return /^exercise-[a-z0-9][a-z0-9-]*$/.test(id) ? id : stableExerciseId(name);
}

function exerciseType(value: unknown): ExerciseType { return value === 'cardio' ? 'cardio' : 'strength'; }
function number(value: unknown, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function nonNegative(value: unknown, fallback = 0, maximum = 1_000_000) {
  return Math.min(maximum, Math.max(0, number(value, fallback)));
}
function exerciseIdentity(value: unknown) {
  const identity = String(value ?? '').trim().replace(/\s*\([AB]\)\s*$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return identity === 'cable shrug' || identity === 'cable shrugs' || identity === 'shrug' ? 'shrugs' : identity;
}

function exerciseMeasurement(value: unknown, type: ExerciseType, name: string, distanceKm = 0): ExerciseMeasurement {
  if (value === 'duration' || value === 'distance' || value === 'reps') return value;
  if (type === 'cardio') return distanceKm > 0 ? 'distance' : 'duration';
  return /\b(plank|hold|wall sit)\b/i.test(name) ? 'duration' : 'reps';
}

function exerciseLoadMode(value: unknown, type: ExerciseType, measurement: ExerciseMeasurement, name: string, weight: number): ExerciseLoadMode {
  if (value === 'total' || value === 'perSide' || value === 'assistance' || value === 'bodyweight' || value === 'duration') return value;
  if (type === 'cardio' || measurement === 'duration') return 'duration';
  if (/assist/i.test(name)) return 'assistance';
  return weight > 0 ? 'total' : 'bodyweight';
}

function normalizeSet(value: unknown, fallbackId: string): SetEntry {
  const item = record(value);
  return {
    id: String(item.id ?? fallbackId), weight: nonNegative(item.weight), reps: nonNegative(item.reps, 0, 10_000),
    durationSeconds: nonNegative(item.durationSeconds, 0, 86_400), durationMinutes: nonNegative(item.durationMinutes, 0, 10_000),
    distanceKm: nonNegative(item.distanceKm, 0, 100_000), calories: nonNegative(item.calories, 0, 100_000), done: Boolean(item.done),
  };
}

function normalizeLevelStandard(value: unknown): ExerciseLevelStandard | undefined {
  const standard = record(value);
  const thresholds = Array.isArray(standard.thresholds)
    ? standard.thresholds.map(Number).filter(Number.isFinite)
    : [];
  const holdSeconds = Array.isArray(standard.holdSeconds)
    ? standard.holdSeconds.map(Number).filter(Number.isFinite)
    : [];
  const metric = standard.metric;
  const unit = standard.unit;
  const validMetric = metric === 'weight' || metric === 'reps' || metric === 'seconds'
    || metric === 'assistanceEquivalent' || metric === 'weightedHold';
  const validUnit = unit === 'kg' || unit === 'reps' || unit === 'sec' || unit === 'level';
  if (thresholds.length !== 10 || !validMetric || !validUnit) return undefined;
  if (metric === 'weightedHold' && holdSeconds.length !== 10) return undefined;
  return {
    thresholds,
    metric,
    unit,
    ...(metric === 'weightedHold' ? { holdSeconds } : {}),
  } as ExerciseLevelStandard;
}

function normalizeLibraryExercise(value: unknown, fallbackId: string): LibraryExercise {
  const item = record(value);
  const type = exerciseType(item.type);
  const name = String(item.name ?? 'Exercise');
  const distanceKm = nonNegative(item.distanceKm, 0, 100_000);
  const measurement = exerciseMeasurement(item.measurement, type, name, distanceKm);
  const legacyTimedSeconds = measurement === 'duration' && type === 'strength' ? number(item.reps) : 0;
  const durationSeconds = nonNegative(item.durationSeconds, legacyTimedSeconds, 86_400);
  const weight = nonNegative(item.weight);
  const sets = Math.min(100, Math.max(1, Math.round(number(item.sets, type === 'strength' ? 3 : 1))));
  const levelStandard = item.levelStandard === null ? null : normalizeLevelStandard(item.levelStandard);
  return {
    id: storedExerciseId(item.id ?? fallbackId, name), name, type, measurement,
    loadMode: exerciseLoadMode(item.loadMode, type, measurement, name, weight),
    weight, reps: measurement === 'reps' ? nonNegative(item.reps, type === 'strength' ? 8 : 0, 10_000) : 0,
    sets, durationSeconds,
    durationMinutes: nonNegative(item.durationMinutes, type === 'cardio' ? nonNegative(item.reps, 20) : 0, 10_000),
    distanceKm, calories: nonNegative(item.calories, 0, 100_000),
    restSeconds: type === 'cardio' && sets <= 1 ? 0 : nonNegative(item.restSeconds, type === 'strength' ? 90 : 0, 3_600),
    category: String(item.category ?? ''), priority: Boolean(item.priority), levelStandard,
  };
}

function normalizeCompletedSet(value: unknown): CompletedSetRecord {
  const item = record(value);
  return {
    weight: nonNegative(item.weight), reps: nonNegative(item.reps, 0, 10_000), durationSeconds: nonNegative(item.durationSeconds, 0, 86_400),
    durationMinutes: nonNegative(item.durationMinutes, 0, 10_000), distanceKm: nonNegative(item.distanceKm, 0, 100_000), calories: nonNegative(item.calories, 0, 100_000),
  };
}

export function normalizeWorkoutData(value: unknown): WorkoutData {
  const legacy = record(value);
  const defaults = createDefaultWorkoutData();
  const legacyLibrary = Array.isArray(legacy.exerciseLibrary) ? legacy.exerciseLibrary : [];
  const rawPlans = Array.isArray(legacy.dayPlans) ? legacy.dayPlans : [];
  if (!rawPlans.length && legacyLibrary.length) {
    defaults.dayPlans[4].exercises = legacyLibrary.map((item, index) => normalizeLibraryExercise(item, `legacy-${index}`));
  }

  const dayPlans = rawPlans.length ? DAY_NAMES.map((_, day) => {
    const fallback = defaults.dayPlans[day];
    const source = record(rawPlans.find((plan) => number(record(plan).day, -1) === day));
    const exercises = Array.isArray(source.exercises) ? source.exercises : fallback.exercises;
    return {
      day, name: String(source.name ?? fallback.name), focus: String(source.focus ?? fallback.focus),
      estimatedTime: String(source.estimatedTime ?? fallback.estimatedTime ?? ''),
      exercises: exercises.map((item, index) => normalizeLibraryExercise(item, `day-${day}-${index}`)),
    };
  }) : defaults.dayPlans;

  const datePlanOverrides = compactDatePlanOverrides(Object.fromEntries(Object.entries(record(legacy.datePlanOverrides)).filter(([date, value]) => {
    const day = Number(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isInteger(day) && day >= -1 && day <= 6;
  }).map(([date, value]) => [date, Number(value)])));

  const workouts = (Array.isArray(legacy.workouts) ? legacy.workouts : []).map((value, index): WorkoutSession => {
    const item = record(value);
    return {
      id: String(item.id ?? `session-${index}`), date: String(item.date ?? new Date().toISOString()), planDay: planDay(item.planDay), name: String(item.name ?? 'Workout'),
      focus: String(item.focus ?? ''), duration: nonNegative(item.duration, 0, 100_000), exercises: nonNegative(item.exercises, 0, 10_000), sets: nonNegative(item.sets, 0, 100_000), volume: nonNegative(item.volume, 0, 1_000_000_000),
      cardioMinutes: nonNegative(item.cardioMinutes, 0, 100_000), distanceKm: nonNegative(item.distanceKm, 0, 100_000), calories: nonNegative(item.calories, 0, 10_000_000),
    };
  });

  const plannedExercises = dayPlans.flatMap((plan) => plan.exercises);
  const exerciseHistory = (Array.isArray(legacy.exerciseHistory) ? legacy.exerciseHistory : []).map((value, index): ExerciseRecord => {
    const item = record(value);
    const type = exerciseType(item.type);
    const exercise = String(item.exercise ?? 'Exercise');
    const planned = plannedExercises.find((candidate) => exerciseIdentity(candidate.name) === exerciseIdentity(exercise));
    const distanceKm = nonNegative(item.distanceKm, 0, 100_000);
    const measurement = exerciseMeasurement(item.measurement ?? planned?.measurement, type, exercise, distanceKm);
    const loadMode = exerciseLoadMode(item.loadMode ?? planned?.loadMode, type, measurement, exercise, number(item.weight));
    const recordedReps = nonNegative(item.reps, 0, 10_000);
    const recordedSets = Math.min(100, Math.max(0, Math.round(number(item.setsCompleted))));
    const setsCompleted = !recordedSets ? Math.max(0, planned?.sets ?? 0) : recordedSets;
    const durationSeconds = nonNegative(item.durationSeconds, measurement === 'duration' && type === 'strength'
      ? (setsCompleted * (planned?.durationSeconds ?? 0)) : 0);
    const storedCompletedSets = Array.isArray(item.completedSets) ? item.completedSets.map(normalizeCompletedSet) : [];
    const inferredSetCount = Math.max(setsCompleted, storedCompletedSets.length);
    const completedSets = storedCompletedSets.length ? storedCompletedSets : Array.from({ length: inferredSetCount }, () => ({
      weight: nonNegative(item.weight), reps: type === 'strength' && measurement === 'reps'
        ? (recordedReps || planned?.reps || 0) : 0,
      durationSeconds: inferredSetCount ? durationSeconds / inferredSetCount : 0,
      durationMinutes: inferredSetCount ? nonNegative(item.durationMinutes, 0, 100_000) / inferredSetCount : 0,
      distanceKm: inferredSetCount ? distanceKm / inferredSetCount : 0,
      calories: inferredSetCount ? number(item.calories) / inferredSetCount : 0,
    }));
    return {
      id: String(item.id ?? `record-${index}`), sessionId: String(item.sessionId ?? `session-${index}`),
      exerciseId: storedExerciseId(item.exerciseId, exercise), exercise,
      date: String(item.date ?? new Date().toISOString()), type, measurement, loadMode, weight: nonNegative(item.weight),
      reps: type === 'strength' && !recordedReps ? Math.max(0, planned?.reps ?? 0) : recordedReps,
      setsCompleted,
      targetMet: Boolean(item.targetMet),
      durationSeconds, durationMinutes: nonNegative(item.durationMinutes, 0, 100_000), distanceKm, calories: nonNegative(item.calories, 0, 10_000_000),
      completedSets, estimated: item.estimated === undefined ? !storedCompletedSets.length : Boolean(item.estimated),
    };
  });

  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const meals = (Array.isArray(legacy.meals) ? legacy.meals : []).map((value, index): Meal => {
    const item = record(value);
    const mealDate = new Date(monday);
    mealDate.setUTCDate(monday.getUTCDate() + Math.min(6, Math.max(0, number(item.day))));
    return {
      id: String(item.id ?? `meal-${index}`), date: String(item.date ?? mealDate.toISOString().slice(0, 10)), type: String(item.type ?? 'Meal'),
      name: String(item.name ?? `Meal ${index + 1}`), note: String(item.note ?? ''), kcal: nonNegative(item.kcal, 0, 100_000), protein: nonNegative(item.protein, 0, 10_000),
      carbs: nonNegative(item.carbs, 0, 10_000), fats: nonNegative(item.fats, 0, 10_000), sugar: nonNegative(item.sugar, 0, 10_000), done: Boolean(item.done), recurring: Boolean(item.recurring),
      completedDates: compactMealCompletionDates(Array.isArray(item.completedDates) ? item.completedDates.map(String) : []),
    };
  });

  const activeSource = record(legacy.activeWorkout);
  const activeRestSource = record(activeSource.restTimer);
  const activeWorkout = legacy.activeWorkout && Array.isArray(activeSource.exercises) ? {
    date: String(activeSource.date ?? new Date().toISOString().slice(0, 10)), startedAt: String(activeSource.startedAt ?? new Date().toISOString()),
    planDay: planDay(activeSource.planDay, planDayFromDate(activeSource.date)) ?? 0,
    name: String(activeSource.name ?? 'Workout'), focus: String(activeSource.focus ?? ''), retake: Boolean(activeSource.retake),
    restTimer: activeSource.restTimer && Number.isFinite(Number(activeRestSource.endsAt)) ? {
      exerciseId: String(activeRestSource.exerciseId ?? ''),
      exerciseName: String(activeRestSource.exerciseName ?? 'Exercise'),
      setNumber: Math.max(1, number(activeRestSource.setNumber, 1)),
      setCount: Math.max(1, number(activeRestSource.setCount, 1)),
      endsAt: number(activeRestSource.endsAt),
      duration: Math.max(1, number(activeRestSource.duration, 90)),
    } : null,
    exercises: activeSource.exercises.map((value, exerciseIndex): ExerciseEntry => {
      const item = record(value);
      const type = exerciseType(item.type);
      const name = String(item.name ?? 'Exercise');
      const distanceKm = nonNegative(item.targetDistanceKm, nonNegative(record((Array.isArray(item.sets) ? item.sets : [])[0]).distanceKm), 100_000);
      const measurement = exerciseMeasurement(item.measurement, type, name, distanceKm);
      const weight = nonNegative(item.targetWeight, nonNegative(record((Array.isArray(item.sets) ? item.sets : [])[0]).weight));
      const sets = Array.isArray(item.sets) ? item.sets : [];
      return {
        id: storedExerciseId(item.id, name), name, type, measurement,
        loadMode: exerciseLoadMode(item.loadMode, type, measurement, name, weight), targetWeight: weight,
        targetReps: measurement === 'reps' ? nonNegative(item.targetReps, nonNegative(record((Array.isArray(item.sets) ? item.sets : [])[0]).reps, type === 'strength' ? 8 : 0), 10_000) : 0,
        targetDurationSeconds: nonNegative(item.targetDurationSeconds, nonNegative(record(sets[0]).durationSeconds,
          measurement === 'duration' && type === 'strength' ? nonNegative(record(sets[0]).reps) : 0), 86_400),
        targetDurationMinutes: nonNegative(item.targetDurationMinutes, nonNegative(record((Array.isArray(item.sets) ? item.sets : [])[0]).durationMinutes), 100_000),
        targetDistanceKm: distanceKm,
        restSeconds: type === 'cardio' && sets.length <= 1 ? 0 : nonNegative(item.restSeconds, type === 'strength' ? 90 : 0, 3_600),
        category: String(item.category ?? ''),
        levelStandard: item.levelStandard === null ? null : normalizeLevelStandard(item.levelStandard),
        sets: sets.map((set, setIndex) => {
          const normalized = normalizeSet(set, `active-${exerciseIndex}-${setIndex}`);
          return type === 'strength' && measurement === 'duration' && !normalized.durationSeconds
            ? { ...normalized, durationSeconds: normalized.reps, reps: 0 }
            : normalized;
        }),
      };
    }),
  } : null;

  return { workouts, exerciseHistory, dayPlans, datePlanOverrides, meals, activeWorkout, levelResetAt: String(legacy.levelResetAt ?? '') };
}
import { stableExerciseId } from '@/lib/workout-schema.mjs';

export { stableExerciseId } from '@/lib/workout-schema.mjs';
