import { describe, expect, it } from 'vitest';
import { CUSTOM_TRAINING_LEVEL_NAMES, PULL_UP_LEVEL_NAMES, strengthLevelForActiveExercise, strengthLevelForExercise, strengthLevelForWorkoutExercise } from '../lib/exercise-profile';
import type { ExerciseEntry, ExerciseRecord, LibraryExercise } from '../lib/workout-data';

const pullUpStandard = {
  thresholds: [-50, -40, -30, -20, -10, 0, 5, 10, 20, 35],
  metric: 'assistanceEquivalent' as const,
  unit: 'kg' as const,
};

function exercise(overrides: Partial<LibraryExercise> = {}): LibraryExercise {
  return {
    id: 'exercise-pull-up', name: 'Pull Up', type: 'strength', measurement: 'reps',
    loadMode: 'assistance', weight: 28.5, reps: 8, sets: 3, durationSeconds: 0, durationMinutes: 0,
    distanceKm: 0, calories: 0, restSeconds: 90, levelStandard: pullUpStandard, ...overrides,
  };
}

function pullUpRecord(loadMode: ExerciseRecord['loadMode'], weight: number): ExerciseRecord {
  return {
    id: `record-${loadMode}-${weight}`, sessionId: 'session-1', exerciseId: 'exercise-assisted-pull-up', exercise: 'Assisted pull-up',
    date: '2026-09-20T00:00:00.000Z', type: 'strength', measurement: 'reps', loadMode,
    weight, reps: 8, setsCompleted: 3, targetMet: true, durationSeconds: 0, durationMinutes: 0,
    distanceKm: 0, calories: 0, completedSets: [], estimated: false,
  };
}

describe('strength levels', () => {
  it('uses the custom Pull Up progression for the planned assistance', () => {
    const level = strengthLevelForExercise(exercise(), []);
    expect(level?.index).toBe(3);
    expect(level?.name).toBe('Elementary');
    expect(level?.levelNames).toEqual(PULL_UP_LEVEL_NAMES);
    expect(level?.load).toBe(-28.5);
    expect(level?.loadMode).toBe('assistance');
  });

  it('continues one Pull Up scale through bodyweight and weighted records', () => {
    expect(strengthLevelForExercise(exercise(), [pullUpRecord('bodyweight', 0)])?.name).toBe('Proficient');
    expect(strengthLevelForExercise(exercise(), [pullUpRecord('total', 20)])?.name).toBe('Expert');
    expect(strengthLevelForExercise(exercise(), [pullUpRecord('total', 35)])?.name).toBe('Elite');
  });

  it('uses added weight and custom milestones for Loaded back extension', () => {
    const backExtension = exercise({
      id: 'exercise-loaded-back-extension', name: 'Loaded back extension (B)', loadMode: 'total', weight: 20,
      reps: 12, sets: 3, restSeconds: 90,
      levelStandard: { thresholds: [0, 5, 10, 15, 20, 25, 30, 35, 40, 50], metric: 'weight', unit: 'kg' },
    });
    const level = strengthLevelForExercise(backExtension, []);
    expect(level?.index).toBe(5);
    expect(level?.name).toBe('Intermediate');
    expect(level?.levelNames).toEqual(CUSTOM_TRAINING_LEVEL_NAMES);
    expect(level?.isAddedWeight).toBe(true);
    expect(level?.load).toBe(20);
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
      id: 'exercise-pull-up', name: 'Pull Up', type: 'strength', measurement: 'reps',
      loadMode: 'assistance', targetWeight: 28.5, targetReps: 8, targetDurationSeconds: 0,
      targetDurationMinutes: 0, targetDistanceKm: 0, restSeconds: 90, levelStandard: pullUpStandard,
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
