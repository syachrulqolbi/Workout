import type { ExerciseLevelStandard, StrengthProfile } from '@/lib/workout-data';

export const STRENGTH_STANDARD_VERSION = 'strength-standards-v2';
export const REFERENCE_BODYWEIGHT_KG = 75;
export const REFERENCE_AGE_YEARS = 30;

export type StandardSource =
  | 'NEW_STRENGTH_LEVEL_MAPPING'
  | 'LEGACY_STANDARD_FALLBACK'
  | 'APPROXIMATE_PROXY'
  | 'CUSTOM_PROGRESSION'
  | 'NO_NUMERIC_STANDARD';

export type ReferencePoint = { input: number; thresholds: number[] };
export type PersonalizationResult = {
  thresholds: number[];
  personalized: boolean;
  bodyweightMethod: 'published' | 'allometric-proxy' | 'unadjusted';
  ageMethod: 'published' | 'generic-proxy' | 'unadjusted';
  approximate: boolean;
  referenceLimited: boolean;
};

export function oneRepMaxMultiplier(reps: number) {
  const value = Number(reps);
  if (!Number.isFinite(value) || value <= 0 || value >= 37) return null;
  const brzycki = 36 / (37 - value);
  const epley = 1 + value / 30;
  if (value < 8) return brzycki;
  if (value > 10) return epley;
  const alpha = (value - 8) / 2;
  return (1 - alpha) * brzycki + alpha * epley;
}

export function estimatedOneRepMax(weight: number, reps: number) {
  const load = Number(weight);
  const multiplier = oneRepMaxMultiplier(reps);
  return Number.isFinite(load) && load >= 0 && multiplier ? load * multiplier : null;
}

export function requiredWorkingWeight(oneRepMax: number, reps: number) {
  const benchmark = Number(oneRepMax);
  const multiplier = oneRepMaxMultiplier(reps);
  return Number.isFinite(benchmark) && benchmark >= 0 && multiplier ? benchmark / multiplier : null;
}

export function expandFiveLevelAnchors(anchors: Array<number | null | undefined>) {
  if (anchors.length !== 5 || anchors.some((value) => value == null || !Number.isFinite(Number(value)))) return null;
  const [l1, l3, l5, l7, l10] = anchors.map(Number);
  return [
    l1, (l1 + l3) / 2, l3, (l3 + l5) / 2, l5,
    (l5 + l7) / 2, l7, l7 + (l10 - l7) / 3,
    l7 + 2 * (l10 - l7) / 3, l10,
  ];
}

