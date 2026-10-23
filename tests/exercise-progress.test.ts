import { describe, expect, it } from 'vitest';
import {
  exercisePlanProgressValue, exerciseProgressDefinition, exerciseRecordProgressValue,
} from '../lib/exercise-progress';
import type { ExerciseRecord, LibraryExercise } from '../lib/workout-data';

const exercise = (overrides: Partial<LibraryExercise> = {}): LibraryExercise => ({
  id: 'exercise-test', name: 'Test exercise', type: 'strength', measurement: 'reps', loadMode: 'total',
  weight: 40, reps: 8, sets: 2, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0,
  restSeconds: 60, ...overrides,
});

const record = (overrides: Partial<ExerciseRecord> = {}): ExerciseRecord => ({
  id: 'record-1', sessionId: 'session-1', exerciseId: 'exercise-test', exercise: 'Test exercise',
  date: '2026-09-20T00:00:00.000Z', type: 'strength', measurement: 'reps', loadMode: 'total',
  weight: 40, reps: 8, setsCompleted: 2, targetMet: true, durationSeconds: 0, durationMinutes: 0,
  distanceKm: 0, calories: 0, estimated: false,
  completedSets: [
    { weight: 40, reps: 8, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0 },
    { weight: 42.5, reps: 6, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0 },
  ],
  ...overrides,
});

describe('exercise progress metrics', () => {
  it('uses the best single hold instead of summing every timed set', () => {
    const plan = exercise({ measurement: 'duration', loadMode: 'duration', weight: 0, reps: 0, durationSeconds: 45,
      levelStandard: { thresholds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], metric: 'seconds', unit: 'sec' } });
    const definition = exerciseProgressDefinition(plan);
    const history = record({ measurement: 'duration', loadMode: 'duration', weight: 0, reps: 0, durationSeconds: 113,
      completedSets: [
        { weight: 0, reps: 0, durationSeconds: 56.5, durationMinutes: 0, distanceKm: 0, calories: 0 },
        { weight: 0, reps: 0, durationSeconds: 56.5, durationMinutes: 0, distanceKm: 0, calories: 0 },
      ] });
    expect(definition.metric).toBe('durationSeconds');
    expect(exerciseRecordProgressValue(history, definition)).toBe(56.5);
    expect(exercisePlanProgressValue(plan, definition)).toBe(45);
  });

  it('uses repetitions for rep-based level standards', () => {
    const plan = exercise({ weight: 20, reps: 15,
      levelStandard: { thresholds: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40], metric: 'reps', unit: 'reps' } });
    const definition = exerciseProgressDefinition(plan);
    expect(definition.metric).toBe('reps');
    expect(exerciseRecordProgressValue(record(), definition)).toBe(8);
    expect(exercisePlanProgressValue(plan, definition)).toBe(15);
  });

  it('charts Loaded back extension by added kilograms', () => {
    const plan = exercise({ id: 'exercise-loaded-back-extension', name: 'Loaded back extension (A)', weight: 20,
      levelStandard: { thresholds: [0, 5, 10, 15, 20, 25, 30, 35, 40, 50], metric: 'weight', unit: 'kg' } });
    const definition = exerciseProgressDefinition(plan);
    expect(definition.metric).toBe('weight');
    expect(definition.label).toBe('Max added weight');
    expect(exercisePlanProgressValue(plan, definition)).toBe(20);
  });

  it('marks machine assistance as inverse progress and chooses the lowest set', () => {
    const plan = exercise({ loadMode: 'assistance', weight: 28.5 });
    const definition = exerciseProgressDefinition(plan);
    const history = record({ loadMode: 'assistance', weight: 25, completedSets: [
      { weight: 25, reps: 8, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0 },
      { weight: 22.5, reps: 6, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0 },
    ] });
    expect(definition.inverse).toBe(true);
    expect(exerciseRecordProgressValue(history, definition)).toBe(22.5);
  });
});

