import {
  stableExerciseId, type ExerciseEntry, type ExerciseLevelMetric, type ExerciseLevelStandard,
  type ExerciseLoadMode, type ExerciseRecord, type LibraryExercise, type StrengthProfile,
} from '@/lib/workout-data';
import {
  estimatedOneRepMax, levelForThresholds, personalizedThresholds, pullUpEstimatedAddedWeightOneRepMax,
  requiredWorkingWeight,
} from '@/lib/strength-calculations';
import { levelIndexForThresholds } from '@/lib/workout-schema.mjs';

export type MuscleGroup =
  | 'chest' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'abs' | 'obliques'
  | 'traps' | 'upperBack' | 'lats' | 'rearDelts' | 'lowerBack'
  | 'glutes' | 'quads' | 'hamstrings' | 'adductors' | 'calves';

export type ExerciseMuscles = { primary: MuscleGroup[]; secondary: MuscleGroup[] };

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms',
  abs: 'Abs', obliques: 'Obliques', traps: 'Traps', upperBack: 'Upper back', lats: 'Lats',
  rearDelts: 'Rear delts', lowerBack: 'Lower back', glutes: 'Glutes', quads: 'Quadriceps',
  hamstrings: 'Hamstrings', adductors: 'Adductors', calves: 'Calves',
};

export const STRENGTH_LEVELS = [
  { name: 'Beginner', color: '#e6e6e6' },
  { name: 'Beginner+', color: '#d0d0d0' },
  { name: 'Novice', color: '#bababa' },
  { name: 'Novice+', color: '#a3a3a3' },
  { name: 'Intermediate', color: '#8c8c8c' },
  { name: 'Intermediate+', color: '#747474' },
  { name: 'Advanced', color: '#5d5d5d' },
  { name: 'Advanced+', color: '#454545' },
  { name: 'Elite−', color: '#2e2e2e' },
  { name: 'Elite', color: '#111111' },
] as const;

const PLAN_BASELINE_LEVEL = 4;
const MAX_STRENGTH_LEVEL = STRENGTH_LEVELS.length;

const has = (name: string, ...terms: string[]) => terms.some((term) => name.includes(term));

