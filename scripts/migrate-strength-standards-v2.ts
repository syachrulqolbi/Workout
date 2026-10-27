import { normalizeWorkoutData } from '@/lib/workout-data';
import { migrateStrengthStandardsV2 } from '@/lib/strength-migration';
import { STRENGTH_STANDARD_DEFINITIONS } from '@/lib/strength-standards';
import { STRENGTH_STANDARD_VERSION } from '@/lib/strength-calculations';

const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'personal-project-414620';
const databaseId = process.env.FIRESTORE_DATABASE_ID ?? 'form-workout';
const collectionName = process.env.WORKOUT_USERS_COLLECTION ?? 'workout-users';
const targetEmail = (process.env.WORKOUT_PLAN_EMAIL ?? 'syachrulqolbinursepti@gmail.com').toLowerCase();
const accessToken = process.env.GCP_ACCESS_TOKEN;
const apply = process.argv.includes('--apply');
const rollback = process.argv.includes('--rollback');
if (!accessToken) throw new Error('GCP_ACCESS_TOKEN is required. No data was changed.');
if (apply && rollback) throw new Error('Choose --apply or --rollback, not both.');

const databaseRoot = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

type FirestoreValue = Record<string, unknown>;
function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return ((value.arrayValue as { values?: FirestoreValue[] }).values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries((value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {}).map(([key, item]) => [key, fromFirestoreValue(item)]));
  return undefined;
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toFirestoreValue(item)])) } };
}

async function fetchTarget() {
  const response = await fetch(`${databaseRoot}:runQuery`, { method: 'POST', headers, body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: collectionName }], where: { fieldFilter: { field: { fieldPath: 'email' }, op: 'EQUAL', value: { stringValue: targetEmail } } }, limit: 2,
  } }) });
  if (!response.ok) throw new Error(`Account lookup failed (${response.status}). No data was changed.`);
  const rows = await response.json() as Array<{ document?: { name: string; fields: Record<string, FirestoreValue>; updateTime: string } }>;
  const documents = rows.flatMap((row) => row.document ? [row.document] : []);
  if (documents.length !== 1) throw new Error(`Expected exactly one account for ${targetEmail}; found ${documents.length}. No data was changed.`);
  return documents[0];
}

async function collectionCount(accountId: string, child: string) {
  let count = 0;
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await fetch(`${databaseRoot}/${collectionName}/${accountId}/${child}?${query}`, { headers });
    if (response.status === 404) return 0;
    if (!response.ok) throw new Error(`Could not inspect ${child} (${response.status}).`);
    const body = await response.json() as { documents?: unknown[]; nextPageToken?: string };
    count += body.documents?.length ?? 0;
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return count;
}

function decodeDocument(document: Awaited<ReturnType<typeof fetchTarget>>) {
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, fromFirestoreValue(value)])) as Record<string, unknown>;
}

const document = await fetchTarget();
const accountId = document.name.split('/').at(-1)!;
const existing = decodeDocument(document);
const originalData = existing.data && typeof existing.data === 'object' ? existing.data as Record<string, unknown> : null;
if (!originalData) throw new Error('The account has no workout data. No data was changed.');
const beforeCounts = { workouts: await collectionCount(accountId, 'workouts'), history: await collectionCount(accountId, 'exercise-history') };
const backupId = `${accountId}--${STRENGTH_STANDARD_VERSION}`;
const backupName = `${databaseRoot}/workout-migration-backups/${backupId}`;

if (rollback) {
  const backupResponse = await fetch(backupName, { headers });
  if (!backupResponse.ok) throw new Error(`Rollback backup was not found (${backupResponse.status}). No data was changed.`);
  const backupDocument = await backupResponse.json() as { fields: Record<string, FirestoreValue> };
  const backup = Object.fromEntries(Object.entries(backupDocument.fields).map(([key, value]) => [key, fromFirestoreValue(value)])) as Record<string, unknown>;
  if (!apply) {
    console.log(`Rollback preview: ${targetEmail}; backup ${backupId}; current ${String(originalData.standardsVersion ?? 'legacy')}.`);
    process.exit(0);
  }
  const restored = backup.originalData;
  const response = await fetch(`${databaseRoot}:commit`, { method: 'POST', headers, body: JSON.stringify({ writes: [{
    update: { name: document.name, fields: { ...document.fields, data: toFirestoreValue(restored), schemaVersion: { integerValue: String(Number(backup.originalSchemaVersion) || 15) }, updatedAt: { timestampValue: new Date().toISOString() } } },
    currentDocument: { updateTime: document.updateTime },
  }] }) });
  if (!response.ok) throw new Error(`Rollback failed (${response.status}).`);
  console.log(`Rolled back ${targetEmail} from ${backupId}. History collections were not touched.`);
  process.exit(0);
}

