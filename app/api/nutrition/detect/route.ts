import type { NextRequest } from 'next/server';
import { detectNutrition } from '@/lib/server/api/nutrition-detection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return detectNutrition(request);
}