export function resolveBaselineThresholds(
  configured: Array<number | null | undefined> | null | undefined,
  legacy: Array<number | null | undefined> | null | undefined,
) {
  const expandedLegacy = legacy?.length === 5 ? expandFiveLevelAnchors(legacy) : legacy;
  const values = Array.from({ length: 10 }, (_, index) => {
    const next = configured?.[index];
    if (next !== null && next !== undefined && Number.isFinite(Number(next))) return Number(next);
    const previous = expandedLegacy?.[index];
    return previous !== null && previous !== undefined && Number.isFinite(Number(previous)) ? Number(previous) : null;
  });
  const source: StandardSource = configured?.every((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    ? 'NEW_STRENGTH_LEVEL_MAPPING'
    : values.some((value) => value !== null) ? 'LEGACY_STANDARD_FALLBACK' : 'NO_NUMERIC_STANDARD';
  return { values, source };
}

function interpolate(points: ReferencePoint[], input: number, levelIndex: number) {
  const sorted = [...points].filter((point) => Number.isFinite(point.input) && Number.isFinite(point.thresholds[levelIndex]))
    .sort((left, right) => left.input - right.input);
  if (!sorted.length) return null;
  if (input <= sorted[0].input) return sorted[0].thresholds[levelIndex];
  if (input >= sorted.at(-1)!.input) return sorted.at(-1)!.thresholds[levelIndex];
  const upperIndex = sorted.findIndex((point) => point.input >= input);
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  const ratio = (input - lower.input) / (upper.input - lower.input);
  return lower.thresholds[levelIndex] + ratio * (upper.thresholds[levelIndex] - lower.thresholds[levelIndex]);
}

function genericAgeFactor(age: number) {
  const points = [
    [15, .85], [20, .975], [25, 1], [40, 1], [45, .94], [50, .88], [55, .81],
    [60, .74], [65, .67], [70, .60], [75, .55], [80, .49], [85, .43], [90, .39],
  ] as const;
  if (age <= points[0][0]) return points[0][1];
  if (age >= points.at(-1)![0]) return points.at(-1)![1];
  const upperIndex = points.findIndex(([pointAge]) => pointAge >= age);
  const [lowerAge, lowerValue] = points[upperIndex - 1];
  const [upperAge, upperValue] = points[upperIndex];
  return lowerValue + (age - lowerAge) / (upperAge - lowerAge) * (upperValue - lowerValue);
}

function monotonic(values: number[]) {
  return values.map((value, index) => index ? Math.max(value, values[index - 1]) : value);
}

export function personalizedThresholds(standard: ExerciseLevelStandard, profile?: StrengthProfile | null): PersonalizationResult {
  const baseline = standard.thresholds;
  if (baseline.length !== 10 || standard.metric !== 'weight') {
    return { thresholds: [...baseline], personalized: false, bodyweightMethod: 'unadjusted', ageMethod: 'unadjusted', approximate: standard.matchQuality === 'proxy' || standard.matchQuality === 'custom', referenceLimited: false };
  }
  const bodyweight = profile?.bodyweightKg && profile.bodyweightKg > 0 ? profile.bodyweightKg : null;
  const age = profile?.ageYears && profile.ageYears > 0 ? profile.ageYears : null;
  const bodyweightPoints = standard.bodyweightReference ?? [];
  const agePoints = standard.ageReference ?? [];
  const outsideRange = (points: ReferencePoint[], input: number | null) => Boolean(input && points.length
    && (input < Math.min(...points.map((point) => point.input)) || input > Math.max(...points.map((point) => point.input))));
  const referenceLimited = outsideRange(bodyweightPoints, bodyweight) || outsideRange(agePoints, age);
  const thresholds = baseline.map((base, index) => {
    let bodyweightFactor = 1;
    if (bodyweight) {
      const referenceAtBodyweight = interpolate(bodyweightPoints, bodyweight, index);
      const referenceAt75 = interpolate(bodyweightPoints, REFERENCE_BODYWEIGHT_KG, index);
      bodyweightFactor = referenceAtBodyweight !== null && referenceAt75
        ? referenceAtBodyweight / referenceAt75
        : Math.pow(bodyweight / REFERENCE_BODYWEIGHT_KG, 2 / 3);
    }
    let ageFactor = 1;
    if (age) {
      const referenceAtAge = interpolate(agePoints, age, index);
      const referenceAt30 = interpolate(agePoints, REFERENCE_AGE_YEARS, index);
      ageFactor = referenceAtAge !== null && referenceAt30 ? referenceAtAge / referenceAt30 : genericAgeFactor(age);
    }
    return base * bodyweightFactor * ageFactor;
  });
  return {
    thresholds: monotonic(thresholds), personalized: Boolean(bodyweight || age),
    bodyweightMethod: !bodyweight ? 'unadjusted' : bodyweightPoints.length ? 'published' : 'allometric-proxy',
    ageMethod: !age ? 'unadjusted' : agePoints.length ? 'published' : 'generic-proxy',
    approximate: standard.matchQuality !== 'exact' || (Boolean(bodyweight) && !bodyweightPoints.length) || (Boolean(age) && !agePoints.length) || referenceLimited,
    referenceLimited,
  };
}

export function levelForThresholds(thresholds: number[], value: number) {
  if (!Number.isFinite(value) || !thresholds.length || value < thresholds[0]) return 0;
  let result = 1;
  thresholds.forEach((threshold, index) => { if (value >= threshold) result = index + 1; });
  return result;
}

export function pullUpEstimatedAddedWeightOneRepMax(bodyweightKg: number, assistanceKg: number, addedWeightKg: number, reps: number) {
  const multiplier = oneRepMaxMultiplier(reps);
  if (!multiplier || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null;
  const effectiveTotalLoad = bodyweightKg + Math.max(0, addedWeightKg) - Math.max(0, assistanceKg);
  return effectiveTotalLoad * multiplier - bodyweightKg;
}

export function pullUpTargetSetup(bodyweightKg: number, addedWeightOneRepMaxThreshold: number, targetReps: number) {
  const multiplier = oneRepMaxMultiplier(targetReps);
  if (!multiplier || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null;
  const externalDelta = (bodyweightKg + addedWeightOneRepMaxThreshold) / multiplier - bodyweightKg;
  return externalDelta < 0
    ? { mode: 'assisted' as const, assistanceKg: Math.abs(externalDelta), addedWeightKg: 0 }
    : externalDelta > 0
      ? { mode: 'weighted' as const, assistanceKg: 0, addedWeightKg: externalDelta }
      : { mode: 'bodyweight' as const, assistanceKg: 0, addedWeightKg: 0 };
}

export function equipmentIncrement(value: number, increment = .5) {
  return Math.round(value / increment) * increment;
}
