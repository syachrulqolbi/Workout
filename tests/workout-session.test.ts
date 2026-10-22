import { describe, expect, it } from 'vitest';
import { buildWorkout } from '../lib/workout-session';
import type { DayPlan, ExerciseRecord } from '../lib/workout-data';

const plan: DayPlan = {
  day: 0,
  name: 'Push / Pull',
  focus: 'Upper body',
  exercises: [{
    id: 'exercise-bench', name: 'Bench', type: 'strength', measurement: 'reps', loadMode: 'total',
    weight: 44.5, reps: 8, sets: 2, durationSeconds: 0, durationMinutes: 0, distanceKm: 0,
    calories: 0, restSeconds: 90,
  }],
};

function record(weight: number): ExerciseRecord {
  return {
    id: 'record-1', sessionId: 'session-1', exerciseId: 'exercise-bench', exercise: 'Bench',
    date: '2026-09-20T00:00:00.000Z', type: 'strength', measurement: 'reps', loadMode: 'total',
    weight, reps: 8, setsCompleted: 2, targetMet: true, durationSeconds: 0, durationMinutes: 0,
    distanceKm: 0, calories: 0, completedSets: [], estimated: false,
  };
}

describe('buildWorkout', () => {
  it('uses the latest logged weight for the next workout', () => {
    const workout = buildWorkout(plan, false, [record(50)], {
      now: new Date('2026-09-27T01:00:00.000Z'), createId: () => 'set-id',
    });
    expect(workout.exercises[0].targetWeight).toBe(50);
    expect(workout.exercises[0].sets.map((set) => set.weight)).toEqual([50, 50]);
  });

  it('uses the plan load when no exercise history exists', () => {
    const workout = buildWorkout(plan, false, [], {
      now: new Date('2026-09-27T01:00:00.000Z'), createId: () => 'set-id',
    });
    expect(workout.exercises[0].targetWeight).toBe(44.5);
  });

  it('does not carry a pre-reset strength load into the next workout', () => {
    const workout = buildWorkout(plan, false, [record(70)], {
      now: new Date('2026-10-02T01:00:00.000Z'), createId: () => 'set-id',
      resetAt: '2026-10-01T00:00:00.000Z',
    });
    expect(workout.exercises[0].targetWeight).toBe(44.5);
  });
});
