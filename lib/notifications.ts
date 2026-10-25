import type { WorkoutData } from '@/lib/workout-data';
import { mealsForDate, workoutPlanForDate } from '@/lib/workout-ui';

export const REMINDER_KINDS = ['workout', 'breakfast', 'lunch', 'snack', 'dinner'] as const;
export type ReminderKind = typeof REMINDER_KINDS[number];
export type ReminderSchedule = { enabled: boolean; time: string };
export type NotificationPreferences = Record<ReminderKind, ReminderSchedule>;

export type StoredPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

export type ReminderNotification = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  workout: { enabled: true, time: '17:30' },
  breakfast: { enabled: true, time: '08:00' },
  lunch: { enabled: true, time: '12:30' },
  snack: { enabled: true, time: '16:00' },
  dinner: { enabled: true, time: '19:00' },
};

export const REMINDER_LABELS: Record<ReminderKind, string> = {
  workout: 'Gym plan', breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner',
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isReminderKind(value: string): value is ReminderKind {
  return REMINDER_KINDS.includes(value as ReminderKind);
}

export function isReminderTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const source = record(value);
  return Object.fromEntries(REMINDER_KINDS.map((kind) => {
    const schedule = record(source[kind]);
    const fallback = DEFAULT_NOTIFICATION_PREFERENCES[kind];
    return [kind, {
      enabled: typeof schedule.enabled === 'boolean' ? schedule.enabled : fallback.enabled,
      time: isReminderTime(schedule.time) ? schedule.time : fallback.time,
    }];
  })) as NotificationPreferences;
}

export function normalizeTimeZone(value: unknown) {
  const timeZone = typeof value === 'string' && value.length <= 100 ? value : 'UTC';
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone }).format();
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export function localReminderTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  return { date, minutes: hour * 60 + minute };
}

export function reminderIsDue(now: Date, timeZone: string, schedule: ReminderSchedule, windowMinutes = 10) {
  if (!schedule.enabled || !isReminderTime(schedule.time)) return false;
  const local = localReminderTime(now, timeZone);
  const [hour, minute] = schedule.time.split(':').map(Number);
  const elapsed = local.minutes - (hour * 60 + minute);
  return elapsed >= 0 && elapsed < windowMinutes;
}

export function reminderSlot(kind: ReminderKind, date: string, time: string) {
  return `${date}:${kind}:${time}`;
}

export function buildReminderNotification(kind: ReminderKind, data: WorkoutData, date: string): ReminderNotification | null {
  if (kind === 'workout') {
    const { plan } = workoutPlanForDate(date, data.dayPlans, data.datePlanOverrides);
    if (!plan.exercises.length) return null;
    return {
      title: 'Gym plan today',
      body: `${plan.name} · ${plan.exercises.length} ${plan.exercises.length === 1 ? 'exercise' : 'exercises'}${plan.focus ? ` · ${plan.focus}` : ''}`,
      tag: `workout-${date}`,
      url: '/?view=today',
    };
  }

  const pending = mealsForDate(data.meals, date).filter((meal) => !meal.done && meal.type.toLowerCase() === kind);
  if (!pending.length) return null;
  const names = pending.map((meal) => meal.name).join(', ');
  const calories = pending.reduce((total, meal) => total + meal.kcal, 0);
  return {
    title: `${REMINDER_LABELS[kind]} reminder`,
    body: `${names}${calories ? ` · ${Math.round(calories).toLocaleString('en-AU')} kcal planned` : ''}`,
    tag: `${kind}-${date}`,
    url: '/?view=meals',
  };
}

export function normalizeStoredPushSubscription(value: unknown): StoredPushSubscription | null {
  const subscription = record(value);
  const keys = record(subscription.keys);
  const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint.trim() : '';
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
  const auth = typeof keys.auth === 'string' ? keys.auth : '';
  let parsedEndpoint: URL;
  try { parsedEndpoint = new URL(endpoint); } catch { return null; }
  if (parsedEndpoint.protocol !== 'https:' || endpoint.length > 2_000
    || !/^[A-Za-z0-9_-]{10,512}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,512}$/.test(auth)) return null;
  const expiration = subscription.expirationTime;
  return {
    endpoint,
    expirationTime: expiration === null || expiration === undefined ? null : Number.isFinite(Number(expiration)) ? Number(expiration) : null,
    keys: { p256dh, auth },
  };
}
