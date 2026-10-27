'use client';

import { LogOut, RotateCcw, Save, Search, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AppUser } from '@/lib/auth-user';
import { authenticatedFetch } from '@/lib/client/authenticated-fetch';
import { accountInitials, formatDate } from '@/lib/workout-ui';
import { NotificationSettings } from '@/features/workout/components/notification-settings';
import type { StrengthProfile } from '@/lib/workout-data';

type AdminUser = {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  lastActivityAt: string | null;
  updatedAt: string | null;
  workoutCount: number;
  strengthRecordCount: number;
  cardioRecordCount: number;
  mealCount: number;
  activeWorkout: boolean;
};

export function SettingsView({ user, profile, saveProfile, reset, signOutUser, isAdmin, clearLocalHistory }: {
  user: AppUser;
  profile: StrengthProfile;
  saveProfile: (profile: StrengthProfile) => void;
  reset: () => void;
  signOutUser: () => void;
  isAdmin: boolean;
  clearLocalHistory: () => void;
}) {
  return <div className="settings-grid"><section className="card account-card"><span className="avatar large">{accountInitials(user.displayName, user.email)}</span><div><span className="muted-label">SIGNED IN WITH GOOGLE</span><h2>{user.displayName || 'Workout user'}</h2><p>{user.email}</p></div><button className="secondary-button inline" onClick={signOutUser}><LogOut size={16} /> Sign out</button></section><ProfileSettings profile={profile} save={saveProfile} /><NotificationSettings /><section className="card privacy-card"><ShieldCheck size={24} /><div><span className="muted-label">PRIVATE BY ACCOUNT</span><h3>Your data belongs to this Google account.</h3><p>The server verifies your protected account session on every read and write. Workout data is automatically deleted after 30 days without account activity.</p></div></section><section className="card danger-card"><div><span className="muted-label">RESET MY DATA</span><h3>Set everything back to zero</h3><p>Clear workout history, exercise progress, meal plans, weekday exercise plans and any active workout. This cannot be undone.</p></div><button className="danger-button" onClick={reset}><RotateCcw size={16} /> Reset everything</button></section>{isAdmin && <section className="admin-settings"><div className="admin-section-heading"><span className="admin-shield"><ShieldCheck size={19} /></span><div><span className="muted-label">VERIFIED ADMINISTRATOR</span><h2>User data summary</h2><p>Server-authorized access for {user.email}</p></div></div><AdminView user={user} clearLocalHistory={clearLocalHistory} /></section>}</div>;
}

function ProfileSettings({ profile, save }: { profile: StrengthProfile; save: (profile: StrengthProfile) => void }) {
  const [bodyweight, setBodyweight] = useState(profile.bodyweightKg?.toString() ?? '');
  const [age, setAge] = useState(profile.ageYears?.toString() ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth);
  const [message, setMessage] = useState('');

  function updateDateOfBirth(value: string) {
    setDateOfBirth(value);
    const birth = new Date(`${value}T12:00:00`);
    if (Number.isNaN(birth.getTime()) || birth > new Date()) return;
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years -= 1;
    if (years >= 10 && years <= 120) setAge(String(years));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const bodyweightKg = Number(bodyweight);
    const ageYears = Number(age);
    if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0 || bodyweightKg > 500 || !Number.isFinite(ageYears) || ageYears < 10 || ageYears > 120) {
      setMessage('Enter a valid bodyweight and an age from 10 to 120.');
      return;
    }
    save({ bodyweightKg, ageYears: Math.round(ageYears), dateOfBirth, updatedAt: new Date().toISOString() });
    setMessage('Saved. All level recommendations have been recalculated.');
  }

  return <section className="card profile-settings-card"><div className="section-heading"><div><span className="muted-label">STRENGTH PROFILE</span><h3>Personalized benchmarks</h3><p>Used only to recalculate level thresholds. Logged workout values never change.</p></div><span className="muscle-heading-icon"><UserRound size={19} /></span></div><form className="profile-settings-form" onSubmit={submit}><label><span>BODYWEIGHT KG</span><input inputMode="decimal" type="number" min="1" max="500" step="0.1" value={bodyweight} onChange={(event) => setBodyweight(event.target.value)} placeholder="Set bodyweight" /></label><label><span>AGE YEARS</span><input inputMode="numeric" type="number" min="10" max="120" step="1" value={age} onChange={(event) => setAge(event.target.value)} placeholder="Set age" /></label><label><span>DATE OF BIRTH <i>OPTIONAL</i></span><input type="date" value={dateOfBirth} onChange={(event) => updateDateOfBirth(event.target.value)} /></label><button className="primary-button" type="submit"><Save size={17} /> Save strength profile</button>{message && <small role="status">{message}</small>}</form></section>;
}

