import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BodyFigure } from '../features/workout/components/body-figure';
import type { MuscleGroup } from '../lib/exercise-profile';

const groups: MuscleGroup[] = [
  'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'traps', 'upperBack',
  'lats', 'rearDelts', 'lowerBack', 'glutes', 'quads', 'hamstrings', 'adductors', 'calves',
];

describe('BodyFigure', () => {
  it('keeps all 17 stable muscle regions across the front and back figures', () => {
    const muscles = { primary: groups, secondary: [] };
    const markup = renderToStaticMarkup(<>
      <BodyFigure view="front" muscles={muscles} />
      <BodyFigure view="back" muscles={muscles} />
    </>);

    for (const group of groups) expect(markup).toContain(`data-muscle-group="${group}"`);
    expect(markup.match(/data-muscle-group=/g)).toHaveLength(19);
  });
});
