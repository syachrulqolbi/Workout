'use client';

import { Save, X } from 'lucide-react';
import { FormEvent } from 'react';
import { useDialogAccessibility } from '@/features/workout/hooks/use-dialog-accessibility';
import { canonicalExerciseName, isLoadedBackExtension, isPlankExercise } from '@/lib/exercise-profile';
import type { ExerciseRecord, WorkoutSession } from '@/lib/workout-data';

function localDateTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function numeric(form: FormData, key: string, fallback: number) {
  const value = Number(form.get(key));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function HistorySessionModal({ workout, records, close, save }: {
  workout: WorkoutSession;
  records: ExerciseRecord[];
  close: () => void;
  save: (workout: WorkoutSession, records: ExerciseRecord[]) => void;
}) {
  const dialogRef = useDialogAccessibility(close);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dateInput = String(form.get('date') ?? '');
    const date = dateInput ? new Date(dateInput).toISOString() : workout.date;
    const nextRecords = records.map((record) => {
      const prefix = `record-${record.id}`;
      const weight = numeric(form, `${prefix}-weight`, record.weight);
      const reps = numeric(form, `${prefix}-reps`, record.reps);
      const durationSeconds = numeric(form, `${prefix}-seconds`, record.durationSeconds);
      const durationMinutes = numeric(form, `${prefix}-minutes`, record.durationMinutes);
      const distanceKm = numeric(form, `${prefix}-distance`, record.distanceKm);
      const calories = numeric(form, `${prefix}-calories`, record.calories);
      const divisor = Math.max(1, record.setsCompleted);
      const completedSets = record.completedSets.map((set) => ({
        ...set,
        ...(record.type === 'strength' && record.measurement === 'reps' ? { weight, reps } : {}),
        ...(record.type === 'strength' && record.measurement === 'duration'
          ? { weight: isPlankExercise({ id: record.exerciseId, name: record.exercise }) ? weight : set.weight, durationSeconds: durationSeconds / divisor }
          : {}),
        ...(record.type === 'cardio' ? { durationMinutes: durationMinutes / divisor, distanceKm: distanceKm / divisor, calories: calories / divisor } : {}),
      }));
      return { ...record, date, weight, reps, durationSeconds, durationMinutes, distanceKm, calories, completedSets };
    });
    save({
      ...workout,
      date,
      name: String(form.get('name') ?? workout.name).trim() || workout.name,
      focus: String(form.get('focus') ?? workout.focus).trim(),
      duration: numeric(form, 'duration', workout.duration),
    }, nextRecords);
  }

  return (
    <div className="modal-backdrop compact">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="meal-modal history-session-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-session-title"
      >
        <header className="modal-header history-session-header">
          <div>
            <span className="muted-label">CORRECT SESSION</span>
            <h2 id="history-session-title">Edit workout history</h2>
            <p>Adjust the session details and recorded exercise values.</p>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close history editor">
            <X size={20} />
          </button>
        </header>

        <form className="meal-form history-session-form" onSubmit={submit}>
          <section className="history-session-details full" aria-labelledby="session-details-heading">
            <div className="history-form-section-heading">
              <div>
                <span className="muted-label" id="session-details-heading">SESSION DETAILS</span>
                <p>Keep the title, timing and focus accurate.</p>
              </div>
            </div>
            <div className="history-session-detail-fields">
              <label className="full">
                <span>WORKOUT NAME</span>
                <input name="name" defaultValue={workout.name} required />
              </label>
              <label className="full">
                <span>FOCUS</span>
                <input name="focus" defaultValue={workout.focus} />
              </label>
              <label className="history-session-date">
                <span>DATE &amp; TIME</span>
                <input type="datetime-local" name="date" defaultValue={localDateTimeValue(workout.date)} required />
              </label>
              <label className="history-session-duration">
                <span>DURATION (MIN)</span>
                <input type="number" name="duration" min="1" step="1" defaultValue={workout.duration} required />
              </label>
            </div>
          </section>

          <section className="history-record-editor full" aria-labelledby="exercise-records-heading">
            <div className="history-form-section-heading">
              <div>
                <span className="muted-label" id="exercise-records-heading">EXERCISE RECORDS</span>
                <p>Values reflect the complete recorded exercise.</p>
              </div>
              <strong>{records.length} {records.length === 1 ? 'exercise' : 'exercises'}</strong>
            </div>

            {records.map((record, index) => (
              <fieldset className="history-record-card" key={record.id}>
                <legend>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {canonicalExerciseName(record.exercise)}
                </legend>
                <div className={`history-record-fields ${record.type === 'cardio' ? 'cardio' : ''}`}>
                  {record.type === 'strength' && record.measurement === 'reps' && (
                    <>
                      <label>
                        <span>{isLoadedBackExtension({ id: record.exerciseId, name: record.exercise }) ? 'ADDED KG' : 'KG'}</span>
                        <input type="number" min="0" step="0.5" name={`record-${record.id}-weight`} defaultValue={record.weight} />
                      </label>
                      <label>
                        <span>REPS</span>
                        <input type="number" min="0" step="1" name={`record-${record.id}-reps`} defaultValue={record.reps} />
                      </label>
                    </>
                  )}
                  {record.type === 'strength' && record.measurement === 'duration' && (
                    <>
                      {isPlankExercise({ id: record.exerciseId, name: record.exercise }) && <label>
                        <span>ADDED KG</span>
                        <input type="number" min="0" step="0.5" name={`record-${record.id}-weight`} defaultValue={record.weight} />
                      </label>}
                      <label>
                        <span>TOTAL SECONDS</span>
                        <input type="number" min="0" step="1" name={`record-${record.id}-seconds`} defaultValue={record.durationSeconds} />
                      </label>
                    </>
                  )}
                  {record.type === 'cardio' && (
                    <>
                      <label>
                        <span>MINUTES</span>
                        <input type="number" min="0" step="1" name={`record-${record.id}-minutes`} defaultValue={record.durationMinutes} />
                      </label>
                      <label>
                        <span>DISTANCE (KM)</span>
                        <input type="number" min="0" step="0.1" name={`record-${record.id}-distance`} defaultValue={record.distanceKm} />
                      </label>
                      <label>
                        <span>CALORIES</span>
                        <input type="number" min="0" step="1" name={`record-${record.id}-calories`} defaultValue={record.calories} />
                      </label>
                    </>
                  )}
                </div>
              </fieldset>
            ))}
          </section>

          <div className="history-session-actions full">
            <button className="history-session-save" type="submit">
              <Save size={18} />
              Save corrections
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
