import 'server-only';

import { createHash } from 'node:crypto';
import { FieldValue } from '@google-cloud/firestore';
import type { NextRequest } from 'next/server';
import {
  DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences, normalizeStoredPushSubscription, normalizeTimeZone,
} from '@/lib/notifications';
import { apiError, apiFailure, apiJson } from '@/lib/server/api-response';
import { requireUser } from '@/lib/server/auth';
import { getFirestore, workoutUsersCollection } from '@/lib/server/firestore';

export const PUSH_SUBSCRIPTIONS_COLLECTION = 'push-subscriptions';

function subscriptionId(endpoint: string) {
  return createHash('sha256').update(endpoint).digest('hex');
}

function publicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
}

function userSubscriptions(uid: string) {
  return getFirestore().collection(workoutUsersCollection).doc(uid).collection(PUSH_SUBSCRIPTIONS_COLLECTION);
}

export async function getNotificationCapability(request: NextRequest) {
  try {
    await requireUser(request);
    const vapidPublicKey = publicKey();
    return apiJson({ available: Boolean(vapidPublicKey), publicKey: vapidPublicKey });
  } catch (cause) {
    return apiFailure(cause, 'Notification capability request failed', 'Notification settings are temporarily unavailable.');
  }
}

export async function getNotificationSubscription(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint || endpoint.length > 2_000) return apiError('A valid push endpoint is required.', 422);
    const snapshot = await userSubscriptions(user.uid).doc(subscriptionId(endpoint)).get();
    if (!snapshot.exists) return apiJson({ subscription: null });
    const stored = snapshot.data() ?? {};
    return apiJson({
      subscription: {
        enabled: stored.enabled !== false,
        preferences: normalizeNotificationPreferences(stored.preferences),
        timezone: normalizeTimeZone(stored.timezone),
      },
    });
  } catch (cause) {
    return apiFailure(cause, 'Notification subscription request failed', 'Notification settings are temporarily unavailable.');
  }
}

export async function saveNotificationSubscription(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!publicKey()) return apiError('Push notifications are not configured on the server.', 503);
    const body = await request.json().catch(() => null) as {
      subscription?: unknown; preferences?: unknown; timezone?: unknown; enabled?: unknown;
    } | null;
    const subscription = normalizeStoredPushSubscription(body?.subscription);
    if (!subscription) return apiError('The push subscription is invalid.', 422);
    const preferences = normalizeNotificationPreferences(body?.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES);
    const timezone = normalizeTimeZone(body?.timezone);
    const reference = userSubscriptions(user.uid).doc(subscriptionId(subscription.endpoint));
    const previous = await reference.get();
    await reference.set({
      uid: user.uid,
      email: user.email ?? '',
      ...subscription,
      preferences,
      timezone,
      enabled: body?.enabled !== false,
      updatedAt: FieldValue.serverTimestamp(),
      ...(previous.exists ? {} : { createdAt: FieldValue.serverTimestamp(), lastSent: {} }),
    }, { merge: true });
    return apiJson({ saved: true, preferences, timezone });
  } catch (cause) {
    return apiFailure(cause, 'Notification subscription save failed', 'Notification settings could not be saved.');
  }
}

export async function deleteNotificationSubscription(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint || endpoint.length > 2_000) return apiError('A valid push endpoint is required.', 422);
    await userSubscriptions(user.uid).doc(subscriptionId(endpoint)).delete();
    return apiJson({ deleted: true });
  } catch (cause) {
    return apiFailure(cause, 'Notification subscription deletion failed', 'Notifications could not be disabled.');
  }
}
