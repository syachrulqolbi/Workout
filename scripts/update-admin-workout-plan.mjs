import { FieldValue, Firestore } from '@google-cloud/firestore';
import { levelUpperLimit, stableExerciseId, WORKOUT_SCHEMA_VERSION } from '../lib/workout-schema.mjs';

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'personal-project-414620';
const databaseId = process.env.FIRESTORE_DATABASE_ID ?? 'form-workout';
const collectionName = process.env.WORKOUT_USERS_COLLECTION ?? 'workout-users';
const targetEmail = (process.env.WORKOUT_PLAN_EMAIL ?? 'syachrulqolbinursepti@gmail.com').toLowerCase();
const schemaVersion = WORKOUT_SCHEMA_VERSION;
const apply = process.argv.includes('--apply');
const details = process.argv.includes('--details');
const resetLevels = process.argv.includes('--reset-levels');

const levelStandards = new Map([
  ['exercise-pull-up', { thresholds: [-50, -40, -30, -20, -10, 0, 5, 10, 20, 35], metric: 'assistanceEquivalent', unit: 'kg' }],
  ['exercise-iso-lateral-bench-press', [34, 45, 56, 71, 86, 103.5, 121, 134.5, 147.5, 161]],
  ['exercise-iso-lateral-wide-pulldown', [42, 51, 60, 71, 82, 94.5, 107, 116, 125, 134]],
  ['exercise-iso-lateral-shoulder-press', [25, 35, 45, 59, 73, 90.5, 108, 121.5, 134.5, 148]],
  ['exercise-chest-fly-machine', [37, 47.5, 58, 71.5, 85, 101.5, 118, 130, 142, 154]],
  ['exercise-lateral-raise', [22, 29.5, 37, 47.5, 58, 71, 84, 93.5, 103.5, 113]],
  ['exercise-face-pull', [14, 20.5, 27, 36, 45, 56.5, 68, 77, 86, 95]],
  ['exercise-wrist-curl', [6, 12.5, 19, 30, 41, 56, 71, 83.5, 96.5, 109]],
  ['exercise-hammer-curl', [18, 24, 30, 38, 46, 55, 64, 71.5, 78.5, 86]],
  ['exercise-machine-ab-crunch', [26, 36, 46, 60, 74, 90.5, 107, 119.5, 132.5, 145]],
  ['exercise-seated-leg-press', [66, 88, 110, 139, 168, 203, 238, 264, 290, 316]],
  ['exercise-pendulum-x-squat', [58, 78.5, 99, 125.5, 152, 184.5, 217, 241, 265, 289]],
  ['exercise-hip-thrust', [45, 65, 85, 112.5, 140, 174, 208, 234, 260, 286]],
  ['exercise-seated-leg-curl', [35, 45, 55, 67.5, 80, 95, 110, 121, 132, 143]],
  ['exercise-lying-leg-curl', [26, 34.5, 43, 53, 63, 76, 89, 98, 107, 116]],
  ['exercise-leg-extension', [43, 55.5, 68, 83.5, 99, 118, 137, 151, 165, 179]],
  ['exercise-loaded-back-extension', { thresholds: [0, 5, 10, 15, 20, 25, 30, 35, 40, 50], metric: 'weight', unit: 'kg' }],
  ['exercise-hip-abductor', [34, 46.5, 59, 75.5, 92, 112, 132, 147.5, 162.5, 178]],
  ['exercise-hip-adductor', [38, 51, 64, 81.5, 99, 120.5, 142, 158, 174, 190]],
  ['exercise-calf-raise', [43, 62.5, 82, 109.5, 137, 171, 205, 231.5, 257.5, 284]],
  ['exercise-plank', {
    thresholds: [0, 0, 0, 0, 5, 10, 15, 25, 35, 40],
    holdSeconds: [20, 30, 45, 60, 30, 45, 60, 60, 60, 60],
    metric: 'weightedHold',
    unit: 'level',
  }],
  ['exercise-iso-lateral-super-incline-press', [43, 53, 63, 74.5, 86, 100, 114, 124, 134, 144]],
  ['exercise-close-grip-seated-row', [41, 50.5, 60, 72, 84, 98, 112, 122, 132, 142]],
  ['exercise-rear-delt-fly', [25, 33.5, 42, 53, 64, 77, 90, 100, 110, 120]],
  ['exercise-bicep-curl', [22, 29.5, 37, 46, 55, 66.5, 78, 86.5, 94.5, 103]],
  ['exercise-tricep-press', [50, 63, 76, 92.5, 109, 128.5, 148, 162, 176, 190]],
  ['exercise-iso-lateral-high-row', [41, 54, 67, 83.5, 100, 120.5, 141, 156, 171, 186]],
  ['exercise-iso-lateral-low-row', [41, 50.5, 60, 72, 84, 98, 112, 122, 132, 142]],
  ['exercise-hi-lo-cable-chest-fly', [7, 12.5, 18, 26.5, 35, 46, 57, 66, 75, 84]],
  ['exercise-shrugs', [28, 40, 52, 68, 84, 104, 124, 139.5, 154.5, 170]],
  ['exercise-cable-woodchopper', [7, 13, 19, 27.5, 36, 48, 60, 69.5, 78.5, 88]],
]);

