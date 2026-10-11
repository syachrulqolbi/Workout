import { describe, expect, it } from 'vitest';
import type { DayPlan, Meal } from '../lib/workout-data';
import { accountInitials, dateSelectionAfterRollover, formatTimer, mealNutritionOverview, scheduledPlanDay, workoutPlanForDate } from '../lib/workout-ui';

describe('workout UI helpers', () => {
  it('uses the first letter of the first two name words', () => {
    expect(accountInitials('Syachrul Qolbi Nur Septi', 'ignored@example.com')).toBe('SQ');
    expect(accountInitials('Raveen Mathews', null)).toBe('RM');
  });

  it('honours a dated plan override without changing the weekly plan', () => {
    const plans: DayPlan[] = [
      { day: 0, name: 'Monday', focus: '', exercises: [] },
      { day: 1, name: 'Tuesday', focus: '', exercises: [] },
    ];
    expect(scheduledPlanDay('2026-09-23', { '2026-09-23': 1 })).toBe(1);
    expect(workoutPlanForDate('2026-09-23', plans, { '2026-09-23': 1 }).plan.name).toBe('Tuesday');
  });

  it('reports eaten and planned nutrition separately', () => {
    const meal = (id: string, done: boolean, kcal: number): Meal => ({
      id, date: '2026-09-25', recurring: false, completedDates: [], type: 'Meal', name: id,
      note: '', kcal, protein: 10, carbs: 20, fats: 5, sugar: 2, done,
    });
    const overview = mealNutritionOverview([meal('planned', false, 500), meal('eaten', true, 300)]);
    expect(overview.planned.kcal).toBe(800);
    expect(overview.eaten.kcal).toBe(300);
    expect(overview.eatenCount).toBe(1);
  });

  it('formats both minute and hour countdowns', () => {
    expect(formatTimer(33)).toBe('00:33');
    expect(formatTimer(3661)).toBe('1:01:01');
  });

  it('moves an open current-day view forward at midnight without replacing a historical selection', () => {
    expect(dateSelectionAfterRollover('2026-09-26', '2026-09-26', '2026-09-27')).toBe('2026-09-27');
    expect(dateSelectionAfterRollover('2026-09-10', '2026-09-26', '2026-09-27')).toBe('2026-09-10');
  });
});
