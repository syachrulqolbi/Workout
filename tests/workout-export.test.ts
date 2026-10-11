import { describe, expect, it } from 'vitest';
import { workoutHistoryCsv, workoutHistoryJson } from '../lib/workout-export';
import type { ExerciseRecord, WorkoutSession } from '../lib/workout-data';

describe('workout history export', () => {
  const workout: WorkoutSession = {
    id: 'session-1', date: '2026-09-27T01:00:00.000Z', planDay: 0, name: 'Push, pull', focus: 'Chest & back',
    duration: 60, exercises: 1, sets: 3, volume: 1500, cardioMinutes: 0, distanceKm: 0, calories: 0,
  };
  const record: ExerciseRecord = {
    id: 'record-1', sessionId: workout.id, exerciseId: 'exercise-press', exercise: 'Chest Press', date: workout.date,
    type: 'strength', measurement: 'reps', loadMode: 'total', weight: 50, reps: 8, setsCompleted: 3,
    targetMet: true, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0,
    completedSets: [], estimated: false,
  };

  it('escapes CSV fields and includes exercise metrics', () => {
    const csv = workoutHistoryCsv([workout], [record]);
    expect(csv).toContain('"Push, pull"');
    expect(csv).toContain('Chest Press,strength,50,8,3');
  });

  it('creates a versioned JSON backup', () => {
    const json = JSON.parse(workoutHistoryJson([workout], [record]));
    expect(json).toMatchObject({ format: 'workout-history', version: 1 });
    expect(json.workouts[0].id).toBe(workout.id);
  });
});
