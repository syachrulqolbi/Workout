function numeric(value: string | undefined) {
  const parsed = Number((value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function valueNearLabel(lines: string[], expression: RegExp, preferUnit = true) {
  const index = lines.findIndex((line) => expression.test(line));
  if (index < 0) return 0;
  const nearby = lines.slice(index, index + 3).join(' ');
  const afterLabel = nearby.replace(expression, ' ');
  const withUnit = preferUnit ? afterLabel.match(/(\d+(?:[.,]\d+)?)\s*(mg|g)\b/i) : null;
  if (withUnit) {
    const value = numeric(withUnit[1]);
    return withUnit[2].toLowerCase() === 'mg' ? value / 1000 : value;
  }
  // Daily-value percentages are never nutrient quantities.
  const withoutPercentages = afterLabel.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ');
  return numeric(withoutPercentages.match(/(\d+(?:[.,]\d+)?)/)?.[1]);
}

export function parseNutritionLabel(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const explicitKcal = numeric(text.match(/(\d+(?:[.,]\d+)?)\s*kcal\b/i)?.[1]);
  const kilojoules = numeric(text.match(/(\d+(?:[.,]\d+)?)\s*kj\b/i)?.[1]);
  const kcal = explicitKcal || valueNearLabel(lines, /\bcalories?\b/i, false) || (kilojoules ? Math.round(kilojoules / 4.184) : 0);
  const protein = Math.min(1000, valueNearLabel(lines, /\bprotein\b/i));
  const carbs = Math.min(1000, valueNearLabel(lines, /\b(?:total\s+)?carbohydrates?\b/i));
  const fats = Math.min(1000, valueNearLabel(lines, /\b(?:total\s+)?fat\b/i));
  const sugar = Math.min(1000, valueNearLabel(lines, /\b(?:total\s+)?sugars?\b/i));
  const detectedFields = [kcal, protein, carbs, fats, sugar].filter((value) => value > 0).length;
  const hasPer100 = /per\s*100\s*(?:g|ml)/i.test(text);
  const hasServing = /per\s*(?:serving|serve|portion)/i.test(text);
  const warning = hasPer100 && !hasServing
    ? 'Values appear to be per 100 g/ml — review the portion before saving.'
    : hasPer100 && hasServing
      ? 'The label includes serving and per-100 values. The first value after each nutrient was used — confirm the serving column.'
      : detectedFields < 4 ? 'Some values were unclear — review every field before saving.' : undefined;
  return {
    name: 'Scanned food', kcal: Math.min(10_000, kcal), protein, carbs, fats, sugar, detectedFields,
    confidence: detectedFields >= 4 ? 'high' : detectedFields >= 2 ? 'medium' : 'low',
    warning,
  };
}
