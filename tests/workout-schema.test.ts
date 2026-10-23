import { describe, expect, it } from 'vitest';
import { levelIndexForThresholds, levelUpperLimit, stableExerciseId } from '../lib/workout-schema.mjs';

describe('workout level thresholds', () => {
  it('returns the highest half-kilogram load that remains in Level 1', () => {
    const thresholds = [34, 45, 56, 71, 86, 103.5, 121, 134.5, 147.5, 161];
    const load = levelUpperLimit(thresholds, 1, 0.5);
    expect(load).toBe(44.5);
    expect(levelIndexForThresholds(thresholds, load)).toBe(1);
  });

  it('returns the highest whole repetition below the next level', () => {
    const thresholds = [4, 9.5, 15, 22, 29, 37, 45, 51, 57, 63];
    const repetitions = levelUpperLimit(thresholds, 1, 1);
    expect(repetitions).toBe(9);
    expect(levelIndexForThresholds(thresholds, repetitions)).toBe(1);
  });

  it('uses one stable identity for current and legacy shrug names', () => {
    expect(stableExerciseId('Shrugs')).toBe('exercise-shrugs');
    expect(stableExerciseId('Shrugs (A)')).toBe('exercise-shrugs');
    expect(stableExerciseId('Cable shrugs (B)')).toBe('exercise-shrugs');
  });

  it('uses one stable identity for assisted, bodyweight and weighted Pull Up names', () => {
    expect(stableExerciseId('Pull Up')).toBe('exercise-pull-up');
    expect(stableExerciseId('Assisted pull-up')).toBe('exercise-pull-up');
    expect(stableExerciseId('Weighted Pull-Up')).toBe('exercise-pull-up');
    expect(stableExerciseId('Pullup')).toBe('exercise-pull-up');
  });
});
