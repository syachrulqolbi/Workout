'use client';

import { Check, Plus, X } from 'lucide-react';
import type { FormEvent } from 'react';
import type { Meal } from '@/lib/workout-data';
import { formatDate, isMealDoneOnDate } from '@/lib/workout-ui';
import { useDialogAccessibility } from '@/features/workout/hooks/use-dialog-accessibility';

export type NutritionDraft = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  sugar: number;
};

type MealModalProps = {
  date: string;
  draft: NutritionDraft | null;
  meal: Meal | null;
  scope: 'daily' | 'date';
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
};

export function MealModal({ date, draft, meal, scope, close, submit }: MealModalProps) {
  const dialogRef = useDialogAccessibility(close);
  const isEditing = Boolean(meal);
  const daily = scope === 'daily';
  const eaten = meal ? isMealDoneOnDate(meal, date) : Boolean(draft);
  const formattedDate = formatDate(`${date}T00:00:00`);

  return (
    <div className="modal-backdrop compact">
      <section ref={dialogRef} tabIndex={-1} className="meal-modal" role="dialog" aria-modal="true" aria-labelledby="meal-title">
        <header className="modal-header">
          <div>
            <span className="muted-label">{daily ? 'RECURRING · EVERY DAY' : formattedDate.toUpperCase()}</span>
            <h2 id="meal-title">{isEditing ? 'Edit meal' : draft ? 'Review nutrition label' : daily ? 'Add to daily meal plan' : 'Add a meal for this date'}</h2>
            <p>{isEditing ? `Changes apply ${daily ? 'to the recurring plan' : 'only to this date'}.` : draft ? 'Confirm or edit every detected value before saving.' : daily ? 'This meal will automatically appear on every day.' : 'This meal will stay attached only to the selected date.'}</p>
          </div>
          <button className="modal-close" onClick={close} aria-label="Close meal form"><X size={20} /></button>
        </header>

        <form onSubmit={submit} className="meal-form">
          <label><span>Meal</span><select name="type" defaultValue={meal?.type ?? 'Lunch'}><option>Breakfast</option><option>Lunch</option><option>Snack</option><option>Dinner</option></select></label>
          <label className="full"><span>Name</span><input name="name" placeholder="e.g. Chicken rice bowl" defaultValue={meal?.name ?? draft?.name} required /></label>
          <label className="full"><span>Ingredients / note</span><input name="note" placeholder="A short description" defaultValue={meal?.note ?? (draft ? 'Detected from a nutrition label' : '')} /></label>
          <label><span>Calories</span><input name="kcal" type="number" min="0" step="0.1" defaultValue={meal?.kcal ?? draft?.kcal} required /></label>
          <label><span>Protein (g)</span><input name="protein" type="number" min="0" step="0.1" defaultValue={meal?.protein ?? draft?.protein} required /></label>
          <label><span>Carbs (g)</span><input name="carbs" type="number" min="0" step="0.1" defaultValue={meal?.carbs ?? draft?.carbs} required /></label>
          <label><span>Fats (g)</span><input name="fats" type="number" min="0" step="0.1" defaultValue={meal?.fats ?? draft?.fats} required /></label>
          <label><span>Sugar (g)</span><input name="sugar" type="number" min="0" step="0.1" defaultValue={meal?.sugar ?? draft?.sugar ?? 0} required /></label>
          <label className="meal-eaten full"><input name="eaten" type="checkbox" defaultChecked={eaten} /><span>Mark as eaten on {formattedDate}</span></label>
          <button className="complete-button full" type="submit">
            {isEditing ? 'Save changes' : draft ? 'Confirm and add meal' : daily ? 'Add to daily plan' : 'Add for this date'}
            {isEditing ? <Check size={17} /> : <Plus size={17} />}
          </button>
        </form>
      </section>
    </div>
  );
}