const normalized = normalizeWorkoutData(originalData);
const migrated = migrateStrengthStandardsV2(normalized);
const originalPlans = Array.isArray(originalData.dayPlans) ? originalData.dayPlans as Array<Record<string, unknown>> : [];
const preservedPlans = migrated.dayPlans.map((plan) => {
  const originalPlan = originalPlans.find((candidate) => Number(candidate.day) === plan.day) ?? {};
  const originalExercises = Array.isArray(originalPlan.exercises) ? originalPlan.exercises as Array<Record<string, unknown>> : [];
  return { ...originalPlan, ...plan, exercises: plan.exercises.map((exercise, index) => ({ ...originalExercises[index], ...exercise })) };
});
const originalActive = originalData.activeWorkout && typeof originalData.activeWorkout === 'object' ? originalData.activeWorkout as Record<string, unknown> : null;
const originalActiveExercises = originalActive && Array.isArray(originalActive.exercises) ? originalActive.exercises as Array<Record<string, unknown>> : [];
const preservedActive = migrated.activeWorkout ? {
  ...originalActive,
  ...migrated.activeWorkout,
  exercises: migrated.activeWorkout.exercises.map((exercise, index) => ({ ...originalActiveExercises[index], ...exercise })),
} : null;
const nextData = {
  ...originalData,
  dayPlans: preservedPlans,
  activeWorkout: preservedActive,
  profile: migrated.profile,
  standardsVersion: migrated.standardsVersion,
};
const slots = migrated.dayPlans.flatMap((plan) => plan.exercises);
const mappedIds = new Set(slots.map((exercise) => exercise.id));
const unmapped = STRENGTH_STANDARD_DEFINITIONS.filter((definition) => !mappedIds.has(`exercise-${definition.name.replace(/\s*\(A\/B\)\s*$/i, '').replace(/\s*\([AB]\)\s*$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`));
const duplicateWithinDay = migrated.dayPlans.flatMap((plan) => {
  const seen = new Set<string>();
  return plan.exercises.flatMap((exercise) => seen.has(exercise.id) ? [`${plan.day}:${exercise.id}`] : (seen.add(exercise.id), []));
});
const changed = JSON.stringify(originalData.dayPlans) !== JSON.stringify(nextData.dayPlans) || originalData.standardsVersion !== STRENGTH_STANDARD_VERSION;
console.log(`Account: ${targetEmail} (${accountId})`);
console.log(`Standards: ${STRENGTH_STANDARD_DEFINITIONS.length}; plan slots: ${slots.length}; unique stable IDs: ${mappedIds.size}`);
console.log(`History before: ${beforeCounts.workouts} workouts / ${beforeCounts.history} exercise records`);
console.log(`Unmatched requested definitions: ${unmapped.map((item) => item.name).join(', ') || 'none'}`);
console.log(`Duplicate stable IDs within a day: ${duplicateWithinDay.join(', ') || 'none'}`);
console.log(`Change required: ${changed ? 'yes' : 'no'}; mode: ${apply ? 'apply' : 'dry-run'}`);
if (unmapped.length || duplicateWithinDay.length) throw new Error('Migration verification failed before write. No data was changed.');
if (!apply || !changed) process.exit(0);

const backupResponse = await fetch(backupName, { headers });
const backupExists = backupResponse.ok;
if (!backupExists && backupResponse.status !== 404) throw new Error(`Backup check failed (${backupResponse.status}). No data was changed.`);
const writes = [] as unknown[];
if (!backupExists) writes.push({ update: { name: backupName, fields: {
  accountId: { stringValue: accountId }, email: { stringValue: targetEmail }, migration: { stringValue: STRENGTH_STANDARD_VERSION },
  createdAt: { timestampValue: new Date().toISOString() }, sourceUpdateTime: { stringValue: document.updateTime },
  originalData: toFirestoreValue(originalData), originalSchemaVersion: toFirestoreValue(existing.schemaVersion), historyCounts: toFirestoreValue(beforeCounts),
} }, currentDocument: { exists: false } });
writes.push({ update: { name: document.name, fields: {
  ...document.fields,
  data: toFirestoreValue(nextData), schemaVersion: { integerValue: '16' },
  standardsUpdatedAt: { timestampValue: new Date().toISOString() }, updatedAt: { timestampValue: new Date().toISOString() },
} }, currentDocument: { updateTime: document.updateTime } });
const commit = await fetch(`${databaseRoot}:commit`, { method: 'POST', headers, body: JSON.stringify({ writes }) });
if (!commit.ok) throw new Error(`Migration commit failed (${commit.status}): ${await commit.text()}`);
const after = await fetchTarget();
const afterData = decodeDocument(after).data as Record<string, unknown>;
const afterCounts = { workouts: await collectionCount(accountId, 'workouts'), history: await collectionCount(accountId, 'exercise-history') };
if (afterData.standardsVersion !== STRENGTH_STANDARD_VERSION || JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) {
  throw new Error(`Post-migration verification failed. Backup ${backupId} is available for rollback.`);
}
console.log(`Migration complete. Backup: workout-migration-backups/${backupId}. History after: ${afterCounts.workouts} workouts / ${afterCounts.history} exercise records.`);
