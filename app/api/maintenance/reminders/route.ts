import type { NextRequest } from 'next/server';
import { dispatchWorkoutReminders } from '@/lib/server/api/reminder-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return dispatchWorkoutReminders(request);
}
