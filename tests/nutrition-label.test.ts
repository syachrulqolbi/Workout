import { describe, expect, it } from 'vitest';
import { parseNutritionLabel } from '../lib/nutrition-label';

describe('nutrition label parsing', () => {
  it('ignores daily-value percentages after gram values', () => {
    const result = parseNutritionLabel('Calories 220\nProtein 18 g 36%\nTotal Carbohydrate 30 g 10%\nTotal Fat 7 g 9%\nTotal Sugars 5 g');
    expect(result).toMatchObject({ kcal: 220, protein: 18, carbs: 30, fats: 7, sugar: 5, confidence: 'high' });
  });

  it('converts milligrams and warns when only per-100 values are present', () => {
    const result = parseNutritionLabel('Per 100 g\nCalories 150\nProtein 800 mg\nCarbohydrate 20 g\nFat 3 g');
    expect(result.protein).toBe(0.8);
    expect(result.warning).toContain('per 100');
  });
});

