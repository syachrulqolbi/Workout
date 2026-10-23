import { describe, expect, it } from 'vitest';
import { indexLatestExerciseRecords, latestExerciseRecord, workoutMatchesPlan } from '../lib/workout-identity';
import type { ExerciseRecord, WorkoutSession } from '../lib/workout-data';

function record(overrides: Partial<ExerciseRecord>): ExerciseRecord {
  return {
    id: 'record', sessionId: 'session', exerciseId: 'exercise-seated-cable-row', exercise: 'Seated Cable Rows',
    date: '2026-09-20T00:00:00.000Z', type: 'strength', measurement: 'reps', loadMode: 'total',
    weight: 50, reps: 8, setsCompleted: 3, targetMet: true, durationSeconds: 0, durationMinutes: 0,
    distanceKm: 0, calories: 0, completedSets: [], estimated: false, ...overrides,
  };
}

function session(overrides: Partial<WorkoutSession>): WorkoutSession {
  return {
    id: 'session', date: '2026-09-20T00:00:00.000Z', planDay: 1, name: 'Leg', focus: '', duration: 60,
    exercises: 1, sets: 3, volume: 1200, cardioMinutes: 0, distanceKm: 0, calories: 0, ...overrides,
  };
}

describe('workout identity', () => {
  it('finds the latest record through canonical aliases and stable ids', () => {
    const older = record({ id: 'older', exerciseId: '', exercise: 'Close-grip seated row', weight: 45 });
    const newer = record({ id: 'newer', date: '2026-09-25T00:00:00.000Z', weight: 55 });
    const index = indexLatestExerciseRecords([older, newer]);
    expect(latestExerciseRecord(index, { id: 'exercise-seated-cable-row', name: 'Close-grip seated row' })?.id).toBe('newer');
  });

  it('shares shrug history across the removed cable variant', () => {
    const cableShrug = record({ id: 'cable', exerciseId: 'exercise-cable-shrugs', exercise: 'Cable shrugs (B)', weight: 55 });
    const index = indexLatestExerciseRecords([cableShrug]);
    expect(latestExerciseRecord(index, { id: 'exercise-shrugs', name: 'Shrugs' })?.id).toBe('cable');
  });

  it('matches renamed plans by plan day while supporting legacy sessions by name', () => {
    expect(workoutMatchesPlan(session({ name: 'Renamed leg day' }), 1, 'Leg')).toBe(true);
    expect(workoutMatchesPlan(session({ planDay: null, name: 'Legacy plan' }), 4, 'Legacy plan')).toBe(true);
    expect(workoutMatchesPlan(session({ planDay: null, name: 'Push/pull/arms' }), 3, 'Push / Pull / Arms')).toBe(true);
    expect(workoutMatchesPlan(session({ planDay: 3, name: 'Same name' }), 4, 'Same name')).toBe(false);
  });
});
