'use client';

import { Check, ChevronLeft, ChevronRight, Dumbbell, Salad } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DAY_NAMES, DAY_SHORT, type DayPlan, type Meal, type WorkoutSession } from '@/lib/workout-data';
import { workoutMatchesPlan } from '@/lib/workout-identity';
import { formatDate, formatNumber, localDateKey, mealsForDate, mondayIndex, workoutPlanForDate } from '@/lib/workout-ui';

type CalendarViewProps = {
  todayKey: string;
  selectedDate: string;
  selectDate: (date: string) => void;
  workouts: WorkoutSession[];
  meals: Meal[];
  dayPlans: DayPlan[];
  datePlanOverrides: Record<string, number>;
  schedulePlan: (date: string, planDay: number) => void;
  openMeals: () => void;
};

type DayState = {
  date: Date;
  key: string;
  workoutCount: number;
  mealCount: number;
  eatenCount: number;
  plan?: DayPlan;
  skipped: boolean;
};

export function CalendarView({ todayKey, selectedDate, selectDate, workouts, meals, dayPlans, datePlanOverrides, schedulePlan, openMeals }: CalendarViewProps) {
  const [month, setMonth] = useState(() => {
    const date = new Date(`${selectedDate}T12:00:00`);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - mondayIndex(first));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const { dayStates, workoutsByDate } = useMemo(() => {
    const workoutMap = new Map<string, WorkoutSession[]>();
    for (const workout of workouts) {
      const key = localDateKey(new Date(workout.date));
      workoutMap.set(key, [...(workoutMap.get(key) ?? []), workout]);
    }

    const states = days.map((date): DayState => {
      const key = localDateKey(date);
      const dateMeals = mealsForDate(meals, key);
      const dateWorkouts = workoutMap.get(key) ?? [];
      const { planDay, plan } = workoutPlanForDate(key, dayPlans, datePlanOverrides);
      const completedPlanWorkouts = dateWorkouts.filter((workout) => workoutMatchesPlan(workout, planDay, plan.name));
      const ageInDays = (+new Date(`${todayKey}T12:00:00`) - +new Date(`${key}T12:00:00`)) / 86_400_000;
      return {
        date,
        key,
        workoutCount: dateWorkouts.length,
        mealCount: dateMeals.length,
        eatenCount: dateMeals.filter((meal) => meal.done).length,
        plan,
        skipped: plan.exercises.length > 0 && completedPlanWorkouts.length === 0 && ageInDays > 7,
      };
    });

    return { dayStates: states, workoutsByDate: workoutMap };
  }, [days, workouts, meals, dayPlans, datePlanOverrides, todayKey]);

  const selectedWorkouts = workoutsByDate.get(selectedDate) ?? [];
  const selectedMeals = useMemo(() => mealsForDate(meals, selectedDate), [meals, selectedDate]);
  const selectedDefaultDay = mondayIndex(new Date(`${selectedDate}T12:00:00`));
  const { planDay: selectedPlanDay, plan: selectedPlan } = workoutPlanForDate(selectedDate, dayPlans, datePlanOverrides);
  const selectedPlanWorkouts = selectedWorkouts.filter((workout) => workoutMatchesPlan(workout, selectedPlanDay, selectedPlan.name));
  const selectedHasOverride = Object.prototype.hasOwnProperty.call(datePlanOverrides, selectedDate);
  const selectedAgeInDays = (+new Date(`${todayKey}T12:00:00`) - +new Date(`${selectedDate}T12:00:00`)) / 86_400_000;
  const selectedSkipped = selectedPlan.exercises.length > 0 && selectedPlanWorkouts.length === 0 && selectedAgeInDays > 7;
  const selectedEaten = selectedMeals.filter((meal) => meal.done).length;
  const monthTitle = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(month);

  function moveMonth(offset: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function returnToToday() {
    const date = new Date();
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    selectDate(todayKey);
  }

  return (
    <div className="calendar-view">
      <section className="card calendar-card">
        <header className="calendar-heading">
          <div><span className="muted-label">YOUR SCHEDULE</span><h2>{monthTitle}</h2></div>
          <div>
            <button className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <button className="calendar-today-button" onClick={returnToToday}>Today</button>
            <button className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
        </header>

        <div className="calendar-weekdays">{DAY_SHORT.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {dayStates.map(({ date, key, workoutCount, mealCount, eatenCount, plan, skipped }) => {
            const hasPlan = Boolean(plan?.exercises.length);
            const workoutStatus = workoutCount > 0
              ? skipped ? 'scheduled workout skipped, different workout completed' : 'workout completed'
              : skipped ? 'workout skipped' : hasPlan ? 'workout scheduled' : 'rest day';
            const dateStatus = hasPlan ? `${plan?.name}, ${workoutStatus}` : 'rest day';
            return (
              <button
                key={key}
                className={`${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === todayKey ? 'today' : ''} ${key === selectedDate ? 'selected' : ''} ${skipped ? 'skipped' : ''}`}
                onClick={() => selectDate(key)}
                aria-label={`${formatDate(`${key}T00:00:00`)}: ${dateStatus}, ${mealCount} meals, ${eatenCount} eaten${key === selectedDate ? ', selected' : ''}`}
                aria-current={key === todayKey ? 'date' : undefined}
              >
                <strong>{date.getDate()}</strong>
                <span>
                  {skipped ? <i className="skipped-dot" title="Workout skipped" /> : hasPlan && <i className="plan-dot" title="Workout scheduled" />}
                  {workoutCount > 0 && <i className="completed-dot" title="Workout completed" />}
                  {mealCount > 0 && <i className="meal-dot" title="Meals planned" />}
                  {eatenCount > 0 && <i className="eaten-dot" title={`${eatenCount} eaten`} />}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="calendar-legend">
          <span><i className="plan-dot" /> Scheduled</span><span><i className="completed-dot" /> Completed</span>
          <span><i className="skipped-dot" /> Skipped</span><span><i className="meal-dot" /> Meals</span><span><i className="eaten-dot" /> Eaten</span><span className="today-key">Today</span>
        </footer>
      </section>

      <aside className={`card calendar-detail ${selectedDate === todayKey ? 'today-outline-soft' : ''}`}>
        <span className="muted-label">{selectedDate === todayKey ? 'TODAY' : 'SELECTED DAY'}</span>
        <h3>{formatDate(`${selectedDate}T00:00:00`)}</h3>
        <div className="calendar-summary"><strong>{selectedPlan?.exercises.length ?? 0}</strong><span>exercises</span><strong>{selectedEaten}/{selectedMeals.length}</strong><span>meals eaten</span></div>

        <label className="calendar-plan-picker"><span>PLAN FOR THIS DATE</span><select value={selectedPlanDay} onChange={(event) => schedulePlan(selectedDate, Number(event.target.value))} aria-label={`Workout plan for ${formatDate(`${selectedDate}T00:00:00`)}`}><option value={-1}>Rest day · No workout</option>{dayPlans.map((plan) => <option key={plan.day} value={plan.day}>{DAY_SHORT[plan.day]} · {plan.name}</option>)}</select><small>{selectedHasOverride ? `Changed for this date only. The regular ${DAY_NAMES[selectedDefaultDay]} plan is unchanged.` : `Weekly default · ${DAY_NAMES[selectedDefaultDay]}`}</small></label>

        <section className="calendar-agenda">
          <header><Dumbbell size={16} /><div><span>WORKOUT PLAN</span><b>{selectedPlan?.name || 'Rest day'}</b></div>{selectedPlanWorkouts.length > 0 ? <em>COMPLETED</em> : selectedSkipped ? <em className="skipped-status">SKIPPED</em> : null}</header>
          {selectedPlan?.exercises.length ? (
            <div className="calendar-workout-table" role="table" aria-label={`${selectedPlan.name} exercise targets`}>
              <div className="calendar-workout-head" role="row"><span role="columnheader">Exercise</span><span role="columnheader">Sets</span><span role="columnheader">Reps/time</span><span role="columnheader">Kg</span></div>
              {selectedPlan.exercises.map((exercise) => (
                <div className="calendar-workout-row" role="row" key={exercise.id}>
                  <span role="cell"><b>{exercise.name}</b>{exercise.type === 'cardio' && <small>{formatNumber(exercise.durationMinutes)} min{exercise.distanceKm ? ` · ${formatNumber(exercise.distanceKm)} km` : ''}</small>}</span>
                  <strong role="cell">{exercise.sets}</strong><strong role="cell">{exercise.type === 'strength' ? exercise.measurement === 'duration' ? `${formatNumber(exercise.durationSeconds)}s` : exercise.reps : '—'}</strong><strong role="cell">{exercise.type === 'strength' && exercise.measurement === 'reps' && exercise.loadMode !== 'bodyweight' ? formatNumber(exercise.weight) : '—'}</strong>
                </div>
              ))}
            </div>
          ) : <p>No workout scheduled.</p>}
          {selectedSkipped && <p className="skipped-session">Not completed within seven days of this date.</p>}
          {selectedWorkouts.map((workout) => <p className="completed-session" key={workout.id}><Check size={13} /> {workout.name} · {formatNumber(workout.duration)} min{workoutMatchesPlan(workout, selectedPlanDay, selectedPlan.name) ? '' : ' · different plan'}</p>)}
        </section>

        <section className="calendar-agenda">
          <header><Salad size={16} /><div><span>MEALS</span><b>Daily plan + extras</b></div></header>
          {selectedMeals.length ? (
            <ul>{selectedMeals.map((meal) => <li key={meal.id}><span><i className={meal.done ? 'status-done' : ''}>{meal.done ? <Check size={11} /> : null}</i>{meal.name}</span><small>{meal.recurring ? 'Daily' : 'Extra'} · {meal.done ? 'Eaten' : 'Pending'}</small></li>)}</ul>
          ) : <p>No meals planned.</p>}
        </section>
        <button className="secondary-button" onClick={openMeals}><Salad size={16} /> View or add meals</button>
      </aside>
    </div>
  );
}
