'use client';

import { Save, X } from 'lucide-react';
import { FormEvent, useMemo } from 'react';
import { useDialogAccessibility } from '@/features/workout/hooks/use-dialog-accessibility';
import { canonicalExerciseName, isLoadedBackExtension, isPlankExercise } from '@/lib/exercise-profile';
import { historyCorrectionRows } from '@/lib/workout-history-correction';
import type { ExerciseRecord, LibraryExercise, WorkoutSession } from '@/lib/workout-data';

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

function optionalNumeric(form: FormData, key: string) {
  const raw = String(form.get(key) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function hasAnyValue(form: FormData, prefix: string, fields: string[]) {
  return fields.some((field) => String(form.get(`${prefix}-${field}`) ?? '').trim() !== '');
}

export function HistorySessionModal({ workout, records, plannedExercises, close, save }: {
  workout: WorkoutSession;
  records: ExerciseRecord[];
  plannedExercises: LibraryExercise[];
  close: () => void;
  save: (workout: WorkoutSession, records: ExerciseRecord[]) => void;
}) {
  const dialogRef = useDialogAccessibility(close);
  const rows = useMemo(
    () => historyCorrectionRows(workout, records, plannedExercises),
    [workout, records, plannedExercises],
  );
  const missingCount = rows.filter((row) => row.missing).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dateInput = String(form.get('date') ?? '');
    const date = dateInput ? new Date(dateInput).toISOString() : workout.date;
    const nextRecords = rows.flatMap(({ record, plan, missing }) => {
      const prefix = `record-${record.id}`;
      const relevantFields = record.type === 'cardio'
        ? ['sets', 'minutes', 'distance', 'calories']
        : record.measurement === 'duration' ? ['sets', 'weight', 'seconds'] : ['sets', 'weight', 'reps'];
      if (missing && !hasAnyValue(form, prefix, relevantFields)) return [];

      const setsCompleted = Math.max(1, Math.round(optionalNumeric(form, `${prefix}-sets`)
        ?? (missing ? plan?.sets ?? 1 : record.setsCompleted || 1)));
      const weight = optionalNumeric(form, `${prefix}-weight`) ?? (missing ? plan?.weight ?? 0 : record.weight);
      const reps = optionalNumeric(form, `${prefix}-reps`) ?? (missing ? plan?.reps ?? 0 : record.reps);
      const durationSeconds = optionalNumeric(form, `${prefix}-seconds`)
        ?? (missing ? (plan?.durationSeconds ?? 0) * setsCompleted : record.durationSeconds);
      const durationMinutes = optionalNumeric(form, `${prefix}-minutes`)
        ?? (missing ? (plan?.durationMinutes ?? 0) * setsCompleted : record.durationMinutes);
      const distanceKm = optionalNumeric(form, `${prefix}-distance`)
        ?? (missing ? (plan?.distanceKm ?? 0) * setsCompleted : record.distanceKm);
      const calories = optionalNumeric(form, `${prefix}-calories`)
        ?? (missing ? (plan?.calories ?? 0) * setsCompleted : record.calories);
      const completedSets = Array.from({ length: setsCompleted }, (_, index) => {
        const prior = record.completedSets[index] ?? { weight: 0, reps: 0, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0 };
        if (record.type === 'cardio') return { ...prior, durationMinutes: durationMinutes / setsCompleted, distanceKm: distanceKm / setsCompleted, calories: calories / setsCompleted };
        if (record.measurement === 'duration') return { ...prior, weight, durationSeconds: durationSeconds / setsCompleted };
        return { ...prior, weight, reps };
      });
      const inverseLoad = plan?.loadMode === 'assistance';
      const targetMet = plan ? record.type === 'cardio'
        ? durationMinutes >= plan.durationMinutes * setsCompleted && (!plan.distanceKm || distanceKm >= plan.distanceKm * setsCompleted)
        : record.measurement === 'duration'
          ? durationSeconds >= plan.durationSeconds * setsCompleted
          : reps >= plan.reps && (inverseLoad ? weight <= plan.weight : weight >= plan.weight)
        : record.targetMet;
      return [{
        ...record, date, weight, reps, setsCompleted, targetMet,
        durationSeconds, durationMinutes, distanceKm, calories, completedSets,
        estimated: missing ? true : record.estimated,
      }];
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
                <p>Recorded values can be corrected. Missing plan exercises can be restored here.</p>
              </div>
              <strong>{records.length} recorded{missingCount ? ` · ${missingCount} missing` : ''}</strong>
            </div>

            {rows.map(({ record, plan, missing }, index) => (
              <fieldset className={`history-record-card ${missing ? 'missing' : ''}`} key={record.id}>
                <legend>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {canonicalExerciseName(record.exercise)}
                  {missing && <em>NOT RECORDED</em>}
                </legend>
                {missing && <p className="history-record-missing-note">Enter the actual values to add this exercise to the completed session. Leave it blank to keep it omitted.</p>}
                <div className={`history-record-fields ${record.type === 'cardio' ? 'cardio' : ''}`}>
                  {record.type === 'strength' && record.measurement === 'reps' && (
                    <>
                      <label>
                        <span>{isLoadedBackExtension({ id: record.exerciseId, name: record.exercise }) ? 'ADDED KG' : 'KG'}</span>
                        <input type="number" min="0" step="0.01" name={`record-${record.id}-weight`} defaultValue={missing ? undefined : record.weight} placeholder={missing ? String(plan?.weight ?? 0) : undefined} />
                      </label>
                      <label>
                        <span>REPS</span>
                        <input type="number" min="0" step="1" name={`record-${record.id}-reps`} defaultValue={missing ? undefined : record.reps} placeholder={missing ? String(plan?.reps ?? 0) : undefined} />
                      </label>
                      <label><span>SETS</span><input type="number" min="1" step="1" name={`record-${record.id}-sets`} defaultValue={missing ? undefined : record.setsCompleted} placeholder={missing ? String(plan?.sets ?? 1) : undefined} /></label>
                    </>
                  )}
                  {record.type === 'strength' && record.measurement === 'duration' && (
                    <>
                      {isPlankExercise({ id: record.exerciseId, name: record.exercise }) && <label>
                        <span>ADDED KG</span>
                        <input type="number" min="0" step="0.01" name={`record-${record.id}-weight`} defaultValue={missing ? undefined : record.weight} placeholder={missing ? String(plan?.weight ?? 0) : undefined} />
                      </label>}
                      <label>
                        <span>TOTAL SECONDS</span>
                        <input type="number" min="0" step="1" name={`record-${record.id}-seconds`} defaultValue={missing ? undefined : record.durationSeconds} placeholder={missing ? String((plan?.durationSeconds ?? 0) * (plan?.sets ?? 1)) : undefined} />
                      </label>
                      <label><span>SETS</span><input type="number" min="1" step="1" name={`record-${record.id}-sets`} defaultValue={missing ? undefined : record.setsCompleted} placeholder={missing ? String(plan?.sets ?? 1) : undefined} /></label>
                    </>
                  )}
                  {record.type === 'cardio' && (
                    <>
                      <label>
                        <span>MINUTES</span>
                        <input type="number" min="0" step="0.01" name={`record-${record.id}-minutes`} defaultValue={missing ? undefined : record.durationMinutes} placeholder={missing ? String((plan?.durationMinutes ?? 0) * (plan?.sets ?? 1)) : undefined} />
                      </label>
                      <label>
                        <span>DISTANCE (KM)</span>
                        <input type="number" min="0" step="0.01" name={`record-${record.id}-distance`} defaultValue={missing ? undefined : record.distanceKm} placeholder={missing ? String((plan?.distanceKm ?? 0) * (plan?.sets ?? 1)) : undefined} />
                      </label>
                      <label>
                        <span>CALORIES</span>
                        <input type="number" min="0" step="0.01" name={`record-${record.id}-calories`} defaultValue={missing ? undefined : record.calories} placeholder={missing ? String((plan?.calories ?? 0) * (plan?.sets ?? 1)) : undefined} />
                      </label>
                      <label><span>ROUNDS</span><input type="number" min="1" step="1" name={`record-${record.id}-sets`} defaultValue={missing ? undefined : record.setsCompleted} placeholder={missing ? String(plan?.sets ?? 1) : undefined} /></label>
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
