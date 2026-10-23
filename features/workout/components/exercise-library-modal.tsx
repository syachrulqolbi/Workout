'use client';

import { Dumbbell, Pencil, Plus, Timer, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  DAY_NAMES, DAY_SHORT, type DayPlan, type ExerciseLoadMode, type ExerciseMeasurement, type ExerciseType, type LibraryExercise,
} from '@/lib/workout-data';
import { isWeightedHoldStandard } from '@/lib/exercise-profile';
import { useDialogAccessibility } from '@/features/workout/hooks/use-dialog-accessibility';

type ExerciseLibraryModalProps = {
  plans: DayPlan[];
  selectedDay: number;
  setSelectedDay: (day: number) => void;
  todayDay: number;
  close: () => void;
  updatePlan: (day: number, updates: Partial<Pick<DayPlan, 'name' | 'focus'>>) => void;
  add: (day: number, exercise: Omit<LibraryExercise, 'id'>) => void;
  update: (day: number, id: string, updates: Partial<LibraryExercise>) => void;
  remove: (day: number, id: string) => void;
};

export function ExerciseLibraryModal({
  plans, selectedDay, setSelectedDay, todayDay, close, updatePlan, add, update, remove,
}: ExerciseLibraryModalProps) {
  const dialogRef = useDialogAccessibility(close);
  const dayTabsRef = useRef<HTMLDivElement>(null);
  const plan = plans.find((item) => item.day === selectedDay) ?? plans[0];
  const [newType, setNewType] = useState<ExerciseType>('strength');
  const [newMeasurement, setNewMeasurement] = useState<ExerciseMeasurement>('reps');
  const [newLoadMode, setNewLoadMode] = useState<ExerciseLoadMode>('total');

  useEffect(() => {
    dayTabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedDay]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const measurement: ExerciseMeasurement = newType === 'cardio' ? 'duration' : newMeasurement;
    const loadMode: ExerciseLoadMode = newType === 'cardio' || measurement === 'duration' ? 'duration' : newLoadMode;
    add(selectedDay, {
      name: String(values.get('name')).trim(),
      type: newType, measurement, loadMode,
      category: String(values.get('category') ?? ''),
      weight: newType === 'strength' && measurement === 'reps' && loadMode !== 'bodyweight' ? Number(values.get('weight')) : 0,
      sets: newType === 'strength' ? Number(values.get('sets')) : 1,
      reps: newType === 'strength' && measurement === 'reps' ? Number(values.get('reps')) : 0,
      durationSeconds: newType === 'strength' && measurement === 'duration' ? Number(values.get('durationSeconds')) : 0,
      durationMinutes: newType === 'cardio' ? Number(values.get('durationMinutes')) : 0,
      distanceKm: newType === 'cardio' ? Number(values.get('distanceKm')) : 0,
      calories: newType === 'cardio' ? Number(values.get('calories')) : 0,
      restSeconds: Number(values.get('restSeconds')),
    });
    form.reset();
    setNewType('strength');
    setNewMeasurement('reps');
    setNewLoadMode('total');
  }

  return (
    <div className="modal-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="library-modal" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <header className="modal-header">
          <div>
            <span className="muted-label">WEEKDAY PLANS</span>
            <h2 id="library-title">Exercise library</h2>
            <p>Build each training day and choose the rest time between sets.</p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close exercise library"><X size={20} /></button>
        </header>

        <div className="library-days" role="tablist" aria-label="Choose a weekday" ref={dayTabsRef}>
          {DAY_SHORT.map((day, index) => (
            <button type="button" role="tab" id={`weekday-tab-${index}`} aria-controls={`weekday-plan-${index}`} aria-selected={selectedDay === index} tabIndex={selectedDay === index ? 0 : -1} key={day} className={`${selectedDay === index ? 'active' : ''} ${todayDay === index ? 'today' : ''}`} onClick={() => setSelectedDay(index)} onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const direction = event.key === 'ArrowRight' ? 1 : -1;
              const nextDay = (index + direction + DAY_SHORT.length) % DAY_SHORT.length;
              setSelectedDay(nextDay);
              window.requestAnimationFrame(() => document.getElementById(`weekday-tab-${nextDay}`)?.focus());
            }}>
              {day}{todayDay === index && <small>Today</small>}
            </button>
          ))}
        </div>

        <div className="library-day-panel" role="tabpanel" id={`weekday-plan-${selectedDay}`} aria-labelledby={`weekday-tab-${selectedDay}`}>
          <div className="plan-fields">
            <TextField label="Workout name" value={plan.name} onChange={(value) => updatePlan(selectedDay, { name: value })} />
            <TextField label="Focus" value={plan.focus} onChange={(value) => updatePlan(selectedDay, { focus: value })} />
          </div>

          <div className="library-scroll">
            {plan.exercises.map((exercise) => (
              <ExerciseEditor key={exercise.id} day={selectedDay} exercise={exercise} update={update} remove={remove} />
            ))}
            {!plan.exercises.length && <div className="library-empty-inline" role="status"><Dumbbell size={22} /><span>No exercises on {DAY_NAMES[selectedDay]} yet.</span></div>}
          </div>

          <form className="library-add-form" onSubmit={submit}>
            <div className="library-add-heading">
              <div><span className="muted-label">ADD TO {DAY_NAMES[selectedDay].toUpperCase()}</span><h3>New exercise</h3></div>
              <Pencil size={17} />
            </div>
            <div className="library-add-fields">
              <label className="library-name"><span>Name</span><input name="name" placeholder={newType === 'strength' ? 'e.g. Front squat' : 'e.g. Outdoor run'} required /></label>
              <div className="library-add-metrics">
                <label><span>TYPE</span><select value={newType} onChange={(event) => { const type = event.target.value as ExerciseType; setNewType(type); if (type === 'cardio') { setNewMeasurement('duration'); setNewLoadMode('duration'); } else { setNewMeasurement('reps'); setNewLoadMode('total'); } }}><option value="strength">Strength</option><option value="cardio">Cardio</option></select></label>
                <CategoryField name="category" defaultValue={newType === 'cardio' ? 'Cardio' : ''} />
                {newType === 'strength' ? (
                  <>
                    <label><span>MEASURE</span><select value={newMeasurement} onChange={(event) => { const measurement = event.target.value as ExerciseMeasurement; setNewMeasurement(measurement); setNewLoadMode(measurement === 'duration' ? 'duration' : 'total'); }}><option value="reps">Repetitions</option><option value="duration">Timed hold</option></select></label>
                    {newMeasurement === 'reps' && <label><span>LOAD</span><select value={newLoadMode} onChange={(event) => setNewLoadMode(event.target.value as ExerciseLoadMode)}><option value="total">Total kg</option><option value="perSide">Kg per side</option><option value="assistance">Assistance</option><option value="bodyweight">Bodyweight</option></select></label>}
                    {newMeasurement === 'reps' && newLoadMode !== 'bodyweight' && <NumberField name="weight" label="KG" min={0} step={0.5} defaultValue={20} />}
                    <NumberField name="sets" label="SETS" min={1} max={20} defaultValue={3} />
                    {newMeasurement === 'reps'
                      ? <NumberField name="reps" label="REPS" min={1} max={100} defaultValue={8} />
                      : <NumberField name="durationSeconds" label="SECONDS" min={1} max={3600} defaultValue={45} />}
                  </>
                ) : (
                  <>
                    <NumberField name="durationMinutes" label="MINUTES" min={1} defaultValue={20} />
                    <NumberField name="distanceKm" label="KM · OPTIONAL" min={0} step={0.1} defaultValue={0} />
                    <NumberField name="calories" label="KCAL · OPTIONAL" min={0} defaultValue={0} />
                  </>
                )}
                <NumberField key={`rest-${newType}`} name="restSeconds" label="REST · SEC" min={0} max={600} step={15} defaultValue={newType === 'strength' ? 90 : 0} />
              </div>
            </div>
            <button className="small-dark-button library-add-submit" type="submit"><Plus size={15} /> Add exercise</button>
          </form>
        </div>
      </section>
    </div>
  );
}

