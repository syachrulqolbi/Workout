import { normalizeWorkoutData, type WorkoutData } from '@/lib/workout-data';
import type { ClientDataScope } from '@/lib/workout-patch';

type MergeValue = { value: unknown; conflicts: number };

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function itemKey(value: unknown, index: number) {
  if (!isRecord(value)) return `index:${index}`;
  if (typeof value.id === 'string') return `id:${value.id}`;
  if (Number.isInteger(Number(value.day))) return `day:${Number(value.day)}`;
  return `index:${index}`;
}

function keyedArray(values: unknown[]) {
  const entries = values.map((value, index) => [itemKey(value, index), value] as const);
  return new Map(entries);
}

function canMergeArray(values: unknown[]) {
  const keys = values.map(itemKey);
  return keys.length === new Set(keys).size && keys.every((key) => !key.startsWith('index:'));
}

function mergeArray(base: unknown[], server: unknown[], local: unknown[]): MergeValue {
  if (![base, server, local].every(canMergeArray)) return { value: local, conflicts: 1 };
  const baseItems = keyedArray(base);
  const serverItems = keyedArray(server);
  const localItems = keyedArray(local);
  const orderedKeys = [...new Set([
    ...local.map(itemKey),
    ...server.map(itemKey),
    ...base.map(itemKey),
  ])];
  const value: unknown[] = [];
  let conflicts = 0;
  for (const key of orderedKeys) {
    const merged = mergeValue(baseItems.get(key), serverItems.get(key), localItems.get(key));
    conflicts += merged.conflicts;
    if (merged.value !== undefined) value.push(merged.value);
  }
  return { value, conflicts };
}

function mergeObject(base: Record<string, unknown>, server: Record<string, unknown>, local: Record<string, unknown>): MergeValue {
  const value: Record<string, unknown> = {};
  let conflicts = 0;
  for (const key of new Set([...Object.keys(local), ...Object.keys(server), ...Object.keys(base)])) {
    const merged = mergeValue(base[key], server[key], local[key]);
    conflicts += merged.conflicts;
    if (merged.value !== undefined) value[key] = merged.value;
  }
  return { value, conflicts };
}

function mergeValue(base: unknown, server: unknown, local: unknown): MergeValue {
  if (same(local, base)) return { value: server, conflicts: 0 };
  if (same(server, base) || same(server, local)) return { value: local, conflicts: 0 };
  if (Array.isArray(base) && Array.isArray(server) && Array.isArray(local)) return mergeArray(base, server, local);
  if (isRecord(base) && isRecord(server) && isRecord(local)) return mergeObject(base, server, local);
  return { value: local, conflicts: 1 };
}

/**
 * Combines independent changes made since the last synchronized snapshot.
 * A current-device value wins only when both devices changed the same leaf.
 */
export function mergeWorkoutDataScopes(base: WorkoutData, server: WorkoutData, local: WorkoutData, scopes: ClientDataScope[]) {
  const selected = new Set(scopes);
  const next: WorkoutData = { ...server };
  let conflicts = 0;
  const mergeField = <K extends keyof WorkoutData>(key: K) => {
    const merged = mergeValue(base[key], server[key], local[key]);
    next[key] = merged.value as WorkoutData[K];
    conflicts += merged.conflicts;
  };

  if (selected.has('active')) mergeField('activeWorkout');
  if (selected.has('plans')) {
    mergeField('dayPlans');
    mergeField('levelResetAt');
  }
  if (selected.has('schedule')) mergeField('datePlanOverrides');
  if (selected.has('history')) {
    mergeField('workouts');
    mergeField('exerciseHistory');
  }
  if (selected.has('meals')) mergeField('meals');

  return { data: normalizeWorkoutData(next), conflicts };
}
