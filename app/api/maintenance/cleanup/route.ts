import type { NextRequest } from 'next/server';
import { cleanupInactiveUsers } from '@/lib/server/api/inactive-cleanup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return cleanupInactiveUsers(request);
}