export function musclesForExercise(exercise: LibraryExercise): ExerciseMuscles {
  const name = exercise.name.toLowerCase().replace(/[–—-]/g, ' ');
  const category = (exercise.category ?? '').toLowerCase();

  if (has(name, 'incline walk', 'walking, treadmill', 'treadmill', 'stair')) return { primary: ['glutes', 'calves'], secondary: ['quads', 'hamstrings'] };
  if (has(name, 'woodchopper')) return { primary: ['obliques'], secondary: ['abs', 'shoulders'] };
  if (has(name, 'plank')) return { primary: ['abs', 'obliques'], secondary: ['shoulders', 'glutes'] };
  if (has(name, 'ab crunch', 'dragon fly', 'hanging pike', 'leg raise', 'sit up')) return { primary: ['abs'], secondary: ['obliques'] };
  if (has(name, 'calf raise')) return { primary: ['calves'], secondary: [] };
  if (has(name, 'hip abductor')) return { primary: ['glutes'], secondary: ['obliques'] };
  if (has(name, 'hip adductor')) return { primary: ['adductors'], secondary: ['quads'] };
  if (has(name, 'hip thrust', 'glute bridge')) return { primary: ['glutes'], secondary: ['hamstrings', 'lowerBack'] };
  if (has(name, 'leg extension')) return { primary: ['quads'], secondary: [] };
  if (has(name, 'leg curl')) return { primary: ['hamstrings'], secondary: ['calves'] };
  if (has(name, 'back extension')) return { primary: ['lowerBack', 'glutes'], secondary: ['hamstrings'] };
  if (has(name, 'leg press', 'squat', 'walking lunge', 'lunges', 'split squat')) return { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors'] };
  if (has(name, 'wrist curl')) return { primary: ['forearms'], secondary: ['biceps'] };
  if (has(name, 'hammer curl')) return { primary: ['biceps', 'forearms'], secondary: [] };
  if (has(name, 'bicep curl', 'cable curl', 'dumbbell curl')) return { primary: ['biceps'], secondary: ['forearms'] };
  if (has(name, 'tricep', 'pushdown')) return { primary: ['triceps'], secondary: ['forearms'] };
  if (has(name, 'shrug')) return { primary: ['traps'], secondary: ['forearms', 'upperBack'] };
  if (has(name, 'face pull', 'rear delt')) return { primary: ['rearDelts', 'upperBack'], secondary: ['shoulders', 'traps'] };
  if (has(name, 'row')) return { primary: ['upperBack', 'lats'], secondary: ['rearDelts', 'biceps', 'forearms'] };
  if (has(name, 'pulldown', 'pull up', 'pullup')) return { primary: ['lats'], secondary: ['upperBack', 'biceps', 'forearms'] };
  if (has(name, 'lateral raise')) return { primary: ['shoulders'], secondary: ['traps'] };
  if (has(name, 'shoulder press', 'overhead press')) return { primary: ['shoulders'], secondary: ['triceps', 'chest'] };
  if (has(name, 'fly')) return { primary: ['chest'], secondary: ['shoulders'] };
  if (has(name, 'bench press', 'chest press', 'incline press')) return { primary: ['chest'], secondary: ['shoulders', 'triceps'] };

  if (category.includes('core')) return { primary: ['abs'], secondary: ['obliques'] };
  if (category.includes('hamstring')) return { primary: ['hamstrings'], secondary: ['glutes'] };
  if (category.includes('glute')) return { primary: ['glutes'], secondary: ['hamstrings'] };
  if (category.includes('leg') || category.includes('calves')) return { primary: ['quads'], secondary: ['glutes', 'hamstrings', 'calves'] };
  if (category.includes('pull') || category.includes('posture')) return { primary: ['upperBack', 'lats'], secondary: ['biceps', 'rearDelts'] };
  if (category.includes('push')) return { primary: ['chest', 'shoulders'], secondary: ['triceps'] };
  if (category.includes('arm')) return { primary: ['biceps', 'triceps'], secondary: ['forearms'] };
  return { primary: [], secondary: [] };
}

function normalizedName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

const EXERCISE_NAME_ALIASES: Record<string, string> = {
  'assisted pull up': 'Pull Up',
  'weighted pull up': 'Pull Up',
  'pullup': 'Pull Up',
  'pull up': 'Pull Up',
  'single arm iso lateral bench press': 'Iso lateral bench press',
  'single arm iso lateral wide pulldown': 'Iso lateral wide pulldown',
  'single arm iso lateral shoulder press': 'Iso lateral shoulder press',
  'single leg seated leg press': 'Seated leg press',
  'seated single leg curl': 'Seated leg curl',
  'lying single leg curl': 'Lying leg curl',
  'walking lunges': 'Leg extension (A)',
  'leverage incline chest press': 'Iso lateral super incline press',
  'seated cable rows': 'Close-grip seated row',
  'cable rear delt fly': 'Rear delt fly',
  'machine bicep curl': 'Bicep curl',
  'triceps pushdown': 'Tricep press',
  'hammer curls': 'Hammer curl (A)',
  'cable wrist curl': 'Wrist curl (B)',
  'hanging pike': 'Dragon fly',
  'walking treadmill': 'Incline walk',
  'cable crunch': 'Cable Woodchopper',
  'cable woodchopper': 'Cable Woodchopper',
  'cable shrug': 'Shrugs',
  'cable shrugs': 'Shrugs',
  'shrug': 'Shrugs',
  'shrugs': 'Shrugs',
};

export function canonicalExerciseName(name: string) {
  const trimmed = name.trim();
  const pairMarker = trimmed.match(/\s*\(([AB])\)\s*$/i)?.[1]?.toUpperCase();
  const withoutPairMarker = trimmed.replace(/\s*\([AB]\)\s*$/i, '');
  const canonical = EXERCISE_NAME_ALIASES[normalizedName(withoutPairMarker)] ?? withoutPairMarker;
  const keepPairMarker = normalizedName(canonical) !== 'shrugs';
  return pairMarker && keepPairMarker && !/\s\([AB]\)$/i.test(canonical) ? `${canonical} (${pairMarker})` : canonical;
}

export function exerciseNamesMatch(left: string, right: string) {
  return normalizedName(canonicalExerciseName(left)) === normalizedName(canonicalExerciseName(right));
}

export function isLoadedBackExtension(exercise: { id?: string; name: string }) {
  return exercise.id === 'exercise-loaded-back-extension'
    || stableExerciseId(exercise.name) === 'exercise-loaded-back-extension';
}

export function isPlankExercise(exercise: { id?: string; name: string }) {
  return exercise.id === 'exercise-plank' || stableExerciseId(exercise.name) === 'exercise-plank';
}

export function isWeightedHoldStandard(standard?: ExerciseLevelStandard | null): standard is ExerciseLevelStandard & { holdSeconds: number[] } {
  return standard?.metric === 'weightedHold' && standard.thresholds.length === 10
    && standard.holdSeconds?.length === 10;
}

export function weightedHoldLevel(standard: ExerciseLevelStandard, weight: number, seconds: number) {
  if (!isWeightedHoldStandard(standard)) return 1;
  let level = 1;
  standard.thresholds.forEach((requiredWeight, index) => {
    if (weight >= requiredWeight && seconds >= standard.holdSeconds[index]) level = index + 1;
  });
  return level;
}

export function bestWeightedHoldPerformance<T extends { weight: number; durationSeconds: number }>(
  standard: ExerciseLevelStandard,
  performances: T[],
) {
  return performances.reduce<T | null>((best, performance) => {
    if (!best) return performance;
    const level = weightedHoldLevel(standard, performance.weight, performance.durationSeconds);
    const bestLevel = weightedHoldLevel(standard, best.weight, best.durationSeconds);
    if (level !== bestLevel) return level > bestLevel ? performance : best;
    if (performance.weight !== best.weight) return performance.weight > best.weight ? performance : best;
    return performance.durationSeconds > best.durationSeconds ? performance : best;
  }, null);
}

function rounded(value: number) {
  return Math.round(value * 2) / 2;
}

export type StrengthLevel = {
  index: number;
  name: string;
  color: string;
  load: number;
  rangeMin: number;
  rangeMax: number;
  isAssistance: boolean;
  hasHistory: boolean;
  loadMode: ExerciseLoadMode;
  metric: ExerciseLevelMetric;
  unit: 'kg' | 'reps' | 'sec' | 'level';
  ranges: Array<{ min: number; max: number | null }>;
  isAddedWeight?: boolean;
  milestones?: Array<{ weight: number; seconds: number }>;
  bestWeight?: number;
  bestSeconds?: number;
  estimatedOneRepMax?: number | null;
  baselineThresholds?: number[];
  personalizedThresholds?: number[];
  targetWorkingWeights?: Array<number | null>;
  targetReps?: number;
  approximate?: boolean;
  personalizationLabel?: string;
};

function explicitLevelRanges(thresholds: number[]) {
  return thresholds.map((min, index) => ({
    min,
    max: index === thresholds.length - 1 ? null : thresholds[index + 1],
  }));
}

function assistanceLevelRanges(startingAssistance: number) {
  const advancedLevelCount = MAX_STRENGTH_LEVEL - PLAN_BASELINE_LEVEL;
  return STRENGTH_LEVELS.map((_, tierIndex) => {
    const index = tierIndex + 1;
    const max = index <= PLAN_BASELINE_LEVEL
      ? startingAssistance * (2 - (index - 1) / PLAN_BASELINE_LEVEL)
      : startingAssistance * (1 - (index - PLAN_BASELINE_LEVEL - 1) / advancedLevelCount);
    const min = index <= PLAN_BASELINE_LEVEL
      ? startingAssistance * (2 - index / PLAN_BASELINE_LEVEL)
      : startingAssistance * (1 - (index - PLAN_BASELINE_LEVEL) / advancedLevelCount);
    return { min: rounded(Math.max(0, min)), max: rounded(Math.max(0, max)) };
  });
}

function generatedLevelRanges(plannedLoad: number, upperBound: number) {
  const advancedLevelCount = MAX_STRENGTH_LEVEL - PLAN_BASELINE_LEVEL;
  return STRENGTH_LEVELS.map((_, tierIndex) => {
    const index = tierIndex + 1;
    const min = index <= PLAN_BASELINE_LEVEL
      ? plannedLoad * (index - 1) / PLAN_BASELINE_LEVEL
      : plannedLoad + (upperBound - plannedLoad) * (index - PLAN_BASELINE_LEVEL - 1) / advancedLevelCount;
    const max = index === MAX_STRENGTH_LEVEL ? null : index <= PLAN_BASELINE_LEVEL
      ? plannedLoad * index / PLAN_BASELINE_LEVEL
      : plannedLoad + (upperBound - plannedLoad) * (index - PLAN_BASELINE_LEVEL) / advancedLevelCount;
    return { min: rounded(min), max: max === null ? null : rounded(max) };
  });
}

function advancedLoadMultiplier(exercise: LibraryExercise) {
  const name = exercise.name.toLowerCase();
  if (/wrist|curl|lateral raise|face pull|fly/.test(name)) return 1.75;
  if (/leg press|squat|hip thrust|calf raise/.test(name)) return 1.8;
  return 2;
}

export function exerciseHistoryKeys({ name, id = '' }: { name: string; id?: string }) {
  return [...new Set([id, stableExerciseId(name), stableExerciseId(canonicalExerciseName(name))].filter(Boolean))];
}

function normalizeStandardLoad(weight: number, loadMode: ExerciseLoadMode, standard: ExerciseLevelStandard) {
  if (standard.loadRepresentation === 'perDumbbell' && loadMode === 'total') return weight / 2;
  if (standard.loadRepresentation === 'total' && loadMode === 'perSide') return weight * 2;
  return weight;
}

function strengthLevelForV2(
  exercise: LibraryExercise,
  matches: ExerciseRecord[],
  profile?: StrengthProfile | null,
): StrengthLevel | null {
  const standard = exercise.levelStandard;
  if (!standard || standard.thresholds.length !== 10) return null;
  if (standard.metric === 'weightedHold' && standard.holdSeconds?.length === 10) {
    const performances = matches.flatMap((record) => record.completedSets.length
      ? record.completedSets.map((set) => ({ weight: set.weight, durationSeconds: set.durationSeconds }))
      : [{ weight: record.weight, durationSeconds: record.setsCompleted ? record.durationSeconds / record.setsCompleted : record.durationSeconds }]);
    const planPerformance = { weight: exercise.weight, durationSeconds: exercise.durationSeconds };
    const best = bestWeightedHoldPerformance(standard, [planPerformance, ...performances]) ?? planPerformance;
    const index = weightedHoldLevel(standard, best.weight, best.durationSeconds);
    const milestones = standard.thresholds.map((weight, milestoneIndex) => ({ weight, seconds: standard.holdSeconds![milestoneIndex] }));
    return {
      index, ...STRENGTH_LEVELS[index - 1], load: index, rangeMin: index, rangeMax: index,
      isAssistance: false, hasHistory: performances.length > 0, loadMode: exercise.loadMode,
      metric: standard.metric, unit: standard.unit, ranges: milestones.map((_, milestoneIndex) => ({ min: milestoneIndex + 1, max: milestoneIndex + 1 })),
      milestones, bestWeight: rounded(best.weight), bestSeconds: rounded(best.durationSeconds),
      baselineThresholds: [...standard.thresholds], personalizedThresholds: [...standard.thresholds], approximate: true,
      personalizationLabel: 'Custom timed progression',
    };
  }

  const personalized = personalizedThresholds(standard, profile);
  const targetReps = Math.max(1, exercise.reps || exercise.repRangeMax || exercise.repRangeMin || 1);
  const customDirectLoad = standard.matchQuality === 'custom' && standard.loadRepresentation === 'addedWeight';
  const pullUp = exercise.id === 'exercise-pull-up' || stableExerciseId(exercise.name) === 'exercise-pull-up';
  const performanceValues: number[] = [];

  const addPerformance = (weight: number, reps: number, loadMode: ExerciseLoadMode) => {
    if (customDirectLoad) { performanceValues.push(weight); return; }
    if (pullUp) {
      if (profile?.bodyweightKg) {
        const estimated = pullUpEstimatedAddedWeightOneRepMax(
          profile.bodyweightKg,
          loadMode === 'assistance' ? weight : 0,
          loadMode === 'total' || loadMode === 'perSide' ? weight : 0,
          reps,
        );
        if (estimated !== null) performanceValues.push(estimated);
      } else performanceValues.push(loadMode === 'assistance' ? -weight : weight);
      return;
    }
    const normalized = normalizeStandardLoad(weight, loadMode, standard);
    const estimated = estimatedOneRepMax(normalized, reps);
    if (estimated !== null) performanceValues.push(estimated);
  };

  for (const record of matches) {
    if (record.completedSets.length) record.completedSets.forEach((set) => addPerformance(set.weight, set.reps, record.loadMode));
    else addPerformance(record.weight, record.reps, record.loadMode);
  }
  if (!performanceValues.length) addPerformance(exercise.weight, targetReps, exercise.loadMode);
  const performance = performanceValues.length ? Math.max(...performanceValues) : 0;
  const rawIndex = levelForThresholds(personalized.thresholds, performance);
  const index = Math.max(1, rawIndex);
  const tier = rawIndex ? STRENGTH_LEVELS[index - 1] : { name: 'Below L1', color: '#eeeeee' };
  const targetWorkingWeights = customDirectLoad
    ? personalized.thresholds.map((threshold) => threshold)
    : pullUp ? personalized.thresholds.map(() => null)
      : personalized.thresholds.map((threshold) => requiredWorkingWeight(threshold, targetReps));
  const ranges = targetWorkingWeights.map((minimum, tierIndex) => ({
    min: minimum ?? personalized.thresholds[tierIndex],
    max: tierIndex === 9 ? null : targetWorkingWeights[tierIndex + 1] ?? personalized.thresholds[tierIndex + 1],
  }));
  const personalizationLabel = personalized.personalized
    ? `${personalized.bodyweightMethod === 'published' ? 'Published bodyweight table' : personalized.bodyweightMethod === 'allometric-proxy' ? 'Approximate bodyweight scaling' : 'No bodyweight adjustment'} · ${personalized.ageMethod === 'published' ? 'published age table' : personalized.ageMethod === 'generic-proxy' ? 'generic age curve' : 'no age adjustment'}`
    : 'Baseline 1RM · set bodyweight and age to personalize';
  return {
    index: rawIndex, name: tier.name, color: tier.color, load: rounded(performance),
    rangeMin: ranges[index - 1]?.min ?? 0, rangeMax: ranges[index - 1]?.max ?? personalized.thresholds[index - 1],
    isAssistance: exercise.loadMode === 'assistance', hasHistory: matches.length > 0,
    loadMode: exercise.loadMode, metric: standard.metric, unit: standard.unit, ranges,
    isAddedWeight: standard.loadRepresentation === 'addedWeight' || pullUp,
    estimatedOneRepMax: customDirectLoad ? null : performance,
    baselineThresholds: [...standard.thresholds], personalizedThresholds: personalized.thresholds,
    targetWorkingWeights, targetReps, approximate: personalized.approximate,
    personalizationLabel: `${personalizationLabel}${personalized.referenceLimited ? ' · outside the local published table, nearest supported value used' : ''}`,
  };
}

export function createStrengthLevelResolver(history: ExerciseRecord[], resetAt = '', profile?: StrengthProfile | null) {
  const resetTime = resetAt ? new Date(resetAt).getTime() : 0;
  const byExercise = new Map<string, ExerciseRecord[]>();
  for (const record of history) {
    if (record.type !== 'strength' || (resetTime && new Date(record.date).getTime() < resetTime)) continue;
    for (const key of exerciseHistoryKeys({ name: record.exercise, id: record.exerciseId })) {
      const records = byExercise.get(key) ?? [];
      records.push(record);
      byExercise.set(key, records);
    }
  }

  return (exercise: LibraryExercise) => {
    const matches = new Set<ExerciseRecord>();
    for (const key of exerciseHistoryKeys(exercise)) {
      for (const record of byExercise.get(key) ?? []) matches.add(record);
    }
    return strengthLevelForExercise(exercise, [], resetAt, [...matches], profile);
  };
}

export function strengthLevelForActiveExercise(exercise: ExerciseEntry, history: ExerciseRecord[] = [], resetAt = '', profile?: StrengthProfile | null) {
  return strengthLevelForExercise({
    id: exercise.id,
    name: exercise.name,
    type: exercise.type,
    measurement: exercise.measurement,
    loadMode: exercise.loadMode,
    weight: exercise.targetWeight,
    reps: exercise.targetReps,
    sets: exercise.sets.length,
    durationSeconds: exercise.targetDurationSeconds,
    durationMinutes: exercise.targetDurationMinutes,
    distanceKm: exercise.targetDistanceKm,
    calories: exercise.sets[0]?.calories ?? 0,
    restSeconds: exercise.restSeconds,
    category: exercise.category, repRangeMin: exercise.repRangeMin, repRangeMax: exercise.repRangeMax,
    levelStandard: exercise.levelStandard,
  }, history, resetAt, undefined, profile);
}

export function strengthLevelForWorkoutExercise(
  exercise: ExerciseEntry,
  planExercises: LibraryExercise[],
  history: ExerciseRecord[] = [],
  resetAt = '',
  profile?: StrengthProfile | null,
) {
  const planExercise = planExercises.find((candidate) => candidate.id === exercise.id)
    ?? planExercises.find((candidate) => exerciseNamesMatch(candidate.name, exercise.name));
  return planExercise
    ? strengthLevelForExercise(planExercise, history, resetAt, undefined, profile)
    : strengthLevelForActiveExercise(exercise, history, resetAt, profile);
}

export function strengthLevelForExercise(exercise: LibraryExercise, history: ExerciseRecord[], resetAt = '', indexedMatches?: ExerciseRecord[], profile?: StrengthProfile | null): StrengthLevel | null {
  if (exercise.type === 'cardio') return null;
  if (exercise.levelStandard === null) return null;
  const exerciseId = exercise.id || stableExerciseId(exercise.name);
  const resetTime = resetAt ? new Date(resetAt).getTime() : 0;
  const matches = indexedMatches ?? history.filter((record) => record.type === 'strength' && (!resetTime || new Date(record.date).getTime() >= resetTime)
    && ((record.exerciseId || stableExerciseId(record.exercise)) === exerciseId || exerciseNamesMatch(record.exercise, exercise.name)));
  if (exercise.levelStandard?.version === 'strength-standards-v2') return strengthLevelForV2(exercise, matches, profile);
  const historyLoads = matches.map((record) => record.weight).filter((weight) => Number.isFinite(weight) && weight >= 0);
  const isAssistance = exercise.loadMode === 'assistance' || /assist/i.test(exercise.name);
  const plannedLoad = Math.max(0, exercise.weight);

  if (exercise.levelStandard) {
    const { thresholds, metric, unit, holdSeconds } = exercise.levelStandard;
    const ranges = explicitLevelRanges(thresholds);
    const exerciseKey = stableExerciseId(canonicalExerciseName(exercise.name));
    const backExtensionProgression = exerciseKey === 'exercise-loaded-back-extension' && metric === 'weight';
    const weightedHoldProgression = metric === 'weightedHold' && holdSeconds?.length === 10;
    if (weightedHoldProgression) {
      const historyPerformances = matches.flatMap((record) => {
        const completed = record.completedSets.filter((set) => set.durationSeconds > 0);
        if (completed.length) return completed;
        const seconds = record.setsCompleted ? record.durationSeconds / record.setsCompleted : record.durationSeconds;
        return seconds > 0 ? [{ weight: record.weight, durationSeconds: seconds }] : [];
      });
      const planPerformance = { weight: exercise.weight, durationSeconds: exercise.durationSeconds };
      const best = bestWeightedHoldPerformance(exercise.levelStandard, [planPerformance, ...historyPerformances]) ?? planPerformance;
      const index = weightedHoldLevel(exercise.levelStandard, best.weight, best.durationSeconds);
      const milestones = thresholds.map((weight, milestoneIndex) => ({ weight, seconds: holdSeconds[milestoneIndex] }));
      return {
        index, ...STRENGTH_LEVELS[index - 1],
        load: index, rangeMin: index, rangeMax: index,
        isAssistance: false, hasHistory: historyPerformances.length > 0, loadMode: exercise.loadMode,
        metric, unit, ranges: milestones.map((_, milestoneIndex) => ({ min: milestoneIndex + 1, max: milestoneIndex + 1 })),
        milestones, bestWeight: rounded(best.weight), bestSeconds: rounded(best.durationSeconds),
      };
    }
    const historyValues = matches.flatMap((record) => {
      if (metric === 'weight') return [record.weight];
      if (metric === 'assistanceEquivalent') return [record.loadMode === 'assistance' ? -record.weight : record.weight];
      if (metric === 'seconds') {
        const setValues = record.completedSets.map((set) => set.durationSeconds).filter((value) => value > 0);
        return setValues.length ? setValues : [record.setsCompleted ? record.durationSeconds / record.setsCompleted : record.durationSeconds];
      }
      const setValues = record.completedSets.map((set) => set.reps).filter((value) => value > 0);
      return setValues.length ? setValues : [record.reps];
    }).filter((value) => Number.isFinite(value) && (metric === 'assistanceEquivalent' || value >= 0));
    const plannedValue = metric === 'weight' ? exercise.weight
      : metric === 'assistanceEquivalent' ? exercise.loadMode === 'assistance' ? -exercise.weight : exercise.weight
      : metric === 'seconds' ? exercise.durationSeconds
      : exercise.reps;
    const load = Math.max(plannedValue, ...historyValues);
    const index = levelIndexForThresholds(thresholds, load);
    return {
      index, ...STRENGTH_LEVELS[index - 1], load: rounded(load),
      rangeMin: thresholds[index - 1], rangeMax: thresholds[Math.min(index, thresholds.length - 1)],
      isAssistance, hasHistory: historyValues.length > 0, loadMode: exercise.loadMode, metric, unit, ranges,
      isAddedWeight: backExtensionProgression,
    };
  }

  const load = isAssistance
    ? (historyLoads.length ? Math.min(plannedLoad, ...historyLoads) : plannedLoad)
    : Math.max(plannedLoad, ...historyLoads, 0);

  if (isAssistance) {
    const startingAssistance = plannedLoad;
    if (startingAssistance <= 0) return { index: PLAN_BASELINE_LEVEL, ...STRENGTH_LEVELS[PLAN_BASELINE_LEVEL - 1], load: rounded(load), rangeMin: 0, rangeMax: 0, isAssistance, hasHistory: historyLoads.length > 0, loadMode: exercise.loadMode, metric: 'weight', unit: 'kg', ranges: STRENGTH_LEVELS.map(() => ({ min: 0, max: 0 })) };
    const advancedLevelCount = MAX_STRENGTH_LEVEL - PLAN_BASELINE_LEVEL;
    const ranges = assistanceLevelRanges(startingAssistance);
    const index = load >= startingAssistance
      ? Math.max(1, Math.min(PLAN_BASELINE_LEVEL, Math.ceil(((2 * startingAssistance - load) / startingAssistance) * PLAN_BASELINE_LEVEL)))
      : Math.max(PLAN_BASELINE_LEVEL + 1, Math.min(MAX_STRENGTH_LEVEL, PLAN_BASELINE_LEVEL + Math.ceil(((startingAssistance - load) / startingAssistance) * advancedLevelCount)));
    const rangeMax = index <= PLAN_BASELINE_LEVEL
      ? startingAssistance * (2 - (index - 1) / PLAN_BASELINE_LEVEL)
      : startingAssistance * (1 - (index - PLAN_BASELINE_LEVEL - 1) / advancedLevelCount);
    const rangeMin = index <= PLAN_BASELINE_LEVEL
      ? startingAssistance * (2 - index / PLAN_BASELINE_LEVEL)
      : startingAssistance * (1 - (index - PLAN_BASELINE_LEVEL) / advancedLevelCount);
    return { index, ...STRENGTH_LEVELS[index - 1], load: rounded(load), rangeMin: rounded(rangeMin), rangeMax: rounded(rangeMax), isAssistance, hasHistory: historyLoads.length > 0, loadMode: exercise.loadMode, metric: 'weight', unit: 'kg', ranges };
  }

  if (plannedLoad <= 0 && load <= 0) return { index: PLAN_BASELINE_LEVEL, ...STRENGTH_LEVELS[PLAN_BASELINE_LEVEL - 1], load: 0, rangeMin: 0, rangeMax: 0, isAssistance, hasHistory: historyLoads.length > 0, loadMode: exercise.loadMode, metric: 'weight', unit: 'kg', ranges: STRENGTH_LEVELS.map(() => ({ min: 0, max: 0 })) };
  // Generated bands are anchored to the plan so a new personal best cannot move
  // the level boundaries underneath previously recorded history.
  const upperBound = Math.max(plannedLoad + 10, plannedLoad * advancedLoadMultiplier(exercise));
  const ranges = generatedLevelRanges(plannedLoad, upperBound);
  const advancedLevelCount = MAX_STRENGTH_LEVEL - PLAN_BASELINE_LEVEL;
  const index = load <= plannedLoad
    ? Math.max(1, Math.min(PLAN_BASELINE_LEVEL, Math.ceil((load / Math.max(plannedLoad, 1)) * PLAN_BASELINE_LEVEL)))
    : Math.max(PLAN_BASELINE_LEVEL + 1, Math.min(MAX_STRENGTH_LEVEL, PLAN_BASELINE_LEVEL + Math.ceil(((load - plannedLoad) / Math.max(upperBound - plannedLoad, 1)) * advancedLevelCount)));
  const rangeMin = index <= PLAN_BASELINE_LEVEL
    ? plannedLoad * (index - 1) / PLAN_BASELINE_LEVEL
    : plannedLoad + (upperBound - plannedLoad) * (index - PLAN_BASELINE_LEVEL - 1) / advancedLevelCount;
  const rangeMax = index <= PLAN_BASELINE_LEVEL
    ? plannedLoad * index / PLAN_BASELINE_LEVEL
    : plannedLoad + (upperBound - plannedLoad) * (index - PLAN_BASELINE_LEVEL) / advancedLevelCount;
  return {
    index, ...STRENGTH_LEVELS[index - 1], load: rounded(load),
    rangeMin: rounded(rangeMin), rangeMax: rounded(rangeMax),
    isAssistance, hasHistory: historyLoads.length > 0, loadMode: exercise.loadMode, metric: 'weight', unit: 'kg',
    ranges,
  };
}