function levelStandard(name) {
  const standard = levelStandards.get(stableExerciseId(name));
  if (!standard) return null;
  return Array.isArray(standard) ? { thresholds: standard, metric: 'weight', unit: 'kg' } : standard;
}

function strength({ name, category, priority = false, weight, reps, sets, restSeconds }) {
  const timed = /\b(plank|hold|wall sit)\b/i.test(name);
  const standard = levelStandard(name);
  const assistance = (standard?.metric === 'assistanceEquivalent' && weight > 0) || /assist/i.test(name);
  const weightedHold = standard?.metric === 'weightedHold';
  const levelOneUpperValue = standard
    ? levelUpperLimit(standard.thresholds, 1, standard.metric === 'weight' ? 0.5 : 1)
    : undefined;
  const levelMetric = standard?.metric;
  const resetWeight = weightedHold ? standard.thresholds[0] : !assistance && levelMetric === 'weight' ? levelOneUpperValue : weight;
  const resetReps = levelMetric === 'reps' ? levelOneUpperValue : reps;
  const resetSeconds = weightedHold ? standard.holdSeconds[0] : levelMetric === 'seconds' ? levelOneUpperValue : reps;
  const loadMode = timed ? 'duration' : assistance ? 'assistance' : resetWeight > 0 ? 'total' : 'bodyweight';
  return {
    id: stableExerciseId(name), name, type: 'strength', measurement: timed ? 'duration' : 'reps',
    loadMode,
    weight: timed && !weightedHold ? 0 : resetWeight, reps: timed ? 0 : resetReps, sets, durationSeconds: timed ? resetSeconds : 0,
    durationMinutes: 0, distanceKm: 0, calories: 0, restSeconds,
    category, priority, ...(standard !== undefined ? { levelStandard: standard } : {}),
  };
}

function cardio() {
  return {
    id: stableExerciseId('Incline walk'), name: 'Incline walk', type: 'cardio', measurement: 'duration', loadMode: 'duration',
    weight: 0, reps: 0, sets: 1, durationSeconds: 0, durationMinutes: 15, distanceKm: 0, calories: 200, restSeconds: 0,
    category: 'CARDIO', priority: true,
  };
}

