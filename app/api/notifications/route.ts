import type { NextRequest } from 'next/server';
import {
  deleteNotificationSubscription,
  getNotificationCapability,
  getNotificationSubscription,
  saveNotificationSubscription,
} from '@/lib/server/api/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  return getNotificationCapability(request);
}

export function POST(request: NextRequest) {
  return getNotificationSubscription(request);
}

export function PUT(request: NextRequest) {
  return saveNotificationSubscription(request);
}

export function DELETE(request: NextRequest) {
  return deleteNotificationSubscription(request);
}
