import type { ExerciseLevelStandard } from '@/lib/workout-data';
import { stableExerciseId } from '@/lib/workout-schema.mjs';
import { resolveBaselineThresholds, STRENGTH_STANDARD_VERSION } from '@/lib/strength-calculations';

type Definition = Omit<ExerciseLevelStandard, 'version' | 'source'> & { name: string };
const url = (slug: string) => `https://strengthlevel.com/strength-standards/${slug}/kg`;
const weight = (name: string, slug: string, thresholds: number[], matchQuality: ExerciseLevelStandard['matchQuality'], note: string, loadRepresentation: ExerciseLevelStandard['loadRepresentation'] = 'total'): Definition => ({
  name, thresholds, metric: 'weight', unit: 'kg', url: url(slug), slug, matchQuality, note, loadRepresentation,
});

const definitions: Definition[] = [
  weight('Iso Lateral Bench Press','chest-press',[34,45,56,71,86,103.5,121,134.5,147.5,161],'similar','Similar machine chest press; benchmark uses total load.'),
  weight('Iso Lateral Wide Pulldown','lat-pulldown',[42,51,60,71,82,94.5,107,116,125,134],'similar','Similar machine pulldown; machine mechanics can differ.'),
  weight('Iso Lateral Shoulder Press','machine-shoulder-press',[25,35,45,59,73,90.5,108,121.5,134.5,148],'similar','Similar machine shoulder press; benchmark uses total load.'),
  weight('Chest Fly Machine','machine-chest-fly',[37,47.5,58,71.5,85,101.5,118,130,142,154],'exact','Machine chest-fly movement match.'),
  weight('Lateral Raise','machine-lateral-raise',[22,29.5,37,47.5,58,71,84,93.5,103.5,113],'similar','Machine lateral-raise benchmark only.'),
  weight('Face Pull','face-pull',[14,20.5,27,36,45,56.5,68,77,86,95],'exact','Cable face-pull movement.'),
  weight('Wrist Curl (A)','wrist-curl',[6,12.5,19,30,41,56,71,83.5,96.5,109],'proxy','Barbell-equivalent total-weight proxy.'),
  weight('Hammer Curl (B)','hammer-curl',[9,12,15,19,23,27.5,32,35.75,39.25,43],'exact','Dumbbell standard; values are per dumbbell.','perDumbbell'),
  weight('Machine Ab Crunch','machine-seated-crunch',[26,36,46,60,74,90.5,107,119.5,132.5,145],'similar','Similar seated crunch machine.'),
  weight('Seated Leg Press (A)','horizontal-leg-press',[66,88,110,139,168,203,238,264,290,316],'similar','Horizontal leg-press machine only.'),
  weight('Pendulum X Squat (B)','hack-squat',[58,78.5,99,125.5,152,184.5,217,241,265,289],'proxy','Hack-squat proxy; a pendulum squat is not mechanically identical.'),
  weight('Hip Thrust','hip-thrust',[45,65,85,112.5,140,174,208,234,260,286],'similar','Barbell-equivalent hip-thrust standard.'),
  weight('Seated Leg Curl (A)','seated-leg-curl',[35,45,55,67.5,80,95,110,121,132,143],'exact','Seated leg-curl machine movement.'),
  weight('Lying Leg Curl (B)','lying-leg-curl',[26,34.5,43,53,63,76,89,98,107,116],'exact','Lying leg-curl machine movement.'),
  weight('Leg Extension (A)','leg-extension',[43,55.5,68,83.5,99,118,137,151,165,179],'exact','Leg-extension machine movement.'),
  { name:'Loaded Back Extension (A/B)', thresholds:[0,5,10,15,20,25,30,35,40,50], metric:'weight', unit:'kg', url:url('back-extension'), slug:'back-extension', matchQuality:'custom', note:'Custom added-plate progression for a 45-degree bench; official reference is bodyweight repetitions.', loadRepresentation:'addedWeight' },
  weight('Hip Abductor (A)','hip-abduction',[34,46.5,59,75.5,92,112,132,147.5,162.5,178],'similar','Seated hip-abduction machine where equipment matches.'),
  weight('Hip Adductor (B)','hip-adduction',[38,51,64,81.5,99,120.5,142,158,174,190],'similar','Seated hip-adduction machine where equipment matches.'),
  weight('Calf Raise','machine-calf-raise',[43,62.5,82,109.5,137,171,205,231.5,257.5,284],'similar','Machine calf-raise benchmark.'),
  { name:'Plank', thresholds:[0,0,0,0,5,10,15,25,35,40], holdSeconds:[20,30,45,60,30,45,60,60,60,60], metric:'weightedHold', unit:'level', url:url('plank'), slug:'plank', matchQuality:'custom', note:'Custom bodyweight and weighted-hold milestones; no ordinary 1RM calculation.', loadRepresentation:'timed' },
  weight('Iso Lateral Super Incline Press','incline-bench-press',[43,53,63,74.5,86,100,114,124,134,144],'proxy','Barbell incline-press proxy; machine mechanics differ.'),
  weight('Close-Grip Seated Row','seated-cable-row',[41,50.5,60,72,84,98,112,122,132,142],'similar','Cable-equivalent close-grip row.'),
  weight('Rear Delt Fly','machine-reverse-fly',[25,33.5,42,53,64,77,90,100,110,120],'similar','Machine reverse-fly variation.'),
  weight('Bicep Curl','machine-bicep-curl',[22,29.5,37,46,55,66.5,78,86.5,94.5,103],'similar','Machine biceps-curl variation.'),
  weight('Tricep Press','seated-dip-machine',[50,63,76,92.5,109,128.5,148,162,176,190],'proxy','Use only for a seated dip-style triceps press.'),
  { name:'Dragon Fly', thresholds:[], metric:'reps', unit:'reps', matchQuality:'custom', note:'Skill/repetition progression; no reliable weighted Strength Level match.', loadRepresentation:'bodyweight' },
  weight('Pull Up','pull-ups',[-3,5,13,22,31,41.5,52,59,66,73],'exact','Added-weight 1RM benchmark. Negative values represent assistance.','assisted'),
  weight('Iso Lateral High Row (A)','machine-row',[41,54,67,83.5,100,120.5,141,156,171,186],'similar','Similar plate-loaded machine row with a high pulling angle.'),
  weight('Iso Lateral Low Row (B)','machine-row',[41,54,67,83.5,100,120.5,141,156,171,186],'similar','Similar plate-loaded machine row with a low pulling angle.'),
  weight('Hi-Lo Cable Chest Fly','cable-fly',[7,12.5,18,26.5,35,46,57,66,75,84],'similar','Cable-fly benchmark with a similar angle.'),
  weight('Shrugs','dumbbell-shrug',[14,20,26,34,42,52,62,69.75,77.25,85],'exact','Dumbbell standard; values are per dumbbell.','perDumbbell'),
  weight('Cable Woodchopper','cable-woodchopper',[7,13,19,27.5,36,48,60,69.5,78.5,88],'exact','Cable woodchopper movement.'),
  { name:'Incline Walk', thresholds:[], metric:'seconds', unit:'sec', matchQuality:'cardio', note:'Cardio exercise; no strength 1RM category.', loadRepresentation:'timed' },
];

