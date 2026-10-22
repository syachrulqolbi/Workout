import { describe, expect, it } from 'vitest';
import { strengthLevelForActiveExercise, strengthLevelForExercise, strengthLevelForWorkoutExercise } from '../lib/exercise-profile';
import type { ExerciseEntry, LibraryExercise } from '../lib/workout-data';

function exercise(overrides: Partial<LibraryExercise> = {}): LibraryExercise {
  return {
    id: 'exercise-assisted-pull-up', name: 'Assisted pull-up', type: 'strength', measurement: 'reps',
    loadMode: 'assistance', weight: 28.5, reps: 8, sets: 3, durationSeconds: 0, durationMinutes: 0,
    distanceKm: 0, calories: 0, restSeconds: 90, ...overrides,
  };
}

describe('strength levels', () => {
  it('treats planned assisted-pull-up assistance as Level 4', () => {
    const level = strengthLevelForExercise(exercise(), []);
    expect(level?.index).toBe(4);
    expect(level?.loadMode).toBe('assistance');
  });

  it('uses the next explicit tier at an exact threshold', () => {
    const level = strengthLevelForExercise(exercise({
      id: 'exercise-bench', name: 'Bench', loadMode: 'total', weight: 71,
      levelStandard: { thresholds: [34, 45, 56, 71, 86, 103.5, 121, 134.5, 147.5, 161], metric: 'weight', unit: 'kg' },
    }), []);
    expect(level?.index).toBe(4);
  });

  it('uses the same resolver for an active assisted exercise', () => {
    const active: ExerciseEntry = {
      id: 'exercise-assisted-pull-up', name: 'Assisted pull-up', type: 'strength', measurement: 'reps',
      loadMode: 'assistance', targetWeight: 28.5, targetReps: 8, targetDurationSeconds: 0,
      targetDurationMinutes: 0, targetDistanceKm: 0, restSeconds: 90,
      sets: [{ id: 'set-1', weight: 28.5, reps: 8, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0, done: false }],
    };
    expect(strengthLevelForActiveExercise(active)?.index).toBe(strengthLevelForExercise(exercise(), [])?.index);
  });

  it('keeps generated level bands stable after a best result exceeds the top band', () => {
    const plan = exercise({ id: 'exercise-row', name: 'Custom row', loadMode: 'total', weight: 50, levelStandard: undefined });
    const level = strengthLevelForExercise(plan, [{
      id: 'record-1', sessionId: 'session-1', exerciseId: plan.id, exercise: plan.name,
      date: '2026-09-20T00:00:00.000Z', type: 'strength', measurement: 'reps', loadMode: 'total',
      weight: 200, reps: 5, setsCompleted: 1, targetMet: true, durationSeconds: 0, durationMinutes: 0,
      distanceKm: 0, calories: 0, completedSets: [], estimated: false,
    }]);
    expect(level?.index).toBe(10);
    expect(level?.ranges[9].min).toBe(91.5);
  });

  it('uses the current plan standard and reset boundary inside an active workout', () => {
    const plan = exercise({
      id: 'exercise-bench', name: 'Bench', loadMode: 'total', weight: 34,
      levelStandard: { thresholds: [34, 45, 56, 71, 86, 103.5, 121, 134.5, 147.5, 161], metric: 'weight', unit: 'kg' },
    });
    const active: ExerciseEntry = {
      id: plan.id, name: plan.name, type: 'strength', measurement: 'reps', loadMode: 'total',
      targetWeight: 90, targetReps: 8, targetDurationSeconds: 0, targetDurationMinutes: 0,
      targetDistanceKm: 0, restSeconds: 90, levelStandard: undefined,
      sets: [{ id: 'set-1', weight: 90, reps: 8, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0, done: false }],
    };
    const oldHistory = [{
      id: 'record-1', sessionId: 'session-1', exerciseId: plan.id, exercise: plan.name,
      date: '2026-09-01T00:00:00.000Z', type: 'strength' as const, measurement: 'reps' as const,
      loadMode: 'total' as const, weight: 121, reps: 8, setsCompleted: 1, targetMet: true,
      durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0, completedSets: [], estimated: false,
    }];

    const resetAt = '2026-10-01T00:00:00.000Z';
    expect(strengthLevelForWorkoutExercise(active, [plan], oldHistory, resetAt)?.index)
      .toBe(strengthLevelForExercise(plan, oldHistory, resetAt)?.index);
    expect(strengthLevelForWorkoutExercise(active, [plan], oldHistory, resetAt)?.index).toBe(1);
  });
});
