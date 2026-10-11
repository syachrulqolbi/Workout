import {
  hasSafeWorkoutPayload, hasWorkoutCollectionLimits, normalizeWorkoutData,
  type ExerciseRecord, type Meal, type WorkoutData, type WorkoutSession,
} from '@/lib/workout-data';

export type ClientDataScope = 'active' | 'plans' | 'schedule' | 'history' | 'meals';
export type WorkoutDataChanges = Partial<Pick<WorkoutData,
  'activeWorkout' | 'dayPlans' | 'levelResetAt' | 'datePlanOverrides' | 'workouts' | 'exerciseHistory' | 'meals'
>>;
export type CollectionMutation<T extends { id: string }> = {
  upserts: Array<{ item: T; order: number }>;
  deleteIds: string[];
};
export type WorkoutCollectionChanges = {
  workouts?: CollectionMutation<WorkoutSession>;
  exerciseHistory?: CollectionMutation<ExerciseRecord>;
  meals?: CollectionMutation<Meal>;
};

export function isClientDataScope(value: unknown): value is ClientDataScope {
  return value === 'active' || value === 'plans' || value === 'schedule' || value === 'history' || value === 'meals';
}

export function workoutDataChanges(data: WorkoutData, scopes: ClientDataScope[]): WorkoutDataChanges {
  const selected = new Set(scopes);
  return {
    ...(selected.has('active') ? { activeWorkout: data.activeWorkout } : {}),
    ...(selected.has('plans') ? { dayPlans: data.dayPlans, levelResetAt: data.levelResetAt } : {}),
    ...(selected.has('schedule') ? { datePlanOverrides: data.datePlanOverrides } : {}),
    ...(selected.has('history') ? { workouts: data.workouts, exerciseHistory: data.exerciseHistory } : {}),
    ...(selected.has('meals') ? { meals: data.meals } : {}),
  };
}

export function workoutMainDataChanges(data: WorkoutData, scopes: ClientDataScope[]): WorkoutDataChanges {
  const changes = workoutDataChanges(data, scopes);
  delete changes.workouts;
  delete changes.exerciseHistory;
  delete changes.meals;
  return changes;
}

function collectionMutation<T extends { id: string }>(previous: T[], next: T[], orderAffectsIdentity: boolean): CollectionMutation<T> {
  const before = new Map(previous.map((item, order) => [item.id, { item, order }]));
  const afterIds = new Set(next.map((item) => item.id));
  return {
    upserts: next.flatMap((item, order) => {
      const current = before.get(item.id);
      const changed = !current || JSON.stringify(current.item) !== JSON.stringify(item) || (orderAffectsIdentity && current.order !== order);
      return changed ? [{ item, order }] : [];
    }),
    deleteIds: previous.filter((item) => !afterIds.has(item.id)).map((item) => item.id),
  };
}

export function workoutCollectionChanges(previous: WorkoutData, next: WorkoutData, scopes: ClientDataScope[]): WorkoutCollectionChanges {
  const selected = new Set(scopes);
  return {
    ...(selected.has('history') ? {
      workouts: collectionMutation(previous.workouts, next.workouts, false),
      exerciseHistory: collectionMutation(previous.exerciseHistory, next.exerciseHistory, false),
    } : {}),
    ...(selected.has('meals') ? { meals: collectionMutation(previous.meals, next.meals, true) } : {}),
  };
}

function applyCollectionMutation<T extends { id: string }>(current: T[], mutation?: CollectionMutation<T>) {
  if (!mutation) return current;
  const changedIds = new Set(mutation.upserts.map(({ item }) => item.id));
  const deletedIds = new Set(mutation.deleteIds);
  const next = current.filter((item) => !changedIds.has(item.id) && !deletedIds.has(item.id));
  for (const { item, order } of [...mutation.upserts].sort((left, right) => left.order - right.order)) {
    next.splice(Math.min(Math.max(0, order), next.length), 0, item);
  }
  return next;
}