const ten = ([l1, l3, l5, l7, l10]: number[]) => [l1,(l1+l3)/2,l3,(l3+l5)/2,l5,(l5+l7)/2,l7,l7+(l10-l7)/3,l7+2*(l10-l7)/3,l10];
const localPublishedReferences: Record<string, Pick<ExerciseLevelStandard, 'bodyweightReference' | 'ageReference'>> = {
  'chest-press': {
    bodyweightReference: [[50,20,37,59,87,119],[75,36,57,85,117,154],[100,50,74,105,142,181],[125,62,89,123,162,204],[140,69,98,132,173,216]].map(([input,...values]) => ({ input, thresholds: ten(values) })),
    ageReference: [[15,29,48,73,103,137],[25,34,56,86,121,161],[30,34,56,86,121,161],[40,34,56,86,121,161],[50,30,50,76,107,142],[60,25,42,64,90,120],[65,22,37,57,80,106]].map(([input,...values]) => ({ input, thresholds: ten(values) })),
  },
  'hammer-curl': {
    bodyweightReference: [[50,5,9,15,22,30],[75,10,15,23,31,41],[100,14,21,29,39,49],[125,18,26,35,45,57],[140,20,28,38,49,61]].map(([input,...values]) => ({ input, thresholds: ten(values) })),
    ageReference: [[15,8,13,19,28,37],[25,9,15,23,32,43],[30,9,15,23,32,43],[40,9,15,23,32,43],[50,8,13,20,29,38],[60,7,11,17,24,32],[65,6,10,15,22,29]].map(([input,...values]) => ({ input, thresholds: ten(values) })),
  },
  'machine-lateral-raise': {
    bodyweightReference: [[50,10,20,35,54,75],[75,23,37,57,80,105],[100,35,53,75,101,130],[125,46,66,91,120,151],[140,53,74,100,130,162]].map(([input,...values]) => ({ input, thresholds: ten(values) })),
    ageReference: [[15,18,32,50,72,96],[25,22,37,58,84,113],[30,22,37,58,84,113],[40,22,37,58,84,113],[50,19,33,52,74,100],[60,16,28,44,63,84],[65,15,25,39,57,76]].map(([input,...values]) => ({ input, thresholds: ten(values) })),
  },
};
for (const definition of definitions) Object.assign(definition, localPublishedReferences[definition.slug ?? ''] ?? {});

