import { describe, expect, it } from 'vitest';
import {
  buildReminderNotification, DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences,
  normalizeStoredPushSubscription, reminderIsDue,
} from '../lib/notifications';
import { createDefaultWorkoutData, type Meal } from '../lib/workout-data';

const breakfast: Meal = {
  id: 'meal-breakfast', date: '2026-10-26', recurring: true, completedDates: [],
  type: 'Breakfast', name: 'Yogurt bowl', note: '', kcal: 420, protein: 30, carbs: 45, fats: 12, sugar: 10, done: false,
};

describe('notification reminders', () => {
  it('keeps safe defaults while accepting a valid custom reminder time', () => {
    const preferences = normalizeNotificationPreferences({ breakfast: { enabled: false, time: '07:15' }, lunch: { time: '99:00' } });
    expect(preferences.breakfast).toEqual({ enabled: false, time: '07:15' });
    expect(preferences.lunch).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.lunch);
    expect(preferences.workout).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.workout);
  });

  it('fires only inside the scheduler window in the device timezone', () => {
    const schedule = { enabled: true, time: '17:30' };
    expect(reminderIsDue(new Date('2026-10-26T17:35:00.000Z'), 'UTC', schedule)).toBe(true);
    expect(reminderIsDue(new Date('2026-10-26T17:40:00.000Z'), 'UTC', schedule)).toBe(false);
    expect(reminderIsDue(new Date('2026-10-26T17:35:00.000Z'), 'UTC', { ...schedule, enabled: false })).toBe(false);
  });

  it('builds meal reminders only for meals that are still pending', () => {
    const data = { ...createDefaultWorkoutData(), meals: [breakfast] };
    expect(buildReminderNotification('breakfast', data, '2026-10-26')).toMatchObject({
      title: 'Breakfast reminder', body: 'Yogurt bowl · 420 kcal planned', url: '/?view=meals',
    });
    data.meals = [{ ...breakfast, completedDates: ['2026-10-26'] }];
    expect(buildReminderNotification('breakfast', data, '2026-10-26')).toBeNull();
  });

  it('skips workout reminders on an explicitly scheduled rest day', () => {
    const data = createDefaultWorkoutData();
    expect(buildReminderNotification('workout', data, '2026-10-26')?.title).toBe('Gym plan today');
    data.datePlanOverrides['2026-10-26'] = -1;
    expect(buildReminderNotification('workout', data, '2026-10-26')).toBeNull();
  });

  it('accepts only complete HTTPS push subscriptions', () => {
    const valid = {
      endpoint: 'https://push.example.test/subscription/123', expirationTime: null,
      keys: { p256dh: 'Abcdefghijklmnop', auth: 'Zyxwvutsrqponml' },
    };
    expect(normalizeStoredPushSubscription(valid)).toEqual(valid);
    expect(normalizeStoredPushSubscription({ ...valid, endpoint: 'http://push.example.test' })).toBeNull();
    expect(normalizeStoredPushSubscription({ ...valid, keys: { p256dh: '', auth: '' } })).toBeNull();
  });
});