export function applyWorkoutCollectionChanges(current: WorkoutData, collections: WorkoutCollectionChanges, scopes: ClientDataScope[]) {
  const selected = new Set(scopes);
  return normalizeWorkoutData({
    ...current,
    ...(selected.has('history') ? {
      workouts: applyCollectionMutation(current.workouts, collections.workouts),
      exerciseHistory: applyCollectionMutation(current.exerciseHistory, collections.exerciseHistory),
    } : {}),
    ...(selected.has('meals') ? { meals: applyCollectionMutation(current.meals, collections.meals) } : {}),
  });
}

function validMutation(value: unknown, maximum: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const mutation = value as { upserts?: unknown; deleteIds?: unknown };
  if (!Array.isArray(mutation.upserts) || !Array.isArray(mutation.deleteIds)
    || mutation.upserts.length + mutation.deleteIds.length > maximum) return false;
  if (!mutation.upserts.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    && Number.isInteger(Number((entry as { order?: unknown }).order)) && Number((entry as { order?: unknown }).order) >= 0
    && typeof (entry as { item?: { id?: unknown } }).item?.id === 'string')) return false;
  return mutation.deleteIds.every((id) => typeof id === 'string' && id.length > 0);
}

export function isWorkoutCollectionChanges(value: unknown, scopes: ClientDataScope[]): value is WorkoutCollectionChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasSafeWorkoutPayload(value)) return false;
  const changes = value as WorkoutCollectionChanges;
  const selected = new Set(scopes);
  if (selected.has('history') && (!validMutation(changes.workouts, 500) || !validMutation(changes.exerciseHistory, 500))) return false;
  if (selected.has('meals') && !validMutation(changes.meals, 500)) return false;
  return true;
}

export function isWorkoutDataChanges(value: unknown, scopes: ClientDataScope[], collections?: WorkoutCollectionChanges): value is WorkoutDataChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !hasSafeWorkoutPayload(value) || !hasWorkoutCollectionLimits(value)) return false;
  const changes = value as WorkoutDataChanges;
  const selected = new Set(scopes);
  if (selected.has('active') && changes.activeWorkout !== null && typeof changes.activeWorkout !== 'object') return false;
  if (selected.has('plans') && (!Array.isArray(changes.dayPlans) || changes.dayPlans.length > 7 || typeof changes.levelResetAt !== 'string')) return false;
  if (selected.has('schedule') && (!changes.datePlanOverrides || typeof changes.datePlanOverrides !== 'object' || Array.isArray(changes.datePlanOverrides))) return false;
  if (selected.has('history') && !collections && (!Array.isArray(changes.workouts) || changes.workouts.length > 5_000
    || !Array.isArray(changes.exerciseHistory) || changes.exerciseHistory.length > 20_000)) return false;
  if (selected.has('meals') && !collections && (!Array.isArray(changes.meals) || changes.meals.length > 5_000)) return false;
  return scopes.length > 0;
}

export function applyWorkoutDataChanges(current: WorkoutData, changes: WorkoutDataChanges, scopes: ClientDataScope[]) {
  const selected = new Set(scopes);
  return normalizeWorkoutData({
    ...current,
    ...(selected.has('active') ? { activeWorkout: changes.activeWorkout } : {}),
    ...(selected.has('plans') ? { dayPlans: changes.dayPlans, levelResetAt: changes.levelResetAt } : {}),
    ...(selected.has('schedule') ? { datePlanOverrides: changes.datePlanOverrides } : {}),
    ...(selected.has('history') ? { workouts: changes.workouts, exerciseHistory: changes.exerciseHistory } : {}),
    ...(selected.has('meals') ? { meals: changes.meals } : {}),
  });
}

export function repositoryScopes(scopes: ClientDataScope[]) {
  const result = new Set<'main' | 'history' | 'meals'>(['main']);
  if (scopes.includes('history')) result.add('history');
  if (scopes.includes('meals')) result.add('meals');
  return [...result];
}
