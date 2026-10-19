'use client';

import { CalendarDays, Dumbbell, Flame, History, Home, LogOut, Salad, Settings2, type LucideIcon } from 'lucide-react';
import type { AppUser } from '@/lib/auth-user';
import { accountInitials } from '@/lib/workout-ui';

export type View = 'today' | 'history' | 'meals' | 'calendar' | 'settings';
export type SyncState = 'loading' | 'syncing' | 'synced' | 'error';

const navigation: { id: View; label: string; shortLabel?: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'history', label: 'History', icon: History },
  { id: 'meals', label: 'Meal plan', shortLabel: 'Meals', icon: Salad },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

type NavigationProps = {
  view: View;
  navigate: (view: View) => void;
};

export function Sidebar({ view, navigate, syncState, retrySave, user, signOutUser }: NavigationProps & {
  syncState: SyncState;
  retrySave: () => void;
  user: AppUser;
  signOutUser: () => void;
}) {
  const syncLabel = syncState === 'synced' ? 'Database connected' : syncState === 'syncing' || syncState === 'loading' ? 'Saving securely…' : 'Save needs attention';
  return (
    <aside className="sidebar">
      <button className="brand button-reset" onClick={() => navigate('today')} aria-label="Workout home"><span className="brand-mark"><Dumbbell size={16} strokeWidth={2.4} /></span><span>WORKOUT</span></button>
      <nav className="side-nav" aria-label="Main navigation">{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><Icon size={19} />{item.label}</button>; })}</nav>
      <div className="sidebar-card"><div className="streak-icon"><Flame size={18} /></div><div><strong>Private workspace</strong><span>30-day inactivity cleanup</span></div></div>
      <div className="profile-mini"><span className="avatar">{accountInitials(user.displayName, user.email)}</span><div><strong>{user.displayName || 'Workout user'}</strong>{syncState === 'error' ? <button className="sync-retry" onClick={retrySave}>Retry save</button> : <span>{syncLabel}</span>}</div><button className="profile-signout" onClick={signOutUser} aria-label="Sign out"><LogOut size={16} /></button></div>
    </aside>
  );
}

export function MobileNav({ view, navigate }: NavigationProps) {
  return <nav className="mobile-nav" aria-label="Mobile navigation">{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><Icon size={18} /><span>{item.shortLabel ?? item.label}</span></button>; })}</nav>;
}
