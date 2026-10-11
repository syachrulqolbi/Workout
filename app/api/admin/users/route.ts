import type { NextRequest } from 'next/server';
import { getAdminUsers, runAdminAction } from '@/lib/server/api/admin-users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return getAdminUsers(request);
}

export function POST(request: NextRequest) {
  return runAdminAction(request);
}
