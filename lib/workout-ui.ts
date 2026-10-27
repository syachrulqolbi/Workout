import type { DayPlan, Meal, WorkoutSession } from '@/lib/workout-data';

const REST_DAY_PLAN: DayPlan = { day: -1, name: 'Rest day', focus: 'Recovery and schedule reset', exercises: [] };
const DISPLAY_NUMBER_FORMATTER = new Intl.NumberFormat('en-AU', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Format UI numbers without changing the full-precision value used by calculations. */
export function formatNumber(value: number) {
  return Number.isFinite(value) ? DISPLAY_NUMBER_FORMATTER.format(value) : '—';
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateSelectionAfterRollover(selectedDate: string, previousToday: string, nextToday: string) {
  return selectedDate === previousToday ? nextToday : selectedDate;
}

export function mondayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

export function scheduledPlanDay(date: string, overrides: Record<string, number>) {
  const override = overrides[date];
  return Number.isInteger(override) && override >= -1 && override <= 6
    ? override
    : mondayIndex(new Date(`${date}T12:00:00`));
}

export function workoutPlanForDate(date: string, dayPlans: DayPlan[], overrides: Record<string, number>) {
  const planDay = scheduledPlanDay(date, overrides);
  return { planDay, plan: planDay === -1 ? REST_DAY_PLAN : dayPlans.find((plan) => plan.day === planDay) ?? REST_DAY_PLAN };
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatTimer(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const remaining = (seconds % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes}:${remaining}` : `${minutes}:${remaining}`;
}

export function isMealDoneOnDate(meal: Meal, date: string) {
  return meal.recurring ? meal.completedDates.includes(date) : meal.done;
}

export function mealsForDate(meals: Meal[], date: string) {
  return meals
    .filter((meal) => meal.recurring || meal.date === date)
    .map((meal) => ({ ...meal, done: isMealDoneOnDate(meal, date) }));
}

export function mealNutritionTotals(meals: Meal[]) {
  return meals.reduce((totals, meal) => ({
    kcal: totals.kcal + meal.kcal,
    protein: totals.protein + meal.protein,
    carbs: totals.carbs + meal.carbs,
    fats: totals.fats + meal.fats,
    sugar: totals.sugar + meal.sugar,
  }), { kcal: 0, protein: 0, carbs: 0, fats: 0, sugar: 0 });
}

export function mealNutritionOverview(meals: Meal[]) {
  const eatenMeals = meals.filter((meal) => meal.done);
  return {
    planned: mealNutritionTotals(meals),
    eaten: mealNutritionTotals(eatenMeals),
    eatenCount: eatenMeals.length,
    plannedCount: meals.length,
  };
}

export function weeklyWorkoutMinutes(workouts: WorkoutSession[], referenceDate = new Date()) {
  const monday = new Date(referenceDate);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayIndex(monday));
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return localDateKey(date);
  });
  const indexByDate = new Map(dates.map((date, index) => [date, index]));
  const minutes = Array.from({ length: 7 }, () => 0);
  for (const workout of workouts) {
    const index = indexByDate.get(localDateKey(new Date(workout.date)));
    if (index !== undefined) minutes[index] += workout.duration;
  }
  return minutes;
}

export function accountInitials(displayName: string | null, email: string | null) {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  const fallback = words[0] || email?.split('@')[0] || 'U';
  return fallback.slice(0, 2).toUpperCase();
}
