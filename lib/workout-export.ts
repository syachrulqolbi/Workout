import type { ExerciseRecord, WorkoutSession } from '@/lib/workout-data';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function workoutHistoryCsv(workouts: WorkoutSession[], exerciseHistory: ExerciseRecord[]) {
  const sessions = new Map(workouts.map((workout) => [workout.id, workout]));
  const header = [
    'session_id', 'date', 'workout', 'focus', 'duration_min', 'exercise', 'type', 'weight_kg',
    'reps', 'sets', 'duration_seconds', 'cardio_minutes', 'distance_km', 'calories',
  ];
  const rows = exerciseHistory.map((record) => {
    const session = sessions.get(record.sessionId);
    return [
      record.sessionId, record.date, session?.name ?? '', session?.focus ?? '', session?.duration ?? '',
      record.exercise, record.type, record.weight, record.reps, record.setsCompleted, record.durationSeconds,
      record.durationMinutes, record.distanceKm, record.calories,
    ].map(csvCell).join(',');
  });
  return [header.join(','), ...rows].join('\r\n');
}

export function workoutHistoryJson(workouts: WorkoutSession[], exerciseHistory: ExerciseRecord[]) {
  return JSON.stringify({
    format: 'workout-history',
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts,
    exerciseHistory,
  }, null, 2);
}