const dayPlans = [
  {
    day: 0,
    name: 'Push / Pull',
    focus: 'Chest, back, shoulders, abs, arms/forearms',
    estimatedTime: '70–85 min',
    exercises: [
      strength({ id: 'mon-bench-press', name: 'Iso lateral bench press', category: 'PUSH', priority: true, prescription: '3×6–8', current: '40 total', target: '166 total', weight: 40, reps: 8, sets: 3, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'mon-wide-pulldown', name: 'Iso lateral wide pulldown', category: 'PULL', priority: true, prescription: '3×6–8', current: '75 total', target: '134 total', weight: 75, reps: 8, sets: 3, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'mon-shoulder-press', name: 'Iso lateral shoulder press', category: 'PUSH', priority: true, prescription: '3×6–8', current: '55 total', target: '144 total', weight: 55, reps: 8, sets: 3, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'mon-chest-fly', name: 'Chest fly machine', category: 'PUSH', prescription: '2×10–15', current: '85 total', target: '154 total', weight: 85, reps: 15, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      strength({ id: 'mon-lateral-raise', name: 'Lateral raise', category: 'PUSH', prescription: '2×12–15', current: '69 total', target: '117 total', weight: 69, reps: 15, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'mon-face-pull', name: 'Face pull', category: 'PULL', prescription: '2×12–15', current: '47.5 total', target: '96 total', weight: 47.5, reps: 15, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'mon-wrist-curl', name: 'Wrist curl (A)', category: 'ARMS', prescription: '2×12–15', current: '50 total', target: '71 total', weight: 50, reps: 15, sets: 2, restSeconds: 45, restLabel: '30–45 sec' }),
      strength({ id: 'mon-hammer-curl', name: 'Hammer curl (B)', category: 'ARMS', prescription: '2×10–12', current: '20 total', target: '50 total', weight: 20, reps: 12, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'mon-ab-crunch', name: 'Machine ab crunch', category: 'CORE', priority: true, prescription: '2×10–15', current: '42.5', target: '86.5', weight: 42.5, reps: 15, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      cardio('mon-incline-walk'),
    ],
  },
  {
    day: 1,
    name: 'Leg',
    focus: 'Legs, glutes, hamstrings, posture, core',
    estimatedTime: '70–90 min',
    exercises: [
      strength({ id: 'tue-leg-press', name: 'Seated leg press (A)', category: 'LEGS', priority: true, prescription: '3×6–8', current: '110 total', target: '347 total', weight: 110, reps: 8, sets: 3, restSeconds: 120, restLabel: '2 min' }),
      strength({ id: 'tue-pendulum-squat', name: 'Pendulum X squat (B)', category: 'LEGS', priority: true, prescription: '3×6–8', current: '30', target: '143', weight: 30, reps: 8, sets: 3, restSeconds: 120, restLabel: '2 min' }),
      strength({ id: 'tue-hip-thrust', name: 'Hip thrust', category: 'GLUTES', priority: true, prescription: '3×6–8', current: '104', target: '128.5', weight: 104, reps: 8, sets: 3, restSeconds: 120, restLabel: '2 min' }),
      strength({ id: 'tue-seated-leg-curl', name: 'Seated leg curl (A)', category: 'HAMSTRINGS', prescription: '2×10–12', current: '66 total', target: '147 total', weight: 66, reps: 12, sets: 2, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'tue-lying-leg-curl', name: 'Lying leg curl (B)', category: 'HAMSTRINGS', prescription: '2×10–12', current: '64 total', target: '120 total', weight: 64, reps: 12, sets: 2, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'tue-walking-lunges', name: 'Leg extension (A)', category: 'LEGS', prescription: '2×8–10', current: '30 total', target: '100 total', weight: 30, reps: 10, sets: 2, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'tue-back-extension', name: 'Loaded back extension (B)', category: 'LEGS', weight: 20, reps: 12, sets: 3, restSeconds: 90 }),
      strength({ id: 'tue-hip-abductor', name: 'Hip abductor (A)', category: 'HIPS', prescription: '2×12–15', current: '50', target: '101.5', weight: 50, reps: 15, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'tue-hip-adductor', name: 'Hip adductor (B)', category: 'HIPS', prescription: '2×12–15', current: '55', target: '111', weight: 55, reps: 15, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'tue-calf-raise', name: 'Calf raise', category: 'CALVES', prescription: '2×12–15', current: '90', target: '145', weight: 90, reps: 15, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      strength({ name: 'Plank', category: 'CORE', priority: true, weight: 0, reps: 20, sets: 2, restSeconds: 60 }),
      cardio('tue-incline-walk'),
    ],
  },
  { day: 2, name: 'Rest', focus: 'Recovery', estimatedTime: '—', exercises: [] },
  {
    day: 3,
    name: 'Push / Pull / Arms',
    focus: 'Shoulders, chest, back, arms, posture, core',
    estimatedTime: '65–80 min',
    exercises: [
      strength({ id: 'thu-super-incline-press', name: 'Iso lateral super incline press', category: 'PUSH', priority: true, prescription: '3×6–8', current: '50 total', target: '130 total', weight: 50, reps: 8, sets: 3, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'thu-seated-row', name: 'Close-grip seated row', category: 'PULL', priority: true, prescription: '3×6–8', current: '75 total', target: '137 total', weight: 75, reps: 8, sets: 3, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'thu-rear-delt-fly', name: 'Rear delt fly', category: 'PULL', prescription: '2×12–15', current: '71 total', target: '119 total', weight: 71, reps: 15, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      strength({ id: 'thu-bicep-curl', name: 'Bicep curl', category: 'ARMS/PULL', prescription: '2×10–12', current: '45 total', target: '103 total', weight: 45, reps: 12, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      strength({ id: 'thu-tricep-press', name: 'Tricep press', category: 'ARMS/PUSH', prescription: '2×10–12', current: '75 total', target: '200 total', weight: 75, reps: 12, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      strength({ id: 'thu-hammer-curl', name: 'Hammer curl (A)', category: 'ARMS', prescription: '2×10–12', current: '20 total', target: '50 total', weight: 20, reps: 12, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'thu-wrist-curl', name: 'Wrist curl (B)', category: 'ARMS', prescription: '2×12–15', current: '50 total', target: '71 total', weight: 50, reps: 15, sets: 2, restSeconds: 45, restLabel: '30–45 sec' }),
      strength({ id: 'thu-dragon-fly', name: 'Dragon fly', category: 'CORE', priority: true, prescription: '2×1–5 reps', current: '0/1', target: '30 reps total over time', weight: 0, reps: 5, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      cardio('thu-incline-walk'),
    ],
  },
  {
    day: 4,
    name: 'Pull / Push',
    focus: 'Back, chest, shoulders, traps, posture, core',
    estimatedTime: '65–85 min',
    exercises: [
      strength({ name: 'Pull Up', category: 'PULL', priority: true, weight: 28.5, reps: 8, sets: 3, restSeconds: 90 }),
      strength({ id: 'fri-high-row', name: 'Iso lateral high row (A)', category: 'PULL', priority: true, prescription: '3×6–8', current: '75 total', target: '178 total', weight: 75, reps: 8, sets: 3, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'fri-low-row', name: 'Iso lateral low row (B)', category: 'PULL', priority: true, prescription: '3×6–8', current: '70 total', target: '137 total', weight: 70, reps: 8, sets: 3, restSeconds: 90, restLabel: '90 sec' }),
      strength({ id: 'fri-cable-chest-fly', name: 'Hi-lo cable chest fly', category: 'PUSH', prescription: '2×12–15', current: '30 total', target: '97 total', weight: 30, reps: 15, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      strength({ id: 'fri-lateral-raise', name: 'Lateral raise', category: 'PUSH', prescription: '2×12–15', current: '69 total', target: '117 total', weight: 69, reps: 15, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'fri-shrugs', name: 'Shrugs', category: 'PULL', prescription: '2×12–15', current: '55 total', target: '171 total', weight: 55, reps: 15, sets: 2, restSeconds: 60, restLabel: '60 sec' }),
      strength({ id: 'fri-back-extension', name: 'Loaded back extension (A)', category: 'POSTURE', weight: 20, reps: 12, sets: 3, restSeconds: 90 }),
      strength({ id: 'fri-face-pull', name: 'Face pull (B)', category: 'POSTURE', prescription: '2×12–15', current: '47.5 total', target: '96 total', weight: 47.5, reps: 15, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      strength({ id: 'fri-woodchopper', name: 'Cable Woodchopper', category: 'CORE', priority: true, prescription: '2×12', current: '13 total', target: '88 total', weight: 13, reps: 12, sets: 2, restSeconds: 60, restLabel: '45–60 sec' }),
      cardio('fri-incline-walk'),
    ],
  },
  { day: 5, name: 'Rest', focus: 'Recovery', estimatedTime: '—', exercises: [] },
  { day: 6, name: 'Rest', focus: 'Recovery', estimatedTime: '—', exercises: [] },
];

const summary = (plans) => plans.map((plan) => `${plan.day}:${plan.name} (${plan.exercises.length})`).join(', ');

function historyKey(name) {
  return String(name ?? '').trim().replace(/\s*\([A-Z]\)\s*$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function migratedExerciseName(name) {
  const key = historyKey(name);
  if (key === 'assisted pull up' || key === 'weighted pull up' || key === 'pullup' || key === 'pull up') return 'Pull Up';
  if (key === 'cable curl') return null;
  if (key === 'bicep curl') return 'Bicep curl';
  if (key === 'cable crunch' || key === 'cable woodchopper') return 'Cable Woodchopper';
  if (key === 'shrug' || key === 'shrugs' || key === 'cable shrug' || key === 'cable shrugs') return 'Shrugs';
  return String(name ?? 'Exercise');
}

function completedSetCount(exercise) {
  return (Array.isArray(exercise?.sets) ? exercise.sets : []).filter((set) => set?.done).length;
}

function migrateActiveWorkout(activeWorkout) {
  if (!activeWorkout || !Array.isArray(activeWorkout.exercises)) return activeWorkout ?? null;
  const planExercises = dayPlans.flatMap((plan) => plan.exercises);
  const migrated = activeWorkout.exercises.flatMap((exercise) => {
    const nextName = migratedExerciseName(exercise?.name);
    if (!nextName) return [];
    const planned = planExercises.find((item) => item.id === stableExerciseId(nextName));
    if (!planned) return [{ ...exercise, id: stableExerciseId(nextName), name: nextName }];
    return [{
      ...exercise, id: planned.id, name: planned.name, type: planned.type, measurement: planned.measurement,
      loadMode: planned.loadMode, targetWeight: planned.weight, targetReps: planned.reps,
      targetDurationSeconds: planned.durationSeconds, targetDurationMinutes: planned.durationMinutes,
      targetDistanceKm: planned.distanceKm, restSeconds: planned.restSeconds, category: planned.category,
      ...(planned.levelStandard !== undefined ? { levelStandard: planned.levelStandard } : {}),
      sets: (Array.isArray(exercise.sets) ? exercise.sets : []).map((set) => set?.done ? set : {
        ...set, weight: planned.weight, reps: planned.reps, durationSeconds: planned.durationSeconds,
        durationMinutes: planned.durationMinutes, distanceKm: planned.distanceKm, calories: planned.calories,
      }),
    }];
  });
  const migratedExercises = [];
  for (const exercise of migrated) {
    const duplicateIndex = migratedExercises.findIndex((candidate) => candidate.id === exercise.id);
    if (duplicateIndex < 0) migratedExercises.push(exercise);
    else if (completedSetCount(exercise) > completedSetCount(migratedExercises[duplicateIndex])) migratedExercises[duplicateIndex] = exercise;
  }
  const restName = migratedExerciseName(activeWorkout.restTimer?.exerciseName);
  const restExercise = restName ? planExercises.find((item) => item.id === stableExerciseId(restName)) : null;
  const restTimer = activeWorkout.restTimer && restName ? {
    ...activeWorkout.restTimer,
    exerciseId: restExercise?.id ?? stableExerciseId(restName),
    exerciseName: restExercise?.name ?? restName,
  } : activeWorkout.restTimer ?? null;
  return { ...activeWorkout, exercises: migratedExercises, restTimer };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function report(accountId, existingPlans, exerciseHistory = []) {
  console.log(`Account: ${targetEmail} (${accountId})`);
  console.log(`Current plans: ${summary(Array.isArray(existingPlans) ? existingPlans : [])}`);
  console.log(`New plans: ${summary(dayPlans)}`);
  console.log(`Exact requested plan already stored: ${JSON.stringify(canonical(existingPlans)) === JSON.stringify(canonical(dayPlans)) ? 'yes' : 'no'}`);
  if (details) {
    console.log('New exercise plans:');
    for (const plan of dayPlans) {
      for (const exercise of plan.exercises) {
        console.log(`${plan.day}\t${exercise.name}\t${exercise.weight ?? 0} kg\t${exercise.measurement === 'duration' ? `${exercise.durationSeconds || exercise.durationMinutes} time` : `${exercise.reps} reps`}\t${exercise.category}`);
      }
    }
    console.log('Current exercise plans:');
    for (const plan of Array.isArray(existingPlans) ? existingPlans : []) {
      for (const exercise of Array.isArray(plan.exercises) ? plan.exercises : []) {
        console.log(`${plan.day}\t${exercise.name}\t${exercise.weight ?? 0} kg\t${exercise.current ?? ''}`);
      }
    }
    console.log(`History exercise names: ${[...new Set((Array.isArray(exerciseHistory) ? exerciseHistory : []).map((record) => record?.exercise).filter(Boolean))].join(' | ') || 'none'}`);
    console.log('Exercise history:');
    for (const record of Array.isArray(exerciseHistory) ? exerciseHistory : []) {
      console.log(`${record.date ?? ''}\t${record.exercise ?? ''}\t${record.weight ?? 0} kg\t${record.reps ?? 0} reps\t${record.setsCompleted ?? 0} sets`);
    }
  }
  if (!apply) console.log('Dry run only. Re-run with --apply to replace this account\'s dayPlans.');
}

async function updateWithSdk() {
  const database = new Firestore({ projectId, databaseId, ignoreUndefinedProperties: true });
  const matches = await database.collection(collectionName).where('email', '==', targetEmail).limit(2).get();
  if (matches.size !== 1) throw new Error(`Expected exactly one account for ${targetEmail}; found ${matches.size}. No data was changed.`);

  const account = matches.docs[0];
  const existing = account.data();
  if (!existing.data || typeof existing.data !== 'object') throw new Error(`Account ${account.id} does not contain workout data. No data was changed.`);
  report(account.id, existing.data.dayPlans, existing.data.exerciseHistory);
  if (!apply) return;

  await database.runTransaction(async (transaction) => {
    const latest = await transaction.get(account.ref);
    if (!latest.exists || String(latest.data()?.email ?? '').toLowerCase() !== targetEmail) {
      throw new Error('The target account changed during verification. No data was changed.');
    }
    const latestDocument = latest.data();
    const latestData = latestDocument?.data;
    const migratedActiveWorkout = migrateActiveWorkout(latestData?.activeWorkout);
    const levelResetAt = resetLevels ? new Date().toISOString() : String(latestData?.levelResetAt ?? '');
    transaction.update(account.ref, {
      'data.dayPlans': dayPlans,
      'data.activeWorkout': migratedActiveWorkout,
      'data.levelResetAt': levelResetAt,
      schemaVersion,
      planUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) } };
}

function fromFirestoreValue(value) {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, fromFirestoreValue(item)]));
  return undefined;
}

async function updateWithRest(accessToken) {
  const databaseRoot = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const queryResponse = await fetch(`${databaseRoot}:runQuery`, {
    method: 'POST', headers,
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: collectionName }],
      where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: targetEmail } } },
      limit: 2,
    } }),
  });
  if (!queryResponse.ok) throw new Error(`Firestore account lookup failed (${queryResponse.status}). No data was changed.`);
  const rows = await queryResponse.json();
  const documents = rows.flatMap((row) => row.document ? [row.document] : []);
  if (documents.length !== 1) throw new Error(`Expected exactly one account for ${targetEmail}; found ${documents.length}. No data was changed.`);

  const document = documents[0];
  const accountId = document.name.split('/').at(-1);
  const existing = Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, item]) => [key, fromFirestoreValue(item)]));
  if (!existing.data || typeof existing.data !== 'object') throw new Error(`Account ${accountId} does not contain workout data. No data was changed.`);
  report(accountId, existing.data.dayPlans, existing.data.exerciseHistory);
  if (!apply) return;

  const now = new Date().toISOString();
  const migratedActiveWorkout = migrateActiveWorkout(existing.data.activeWorkout);
  const levelResetAt = resetLevels ? now : String(existing.data.levelResetAt ?? '');
  const query = new URLSearchParams();
  for (const path of ['data.dayPlans', 'data.activeWorkout', 'data.levelResetAt', 'schemaVersion', 'planUpdatedAt', 'updatedAt']) query.append('updateMask.fieldPaths', path);
  query.set('currentDocument.updateTime', document.updateTime);
  const patchResponse = await fetch(`${databaseRoot}/${collectionName}/${accountId}?${query}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ fields: {
      data: { mapValue: { fields: { dayPlans: toFirestoreValue(dayPlans), activeWorkout: toFirestoreValue(migratedActiveWorkout), levelResetAt: toFirestoreValue(levelResetAt) } } },
      schemaVersion: { integerValue: String(schemaVersion) },
      planUpdatedAt: { timestampValue: now },
      updatedAt: { timestampValue: now },
    } }),
  });
  if (!patchResponse.ok) throw new Error(`Firestore plan update failed (${patchResponse.status}). The document was not changed.`);
}

const accessToken = process.env.GCP_ACCESS_TOKEN;
if (accessToken) await updateWithRest(accessToken);
else await updateWithSdk();

if (apply) console.log('Workout plan updated. Exercise history, meals, and schedule overrides were preserved.');
