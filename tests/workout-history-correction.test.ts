import { describe, expect, it } from 'vitest';
import { historyCorrectionRows } from '../lib/workout-history-correction';
import { createDefaultWorkoutData, normalizeWorkoutData, type ExerciseRecord, type WorkoutSession } from '../lib/workout-data';

function session(planDay = 0): WorkoutSession {
  return {
    id: 'session-1', date: '2026-10-31T08:00:00.000Z', planDay,
    name: 'Push / Pull', focus: 'Chest and back', duration: 60,
    exercises: 1, sets: 3, volume: 1200, cardioMinutes: 0, distanceKm: 0, calories: 0,
  };
}

function record(exerciseId: string, exercise: string): ExerciseRecord {
  return {
    id: 'record-1', sessionId: 'session-1', exerciseId, exercise,
    date: '2026-10-31T08:00:00.000Z', type: 'strength', measurement: 'reps', loadMode: 'total',
    weight: 40, reps: 8, setsCompleted: 3, targetMet: true,
    durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0,
    completedSets: [], estimated: false,
  };
}

describe('workout history correction rows', () => {
  it('adds one editable placeholder for every omitted planned exercise', () => {
    const plan = createDefaultWorkoutData().dayPlans[0];
    const existing = record(plan.exercises[0].id, plan.exercises[0].name);
    const rows = historyCorrectionRows(session(plan.day), [existing], plan.exercises);

    expect(rows).toHaveLength(plan.exercises.length);
    expect(rows[0]).toMatchObject({ missing: false, record: { id: existing.id } });
    expect(rows.slice(1).every((row) => row.missing && row.record.setsCompleted === 0)).toBe(true);
    expect(new Set(rows.map((row) => row.record.exerciseId)).size).toBe(plan.exercises.length);
  });

  it('keeps historical records that are no longer present in the current plan', () => {
    const plan = createDefaultWorkoutData().dayPlans[0];
    const legacy = record('exercise-retired', 'Retired exercise');
    const rows = historyCorrectionRows(session(plan.day), [legacy], plan.exercises.slice(0, 1));
    expect(rows).toHaveLength(2);
    expect(rows.at(-1)).toMatchObject({ missing: false, record: { exerciseId: 'exercise-retired' } });
  });

  it('preserves the completed-session plan snapshot through normalization', () => {
    const data = createDefaultWorkoutData();
    const workout = { ...session(), plannedExercises: data.dayPlans[0].exercises };
    const normalized = normalizeWorkoutData({ ...data, workouts: [workout] });
    expect(normalized.workouts[0].plannedExercises?.map((exercise) => exercise.id))
      .toEqual(data.dayPlans[0].exercises.map((exercise) => exercise.id));
  });
});
