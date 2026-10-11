'use client';

import dynamic from 'next/dynamic';
import { ArrowRight, ChevronRight, Dumbbell, Plus, Settings2, Timer } from 'lucide-react';
import type { View } from '@/features/workout/components/app-navigation';
import { DAY_NAMES, DAY_SHORT, type ActiveWorkout, type DayPlan, type ExerciseRecord, type Meal, type WorkoutSession } from '@/lib/workout-data';
import { mealNutritionOverview, mondayIndex, weeklyWorkoutMinutes } from '@/lib/workout-ui';

const MuscleVisualization = dynamic(() => import('@/features/workout/components/muscle-visualization').then((module) => module.MuscleVisualization));

type DashboardProps = {
  plan: DayPlan;
  dayPlans: DayPlan[];
  scheduledDay: number;
  defaultDay: number;
  meals: Meal[];
  workouts: WorkoutSession[];
  exerciseHistory: ExerciseRecord[];
  levelResetAt: string;
  active: ActiveWorkout | null;
  completedToday: boolean;
  schedulePlan: (planDay: number) => void;
  openWorkout: () => void;
  openMeals: () => void;
  openLibrary: () => void;
  navigate: (view: View) => void;
  latestWorkout?: WorkoutSession;
};

export function Dashboard({ plan, dayPlans, scheduledDay, defaultDay, meals, workouts, exerciseHistory, levelResetAt, active, completedToday, schedulePlan, openWorkout, openMeals, openLibrary, navigate, latestWorkout }: DashboardProps) {
  const button = active ? 'Resume workout' : completedToday ? 'Retake today' : plan.exercises.length ? 'Start workout' : scheduledDay === -1 ? 'Choose a plan above' : 'Edit weekly plan';
  const plannedMinutes = plan.exercises.filter((exercise) => exercise.type === 'cardio').reduce((sum, exercise) => sum + exercise.durationMinutes * exercise.sets, 0);
  const plannedSets = plan.exercises.filter((exercise) => exercise.type === 'strength').reduce((sum, exercise) => sum + exercise.sets, 0);
  const nutrition = mealNutritionOverview(meals);
  const plannedNutrition = nutrition.planned;
  const eatenNutrition = nutrition.eaten;
  const weeklyMinutes = weeklyWorkoutMinutes(workouts);
  const weeklyMaximum = Math.max(1, ...weeklyMinutes);
  const calorieProgress = plannedNutrition.kcal ? Math.min(100, eatenNutrition.kcal / plannedNutrition.kcal * 100) : 0;
  const nutritionRows = [
    ['Protein', eatenNutrition.protein, plannedNutrition.protein],
    ['Carbs', eatenNutrition.carbs, plannedNutrition.carbs],
    ['Fats', eatenNutrition.fats, plannedNutrition.fats],
    ['Sugar', eatenNutrition.sugar, plannedNutrition.sugar],
  ] as const;

  return (
    <div className="dashboard-grid">
      <section className="workout-hero today-outline">
        <div className="hero-topline">
          <span className="pill dark">TODAY</span>
          <span><Timer size={15} /> {active ? 'In progress' : [plannedSets ? `${plannedSets} sets` : '', plannedMinutes ? `${plannedMinutes} cardio min` : ''].filter(Boolean).join(' · ') || 'Plan ready'}</span>
        </div>
        <div className="hero-copy">
          <span className="muted-label">{plan.name.toUpperCase()}</span>
          <h2>{plan.focus}</h2>
          <p>{plan.exercises.length} exercises{plan.estimatedTime && plan.estimatedTime !== '—' ? ` · ${plan.estimatedTime}` : ''} · {scheduledDay === -1 ? 'No workout scheduled' : `${DAY_NAMES[scheduledDay]} template`}</p>
        </div>
        <label className="hero-plan-picker">
          <span>PLAN FOR TODAY</span>
          <select value={scheduledDay} onChange={(event) => schedulePlan(Number(event.target.value))} disabled={Boolean(active)} aria-label="Workout plan for today">
            <option value={-1}>Rest day · No workout</option>
            {dayPlans.map((item) => <option key={item.day} value={item.day}>{DAY_SHORT[item.day]} · {item.name}</option>)}
          </select>
          <small>{active ? 'Finish or discard the active workout to change plans.' : scheduledDay === defaultDay ? `Using the regular ${DAY_NAMES[defaultDay]} plan.` : scheduledDay === -1 ? 'Rest day selected for today.' : `Using the ${DAY_NAMES[scheduledDay]} plan instead of ${DAY_NAMES[defaultDay]}.`}</small>
        </label>
        <button className="primary-button" onClick={openWorkout}>{button} <ArrowRight size={18} /></button>
        <span className="hero-number" aria-hidden="true">{scheduledDay === -1 ? '—' : String(scheduledDay + 1).padStart(2, '0')}</span>
      </section>

      <section className="card activity-card">
        <div className="section-heading"><div><span className="muted-label">THIS WEEK</span><h3>Training activity</h3></div><button className="text-button" onClick={() => navigate('history')}>History</button></div>
        <div className="chart">{weeklyMinutes.map((minutes, index) => <div className="bar-column" key={index}><div className={`bar-track ${index === mondayIndex() ? 'current' : ''}`} title={`${minutes} workout minutes`}><span style={{ height: `${minutes ? Math.max(8, minutes / weeklyMaximum * 100) : 0}%` }} /></div><small>{DAY_SHORT[index].slice(0, 1)}</small></div>)}</div>
        <div className="activity-summary"><strong>{latestWorkout?.duration ?? 0}</strong><span>min · last workout</span></div>
      </section>

      <section className={`card nutrition-card ${meals.length ? 'today-outline-soft' : ''}`}>
        <div className="section-heading"><div><span className="muted-label">TODAY’S NUTRITION</span><h3>{eatenNutrition.kcal.toLocaleString()} / {plannedNutrition.kcal.toLocaleString()} kcal</h3><small className="nutrition-ratio-label">EATEN / PLANNED · {nutrition.eatenCount}/{nutrition.plannedCount} MEALS</small></div><button className="text-button" onClick={() => navigate('meals')}>Details</button></div>
        <div className="calorie-row"><div className="calorie-ring" style={{ background: `conic-gradient(var(--ink) 0 ${calorieProgress}%, #ececec ${calorieProgress}% 100%)` }}><div><strong>{eatenNutrition.kcal.toLocaleString()}</strong><span>OF {plannedNutrition.kcal.toLocaleString()} PLAN</span></div></div><div className="macro-list">{nutritionRows.map(([label, eaten, planned]) => <div key={label}><span>{label}</span><strong>{eaten}g / {planned}g</strong><i><b style={{ width: `${planned ? Math.min(100, eaten / planned * 100) : 0}%` }} /></i></div>)}</div></div>
        <button className="secondary-button" onClick={openMeals}><Plus size={17} /> Log a meal</button>
      </section>

      <section className="card exercises-card today-outline-soft">
        <div className="section-heading"><div><span className="muted-label">TODAY’S PLAN</span><h3>{plan.name}</h3></div><button className="manage-button" onClick={openLibrary}><Settings2 size={14} /> Manage</button></div>
        {plan.exercises.length ? <div className="exercise-list">{plan.exercises.map((exercise, index) => <div className="exercise-row" key={`${exercise.id}:${index}`}><span className="exercise-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{exercise.name}</strong><span>{exercise.type === 'cardio' ? `${exercise.durationMinutes} min${exercise.distanceKm ? ` · ${exercise.distanceKm} km` : ''}` : exercise.measurement === 'duration' ? `${exercise.sets} sets · ${exercise.durationSeconds} sec` : `${exercise.sets} sets · ${exercise.reps} reps · ${exercise.loadMode === 'bodyweight' ? 'bodyweight' : `${exercise.weight} kg`}`}</span></div>{exercise.type === 'cardio' && <b>CARDIO</b>}<ChevronRight size={16} /></div>)}</div> : <div className="library-empty-inline"><Dumbbell size={22} /><span>No exercises for today.</span><button onClick={openLibrary}>Build today’s plan</button></div>}
      </section>

      <MuscleVisualization plans={dayPlans} history={exerciseHistory} resetAt={levelResetAt} />

      <section className="quote-card"><Dumbbell size={19} /><p>Every completed set becomes part of your private training history.</p><span>{latestWorkout ? `LAST · ${latestWorkout.name.toUpperCase()}` : 'YOUR FIRST SESSION IS READY'}</span></section>
    </div>
  );
}