function ExerciseEditor({ day, exercise, update, remove }: {
  day: number;
  exercise: LibraryExercise;
  update: ExerciseLibraryModalProps['update'];
  remove: ExerciseLibraryModalProps['remove'];
}) {
  const weightedHold = isWeightedHoldStandard(exercise.levelStandard);
  return (
    <article className="library-item">
      <div className="library-item-heading">
        <span className="library-item-icon">{exercise.type === 'cardio' ? <Timer size={17} /> : <Dumbbell size={17} />}</span>
        <label className="library-name"><span>Exercise</span><input value={exercise.name} onChange={(event) => update(day, exercise.id, { name: event.target.value })} /></label>
        <button type="button" className="library-delete" onClick={() => { if (window.confirm(`Remove ${exercise.name} from this weekday plan?`)) remove(day, exercise.id); }} aria-label={`Remove ${exercise.name}`}><Trash2 size={16} /></button>
      </div>

      <div className="library-metrics">
        <label><span>TYPE</span><select value={exercise.type} onChange={(event) => { const type = event.target.value as ExerciseType; update(day, exercise.id, type === 'cardio'
          ? { type, measurement: 'duration', loadMode: 'duration', weight: 0, reps: 0, durationSeconds: 0, sets: 1, restSeconds: 0 }
          : { type, measurement: 'reps', loadMode: 'total', durationMinutes: 0, distanceKm: 0, calories: 0, restSeconds: 90 }); }}><option value="strength">Strength</option><option value="cardio">Cardio</option></select></label>
        <CategoryField value={exercise.category ?? ''} onChange={(category) => update(day, exercise.id, { category })} />
        {exercise.type === 'strength' ? (
          <>
            <label><span>MEASURE</span><select value={exercise.measurement} onChange={(event) => { const measurement = event.target.value as ExerciseMeasurement; update(day, exercise.id, measurement === 'duration'
              ? { measurement, loadMode: 'duration', weight: 0, reps: 0, durationSeconds: exercise.durationSeconds || 45 }
              : { measurement, loadMode: exercise.loadMode === 'duration' ? 'total' : exercise.loadMode, durationSeconds: 0, reps: exercise.reps || 8 }); }}><option value="reps">Repetitions</option><option value="duration">Timed hold</option></select></label>
            {exercise.measurement === 'reps' && <label><span>LOAD</span><select value={exercise.loadMode} onChange={(event) => { const loadMode = event.target.value as ExerciseLoadMode; update(day, exercise.id, { loadMode, weight: loadMode === 'bodyweight' ? 0 : exercise.weight }); }}><option value="total">Total kg</option><option value="perSide">Kg per side</option><option value="assistance">Assistance</option><option value="bodyweight">Bodyweight</option></select></label>}
            {exercise.measurement === 'reps' && exercise.loadMode !== 'bodyweight' && <EditableNumber label="KG" value={exercise.weight} min={0} step={0.5} onChange={(value) => update(day, exercise.id, { weight: value })} />}
            {exercise.measurement === 'duration' && weightedHold && <EditableNumber label="ADDED KG" value={exercise.weight} min={0} step={0.5} onChange={(value) => update(day, exercise.id, { weight: value })} />}
            <EditableNumber label="SETS" value={exercise.sets} min={1} onChange={(value) => update(day, exercise.id, { sets: value })} />
            {exercise.measurement === 'duration'
              ? <EditableNumber label="SECONDS" value={exercise.durationSeconds} min={1} onChange={(value) => update(day, exercise.id, { durationSeconds: value })} />
              : <EditableNumber label="REPS" value={exercise.reps} min={1} onChange={(value) => update(day, exercise.id, { reps: value })} />}
          </>
        ) : (
          <>
            <EditableNumber label="MIN" value={exercise.durationMinutes} min={1} onChange={(value) => update(day, exercise.id, { durationMinutes: value, sets: 1 })} />
            <EditableNumber label="KM · OPTIONAL" value={exercise.distanceKm} min={0} step={0.1} onChange={(value) => update(day, exercise.id, { distanceKm: value })} />
            <EditableNumber label="KCAL · OPTIONAL" value={exercise.calories} min={0} onChange={(value) => update(day, exercise.id, { calories: value })} />
          </>
        )}
        <EditableNumber label="REST · SEC" value={exercise.restSeconds} min={0} max={600} step={15} onChange={(value) => update(day, exercise.id, { restSeconds: value })} />
      </div>
    </article>
  );
}

const EXERCISE_CATEGORIES = ['', 'Push', 'Pull', 'Arms', 'Core', 'Legs', 'Glutes', 'Hamstrings', 'Calves', 'Posture', 'Cardio'];

function CategoryField({ name, value, defaultValue, onChange }: {
  name?: string; value?: string; defaultValue?: string; onChange?: (value: string) => void;
}) {
  return <label><span>CATEGORY</span><select name={name} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined}>{EXERCISE_CATEGORIES.map((category) => <option key={category || 'none'} value={category}>{category || 'Choose area'}</option>)}</select></label>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function EditableNumber({ label, value, onChange, min, max, step }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return <label><span>{label}</span><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function NumberField({ name, label, min, max, step, defaultValue }: {
  name: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
}) {
  return <label><span>{label}</span><input name={name} type="number" min={min} max={max} step={step} defaultValue={defaultValue} required /></label>;
}