const aliases: Record<string, string> = {
  'exercise-wrist-curl': 'Wrist Curl (A)', 'exercise-hammer-curl': 'Hammer Curl (B)',
  'exercise-loaded-back-extension': 'Loaded Back Extension (A/B)',
};

const exerciseIdentity = (value: string) => value.startsWith('exercise-')
  ? value : stableExerciseId(value.replace(/\s*\(A\/B\)\s*$/i, ''));

export const STRENGTH_STANDARD_DEFINITIONS = definitions;
export const STRENGTH_STANDARD_BY_ID = new Map(definitions.map((definition) => [exerciseIdentity(definition.name), definition]));

export function strengthStandardForExercise(id: string, name: string, legacy?: ExerciseLevelStandard | null): ExerciseLevelStandard | null {
  const identity = exerciseIdentity(id || name);
  const definition = STRENGTH_STANDARD_BY_ID.get(identity)
    ?? STRENGTH_STANDARD_BY_ID.get(stableExerciseId(aliases[identity] ?? name));
  if (!definition) return legacy ?? null;
  if (definition.matchQuality === 'cardio') return null;
  if (!definition.thresholds.length) return legacy ?? null;
  const resolved = resolveBaselineThresholds(definition.thresholds, legacy?.thresholds);
  if (resolved.values.some((value) => value === null)) return legacy ?? null;
  return {
    ...definition,
    thresholds: resolved.values as number[],
    version: STRENGTH_STANDARD_VERSION,
    source: resolved.source === 'LEGACY_STANDARD_FALLBACK' ? resolved.source
      : definition.matchQuality === 'custom' ? 'CUSTOM_PROGRESSION'
        : definition.matchQuality === 'proxy' ? 'APPROXIMATE_PROXY' : 'NEW_STRENGTH_LEVEL_MAPPING',
  };
}

export function canonicalV2DisplayName(id: string, currentName: string) {
  if (id === 'exercise-wrist-curl') return /\(B\)/i.test(currentName) ? 'Wrist Curl (B)' : 'Wrist Curl (A)';
  if (id === 'exercise-hammer-curl') return /\(A\)/i.test(currentName) ? 'Hammer Curl (A)' : 'Hammer Curl (B)';
  if (id === 'exercise-pull-up') return 'Pull Up';
  return currentName;
}