function AdminView({ clearLocalHistory }: { user: AppUser; clearLocalHistory: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const response = await authenticatedFetch('/api/admin/users', { cache: 'no-store' });
      if (!response.ok) throw new Error('Admin data could not be loaded.');
      const payload = await response.json() as { users: AdminUser[]; totalCount: number; truncated: boolean };
      setUsers(payload.users);
      setTotalCount(payload.totalCount);
      setTruncated(payload.truncated);
      setStatus('ready');
    } catch { setStatus('error'); }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function deleteOwnHistory() {
    if (!window.confirm('Delete your own workout and exercise history? Meal and exercise plans will stay.')) return;
    const response = await authenticatedFetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-own-history' }) });
    if (response.ok) { clearLocalHistory(); window.location.reload(); } else setMessage('Your history could not be deleted.');
  }

  async function deleteAllHistory() {
    const phrase = `DELETE ALL HISTORY ${totalCount}`;
    const confirmation = window.prompt(`This permanently deletes workout and exercise history for ${totalCount} users. Meal and exercise plans stay. Type ${phrase} to continue.`);
    if (confirmation !== phrase) return;
    const response = await authenticatedFetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete-all-history', confirmation }) });
    if (response.ok) { window.location.reload(); } else setMessage('Global history deletion failed.');
  }

  const visible = users.filter((item) => `${item.displayName} ${item.email} ${item.uid}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="admin-view">
      <section className="admin-toolbar">
        <label className="search-box"><Search size={17} /><span className="sr-only">Search users</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or UID" /></label>
        <div className="admin-danger-actions"><button className="danger-button subtle" onClick={deleteOwnHistory}><Trash2 size={16} /> Delete my history</button><button className="danger-button" onClick={deleteAllHistory} disabled={!totalCount}><RotateCcw size={16} /> Delete all history · {totalCount} users</button></div>
      </section>
      {message && <div className="admin-message" role="status">{message}</div>}
      {truncated && <div className="admin-message" role="status">Showing the 500 most recently active users. Destructive actions still use all {totalCount} users.</div>}
      {status === 'loading' ? <div className="table-state">Loading database…</div> : status === 'error' ? <div className="table-state">Admin data could not be loaded. <button onClick={load}>Try again</button></div> : (
        <div className="admin-table-wrap">
          <div className="admin-user-table" role="table" aria-label="Workout users">
            <div className="admin-user-head" role="row"><span role="columnheader">User</span><span role="columnheader">Role</span><span role="columnheader">Workouts</span><span role="columnheader">Meals</span><span role="columnheader">Strength</span><span role="columnheader">Cardio</span><span role="columnheader">Active</span><span role="columnheader">Last activity</span></div>
            {visible.map((item) => <article className="admin-user-row" role="row" key={item.uid}>
              <div className="admin-user-cell user" role="cell" data-label="User"><strong>{item.displayName || 'Unnamed user'}</strong><span>{item.email}</span></div>
              <div className="admin-user-cell" role="cell" data-label="Role"><span className="role-pill">{item.role}</span></div>
              <div className="admin-user-cell" role="cell" data-label="Workouts">{item.workoutCount}</div>
              <div className="admin-user-cell" role="cell" data-label="Meals">{item.mealCount}</div>
              <div className="admin-user-cell" role="cell" data-label="Strength">{item.strengthRecordCount}</div>
              <div className="admin-user-cell" role="cell" data-label="Cardio">{item.cardioRecordCount}</div>
              <div className="admin-user-cell" role="cell" data-label="Active">{item.activeWorkout ? 'Yes' : 'No'}</div>
              <div className="admin-user-cell" role="cell" data-label="Last activity">{item.lastActivityAt ? formatDate(item.lastActivityAt) : '—'}</div>
            </article>)}
          </div>
          {!visible.length && <div className="table-state">No users match your search.</div>}
        </div>
      )}
    </div>
  );
}
