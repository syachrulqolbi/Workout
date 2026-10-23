export const WORKOUT_SCHEMA_VERSION = 15;

const EXERCISE_ID_ALIASES = new Map([
  ['assisted-pull-up', 'pull-up'],
  ['weighted-pull-up', 'pull-up'],
  ['pullup', 'pull-up'],
  ['cable-shrug', 'shrugs'],
  ['cable-shrugs', 'shrugs'],
  ['shrug', 'shrugs'],
]);

export function stableExerciseId(name) {
  const base = String(name ?? '')
    .trim()
    .replace(/\s*\([AB]\)\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `exercise-${(EXERCISE_ID_ALIASES.get(base) ?? base) || 'untitled'}`;
}

export function levelIndexForThresholds(thresholds, value) {
  let index = 1;
  thresholds.forEach((threshold, thresholdIndex) => {
    if (value >= threshold) index = thresholdIndex + 1;
  });
  return index;
}

export function levelUpperLimit(thresholds, level = 1, step = 0.5) {
  const safeThresholds = Array.isArray(thresholds) ? thresholds.map(Number).filter(Number.isFinite) : [];
  const safeLevel = Math.max(1, Math.min(safeThresholds.length, Math.round(Number(level) || 1)));
  const lower = safeThresholds[safeLevel - 1];
  const next = safeThresholds[safeLevel];
  if (!Number.isFinite(lower)) return 0;
  if (!Number.isFinite(next)) return lower;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.5;
  const upper = Math.ceil(next / safeStep - 1) * safeStep;
  return Math.max(lower, Math.round(upper * 1000) / 1000);
}
