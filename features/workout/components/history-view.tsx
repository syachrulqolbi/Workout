'use client';

import { Activity, Download, Dumbbell, History, Settings2, Trash2, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/features/workout/components/empty-state';
import { canonicalExerciseName, exerciseHistoryKeys } from '@/lib/exercise-profile';
import { exercisePlanProgressValue, exerciseProgressDefinition, exerciseRecordProgressValue } from '@/lib/exercise-progress';
import { formatDate, formatNumber, localDateKey } from '@/lib/workout-ui';
import { stableExerciseId, type DayPlan, type ExerciseType, type LibraryExercise, type WorkoutData, type WorkoutSession } from '@/lib/workout-data';

type HistoryViewProps = {
  workouts: WorkoutSession[];
  exerciseHistory: WorkoutData['exerciseHistory'];
  dayPlans: DayPlan[];
  totalVolume: number;
  now: number;
  goToday: () => void;
  editWorkout: (workout: WorkoutSession) => void;
  deleteWorkout: (workout: WorkoutSession) => void;
  downloadHistory: (format: 'json' | 'csv') => void;
  historyHasMore: boolean;
  historyLoading: boolean;
  loadOlderHistory: () => void;
};

function niceChartMaximum(values: number[], minimum: number) {
  const peak = Math.max(minimum, ...values);
  const padded = peak * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const fraction = padded / magnitude;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((candidate) => candidate >= fraction) ?? 10;
  return step * magnitude;
}

export function HistoryView({ workouts, exerciseHistory, dayPlans, totalVolume, now, goToday, editWorkout, deleteWorkout, downloadHistory, historyHasMore, historyLoading, loadOlderHistory }: HistoryViewProps) {
  const plannedById = useMemo(() => {
    const entries = new Map<string, LibraryExercise>();
    for (const exercise of dayPlans.flatMap((plan) => plan.exercises)) {
      const id = exercise.id || stableExerciseId(exercise.name);
      if (!entries.has(id)) entries.set(id, exercise);
    }
    return entries;
  }, [dayPlans]);
  const plannedIdByHistoryKey = useMemo(() => new Map(
    [...plannedById].flatMap(([id, exercise]) => exerciseHistoryKeys(exercise).map((key) => [key, id] as const)),
  ), [plannedById]);
  const exerciseOptions = useMemo(() => {
    const entries = new Map([...plannedById].map(([id, exercise]) => [id, exercise.name]));
    for (const item of exerciseHistory) {
      const keys = exerciseHistoryKeys({ id: item.exerciseId, name: item.exercise });
      const resolvedId = keys.map((key) => plannedIdByHistoryKey.get(key)).find(Boolean) ?? keys[0];
      if (!entries.has(resolvedId)) entries.set(resolvedId, canonicalExerciseName(item.exercise));
    }
    return [...entries].map(([id, name]) => ({ id, name }));
  }, [exerciseHistory, plannedById, plannedIdByHistoryKey]);
  const recordedExerciseCount = useMemo(() => new Set(exerciseHistory.map((item) => {
    const keys = exerciseHistoryKeys({ id: item.exerciseId, name: item.exercise });
    return keys.map((key) => plannedIdByHistoryKey.get(key)).find(Boolean) ?? keys[0];
  })).size, [exerciseHistory, plannedIdByHistoryKey]);
  const exerciseIds = exerciseOptions.map((item) => item.id);
  const [selected, setSelected] = useState(exerciseIds[0] ?? '');
  const [cardioMetric, setCardioMetric] = useState<'durationMinutes' | 'distanceKm' | 'calories'>('durationMinutes');
  const selectedExerciseId = exerciseIds.includes(selected) ? selected : exerciseIds[0] ?? '';
  const selectedPlanExercise = plannedById.get(selectedExerciseId);
  const selectedHistoryKeys = new Set(exerciseHistoryKeys({ id: selectedExerciseId, name: selectedPlanExercise?.name ?? selectedExerciseId }));
  const records = exerciseHistory.filter((item) => exerciseHistoryKeys({ id: item.exerciseId, name: item.exercise }).some((key) => selectedHistoryKeys.has(key)))
    .sort((left, right) => +new Date(left.date) - +new Date(right.date));
  const selectedExerciseName = selectedPlanExercise?.name ?? exerciseOptions.find((item) => item.id === selectedExerciseId)?.name ?? records[0]?.exercise ?? '';
  const selectedType: ExerciseType = selectedPlanExercise?.type ?? records[0]?.type ?? 'strength';
  const progressDefinition = exerciseProgressDefinition(selectedPlanExercise, records[0], cardioMetric);
  const { metric, unit, label: metricLabel, inverse } = progressDefinition;
  const values = records.map((item) => exerciseRecordProgressValue(item, progressDefinition));
  const twelveMonthCutoff = new Date();
  twelveMonthCutoff.setFullYear(twelveMonthCutoff.getFullYear() - 1);
  const recentReferenceValues = selectedType === 'strength' ? records.filter((item) => {
    const date = new Date(item.date);
    return !Number.isNaN(date.getTime()) && date >= twelveMonthCutoff;
  }).map((item) => exerciseRecordProgressValue(item, progressDefinition)) : [];
  const twelveMonthAverage = recentReferenceValues.length ? recentReferenceValues.reduce((sum, value) => sum + value, 0) / recentReferenceValues.length : null;
  const planLoad = selectedType === 'strength' && selectedPlanExercise ? exercisePlanProgressValue(selectedPlanExercise, progressDefinition) : null;
  const max = metric === 'level' ? 10 : niceChartMaximum(planLoad === null ? values : [...values, planLoad], metric === 'distanceKm' ? 1 : 10);
  const compact = records.length <= 6;
  const singlePoint = records.length === 1;
  const chartWidth = compact ? 680 : Math.max(800, records.length * 110 + 120);
  const chartHeight = 220;
  const plotTop = 24;
  const plotBottom = 176;
  const edgePadding = compact ? 68 : 60;
  const plotRight = chartWidth - edgePadding;
  const spacing = compact ? (records.length > 1 ? (plotRight - edgePadding) / (records.length - 1) : 0) : 110;
  const chartY = (value: number) => inverse ? plotTop + (value / max) * (plotBottom - plotTop) : plotBottom - (value / max) * (plotBottom - plotTop);
  const points = records.map((item, index) => ({ x: singlePoint ? chartWidth / 2 : edgePadding + index * spacing, y: chartY(exerciseRecordProgressValue(item, progressDefinition)), item, value: exerciseRecordProgressValue(item, progressDefinition) }));
  const averageY = twelveMonthAverage === null ? null : chartY(twelveMonthAverage);
  const planY = planLoad === null ? null : chartY(planLoad);
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const ticks = Array.from({ length: 5 }, (_, index) => ({ y: plotTop + index * ((plotBottom - plotTop) / 4), value: inverse ? max * index * .25 : max * (1 - index * .25) }));
  const formatTick = (value: number) => formatNumber(value);
  const formattedAverage = twelveMonthAverage === null ? '' : formatNumber(twelveMonthAverage);
  const formattedPlanLoad = planLoad === null ? '' : formatNumber(planLoad);
  const formatChartValue = (value: string | number) => metric === 'level' ? `Level ${value}` : `${value} ${unit}`;
  const recent = workouts.filter((workout) => now - +new Date(workout.date) < 30 * 86400000);
  const trainingDays = new Set(recent.map((workout) => localDateKey(new Date(workout.date)))).size;
  const monthlyTarget = 12;
  const consistency = Math.min(100, Math.round(trainingDays / monthlyTarget * 100));
  const best = workouts.reduce((current, item) => item.volume > current.volume ? item : current, workouts[0] ?? { volume: 0, name: 'No workout yet' } as WorkoutSession);

  return <div className="history-layout">
    <div className="stats-row"><article><span>WORKOUTS</span><strong>{workouts.length}</strong><small>{historyHasMore ? 'loaded so far' : 'all time'}</small></article><article><span>TOTAL VOLUME</span><strong>{formatNumber(totalVolume / 1000)}k</strong><small>{historyHasMore ? 'kg in loaded history' : 'kg lifted'}</small></article><article><span>EXERCISES LOGGED</span><strong>{recordedExerciseCount}</strong><small>with progress data</small></article></div>
    <section className="history-momentum"><div className="momentum-ring" style={{ background: `conic-gradient(#fff 0 ${consistency}%, #555 ${consistency}% 100%)` }}><div><strong>{consistency}</strong><span>CONSISTENCY</span></div></div><div className="history-momentum-copy"><span className="muted-label">LAST 30 DAYS</span><h2>{trainingDays ? 'Momentum is building.' : 'Your next session starts the score.'}</h2><p>{trainingDays} of {monthlyTarget} training days · {recent.length} completed {recent.length === 1 ? 'workout' : 'workouts'}</p></div><div className="history-best"><Activity size={19} /><span>STRONGEST SESSION</span><strong>{best.name}</strong><small>{formatNumber(best.volume)} kg volume</small></div></section>
    <section className="card progress-card"><div className="section-heading chart-controls"><div><span className="muted-label">EXERCISE PROGRESS</span><h3>{selectedExerciseName || 'No exercise history yet'}</h3><p>{records.length ? `${metricLabel} · ${metric === 'level' ? '1–10' : unit}` : 'Complete a workout to begin'}</p></div><div className="progress-selects">{exerciseOptions.length > 0 && <select aria-label="Exercise progress" className="exercise-select" value={selectedExerciseId} onChange={(event) => setSelected(event.target.value)}>{exerciseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}{selectedType === 'cardio' && <select aria-label="Cardio progress metric" className="exercise-select metric-select" value={cardioMetric} onChange={(event) => setCardioMetric(event.target.value as typeof cardioMetric)}><option value="durationMinutes">Duration (min)</option><option value="distanceKm">Distance (km)</option><option value="calories">Calories (kcal)</option></select>}</div></div>
      {(planLoad !== null || twelveMonthAverage !== null) && <div className="chart-reference-keys">{planLoad !== null && <div className="chart-plan-key"><i aria-hidden="true" /><span>Current plan</span><strong>{formatChartValue(formattedPlanLoad)}</strong></div>}{twelveMonthAverage !== null && <div className="chart-average-key"><i aria-hidden="true" /><span>12-month average</span><strong>{formatChartValue(formattedAverage)}</strong><small>{recentReferenceValues.length} {recentReferenceValues.length === 1 ? 'entry' : 'entries'}</small></div>}</div>}
      {records.length ? <div className={`fixed-axis-chart ${compact ? 'compact' : 'scrolling'} ${singlePoint ? 'single' : ''}`}><div className="fixed-y-axis" aria-hidden="true">{ticks.map((tick) => <span key={tick.y} style={{ top: tick.y }}>{metric === 'level' ? `L${formatTick(tick.value)}` : formatTick(tick.value)} <small>{metric === 'level' ? '' : unit}</small></span>)}</div><div className="chart-scroll"><div className="chart-canvas" style={compact ? undefined : { width: chartWidth }}><svg className="chart-plot" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label={`${selectedExerciseName} ${metricLabel.toLowerCase()} progression${planLoad === null ? '' : `, current plan ${formatChartValue(formattedPlanLoad)}`}${twelveMonthAverage === null ? '' : `, with a 12-month average of ${formatChartValue(formattedAverage)}`}`}><g className="grid-lines">{ticks.map((tick) => <line key={tick.y} x1="0" x2={chartWidth} y1={tick.y} y2={tick.y} vectorEffect="non-scaling-stroke" />)}</g>{planY !== null && <line className="plan-load-line" x1="0" x2={chartWidth} y1={planY} y2={planY} vectorEffect="non-scaling-stroke" />}{averageY !== null && <line className="average-line" x1="0" x2={chartWidth} y1={averageY} y2={averageY} vectorEffect="non-scaling-stroke" />}{singlePoint && <line className="single-point-guide" x1={points[0].x} x2={points[0].x} y1={points[0].y} y2={plotBottom} vectorEffect="non-scaling-stroke" />}{points.length > 1 && <path className="progress-line" d={path} vectorEffect="non-scaling-stroke" />}</svg>{points.map((point, index) => { const left = compact ? `${point.x / chartWidth * 100}%` : point.x; const edgeClass = points.length === 1 ? '' : index === 0 ? 'first' : index === points.length - 1 ? 'last' : ''; return <div className={`chart-point ${edgeClass}`} key={point.item.id} style={{ left }} aria-hidden="true"><span className="chart-point-value" style={{ top: point.y - 8 }}>{formatChartValue(formatTick(point.value))}</span><span className="chart-point-dot" style={{ top: point.y }} title={`${formatDate(point.item.date)}: ${formatChartValue(point.value)}`} /><span className="chart-point-date">{formatDate(point.item.date).replace(/\s\d{4}/, '')}</span></div>; })}<ol className="sr-only">{points.map((point) => <li key={`summary-${point.item.id}`}>{formatDate(point.item.date)}: {formatChartValue(formatTick(point.value))}</li>)}</ol></div></div></div> : <EmptyState icon={<TrendingUp size={24} />} title="No progress points yet" copy="Complete a workout from the Today page to start your exercise chart." action="Go to Today" onAction={goToday} />}
    </section>
    <section className="history-list-section"><div className="section-heading history-list-heading"><div><span className="muted-label">SESSIONS</span><h3>Workout history</h3></div>{workouts.length > 0 && <div className="history-export-actions"><button onClick={() => downloadHistory('csv')}><Download size={14} /> CSV</button><button onClick={() => downloadHistory('json')}><Download size={14} /> JSON</button></div>}</div>{workouts.length ? <><div className="history-list">{workouts.map((workout) => <article className="history-item" key={workout.id}><span className="history-icon"><Dumbbell size={18} /></span><div><strong>{workout.name}</strong><span>{formatDate(workout.date)} · {workout.focus}</span></div><div><strong>{formatNumber(workout.duration)} min</strong><span>{[workout.sets ? `${formatNumber(workout.sets)} sets` : '', workout.cardioMinutes ? `${formatNumber(workout.cardioMinutes)} cardio min` : '', workout.distanceKm ? `${formatNumber(workout.distanceKm)} km` : ''].filter(Boolean).join(' · ') || 'Completed'}</span></div><div className="history-row-actions"><button onClick={() => editWorkout(workout)} aria-label={`Edit ${workout.name} from ${formatDate(workout.date)}`}><Settings2 size={15} /></button><button className="history-delete" onClick={() => deleteWorkout(workout)} aria-label={`Delete ${workout.name} from ${formatDate(workout.date)}`}><Trash2 size={15} /></button></div></article>)}</div>{historyHasMore && <button className="history-load-more" onClick={loadOlderHistory} disabled={historyLoading}>{historyLoading ? 'Loading older sessions…' : 'Load older sessions'}</button>}</> : <EmptyState icon={<History size={24} />} title="No workouts yet" copy="Your completed sessions will stay here." action="Go to Today" onAction={goToday} />}</section>
  </div>;
}
