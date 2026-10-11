import type { NextRequest } from 'next/server';
import { getWorkoutHistory } from '@/lib/server/api/workout-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return getWorkoutHistory(request);
}
