import { describe, expect, it } from 'vitest';
import {
  compactDatePlanOverrides, compactMealCompletionDates, createDefaultWorkoutData,
  hasSafeWorkoutPayload, isWorkoutData, normalizeWorkoutData,
} from '../lib/workout-data';
import { mergeWorkoutDataScopes } from '../lib/workout-merge';
import {
  applyWorkoutCollectionChanges, applyWorkoutDataChanges, workoutCollectionChanges,
  workoutDataChanges, workoutMainDataChanges,
} from '../lib/workout-patch';

describe('workout data identity and scoped updates', () => {
  it('preserves a valid exercise id when its display name changes', () => {
    const data = createDefaultWorkoutData();
    data.dayPlans[0].exercises[0] = { ...data.dayPlans[0].exercises[0], id: 'exercise-shared-press', name: 'Renamed press' };
    expect(normalizeWorkoutData(data).dayPlans[0].exercises[0].id).toBe('exercise-shared-press');
  });

  it('sends and applies only the requested data scope', () => {
    const current = createDefaultWorkoutData();
    const changed = { ...current, activeWorkout: { date: '2026-09-25', planDay: 4, startedAt: '2026-09-25T00:00:00.000Z', name: 'Test', focus: '', exercises: [], retake: false, restTimer: null } };
    const patch = workoutDataChanges(changed, ['active']);
    expect(Object.keys(patch)).toEqual(['activeWorkout']);
    const merged = applyWorkoutDataChanges(current, patch, ['active']);
    expect(merged.activeWorkout?.name).toBe('Test');
    expect(merged.dayPlans).toEqual(normalizeWorkoutData(current).dayPlans);
  });

  it('rejects unsafe numeric payloads and clamps negative user metrics', () => {
    const data = createDefaultWorkoutData();
    expect(isWorkoutData({ ...data, workouts: [{ volume: Number.POSITIVE_INFINITY }] })).toBe(false);
    expect(hasSafeWorkoutPayload({ endsAt: Date.now() })).toBe(true);
    data.dayPlans[0].exercises[0].weight = -50;
    expect(normalizeWorkoutData(data).dayPlans[0].exercises[0].weight).toBe(0);
  });

  it('creates incremental history mutations without resending unchanged records', () => {
    const current = createDefaultWorkoutData();
    const workout = {
      id: 'workout-1', date: '2026-09-25T00:00:00.000Z', planDay: 4, name: 'Pull', focus: '', duration: 60,
      exercises: 1, sets: 3, volume: 1200, cardioMinutes: 0, distanceKm: 0, calories: 0,
    };
    const changed = { ...current, workouts: [workout] };
    const collections = workoutCollectionChanges(current, changed, ['history']);
    expect(collections.workouts?.upserts).toEqual([{ item: workout, order: 0 }]);
    expect(collections.workouts?.deleteIds).toEqual([]);
    expect(collections.exerciseHistory?.upserts).toEqual([]);
    expect(workoutMainDataChanges(changed, ['history'])).toEqual({});
  });

  it('sends only deleted ids when a saved record is removed', () => {
    const current = createDefaultWorkoutData();
    current.meals = [{ id: 'meal-1', date: '2026-09-25', recurring: false, completedDates: [], type: 'Lunch', name: 'Rice bowl', note: '', kcal: 600, protein: 40, carbs: 70, fats: 15, sugar: 4, done: false }];
    const changed = { ...current, meals: [] };
    expect(workoutCollectionChanges(current, changed, ['meals']).meals).toEqual({ upserts: [], deleteIds: ['meal-1'] });
  });

  it('preserves independent records from two devices during a three-way merge', () => {
    const base = createDefaultWorkoutData();
    const server = normalizeWorkoutData({ ...base, meals: [meal('server-meal')] });
    const local = normalizeWorkoutData({ ...base, meals: [meal('local-meal')] });
    const merged = mergeWorkoutDataScopes(base, server, local, ['meals']);
    expect(merged.data.meals.map((item) => item.id)).toEqual(['local-meal', 'server-meal']);
    expect(merged.conflicts).toBe(0);
  });

  it('keeps an explicit local deletion while preserving a remote addition', () => {
    const base = createDefaultWorkoutData();
    base.meals = [meal('existing')];
    const server = normalizeWorkoutData({ ...base, meals: [...base.meals, meal('remote-new')] });
    const local = normalizeWorkoutData({ ...base, meals: [] });
    const merged = mergeWorkoutDataScopes(base, server, local, ['meals']);
    expect(merged.data.meals.map((item) => item.id)).toEqual(['remote-new']);
  });

  it('reports overlapping edits and keeps the current-device value', () => {
    const base = createDefaultWorkoutData();
    base.meals = [meal('shared')];
    const server = normalizeWorkoutData({ ...base, meals: [{ ...base.meals[0], name: 'Server name' }] });
    const local = normalizeWorkoutData({ ...base, meals: [{ ...base.meals[0], name: 'Local name' }] });
    const merged = mergeWorkoutDataScopes(base, server, local, ['meals']);
    expect(merged.data.meals[0].name).toBe('Local name');
    expect(merged.conflicts).toBe(1);
  });

  it('applies recovery mutations without removing unrelated server records', () => {
    const server = createDefaultWorkoutData();
    server.meals = [meal('remote')];
    const recovered = applyWorkoutCollectionChanges(server, {
      meals: { upserts: [{ item: meal('local'), order: 0 }], deleteIds: [] },
    }, ['meals']);
    expect(recovered.meals.map((item) => item.id)).toEqual(['local', 'remote']);
  });

  it('bounds dated schedule and recurring-meal occurrence data', () => {
    const reference = new Date('2026-09-27T12:00:00Z');
    const dates = Array.from({ length: 800 }, (_, index) => {
      const date = new Date(reference);
      date.setUTCDate(date.getUTCDate() + index - 400);
      return date.toISOString().slice(0, 10);
    });
    const overrides = Object.fromEntries(dates.map((date, index) => [date, index % 7]));
    expect(Object.keys(compactDatePlanOverrides(overrides, reference))).toHaveLength(240);
    expect(compactMealCompletionDates(dates, reference)).toHaveLength(730);
  });
});

function meal(id: string) {
  return {
    id, date: '2026-09-25', recurring: false, completedDates: [], type: 'Lunch', name: id,
    note: '', kcal: 600, protein: 40, carbs: 70, fats: 15, sugar: 4, done: false,
  };
}
