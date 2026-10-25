import 'server-only';

import { FieldValue, type DocumentData, type DocumentReference } from '@google-cloud/firestore';
import type { NextRequest } from 'next/server';
import webpush, { type PushSubscription } from 'web-push';
import {
  buildReminderNotification, localReminderTime, normalizeNotificationPreferences, normalizeStoredPushSubscription,
  normalizeTimeZone, REMINDER_KINDS, reminderIsDue, reminderSlot, type ReminderKind,
} from '@/lib/notifications';
import { apiError, apiJson } from '@/lib/server/api-response';
import { getFirestore } from '@/lib/server/firestore';
import { PUSH_SUBSCRIPTIONS_COLLECTION } from '@/lib/server/api/notifications';
import { verifySchedulerRequest } from '@/lib/server/scheduler-auth';
import { readWorkoutReminderData } from '@/lib/server/workout-repository';

type DeliveryStats = { scanned: number; sent: number; skipped: number; expired: number; failed: number };

function vapidConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:syachrulqolbinursepti@gmail.com';
  return { publicKey, privateKey, subject };
}

function lastSentSlots(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Partial<Record<ReminderKind, string>>;
  return Object.fromEntries(Object.entries(value).filter(([kind, slot]) =>
    REMINDER_KINDS.includes(kind as ReminderKind) && typeof slot === 'string')) as Partial<Record<ReminderKind, string>>;
}

async function sendForSubscription(
  reference: DocumentReference,
  stored: DocumentData,
  now: Date,
  dataForUser: (reference: DocumentReference) => ReturnType<typeof readWorkoutReminderData>,
  stats: DeliveryStats,
) {
  if (stored.enabled === false) { stats.skipped += 1; return; }
  const subscription = normalizeStoredPushSubscription(stored);
  if (!subscription) {
    await reference.delete();
    stats.expired += 1;
    return;
  }
  const userReference = reference.parent.parent;
  if (!userReference) { stats.skipped += 1; return; }
  const preferences = normalizeNotificationPreferences(stored.preferences);
  const timezone = normalizeTimeZone(stored.timezone);
  const local = localReminderTime(now, timezone);
  const previousSlots = lastSentSlots(stored.lastSent);
  const dueKinds = REMINDER_KINDS.filter((kind) => {
    const slot = reminderSlot(kind, local.date, preferences[kind].time);
    return reminderIsDue(now, timezone, preferences[kind]) && previousSlots[kind] !== slot;
  });
  if (!dueKinds.length) { stats.skipped += 1; return; }

  const data = await dataForUser(userReference);
  if (!data) { stats.skipped += 1; return; }
  const delivered = { ...previousSlots };
  for (const kind of dueKinds) {
    const notification = buildReminderNotification(kind, data, local.date);
    if (!notification) continue;
    try {
      await webpush.sendNotification(subscription as PushSubscription, JSON.stringify({
        ...notification,
        icon: '/icons/workout-192.png',
        badge: '/icons/workout-192.png',
      }), { TTL: 14_400, urgency: kind === 'workout' ? 'normal' : 'high' });
      delivered[kind] = reminderSlot(kind, local.date, preferences[kind].time);
      stats.sent += 1;
    } catch (cause) {
      const statusCode = Number((cause as { statusCode?: unknown })?.statusCode);
      if (statusCode === 404 || statusCode === 410) {
        await reference.delete();
        stats.expired += 1;
        return;
      }
      console.error('Workout reminder push failed', { statusCode, kind, subscription: reference.path });
      stats.failed += 1;
    }
  }
  if (JSON.stringify(delivered) !== JSON.stringify(previousSlots)) {
    await reference.set({ lastSent: delivered, lastSentAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

export async function dispatchWorkoutReminders(request: NextRequest) {
  const audience = process.env.REMINDER_AUDIENCE ?? 'https://workout.sqnsportfolio.com/api/maintenance/reminders';
  const serviceAccount = process.env.REMINDER_SERVICE_ACCOUNT ?? 'workout-cleanup@personal-project-414620.iam.gserviceaccount.com';
  if (!await verifySchedulerRequest(request, audience, serviceAccount)) return apiError('Scheduler authentication required.', 401);
  const vapid = vapidConfiguration();
  if (!vapid.publicKey || !vapid.privateKey) return apiError('Push notifications are not configured.', 503);
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  try {
    const database = getFirestore();
    const subscriptions = await database.collectionGroup(PUSH_SUBSCRIPTIONS_COLLECTION).limit(500).get();
    const stats: DeliveryStats = { scanned: subscriptions.size, sent: 0, skipped: 0, expired: 0, failed: 0 };
    const userData = new Map<string, ReturnType<typeof readWorkoutReminderData>>();
    const dataForUser = (reference: DocumentReference) => {
      const existing = userData.get(reference.path);
      if (existing) return existing;
      const pending = readWorkoutReminderData(reference);
      userData.set(reference.path, pending);
      return pending;
    };
    const now = new Date();
    for (const document of subscriptions.docs) {
      await sendForSubscription(document.ref, document.data(), now, dataForUser, stats);
    }
    return apiJson(stats);
  } catch (cause) {
    console.error('Workout reminder dispatch failed', cause);
    return apiError('Reminder dispatch failed.', 503);
  }
}
