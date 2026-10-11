import { getHealth } from '@/lib/server/api/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return getHealth();
}
