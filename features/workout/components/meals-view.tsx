'use client';

import { CalendarDays, Camera, Check, Pencil, Plus, Salad, Trash2, Utensils } from 'lucide-react';
import { EmptyState } from '@/features/workout/components/empty-state';
import { DAY_NAMES, type Meal } from '@/lib/workout-data';
import { formatDate, mealNutritionOverview, mondayIndex } from '@/lib/workout-ui';

type MealsViewProps = {
  todayKey: string;
  selectedDate: string;
  meals: Meal[];
  toggleMeal: (id: string) => void;
  addMeal: (scope: 'daily' | 'date') => void;
  editMeal: (meal: Meal) => void;
  deleteMeal: (meal: Meal) => void;
  openCalendar: () => void;
  scanLabel: (file: File) => void;
  nutritionState: 'idle' | 'loading' | 'error';
  nutritionError: string;
};

export function MealsView({
  todayKey, selectedDate, meals, toggleMeal, addMeal, editMeal, deleteMeal,
  openCalendar, scanLabel, nutritionState, nutritionError,
}: MealsViewProps) {
  const dailyMeals = meals.filter((meal) => meal.recurring);
  const dateMeals = meals.filter((meal) => !meal.recurring);
  const nutrition = mealNutritionOverview(meals);
  const plannedTotals = nutrition.planned;
  const eatenTotals = nutrition.eaten;
  const nutrientRows = [
    ['protein', eatenTotals.protein, plannedTotals.protein],
    ['carbs', eatenTotals.carbs, plannedTotals.carbs],
    ['fats', eatenTotals.fats, plannedTotals.fats],
    ['sugar', eatenTotals.sugar, plannedTotals.sugar],
  ] as const;
  const isToday = selectedDate === todayKey;
  const displayDate = formatDate(`${selectedDate}T00:00:00`);

  return (
    <div className="meals-view">
      <div className="meal-date-bar">
        <div><span className="muted-label">MEALS FOR</span><strong>{isToday ? 'Today' : displayDate}</strong></div>
        <button className="secondary-button inline" onClick={openCalendar}><CalendarDays size={16} /> Choose in Calendar</button>
      </div>

      <section className={`meal-overview ${isToday ? 'today-outline' : ''}`}>
        <div className="meal-overview-copy">
          <span className="pill dark">{isToday ? 'TODAY' : DAY_NAMES[mondayIndex(new Date(`${selectedDate}T00:00:00`))].toUpperCase()} NUTRITION</span>
          <h2>{eatenTotals.kcal.toLocaleString()} <small>kcal eaten</small></h2>
          <p>{plannedTotals.kcal.toLocaleString()} kcal planned · {nutrition.eatenCount}/{nutrition.plannedCount} meals eaten · {displayDate}</p>
        </div>
        <div className="meal-overview-nutrients">
          <div className="meal-overview-key"><span>NUTRIENTS</span><strong>EATEN / PLANNED</strong></div>
          <div className="meal-macros">
            {nutrientRows.map(([label, eaten, planned]) => <span key={label}><b>{eaten}g <em>/ {planned}g</em></b><small>{label}</small></span>)}
          </div>
        </div>
      </section>

      <div className="meal-section-heading">
        <div><span className="muted-label">NUTRITION WORKSPACE</span><h3>Plan once, log each day</h3></div>
        <div className="meal-actions scan-only">
          <label className={`scan-button ${nutritionState === 'loading' ? 'loading' : ''}`}>
            <Camera size={15} /> {nutritionState === 'loading' ? 'Reading label…' : 'Scan for this date'}
            <input aria-label="Scan nutrition label for this date" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={nutritionState === 'loading'} onChange={(event) => { const file = event.target.files?.[0]; if (file) scanLabel(file); event.currentTarget.value = ''; }} />
          </label>
        </div>
      </div>
      {nutritionError && <p className="nutrition-error" role="alert">{nutritionError}</p>}

      <section className="meal-plan-section">
        <div className="meal-subheading">
          <div><span className="muted-label">EVERY DAY</span><h3>Daily meal plan</h3><p>These meals automatically appear on every calendar day.</p></div>
          {dailyMeals.length > 0 && <button className="secondary-button inline" onClick={() => addMeal('daily')}><Plus size={15} /> Add daily meal</button>}
        </div>
        {dailyMeals.length ? (
          <div className="meal-grid">{dailyMeals.map((meal, index) => <MealCard key={meal.id} meal={meal} index={index} toggleMeal={toggleMeal} editMeal={editMeal} deleteMeal={deleteMeal} />)}</div>
        ) : (
          <EmptyState icon={<Salad size={24} />} title="No daily meals yet" copy="Create a fixed meal plan once and it will appear every day." action="Add daily meal" onAction={() => addMeal('daily')} />
        )}
      </section>

      <section className="meal-plan-section date-specific">
        <div className="meal-subheading">
          <div>
            <span className="muted-label">{isToday ? 'TODAY ONLY' : 'SELECTED DATE ONLY'}</span>
            <h3>Additional meals</h3>
            <p>Manual and scanned meals added only for {isToday ? 'today' : displayDate}.</p>
          </div>
          {dateMeals.length > 0 && <button className="secondary-button inline" onClick={() => addMeal('date')}><Plus size={15} /> Add extra meal</button>}
        </div>
        {dateMeals.length ? (
          <div className="meal-grid">{dateMeals.map((meal, index) => <MealCard key={meal.id} meal={meal} index={index + dailyMeals.length} toggleMeal={toggleMeal} editMeal={editMeal} deleteMeal={deleteMeal} />)}</div>
        ) : (
          <div className="meal-inline-empty"><span>No additional meals for this date.</span><button onClick={() => addMeal('date')}>Add extra meal</button></div>
        )}
      </section>
    </div>
  );
}

function MealCard({ meal, index, toggleMeal, editMeal, deleteMeal }: {
  meal: Meal;
  index: number;
  toggleMeal: MealsViewProps['toggleMeal'];
  editMeal: MealsViewProps['editMeal'];
  deleteMeal: MealsViewProps['deleteMeal'];
}) {
  return (
    <article className={`meal-card ${meal.done ? 'done' : ''}`}>
      <div className="meal-card-top">
        <span className="meal-icon">{index % 2 ? <Utensils size={18} /> : <Salad size={18} />}</span>
        <div className="meal-card-controls">
          <button className="meal-card-action" onClick={() => editMeal(meal)} aria-label={`Edit ${meal.name}`}><Pencil size={14} /></button>
          <button className="meal-card-action danger" onClick={() => deleteMeal(meal)} aria-label={`Delete ${meal.name}`}><Trash2 size={14} /></button>
          <button className={`meal-check ${meal.done ? 'checked' : ''}`} onClick={() => toggleMeal(meal.id)} aria-pressed={meal.done} aria-label={`${meal.done ? 'Unmark' : 'Mark'} ${meal.name} as eaten`}><Check size={14} /><span>{meal.done ? 'Eaten' : 'Eat'}</span></button>
        </div>
      </div>
      <div className="meal-card-meta"><span className="muted-label">{meal.type.toUpperCase()}</span><span className={`meal-scope ${meal.recurring ? 'daily' : ''}`}>{meal.recurring ? 'DAILY PLAN' : 'THIS DATE'}</span></div>
      <h3>{meal.name}</h3><p>{meal.note}</p>
      <div className="meal-card-bottom"><strong>{meal.kcal} kcal</strong><span>P {meal.protein} · C {meal.carbs} · F {meal.fats} · S {meal.sugar}</span></div>
    </article>
  );
}
