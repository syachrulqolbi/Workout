import { describe, expect, it } from 'vitest';
import type { ExerciseEntry, SetEntry } from '../lib/workout-data';
import { activeWorkoutVolume, bestCompletedSet, completedSetVolume } from '../lib/workout-metrics';

function set(overrides: Partial<SetEntry> = {}): SetEntry {
  return {
    id: crypto.randomUUID(), weight: 20, reps: 8, durationSeconds: 0,
    durationMinutes: 0, distanceKm: 0, calories: 0, done: true, ...overrides,
  };
}

function exercise(overrides: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    id: 'exercise', name: 'Exercise', type: 'strength', measurement: 'reps', loadMode: 'total',
    targetWeight: 20, targetReps: 8, targetDurationSeconds: 0, targetDurationMinutes: 0,
    targetDistanceKm: 0, restSeconds: 90, category: 'Strength', sets: [], ...overrides,
  };
}

describe('workout metrics', () => {
  it('uses the lowest assistance as the best assisted set', () => {
    const assisted = exercise({ loadMode: 'assistance' });
    expect(bestCompletedSet(assisted, [set({ weight: 28.5 }), set({ weight: 20 }), set({ weight: 25 })])?.weight).toBe(20);
  });

  it('breaks equal-load ties using repetitions', () => {
    const strength = exercise();
    expect(bestCompletedSet(strength, [set({ weight: 30, reps: 6 }), set({ weight: 30, reps: 9 })])?.reps).toBe(9);
  });

  it('uses the highest completed Plank milestone as the best timed set', () => {
    const weightedPlank = exercise({
      id: 'exercise-plank', name: 'Plank', measurement: 'duration', loadMode: 'duration',
      targetWeight: 0, targetReps: 0, targetDurationSeconds: 20,
      levelStandard: {
        thresholds: [0, 0, 0, 0, 5, 10, 15, 25, 35, 40],
        holdSeconds: [20, 30, 45, 60, 30, 45, 60, 60, 60, 60],
        metric: 'weightedHold', unit: 'level',
      },
    });
    const best = bestCompletedSet(weightedPlank, [
      set({ weight: 0, durationSeconds: 60 }),
      set({ weight: 5, durationSeconds: 30 }),
      set({ weight: 40, durationSeconds: 20 }),
    ]);
    expect(best?.weight).toBe(5);
    expect(best?.durationSeconds).toBe(30);
  });

  it('doubles per-side load and excludes bodyweight and assistance from volume', () => {
    const completed = set({ weight: 12.5, reps: 10 });
    expect(completedSetVolume(exercise({ loadMode: 'perSide' }), completed)).toBe(250);
    expect(completedSetVolume(exercise({ loadMode: 'bodyweight' }), completed)).toBe(0);
    expect(completedSetVolume(exercise({ loadMode: 'assistance' }), completed)).toBe(0);
  });

  it('counts only completed sets in workout volume', () => {
    const first = exercise({ sets: [set({ weight: 25, reps: 8 }), set({ weight: 25, reps: 8, done: false })] });
    expect(activeWorkoutVolume([first])).toBe(200);
  });
});
