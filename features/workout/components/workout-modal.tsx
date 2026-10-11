'use client';

import { Check, ChevronLeft, ChevronRight, Clock3, Plus, Timer, TrendingUp, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { strengthLevelForActiveExercise } from '@/lib/exercise-profile';
import { type ActiveRestTimer, type ActiveWorkout, type ExerciseEntry, type ExerciseRecord, type SetEntry } from '@/lib/workout-data';
import { indexLatestExerciseRecords, latestExerciseRecord } from '@/lib/workout-identity';
import { formatTimer } from '@/lib/workout-ui';
import { useDialogAccessibility } from '@/features/workout/hooks/use-dialog-accessibility';

type WorkoutModalProps = {
  workout: ActiveWorkout;
  exerciseHistory: ExerciseRecord[];
  finishedSets: number;
  totalSets: number;
  totalVolume: number;
  cardioMinutes: number;
  updateSet: (exerciseId: string, setId: string, field: keyof SetEntry, value: number | boolean) => void;
  addSet: (exerciseId: string) => void;
  deleteSet: (exerciseId: string, setId: string) => void;
  updateRestTimer: (timer: ActiveRestTimer | null) => void;
  close: () => void;
  discard: () => void;
  complete: (elapsedSeconds: number) => void;
};

export function WorkoutModal({
  workout, exerciseHistory, finishedSets, totalSets, totalVolume, cardioMinutes,
  updateSet, addSet, deleteSet, updateRestTimer, close, discard, complete,
}: WorkoutModalProps) {
  const restTimer = workout.restTimer;
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [restAnnouncement, setRestAnnouncement] = useState('');
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, workout.exercises.findIndex((exercise) => exercise.sets.some((set) => !set.done))));
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dialogRef = useDialogAccessibility(() => releaseAudio(close, false));

  const latestRecords = useMemo(() => indexLatestExerciseRecords(exerciseHistory), [exerciseHistory]);

  const restRemaining = restTimer ? Math.max(0, Math.ceil((restTimer.endsAt - timerNow) / 1000)) : 0;
  const activeExercise = workout.exercises[Math.min(activeIndex, Math.max(0, workout.exercises.length - 1))];
  const previousExercise = activeIndex > 0 ? workout.exercises[activeIndex - 1] : null;
  const nextExercise = activeIndex < workout.exercises.length - 1 ? workout.exercises[activeIndex + 1] : null;
  const activeLevel = activeExercise ? strengthLevelForActiveExercise(activeExercise, exerciseHistory) : null;
  const elapsed = Math.max(0, Math.floor((elapsedNow - new Date(workout.startedAt).getTime()) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!restTimer) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTimerNow(now);
      if (now < restTimer.endsAt) return;

      setRestAnnouncement(`Rest complete for ${restTimer.exerciseName}.`);
      updateRestTimer(null);
      navigator.vibrate?.([200, 100, 200]);
      playCompletionTone(audioContextRef.current);
    }, 500);
    return () => window.clearInterval(timer);
  }, [restTimer, updateRestTimer]);

  function prepareAudio() {
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      if (context.state === 'suspended') void context.resume();
    } catch {
      // The visual countdown and vibration still work without Web Audio.
    }
  }

  function startRest(exercise: ExerciseEntry, set: SetEntry) {
    if (exercise.restSeconds <= 0) return;
    prepareAudio();
    const now = Date.now();
    const setNumber = Math.max(1, exercise.sets.findIndex((item) => item.id === set.id) + 1);
    setTimerNow(now);
    updateRestTimer({ exerciseId: exercise.id, exerciseName: exercise.name, setNumber, setCount: exercise.sets.length, endsAt: now + exercise.restSeconds * 1000, duration: exercise.restSeconds });
    setRestAnnouncement(`${exercise.restSeconds}-second rest started after set ${setNumber} of ${exercise.name}.`);
  }

  function toggleDone(exercise: ExerciseEntry, set: SetEntry) {
    const markingDone = !set.done;
    if (markingDone && exercise.type === 'strength' && exercise.measurement === 'reps' && set.reps <= 0) {
      setRestAnnouncement(`Enter at least one repetition before completing this set of ${exercise.name}.`);
      return;
    }
    if (markingDone && exercise.type === 'strength' && exercise.measurement === 'duration' && set.durationSeconds <= 0) {
      setRestAnnouncement(`Enter the completed seconds before completing this set of ${exercise.name}.`);
      return;
    }
    if (markingDone && exercise.type === 'cardio' && set.durationMinutes <= 0) {
      setRestAnnouncement(`Enter the completed time before finishing this interval of ${exercise.name}.`);
      return;
    }
    updateSet(exercise.id, set.id, 'done', markingDone);
    if (markingDone) startRest(exercise, set);
  }

  function releaseAudio(action: () => void, clearTimer = true) {
    const context = audioContextRef.current;
    if (context && context.state !== 'closed') void context.close();
    audioContextRef.current = null;
    if (clearTimer) updateRestTimer(null);
    action();
  }

  function showExercise(index: number) {
    setActiveIndex(Math.max(0, Math.min(workout.exercises.length - 1, index)));
  }

  function finishNextSet() {
    if (!activeExercise) return;
    const nextSet = activeExercise.sets.find((set) => !set.done);
    if (nextSet) toggleDone(activeExercise, nextSet);
  }

  function endSwipe(clientX: number, clientY: number) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const horizontal = clientX - start.x;
    const vertical = clientY - start.y;
    if (Math.abs(horizontal) < 48 || Math.abs(horizontal) <= Math.abs(vertical)) return;
    showExercise(activeIndex + (horizontal < 0 ? 1 : -1));
  }

  return (
    <div className="modal-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="workout-modal" role="dialog" aria-modal="true" aria-labelledby="workout-title">
        <header className="workout-modal-header">
          <div>
            <span className="muted-label">{workout.retake ? 'RETAKING TODAY · REPLACES TODAY’S HISTORY' : 'WORKOUT IN PROGRESS'}</span>
            <h2 id="workout-title">{workout.name}</h2>
            <p>{workout.focus}</p>
          </div>
          <div className="workout-clock"><Clock3 size={17} /><strong>{formatTimer(elapsed)}</strong></div>
          <button className="modal-close" onClick={() => releaseAudio(close, false)} aria-label="Close workout"><X size={20} /></button>
        </header>

        <div className="workout-deck-status"><span>Exercise {activeIndex + 1} of {workout.exercises.length}</span><strong>{finishedSets}/{totalSets} sets complete</strong></div>
        <div className="workout-progress"><span style={{ width: `${totalSets ? finishedSets / totalSets * 100 : 0}%` }} /></div>
        {restTimer && <RestTimerPanel timer={restTimer} remaining={restRemaining} addTime={() => updateRestTimer({ ...restTimer, endsAt: restTimer.endsAt + 15000, duration: restTimer.duration + 15 })} skip={() => { updateRestTimer(null); setRestAnnouncement('Rest timer skipped.'); }} />}
        <p className="sr-only" aria-live="assertive">{restAnnouncement}</p>

        <div className="workout-scroll workout-deck-scroll">
          {activeExercise ? (
            <div className="workout-deck" onPointerDown={(event) => {
              const target = event.target instanceof Element ? event.target : null;
              if (target?.closest('button, input, select, textarea, a, label, [contenteditable="true"]')) {
                swipeStart.current = null;
                return;
              }
              swipeStart.current = { x: event.clientX, y: event.clientY };
            }} onPointerUp={(event) => endSwipe(event.clientX, event.clientY)} onPointerCancel={() => { swipeStart.current = null; }}>
              {previousExercise && <button className="workout-card-peek previous" onClick={() => showExercise(activeIndex - 1)} aria-label={`Previous exercise: ${previousExercise.name}`}><span>{previousExercise.name}</span></button>}
              <section className={`workout-exercise workout-swipe-card ${restTimer?.exerciseId === activeExercise.id ? 'resting' : ''}`} key={activeExercise.id} tabIndex={0} onKeyDown={(event) => { if (event.key === 'ArrowLeft') showExercise(activeIndex - 1); if (event.key === 'ArrowRight') showExercise(activeIndex + 1); }}>
              <div className="workout-exercise-title">
                <span>{String(activeIndex + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{activeExercise.name}</h3>
                  <div className="workout-exercise-tags"><b>{activeExercise.category || (activeExercise.type === 'cardio' ? 'CARDIO' : 'STRENGTH')}</b>{activeLevel && <b>L{activeLevel.index} · {activeLevel.name}</b>}</div>
                  <p>{activeExercise.sets.filter((set) => set.done).length}/{activeExercise.sets.length} complete</p>
                </div>
              </div>

              <ExerciseMetrics exercise={activeExercise} />
              <ProgressionGuidance exercise={activeExercise} previous={latestExerciseRecord(latestRecords, activeExercise)} />

              {activeExercise.type === 'strength' && activeExercise.measurement === 'duration' ? (
                <TimedStrengthSetTable exercise={activeExercise} updateSet={updateSet} deleteSet={deleteSet} toggleDone={toggleDone} />
              ) : activeExercise.type === 'strength' ? (
                <StrengthSetTable exercise={activeExercise} updateSet={updateSet} deleteSet={deleteSet} toggleDone={toggleDone} />
              ) : (
                <CardioSetTable exercise={activeExercise} updateSet={updateSet} deleteSet={deleteSet} toggleDone={toggleDone} />
              )}

              <button className="add-set-button" onClick={() => addSet(activeExercise.id)}><Plus size={14} /> Add {activeExercise.type === 'cardio' ? 'interval' : 'set'}</button>
              </section>
              {nextExercise && <button className="workout-card-peek next" onClick={() => showExercise(activeIndex + 1)} aria-label={`Next exercise: ${nextExercise.name}`}><span>{nextExercise.name}</span></button>}
            </div>
          ) : <div className="workout-deck-empty">No exercises in this workout.</div>}

          <div className="workout-deck-dots" aria-label={`Exercise ${activeIndex + 1} of ${workout.exercises.length}`}>{workout.exercises.map((exercise, index) => <button key={`${exercise.id}:${index}`} className={index === activeIndex ? 'active' : exercise.sets.every((set) => set.done) ? 'done' : ''} onClick={() => showExercise(index)} aria-label={`Show ${exercise.name}`} />)}</div>
          <div className="workout-swipe-hint"><ChevronLeft size={14} /> Swipe to change exercise <ChevronRight size={14} /></div>
        </div>

        <footer className="workout-footer swipe-workout-footer">
          <div><span>SESSION OUTPUT</span><strong>{[totalVolume ? `${totalVolume.toLocaleString()} kg` : '', cardioMinutes ? `${cardioMinutes} cardio min` : ''].filter(Boolean).join(' · ') || 'Mark an entry complete'}</strong></div>
          <div className="workout-swipe-actions"><button className="workout-arrow" onClick={() => showExercise(activeIndex - 1)} disabled={!previousExercise} aria-label="Previous exercise"><ChevronLeft size={20} /></button><button className="complete-set-button" onClick={finishNextSet} disabled={!activeExercise?.sets.some((set) => !set.done)}>{activeExercise?.sets.every((set) => set.done) ? 'Exercise complete' : 'Complete set'}</button><button className="workout-arrow" onClick={() => showExercise(activeIndex + 1)} disabled={!nextExercise} aria-label="Next exercise"><ChevronRight size={20} /></button></div>
          <button className="discard-button" onClick={() => releaseAudio(discard)}><Trash2 size={15} /> Discard</button>
          <button className="complete-button" disabled={!finishedSets} onClick={() => releaseAudio(() => complete(elapsed))}>Complete workout <Check size={17} /></button>
        </footer>
      </section>
    </div>
  );
}

function ExerciseMetrics({ exercise }: { exercise: ExerciseEntry }) {
  const load = exercise.type === 'cardio' ? `${exercise.targetDurationMinutes} min`
    : exercise.measurement === 'duration' ? `${exercise.targetDurationSeconds} sec`
    : exercise.loadMode === 'bodyweight' ? 'Bodyweight' : `${exercise.targetWeight} kg`;
  const effort = exercise.type === 'cardio' ? 'Cardio'
    : exercise.measurement === 'duration' ? 'Timed' : `${exercise.targetReps} reps`;
  return <div className="workout-card-metrics"><div><strong>{load}</strong><span>LOAD</span></div><div><strong>{exercise.sets.length}</strong><span>SETS</span></div><div><strong>{effort}</strong><span>{exercise.measurement === 'duration' ? 'MODE' : 'REPS'}</span></div><div><strong>{exercise.restSeconds ? `${exercise.restSeconds} sec` : '—'}</strong><span>REST</span></div></div>;
}

function RestTimerPanel({ timer, remaining, addTime, skip }: { timer: ActiveRestTimer; remaining: number; addTime: () => void; skip: () => void }) {
  const progress = timer.duration ? Math.max(0, Math.min(100, remaining / timer.duration * 100)) : 0;
  return (
    <div className="rest-timer-bar" role="timer" aria-label={`${formatTimer(remaining)} rest remaining for ${timer.exerciseName}, after set ${timer.setNumber} of ${timer.setCount}`}>
      <span className="rest-timer-icon"><Timer size={18} /></span>
      <div className="rest-timer-copy">
        <span>REST · {timer.exerciseName}</span>
        <strong className="rest-countdown">{formatTimer(remaining)}</strong>
        <small>remaining · set {timer.setNumber} of {timer.setCount} · {formatTimer(timer.duration)} total</small>
        <i className="rest-timer-progress" aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>
      </div>
      <button type="button" onClick={addTime}>+15 sec</button>
      <button type="button" onClick={skip}>Skip</button>
    </div>
  );
}

type SetTableProps = {
  exercise: ExerciseEntry;
  updateSet: WorkoutModalProps['updateSet'];
  deleteSet: WorkoutModalProps['deleteSet'];
  toggleDone: (exercise: ExerciseEntry, set: SetEntry) => void;
};

function StrengthSetTable({ exercise, updateSet, deleteSet, toggleDone }: SetTableProps) {
  return (
    <div className="set-table">
      <div className="set-head"><span>SET</span><span>KG</span><span>REPS</span><span>DONE</span><span /></div>
      {exercise.sets.map((set, index) => (
        <div className={`set-row ${set.done ? 'completed' : ''}`} key={set.id}>
          <strong>{index + 1}</strong>
          <input type="number" min="0" step="0.5" value={set.weight} onChange={(event) => updateSet(exercise.id, set.id, 'weight', Number(event.target.value))} aria-label={`${exercise.name} set ${index + 1} weight`} />
          <input type="number" min="0" value={set.reps} onChange={(event) => updateSet(exercise.id, set.id, 'reps', Number(event.target.value))} aria-label={`${exercise.name} set ${index + 1} reps`} />
          <SetActions exercise={exercise} set={set} index={index} unit="set" deleteSet={deleteSet} toggleDone={toggleDone} />
        </div>
      ))}
    </div>
  );
}

function TimedStrengthSetTable({ exercise, updateSet, deleteSet, toggleDone }: SetTableProps) {
  return (
    <div className="set-table timed-strength">
      <div className="set-head"><span>SET</span><span>SECONDS</span><span>DONE</span><span /></div>
      {exercise.sets.map((set, index) => (
        <div className={`set-row ${set.done ? 'completed' : ''}`} key={set.id}>
          <strong>{index + 1}</strong>
          <input type="number" min="1" step="1" value={set.durationSeconds} onChange={(event) => updateSet(exercise.id, set.id, 'durationSeconds', Number(event.target.value))} aria-label={`${exercise.name} set ${index + 1} duration in seconds`} />
          <SetActions exercise={exercise} set={set} index={index} unit="set" deleteSet={deleteSet} toggleDone={toggleDone} />
        </div>
      ))}
    </div>
  );
}

function CardioSetTable({ exercise, updateSet, deleteSet, toggleDone }: SetTableProps) {
  return (
    <div className="set-table cardio">
      <div className="set-head"><span>ROUND</span><span>MIN</span><span>KM</span><span>KCAL</span><span>DONE</span><span /></div>
      {exercise.sets.map((set, index) => (
        <div className={`set-row ${set.done ? 'completed' : ''}`} key={set.id}>
          <strong>{index + 1}</strong>
          <input type="number" min="0" step="1" value={set.durationMinutes} onChange={(event) => updateSet(exercise.id, set.id, 'durationMinutes', Number(event.target.value))} aria-label={`${exercise.name} round ${index + 1} duration in minutes`} />
          <input type="number" min="0" step="0.1" value={set.distanceKm} onChange={(event) => updateSet(exercise.id, set.id, 'distanceKm', Number(event.target.value))} aria-label={`${exercise.name} round ${index + 1} distance in kilometres`} />
          <input type="number" min="0" step="1" value={set.calories} onChange={(event) => updateSet(exercise.id, set.id, 'calories', Number(event.target.value))} aria-label={`${exercise.name} round ${index + 1} calories`} />
          <SetActions exercise={exercise} set={set} index={index} unit="round" deleteSet={deleteSet} toggleDone={toggleDone} />
        </div>
      ))}
    </div>
  );
}

function SetActions({ exercise, set, index, unit, deleteSet, toggleDone }: {
  exercise: ExerciseEntry;
  set: SetEntry;
  index: number;
  unit: 'set' | 'round';
  deleteSet: WorkoutModalProps['deleteSet'];
  toggleDone: SetTableProps['toggleDone'];
}) {
  return (
    <>
      <button className={`set-check ${set.done ? 'checked' : ''}`} onClick={() => toggleDone(exercise, set)} aria-label={`Mark ${exercise.name} ${unit} ${index + 1} ${set.done ? 'not done' : 'done'}`}>{set.done && <Check size={15} />}</button>
      <button className="delete-set" onClick={() => deleteSet(exercise.id, set.id)} aria-label={`Delete ${exercise.name} ${unit} ${index + 1}`}><Trash2 size={14} /></button>
    </>
  );
}

function ProgressionGuidance({ exercise, previous }: { exercise: ExerciseEntry; previous?: ExerciseRecord }) {
  const completed = exercise.sets.filter((set) => set.done);

  if (exercise.type === 'cardio') {
    const currentMet = completed.length === exercise.sets.length && completed.every((set) =>
      set.durationMinutes >= exercise.targetDurationMinutes && (!exercise.targetDistanceKm || set.distanceKm >= exercise.targetDistanceKm));
    const ready = currentMet || (!completed.length && Boolean(previous?.targetMet));
    const minuteStep = exercise.targetDurationMinutes >= 30 ? 5 : 2;
    const nextMinutes = exercise.targetDurationMinutes + minuteStep;
    const nextDistance = exercise.targetDistanceKm ? Math.round((exercise.targetDistanceKm + 0.2) * 10) / 10 : 0;
    const previousText = previous
      ? `Previous total · ${previous.durationMinutes} min${previous.distanceKm ? ` · ${previous.distanceKm} km` : ''}${previous.calories ? ` · ${previous.calories} kcal` : ''}`
      : 'No previous cardio session logged';
    const advice = ready
      ? `${currentMet ? 'Target reached. Next session' : 'Previous target complete. Today'} try ${nextMinutes} min${nextDistance ? ` or ${nextDistance} km` : ''}.`
      : `Build consistency at ${exercise.targetDurationMinutes} min${exercise.targetDistanceKm ? ` and ${exercise.targetDistanceKm} km` : ''}, then add ${minuteStep} minutes.`;

    return <div className={`progression-guidance ${currentMet ? 'achieved' : ''}`}><span><TrendingUp size={15} /> PROGRESSION</span><strong>{previousText}</strong><p>{advice}</p></div>;
  }

  if (exercise.measurement === 'duration') {
    const currentMet = completed.length === exercise.sets.length && completed.every((set) => set.durationSeconds >= exercise.targetDurationSeconds);
    const ready = currentMet || (!completed.length && Boolean(previous?.targetMet));
    const step = exercise.targetDurationSeconds >= 60 ? 10 : 5;
    const nextSeconds = exercise.targetDurationSeconds + step;
    const previousText = previous
      ? `Previous total · ${previous.durationSeconds} sec${previous.setsCompleted ? ` · ${previous.setsCompleted} sets` : ''}${previous.estimated ? ' · estimated' : ''}`
      : 'No previous timed session logged';
    const advice = ready
      ? `${currentMet ? 'Target reached. Next session' : 'Previous target complete. Today'} try ${nextSeconds} seconds per set.`
      : `Hold each set for ${exercise.targetDurationSeconds} seconds, then add ${step} seconds.`;
    return <div className={`progression-guidance ${currentMet ? 'achieved' : ''}`}><span><TrendingUp size={15} /> PROGRESSION</span><strong>{previousText}</strong><p>{advice}</p></div>;
  }

  const inverseLoad = exercise.loadMode === 'assistance';
  const currentMet = completed.length === exercise.sets.length && completed.every((set) =>
    (inverseLoad ? set.weight <= exercise.targetWeight : set.weight >= exercise.targetWeight) && set.reps >= exercise.targetReps);
  const ready = currentMet || (!completed.length && Boolean(previous?.targetMet));
  const step = exercise.targetWeight >= 80 ? 5 : 2.5;
  const nextWeight = Math.max(0, exercise.targetWeight + (inverseLoad ? -step : step));
  const previousText = previous
    ? `Previous best · ${previous.weight} kg${previous.reps ? ` × ${previous.reps} reps` : ' · reps unavailable'}${previous.setsCompleted ? ` · ${previous.setsCompleted} sets` : ''}${previous.estimated ? ' · estimated' : ''}`
    : 'No previous strength session logged';

  let advice: string;
  if (exercise.targetWeight <= 0) {
    const nextReps = exercise.targetReps + (exercise.targetReps >= 12 ? 2 : 1);
    advice = ready
      ? `${currentMet ? 'Target reached. Next session' : 'Previous target complete. Today'} aim for ${nextReps} reps per set.`
      : `Keep ${exercise.targetReps} reps until every work set is controlled, then add reps.`;
  } else if (ready) {
    advice = `${currentMet ? 'Target reached. Next session' : 'Previous target complete. Today'} try ${nextWeight} kg × ${exercise.targetReps} reps.`;
  } else {
    advice = `Hold ${exercise.targetWeight} kg until every work set reaches ${exercise.targetReps} reps, then ${inverseLoad ? 'reduce assistance' : 'add weight'}.`;
  }

  return <div className={`progression-guidance ${currentMet ? 'achieved' : ''}`}><span><TrendingUp size={15} /> PROGRESSION</span><strong>{previousText}</strong><p>{advice}</p></div>;
}

function playCompletionTone(context: AudioContext | null) {
  if (!context) return;
  void (async () => {
    if (context.state === 'suspended') await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.45);
  })();
}
