'use client';

import { BellRing, Check, Clock3, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_PREFERENCES, normalizeNotificationPreferences, REMINDER_KINDS, REMINDER_LABELS,
  type NotificationPreferences, type ReminderKind, type StoredPushSubscription,
} from '@/lib/notifications';
import { authenticatedFetch } from '@/lib/client/authenticated-fetch';

type NotificationState = 'loading' | 'off' | 'enabled' | 'install' | 'denied' | 'unsupported' | 'error';

function applicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function serializedSubscription(subscription: PushSubscription): StoredPushSubscription | null {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) return null;
  return {
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}

function currentTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function NotificationSettings() {
  const [state, setState] = useState<NotificationState>('loading');
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [publicKey, setPublicKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const supportsPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supportsPush) {
        const iphoneOrIpad = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (active) setState(iphoneOrIpad && !isStandaloneApp() ? 'install' : 'unsupported');
        return;
      }
      try {
        const capabilityResponse = await authenticatedFetch('/api/notifications', { cache: 'no-store' });
        const capability = await capabilityResponse.json() as { available?: boolean; publicKey?: string };
        if (!capabilityResponse.ok || !capability.available || !capability.publicKey) {
          if (active) setState('unsupported');
          return;
        }
        if (!active) return;
        setPublicKey(capability.publicKey);
        if (Notification.permission === 'denied') { setState('denied'); return; }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) { if (active) setState('off'); return; }
        const statusResponse = await authenticatedFetch('/api/notifications', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const status = await statusResponse.json() as {
          subscription?: { enabled?: boolean; preferences?: unknown; timezone?: string } | null;
        };
        if (!active) return;
        if (statusResponse.ok && status.subscription?.enabled !== false) {
          setPreferences(normalizeNotificationPreferences(status.subscription?.preferences));
          setState('enabled');
        } else setState('off');
      } catch {
        if (active) setState('error');
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function updateSchedule(kind: ReminderKind, updates: Partial<NotificationPreferences[ReminderKind]>) {
    setPreferences((current) => ({ ...current, [kind]: { ...current[kind], ...updates } }));
  }

  async function persist(subscription: PushSubscription, nextPreferences = preferences) {
    const serialized = serializedSubscription(subscription);
    if (!serialized) throw new Error('This device returned an incomplete push subscription.');
    const response = await authenticatedFetch('/api/notifications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: serialized, preferences: nextPreferences, timezone: currentTimeZone(), enabled: true }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Notification settings could not be saved.');
  }

  async function enable() {
    if (!publicKey || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && !isStandaloneApp()) {
        setState('install');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState('denied'); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      await persist(subscription);
      setState('enabled');
      setMessage('Reminders are enabled on this device.');
    } catch (cause) {
      setState('error');
      setMessage(cause instanceof Error ? cause.message : 'Notifications could not be enabled.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error('Enable reminders on this device first.');
      await persist(subscription);
      setState('enabled');
      setMessage('Reminder times saved.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Reminder times could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await authenticatedFetch('/api/notifications', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState('off');
      setMessage('Reminders are off on this device.');
    } catch {
      setMessage('Reminders could not be disabled. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const status = state === 'enabled' ? 'ON' : state === 'loading' ? 'CHECKING' : 'OFF';
  return (
    <section className="card notification-card">
      <div className="notification-card-heading">
        <span className="notification-icon"><BellRing size={22} /></span>
        <div><span className="muted-label">PHONE REMINDERS</span><h2>Training and meals, right on time.</h2><p>Workout only alerts you when today has a gym plan or a meal is still waiting to be eaten.</p></div>
        <span className={`notification-status ${state === 'enabled' ? 'enabled' : ''}`}>{state === 'enabled' ? <Check size={13} /> : <X size={13} />}{status}</span>
      </div>

      {state === 'loading' && <div className="notification-guidance">Checking notification support on this device…</div>}
      {state === 'install' && <div className="notification-guidance"><Smartphone size={18} /><span><strong>Add Workout to your iPhone Home Screen first.</strong> Open this site in Safari, tap Share, choose “Add to Home Screen”, then open Workout from its icon.</span></div>}
      {state === 'denied' && <div className="notification-guidance"><BellRing size={18} /><span><strong>Notifications are blocked.</strong> Open iPhone Settings → Notifications → Workout and allow notifications, then return here.</span></div>}
      {state === 'unsupported' && <div className="notification-guidance"><Smartphone size={18} /><span><strong>Push reminders are not available here.</strong> Use the installed Home Screen app on iPhone, or a current mobile browser that supports Web Push.</span></div>}
      {state === 'error' && <div className="notification-guidance"><BellRing size={18} /><span><strong>Reminders need attention.</strong> {message || 'Refresh the app and try again.'}</span></div>}

      {(state === 'enabled' || state === 'off') && <>
        <div className="reminder-schedule-grid">
          {REMINDER_KINDS.map((kind) => <label className={`reminder-schedule ${preferences[kind].enabled ? 'active' : ''}`} key={kind}>
            <span className="reminder-toggle"><input type="checkbox" checked={preferences[kind].enabled} onChange={(event) => updateSchedule(kind, { enabled: event.target.checked })} /><i aria-hidden="true" /><strong>{REMINDER_LABELS[kind]}</strong></span>
            <span className="reminder-time"><Clock3 size={14} /><input aria-label={`${REMINDER_LABELS[kind]} reminder time`} type="time" value={preferences[kind].time} disabled={!preferences[kind].enabled} onChange={(event) => updateSchedule(kind, { time: event.target.value })} /></span>
          </label>)}
        </div>
        <div className="notification-actions">
          {state === 'off'
            ? <button className="complete-button" type="button" onClick={enable} disabled={busy}>{busy ? 'Enabling…' : 'Enable reminders'}</button>
            : <><button className="complete-button" type="button" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save reminder times'}</button><button className="secondary-button inline" type="button" onClick={disable} disabled={busy}>Turn off on this device</button></>}
        </div>
      </>}
      {message && state !== 'error' && <p className="notification-message" role="status">{message}</p>}
      <small className="notification-footnote">Times use {currentTimeZone()}. Completed meals, rest days, and disabled reminder types are skipped automatically.</small>
    </section>
  );
}
