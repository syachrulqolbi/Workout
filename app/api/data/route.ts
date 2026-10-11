import type { NextRequest } from 'next/server';
import {
  deleteWorkoutData,
  getWorkoutData,
  putWorkoutData,
} from '@/lib/server/api/workout-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return getWorkoutData(request);
}

export function PUT(request: NextRequest) {
  return putWorkoutData(request);
}

export function DELETE(request: NextRequest) {
  return deleteWorkoutData(request);
}
