'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import {
  ArrowRight, CalendarDays, Check, Database, Dumbbell, LogIn,
} from 'lucide-react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { MobileNav, Sidebar, type SyncState, type View } from '@/features/workout/components/app-navigation';
import { Dashboard } from '@/features/workout/components/dashboard';
import type { NutritionDraft } from '@/features/workout/components/meal-modal';
import { SettingsView } from '@/features/workout/components/settings-view';
import { authenticatedFetch } from '@/lib/client/authenticated-fetch';
import { canonicalExerciseName } from '@/lib/exercise-profile';
import { firebaseAuth, googleProvider } from '@/lib/client/firebase-client';
import {
  compactDatePlanOverrides, compactMealCompletionDates, createDefaultWorkoutData, DAY_NAMES, isWorkoutData, normalizeWorkoutData, stableExerciseId,
  type ActiveWorkout, type DayPlan, type LibraryExercise, type Meal,
  type SetEntry, type WorkoutData, type WorkoutSession,
} from '@/lib/workout-data';
import { dateSelectionAfterRollover, formatDate, localDateKey, mealsForDate, mondayIndex, workoutPlanForDate } from '@/lib/workout-ui';
import { activeWorkoutVolume, bestCompletedSet } from '@/lib/workout-metrics';
import { workoutMatchesPlan } from '@/lib/workout-identity';
import { mergeWorkoutDataScopes } from '@/lib/workout-merge';
import { workoutHistoryCsv, workoutHistoryJson } from '@/lib/workout-export';
import { buildWorkout } from '@/lib/workout-session';
import {
  applyWorkoutCollectionChanges, applyWorkoutDataChanges, isWorkoutCollectionChanges, isWorkoutDataChanges,
  workoutCollectionChanges, workoutMainDataChanges, type ClientDataScope, type WorkoutCollectionChanges,
  type WorkoutDataChanges,
} from '@/lib/workout-patch';

const CalendarView = dynamic(() => import('@/features/workout/components/calendar-view').then((module) => module.CalendarView));
const ExerciseLibraryModal = dynamic(() => import('@/features/workout/components/exercise-library-modal').then((module) => module.ExerciseLibraryModal));
const HistoryView = dynamic(() => import('@/features/workout/components/history-view').then((module) => module.HistoryView));
const HistorySessionModal = dynamic(() => import('@/features/workout/components/history-session-modal').then((module) => module.HistorySessionModal));
const MealModal = dynamic(() => import('@/features/workout/components/meal-modal').then((module) => module.MealModal));
const MealsView = dynamic(() => import('@/features/workout/components/meals-view').then((module) => module.MealsView));
const WorkoutModal = dynamic(() => import('@/features/workout/components/workout-modal').then((module) => module.WorkoutModal));

const RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 2_000;
const AUTH_STARTUP_TIMEOUT_MS = 15_000;

function authErrorCode(cause: unknown) {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return '';
  return typeof cause.code === 'string' ? cause.code : '';
}

function authErrorMessage(cause: unknown) {
  const code = authErrorCode(cause);
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'The Google sign-in window was closed. Please try again.';
    case 'auth/network-request-failed':
      return 'Google sign-in could not reach the network. Check your connection and try again.';
    case 'auth/unauthorized-domain':
      return 'This Workout domain is not authorized for Google sign-in.';
    case 'auth/web-storage-unsupported':
      return 'Safari blocked the storage needed for sign-in. Open Workout in a normal Safari tab and try again.';
    case 'auth/invalid-api-key':
      return 'Workout could not verify its Google sign-in configuration. Please refresh and try again.';
    default:
      return code
        ? `Google sign-in could not be completed (${code}). Please refresh and try again.`
        : 'Google sign-in could not be completed. Please refresh and try again.';
  }
}

async function configureAuthPersistence() {
  try {
    await setPersistence(firebaseAuth, browserLocalPersistence);
  } catch {
    await setPersistence(firebaseAuth, browserSessionPersistence);
  }
}

export function WorkoutApplication() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let active = true;
    let redirectSettled = false;
    let observedUser = firebaseAuth.currentUser;
    const fallback = window.setTimeout(() => {
      if (!active) return;
      setAuthError('Google sign-in is taking longer than expected. Please refresh and try again.');
      setUser(firebaseAuth.currentUser ?? observedUser);
      setAuthReady(true);
    }, AUTH_STARTUP_TIMEOUT_MS);
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      observedUser = nextUser;
      if (!active) return;
      setUser(nextUser);
      if (nextUser || redirectSettled) {
        window.clearTimeout(fallback);
        setAuthReady(true);
      }
    });
    void getRedirectResult(firebaseAuth)
      .then((result) => {
        if (!active) return;
        setUser(result?.user ?? firebaseAuth.currentUser ?? observedUser);
      })
      .catch((cause) => {
        if (!active || authErrorCode(cause) === 'auth/redirect-cancelled-by-user') return;
        setAuthError(authErrorMessage(cause));
      })
      .finally(() => {
        redirectSettled = true;
        if (!active) return;
        window.clearTimeout(fallback);
        setUser((current) => firebaseAuth.currentUser ?? observedUser ?? current);
        setAuthReady(true);
      });
    return () => {
      active = false;
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  async function handleSignIn() {
    if (signingIn) return;
    setAuthError('');
    setSigningIn(true);
    try {
      await configureAuthPersistence();
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      setUser(result.user);
      setAuthReady(true);
    } catch (cause) {
      const code = authErrorCode(cause);
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(firebaseAuth, googleProvider);
          return;
        } catch (redirectCause) {
          setAuthError(authErrorMessage(redirectCause));
        }
      } else if (code !== 'auth/cancelled-popup-request') {
        setAuthError(authErrorMessage(cause));
      }
    } finally {
      setSigningIn(false);
    }
  }

  if (!authReady) return <AuthLoading />;
  if (!user) return <LandingPage signIn={handleSignIn} error={authError} signingIn={signingIn} />;
  return <WorkoutApp user={user} signOutUser={() => signOut(firebaseAuth)} />;
}

function AuthLoading() {
  return <main className="auth-loading"><span className="brand-mark"><Dumbbell size={18} /></span><p>Loading Workout…</p></main>;
}

function LandingPage({ signIn, error, signingIn }: { signIn: () => void; error: string; signingIn: boolean }) {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Landing navigation">
        <div className="brand"><span className="brand-mark"><Dumbbell size={16} strokeWidth={2.4} /></span><span>WORKOUT</span></div>
        <button className="landing-sign-in" onClick={signIn} disabled={signingIn} aria-busy={signingIn}><LogIn size={17} /> {signingIn ? 'Signing in…' : 'Sign in'}</button>
      </nav>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">TRAIN WITH INTENTION</span>
          <h1>Progress you<br />can prove.</h1>
          <p>A focused space for strength, cardio, meals and the small wins that become lasting progress.</p>
          <button className="google-button" onClick={signIn} disabled={signingIn} aria-busy={signingIn}><span aria-hidden="true">G</span> {signingIn ? 'Opening Google…' : 'Continue with Google'} <ArrowRight size={18} /></button>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <small>Private by account. Your training history stays yours.</small>
        </div>
        <div className="landing-visual">
          <Image className="landing-visual-image" src="/welcome-athlete.png" alt="Athlete preparing for a focused strength workout" fill priority sizes="(max-width: 720px) 100vw, 42vw" />
          <div className="landing-visual-shade" aria-hidden="true" />
          <div className="landing-visual-top"><span>PRIVATE · PERSONAL · PROGRESSIVE</span><Dumbbell size={22} /></div>
          <div className="landing-photo-caption">
            <span>YOUR WORKOUT, YOUR PACE</span>
            <strong>Show up today.<br />Keep every win.</strong>
            <p>Plan it. Track it. Build on it.</p>
          </div>
        </div>
      </section>
      <footer className="landing-footer"><a href="/privacy">Privacy</a><span>Private by account · Automatically cleaned after 30 days of inactivity</span></footer>
    </main>
  );
}

function WorkoutApp({ user, signOutUser }: { user: User; signOutUser: () => void }) {
  const today = new Date();
  const todayKey = localDateKey(today);
  const todayDay = mondayIndex(today);
  const [view, setView] = useState<View>('today');
  const [data, setData] = useState<WorkoutData>(() => createDefaultWorkoutData());
  const [historyPage, setHistoryPage] = useState<{ nextBefore: string | null; hasMore: boolean }>({ nextBefore: null, hasMore: false });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<WorkoutSession | null>(null);
  const syncedData = useRef(data);
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const latestDirtyRevision = useRef(0);
  const savedDirtyRevision = useRef(0);
  const serverRevision = useRef(0);
  const latestData = useRef(data);
  const scopeRevisions = useRef(new Map<ClientDataScope, number>());
  const scheduledRevision = useRef(0);
  const saveTimeout = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [dataReady, setDataReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [isAdmin, setIsAdmin] = useState(false);
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [mealOpen, setMealOpen] = useState(false);
  const [mealDraft, setMealDraft] = useState<NutritionDraft | null>(null);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [mealScope, setMealScope] = useState<'daily' | 'date'>('date');
  const [nutritionState, setNutritionState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [nutritionError, setNutritionError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedPlanDay, setSelectedPlanDay] = useState(todayDay);
  const [selectedMealDate, setSelectedMealDate] = useState(todayKey);
  const previousTodayKey = useRef(todayKey);
  const [toast, setToast] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const [loadError, setLoadError] = useState('');
  const recoveryKey = `workout-recovery:${user.uid}`;

  const updateData = useCallback((updater: (current: WorkoutData) => WorkoutData, scopes: ClientDataScope[] = ['active']) => {
    const revision = latestDirtyRevision.current + 1;
    latestDirtyRevision.current = revision;
    scopes.forEach((scope) => scopeRevisions.current.set(scope, revision));
    setData(updater);
    setDirtyRevision(revision);
  }, [setData, setDirtyRevision]);

  const persistRecovery = useCallback((snapshot: WorkoutData, scopes: ClientDataScope[]) => {
    try {
      window.localStorage.setItem(recoveryKey, JSON.stringify({
        changes: workoutMainDataChanges(snapshot, scopes),
        baseChanges: workoutMainDataChanges(syncedData.current, scopes),
        collections: workoutCollectionChanges(syncedData.current, snapshot, scopes),
        scopes, baseRevision: serverRevision.current,
        createdAt: new Date().toISOString(),
      }));
    } catch {
      // The server save remains authoritative when local recovery storage is unavailable.
    }
  }, [recoveryKey]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setSyncState('loading');
      setLoadError('');
      try {
        const response = await authenticatedFetch(user, '/api/data', { cache: 'no-store' });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Data could not be loaded.');
        const payload = await response.json() as { data: WorkoutData; revision: number; migrated: boolean; isAdmin: boolean; historyPage?: { nextBefore?: string | null; hasMore?: boolean } | null };
        if (cancelled) return;
        const serverData = normalizeWorkoutData(payload.data);
        let nextData = serverData;
        syncedData.current = serverData;
        serverRevision.current = Number(payload.revision) || 0;

        let recoveredScopes: ClientDataScope[] = [];
        try {
          const recovery = JSON.parse(window.localStorage.getItem(recoveryKey) || 'null') as {
            changes?: unknown; baseChanges?: unknown; collections?: unknown;
            scopes?: unknown; createdAt?: unknown; baseRevision?: unknown;
          } | null;
          if (recovery && Array.isArray(recovery.scopes)) {
            recoveredScopes = recovery.scopes.filter((scope): scope is ClientDataScope =>
              scope === 'active' || scope === 'plans' || scope === 'schedule' || scope === 'history' || scope === 'meals');
            const createdAt = new Date(String(recovery.createdAt ?? '')).getTime();
            const isFresh = Number.isFinite(createdAt) && Date.now() - createdAt <= RECOVERY_MAX_AGE_MS;
            const matchesRevision = Number(recovery.baseRevision) === serverRevision.current;
            const collections = recovery.collections !== undefined
              && isWorkoutCollectionChanges(recovery.collections, recoveredScopes)
              ? recovery.collections as WorkoutCollectionChanges : undefined;
            const changesValid = recoveredScopes.length && isWorkoutDataChanges(recovery.changes, recoveredScopes, collections);
            const baseValid = recovery.baseChanges !== undefined
              && isWorkoutDataChanges(recovery.baseChanges, recoveredScopes, collections);
            if (isFresh && changesValid && (matchesRevision || (collections && baseValid))) {
              const mainScopes = recoveredScopes.filter((scope) => scope !== 'history' && scope !== 'meals');
              if (matchesRevision) {
                nextData = applyWorkoutDataChanges(nextData, recovery.changes as WorkoutDataChanges, mainScopes);
              } else {
                const baseData = applyWorkoutDataChanges(serverData, recovery.baseChanges as WorkoutDataChanges, mainScopes);
                const localData = applyWorkoutDataChanges(baseData, recovery.changes as WorkoutDataChanges, mainScopes);
                nextData = mergeWorkoutDataScopes(baseData, serverData, localData, mainScopes).data;
              }
              if (collections) nextData = applyWorkoutCollectionChanges(nextData, collections, recoveredScopes);
              else if (matchesRevision) nextData = applyWorkoutDataChanges(serverData, recovery.changes as WorkoutDataChanges, recoveredScopes);
            } else {
              recoveredScopes = [];
              window.localStorage.removeItem(recoveryKey);
            }
          }
        } catch { window.localStorage.removeItem(recoveryKey); }

        latestData.current = nextData;
        setData(nextData);
        setHistoryPage({ nextBefore: payload.historyPage?.nextBefore ?? null, hasMore: Boolean(payload.historyPage?.hasMore) });
        setIsAdmin(payload.isAdmin);
        setDataReady(true);
        if (recoveredScopes.length) {
          latestDirtyRevision.current = 1;
          recoveredScopes.forEach((scope) => scopeRevisions.current.set(scope, 1));
          setDirtyRevision(1);
          setSyncState('syncing');
          setToast('Recovered unsaved changes from this device');
        } else setSyncState('synced');
        ['form-workouts', 'form-meals', 'form-exercise-history', 'form-exercise-library', 'form-workspace-id'].forEach((key) => window.localStorage.removeItem(key));
        if (payload.migrated) setToast('Your previous workout data was moved into this account');
      } catch (cause) {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : 'Data could not be loaded.');
          setSyncState('error');
        }
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [recoveryKey, user]);

  useEffect(() => {
    latestData.current = data;
    if (!dataReady || dirtyRevision <= savedDirtyRevision.current) return;
    persistRecovery(data, [...scopeRevisions.current.keys()]);
  }, [data, dataReady, dirtyRevision, persistRecovery]);

  const enqueueSave = useCallback((snapshot: WorkoutData, revision: number, clientScopes: ClientDataScope[]) => {
    setSyncState('syncing');
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      if (revision <= savedDirtyRevision.current) return;
      let outgoing = snapshot;
      let outgoingRevision = revision;
      let outgoingScopes = clientScopes;

      const save = () => authenticatedFetch(user, '/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: workoutMainDataChanges(outgoing, outgoingScopes),
          collections: workoutCollectionChanges(syncedData.current, outgoing, outgoingScopes),
          baseRevision: serverRevision.current,
          scopes: outgoingScopes,
        }),
      });

      let response = await save();
      if (response.status === 409) {
        const conflict = await response.json().catch(() => null) as { data?: unknown; revision?: unknown } | null;
        if (!conflict || !isWorkoutData(conflict.data) || !Number.isInteger(Number(conflict.revision))) throw new Error('Data conflict could not be resolved.');
        const mergeBase = syncedData.current;
        serverRevision.current = Number(conflict.revision);
        syncedData.current = normalizeWorkoutData(conflict.data);
        outgoingRevision = latestDirtyRevision.current;
        outgoingScopes = [...scopeRevisions.current.keys()];
        const merged = mergeWorkoutDataScopes(mergeBase, syncedData.current, latestData.current, outgoingScopes);
        outgoing = merged.data;
        latestData.current = outgoing;
        setData(outgoing);
        response = await save();
        setToast(merged.conflicts
          ? `Changes merged · ${merged.conflicts} overlapping ${merged.conflicts === 1 ? 'value' : 'values'} kept from this device`
          : 'Changes from another device were merged safely');
      }

      const payload = await response.json().catch(() => null) as { revision?: unknown; error?: string } | null;
      if (!response.ok || !Number.isInteger(Number(payload?.revision))) throw new Error(payload?.error || 'Save failed');
      serverRevision.current = Number(payload?.revision);
      syncedData.current = outgoing;
      savedDirtyRevision.current = Math.max(savedDirtyRevision.current, outgoingRevision);
      for (const [scope, changedAt] of scopeRevisions.current) {
        if (changedAt <= outgoingRevision) scopeRevisions.current.delete(scope);
      }
      if (latestDirtyRevision.current === outgoingRevision) {
        window.localStorage.removeItem(recoveryKey);
        setSyncState('synced');
      } else persistRecovery(latestData.current, [...scopeRevisions.current.keys()]);
    }).catch(() => {
      if (latestDirtyRevision.current > savedDirtyRevision.current) setSyncState('error');
    });
  }, [persistRecovery, recoveryKey, setData, setSyncState, setToast, user]);

  useEffect(() => {
    if (!dataReady || !dirtyRevision || dirtyRevision === scheduledRevision.current) return;
    scheduledRevision.current = dirtyRevision;
    const revision = dirtyRevision;
    const snapshot = data;
    const scopes = [...scopeRevisions.current].filter(([, changedAt]) => changedAt <= revision).map(([scope]) => scope);
    saveTimeout.current = window.setTimeout(() => {
      saveTimeout.current = null;
      enqueueSave(snapshot, revision, scopes);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeout.current !== null) {
        window.clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
    };
  }, [data, dataReady, dirtyRevision, enqueueSave]);

  useEffect(() => {
    function flushPendingSave() {
      if (document.visibilityState !== 'hidden' || latestDirtyRevision.current <= savedDirtyRevision.current) return;
      if (saveTimeout.current !== null) window.clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
      const revision = latestDirtyRevision.current;
      scheduledRevision.current = revision;
      enqueueSave(latestData.current, revision, [...scopeRevisions.current.keys()]);
    }
    document.addEventListener('visibilitychange', flushPendingSave);
    return () => document.removeEventListener('visibilitychange', flushPendingSave);
  }, [enqueueSave]);

  useEffect(() => {
    function retryAfterReconnect() {
      if (latestDirtyRevision.current <= savedDirtyRevision.current) return;
      enqueueSave(latestData.current, latestDirtyRevision.current, [...scopeRevisions.current.keys()]);
    }
    window.addEventListener('online', retryAfterReconnect);
    return () => window.removeEventListener('online', retryAfterReconnect);
  }, [enqueueSave]);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const previousToday = previousTodayKey.current;
    if (previousToday === todayKey) return;
    setSelectedMealDate((selectedDate) => dateSelectionAfterRollover(selectedDate, previousToday, todayKey));
    previousTodayKey.current = todayKey;
  }, [todayKey]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const { planDay: todayPlanDay, plan: todayPlan } = workoutPlanForDate(todayKey, data.dayPlans, data.datePlanOverrides);
  const todayMeals = mealsForDate(data.meals, todayKey);
  const selectedMeals = mealsForDate(data.meals, selectedMealDate);
  const completedToday = data.workouts.some((session) => localDateKey(new Date(session.date)) === todayKey && workoutMatchesPlan(session, todayPlanDay, todayPlan.name));
  const active = data.activeWorkout;
  const allSets = active?.exercises.flatMap((exercise) => exercise.sets) ?? [];
  const finishedSets = allSets.filter((set) => set.done).length;
  const strengthSets = active?.exercises.flatMap((exercise) => exercise.type === 'strength' ? exercise.sets : []) ?? [];
  const cardioSets = active?.exercises.flatMap((exercise) => exercise.type === 'cardio' ? exercise.sets : []) ?? [];
  const totalVolume = activeWorkoutVolume(active?.exercises ?? []);
  const cardioMinutes = cardioSets.filter((set) => set.done).reduce((sum, set) => sum + set.durationMinutes, 0);
  const cardioDistance = cardioSets.filter((set) => set.done).reduce((sum, set) => sum + set.distanceKm, 0);
  const cardioCalories = cardioSets.filter((set) => set.done).reduce((sum, set) => sum + set.calories, 0);
  const historyVolume = data.workouts.reduce((sum, workout) => sum + workout.volume, 0);
  const firstName = user.displayName?.trim().split(/\s+/)[0] || 'athlete';

  function navigate(next: View) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  function startOrResumeWorkout() {
    if (active) { setWorkoutOpen(true); return; }
    if (!todayPlan.exercises.length) {
      if (todayPlanDay === -1) { setToast('Choose a workout plan for today first'); return; }
      setSelectedPlanDay(todayPlanDay); setLibraryOpen(true); return;
    }
    const retake = completedToday;
    if (retake && !window.confirm('Retake today’s workout? When you complete it, today’s previous workout and exercise history will be replaced.')) return;
    updateData((current) => ({ ...current, activeWorkout: buildWorkout(todayPlan, retake, current.exerciseHistory) }));
    setWorkoutOpen(true);
  }

  function schedulePlan(date: string, planDay: number) {
    if (date === todayKey && data.activeWorkout) {
      setToast('Finish or discard the active workout before changing today’s plan');
      return;
    }
    updateData((current) => {
      const defaultDay = mondayIndex(new Date(`${date}T12:00:00`));
      const datePlanOverrides = { ...current.datePlanOverrides };
      if (planDay === defaultDay) delete datePlanOverrides[date];
      else datePlanOverrides[date] = planDay;
      return { ...current, datePlanOverrides: compactDatePlanOverrides(datePlanOverrides) };
    }, ['schedule']);
    const planName = planDay === -1 ? 'Rest day' : data.dayPlans.find((plan) => plan.day === planDay)?.name ?? 'Workout';
    setToast(`${planName} scheduled for ${date === todayKey ? 'today' : formatDate(`${date}T00:00:00`)}`);
  }

  function updateSet(exerciseId: string, setId: string, field: keyof SetEntry, value: number | boolean) {
    updateData((current) => !current.activeWorkout ? current : ({
      ...current, activeWorkout: {
        ...current.activeWorkout,
        exercises: current.activeWorkout.exercises.map((exercise) => exercise.id === exerciseId ? {
          ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, [field]: value } : set),
        } : exercise),
      },
    }));
  }

  function addSet(exerciseId: string) {
    updateData((current) => !current.activeWorkout ? current : ({
      ...current, activeWorkout: {
        ...current.activeWorkout,
        exercises: current.activeWorkout.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) return exercise;
          const last = exercise.sets.at(-1) ?? { weight: 0, reps: 8, durationSeconds: 0, durationMinutes: 20, distanceKm: 0, calories: 0 };
          return { ...exercise, sets: [...exercise.sets, {
            id: crypto.randomUUID(), weight: last.weight, reps: last.reps, durationSeconds: last.durationSeconds,
            durationMinutes: last.durationMinutes,
            distanceKm: last.distanceKm, calories: last.calories, done: false,
          }] };
        }),
      },
    }));
  }

  function deleteSet(exerciseId: string, setId: string) {
    updateData((current) => !current.activeWorkout ? current : ({
      ...current, activeWorkout: {
        ...current.activeWorkout,
        exercises: current.activeWorkout.exercises.map((exercise) => exercise.id === exerciseId
          ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) } : exercise),
      },
    }));
  }

  const updateRestTimer = useCallback((restTimer: ActiveWorkout['restTimer']) => {
    updateData((current) => !current.activeWorkout ? current : ({
      ...current,
      activeWorkout: { ...current.activeWorkout, restTimer },
    }));
  }, [updateData]);

  function discardWorkout() {
    if (!window.confirm('Discard this in-progress workout? Completed sets in it will not be saved.')) return;
    updateData((current) => ({ ...current, activeWorkout: null }));
    setWorkoutOpen(false);
    setToast('In-progress workout discarded');
  }

  function completeWorkout(elapsedSeconds: number) {
    if (!active || !finishedSets) return;
    const id = crypto.randomUUID();
    const completedAt = new Date().toISOString();
    const session: WorkoutSession = {
      id, date: completedAt, planDay: active.planDay, name: active.name, focus: active.focus, duration: Math.max(1, Math.round(elapsedSeconds / 60)),
      exercises: active.exercises.filter((exercise) => exercise.sets.some((set) => set.done)).length,
      sets: strengthSets.filter((set) => set.done).length, volume: totalVolume,
      cardioMinutes, distanceKm: cardioDistance, calories: cardioCalories,
    };
    const records = active.exercises.flatMap((exercise) => {
      const completed = exercise.sets.filter((set) => set.done);
      const topStrengthSet = bestCompletedSet(exercise, completed);
      const inverseLoad = exercise.loadMode === 'assistance';
      const targetMet = completed.length === exercise.sets.length && completed.every((set) => exercise.type === 'strength'
        ? exercise.measurement === 'duration'
          ? set.durationSeconds >= exercise.targetDurationSeconds
          : (inverseLoad ? set.weight <= exercise.targetWeight : set.weight >= exercise.targetWeight) && set.reps >= exercise.targetReps
        : set.durationMinutes >= exercise.targetDurationMinutes && (!exercise.targetDistanceKm || set.distanceKm >= exercise.targetDistanceKm));
      return completed.length ? [{
        id: crypto.randomUUID(), sessionId: id, exerciseId: exercise.id, exercise: exercise.name, date: completedAt,
        type: exercise.type, measurement: exercise.measurement, loadMode: exercise.loadMode,
        weight: exercise.type === 'strength' ? topStrengthSet?.weight ?? 0 : 0,
        reps: exercise.type === 'strength' ? topStrengthSet?.reps ?? 0 : 0,
        setsCompleted: completed.length, targetMet,
        durationSeconds: completed.reduce((sum, set) => sum + set.durationSeconds, 0),
        durationMinutes: completed.reduce((sum, set) => sum + set.durationMinutes, 0),
        distanceKm: completed.reduce((sum, set) => sum + set.distanceKm, 0),
        calories: completed.reduce((sum, set) => sum + set.calories, 0),
        completedSets: completed.map(({ weight, reps, durationSeconds, durationMinutes, distanceKm, calories }) => ({
          weight, reps, durationSeconds, durationMinutes, distanceKm, calories,
        })),
        estimated: false,
      }] : [];
    });
    updateData((current) => {
      const replacedSessionIds = active.retake ? new Set(current.workouts
        .filter((item) => localDateKey(new Date(item.date)) === todayKey && workoutMatchesPlan(item, active.planDay, active.name))
        .map((item) => item.id)) : new Set<string>();
      const workouts = active.retake ? current.workouts.filter((item) => !replacedSessionIds.has(item.id)) : current.workouts;
      const exerciseHistory = active.retake ? current.exerciseHistory.filter((item) => !replacedSessionIds.has(item.sessionId)) : current.exerciseHistory;
      return { ...current, workouts: [session, ...workouts], exerciseHistory: [...exerciseHistory, ...records], activeWorkout: null };
    }, ['active', 'history']);
    setWorkoutOpen(false);
    setView('history');
    setToast(active.retake ? 'Today’s workout history was replaced' : 'Workout saved to your history');
  }

  function deleteWorkout(workout: WorkoutSession) {
    if (!window.confirm(`Delete ${workout.name} from ${formatDate(workout.date)}? Its exercise progress entries will also be removed.`)) return;
    updateData((current) => ({
      ...current,
      workouts: current.workouts.filter((item) => item.id !== workout.id),
      exerciseHistory: current.exerciseHistory.filter((item) => item.sessionId !== workout.id),
    }), ['history']);
    setToast(`${workout.name} deleted from history`);
  }

  function saveWorkoutCorrection(workout: WorkoutSession, records: WorkoutData['exerciseHistory']) {
    const recordIds = new Set(records.map((record) => record.id));
    const volume = records.filter((record) => record.type === 'strength' && record.measurement === 'reps')
      .reduce((sum, record) => sum + record.weight * record.reps * Math.max(1, record.setsCompleted), 0);
    const nextWorkout = {
      ...workout,
      exercises: records.length,
      sets: records.filter((record) => record.type === 'strength').reduce((sum, record) => sum + record.setsCompleted, 0),
      volume,
      cardioMinutes: records.filter((record) => record.type === 'cardio').reduce((sum, record) => sum + record.durationMinutes, 0),
      distanceKm: records.filter((record) => record.type === 'cardio').reduce((sum, record) => sum + record.distanceKm, 0),
      calories: records.filter((record) => record.type === 'cardio').reduce((sum, record) => sum + record.calories, 0),
    };
    updateData((current) => ({
      ...current,
      workouts: current.workouts.map((item) => item.id === workout.id ? nextWorkout : item),
      exerciseHistory: current.exerciseHistory.map((item) => recordIds.has(item.id) ? records.find((record) => record.id === item.id)! : item),
    }), ['history']);
    setEditingWorkout(null);
    setToast(`${workout.name} corrections saved`);
  }

  function downloadHistory(format: 'json' | 'csv') {
    if (historyPage.hasMore) {
      setToast('Load all older sessions before exporting a complete history');
      return;
    }
    const content = format === 'json'
      ? workoutHistoryJson(data.workouts, data.exerciseHistory)
      : workoutHistoryCsv(data.workouts, data.exerciseHistory);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `workout-history-${todayKey}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
    setToast(`Workout history exported as ${format.toUpperCase()}`);
  }

  async function loadOlderHistory() {
    if (!historyPage.hasMore || !historyPage.nextBefore || historyLoading) return;
    if (syncState !== 'synced') {
      setToast('Wait for current changes to finish saving before loading older history');
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await authenticatedFetch(user, `/api/data/history?before=${encodeURIComponent(historyPage.nextBefore)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as {
        workouts?: WorkoutSession[]; exerciseHistory?: WorkoutData['exerciseHistory']; nextBefore?: string | null; hasMore?: boolean; error?: string;
      } | null;
      if (!response.ok || !payload || !Array.isArray(payload.workouts) || !Array.isArray(payload.exerciseHistory)) {
        throw new Error(payload?.error || 'Older history could not be loaded.');
      }
      const appendPage = (current: WorkoutData) => normalizeWorkoutData({
        ...current,
        workouts: [...new Map([...current.workouts, ...payload.workouts!].map((item) => [item.id, item])).values()]
          .sort((left, right) => +new Date(right.date) - +new Date(left.date)),
        exerciseHistory: [...new Map([...current.exerciseHistory, ...payload.exerciseHistory!].map((item) => [item.id, item])).values()],
      });
      setData((current) => {
        const next = appendPage(current);
        latestData.current = next;
        return next;
      });
      syncedData.current = appendPage(syncedData.current);
      setHistoryPage({ nextBefore: payload.nextBefore ?? null, hasMore: Boolean(payload.hasMore) });
    } catch (cause) {
      setToast(cause instanceof Error ? cause.message : 'Older history could not be loaded');
    } finally {
      setHistoryLoading(false);
    }
  }

  function saveMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const recurring = mealScope === 'daily';
    const eaten = values.get('eaten') === 'on';
    const meal: Meal = {
      id: editingMeal?.id ?? crypto.randomUUID(), date: recurring ? (editingMeal?.date ?? selectedMealDate) : selectedMealDate,
      recurring, completedDates: recurring
        ? compactMealCompletionDates([...new Set([...(editingMeal?.completedDates ?? []), ...(eaten ? [selectedMealDate] : [])])].filter((date) => eaten || date !== selectedMealDate))
        : [],
      type: String(values.get('type')), name: String(values.get('name')).trim(),
      note: String(values.get('note') || 'Custom meal').trim(), kcal: Number(values.get('kcal')), protein: Number(values.get('protein')),
      carbs: Number(values.get('carbs')), fats: Number(values.get('fats')), sugar: Number(values.get('sugar')), done: recurring ? false : eaten,
    };
    updateData((current) => ({ ...current, meals: editingMeal
      ? current.meals.map((item) => item.id === editingMeal.id ? meal : item)
      : [...current.meals, meal] }), ['meals']);
    setMealOpen(false);
    setMealDraft(null);
    setEditingMeal(null);
    setToast(editingMeal ? `${meal.name} updated` : recurring ? `${meal.name} added to your daily plan` : `${meal.name} added to ${formatDate(`${selectedMealDate}T00:00:00`)}`);
  }

  function toggleMeal(id: string) {
    updateData((current) => ({ ...current, meals: current.meals.map((meal) => {
      if (meal.id !== id) return meal;
      if (!meal.recurring) return { ...meal, done: !meal.done };
      const done = meal.completedDates.includes(selectedMealDate);
      return { ...meal, completedDates: compactMealCompletionDates(done ? meal.completedDates.filter((date) => date !== selectedMealDate) : [...meal.completedDates, selectedMealDate]) };
    }) }), ['meals']);
  }

  function openNewMeal(scope: 'daily' | 'date') {
    setMealDraft(null);
    setEditingMeal(null);
    setMealScope(scope);
    setMealOpen(true);
  }

  function editMeal(meal: Meal) {
    setMealDraft(null);
    setEditingMeal(meal);
    setMealScope(meal.recurring ? 'daily' : 'date');
    setMealOpen(true);
  }

  function deleteMeal(meal: Meal) {
    const detail = meal.recurring ? 'This removes it from the recurring plan for every day.' : `This removes it only from ${formatDate(`${meal.date}T00:00:00`)}.`;
    if (!window.confirm(`Delete ${meal.name}? ${detail}`)) return;
    updateData((current) => ({ ...current, meals: current.meals.filter((item) => item.id !== meal.id) }), ['meals']);
    setToast(`${meal.name} deleted`);
  }

  async function scanNutritionLabel(file: File) {
    setNutritionState('loading');
    setNutritionError('');
    try {
      const body = new FormData();
      body.set('image', file);
      const response = await authenticatedFetch(user, '/api/nutrition/detect', { method: 'POST', body });
      const payload = await response.json().catch(() => null) as (NutritionDraft & { error?: string; warning?: string }) | null;
      if (!response.ok || !payload) throw new Error(payload?.error || 'The nutrition label could not be read.');
      setMealDraft({ name: payload.name || 'Scanned food', kcal: payload.kcal, protein: payload.protein, carbs: payload.carbs, fats: payload.fats, sugar: payload.sugar });
      setEditingMeal(null);
      setMealScope('date');
      setMealOpen(true);
      setNutritionState('idle');
      setToast(payload.warning || 'Nutrition values detected — review them before saving');
    } catch (cause) {
      setNutritionState('error');
      setNutritionError(cause instanceof Error ? cause.message : 'The nutrition label could not be read.');
    }
  }

  function updatePlan(day: number, updates: Partial<Pick<DayPlan, 'name' | 'focus'>>) {
    updateData((current) => ({ ...current, dayPlans: current.dayPlans.map((plan) => plan.day === day ? { ...plan, ...updates } : plan) }), ['plans']);
  }

  function addExercise(day: number, exercise: Omit<LibraryExercise, 'id'>) {
    const exerciseId = stableExerciseId(exercise.name);
    if (data.dayPlans.find((plan) => plan.day === day)?.exercises.some((item) => item.id === exerciseId)) {
      setToast(`${exercise.name} is already in ${DAY_NAMES[day]}`);
      return;
    }
    updateData((current) => ({ ...current, dayPlans: current.dayPlans.map((plan) => plan.day === day
      ? { ...plan, exercises: [...plan.exercises, { ...exercise, id: exerciseId }] } : plan) }), ['plans']);
    setToast(`${exercise.name} added to ${DAY_NAMES[day]}`);
  }

  function updateExercise(day: number, id: string, updates: Partial<LibraryExercise>) {
    updateData((current) => ({ ...current, dayPlans: current.dayPlans.map((plan) => plan.day === day ? {
      ...plan, exercises: plan.exercises.map((exercise) => {
        if (exercise.id !== id) return exercise;
        const next = { ...exercise, ...updates, id: exercise.id };
        const identityChanged = canonicalExerciseName(next.name) !== canonicalExerciseName(exercise.name)
          || next.type !== exercise.type || next.measurement !== exercise.measurement || next.loadMode !== exercise.loadMode;
        return identityChanged && updates.levelStandard === undefined ? { ...next, levelStandard: undefined } : next;
      }),
    } : plan) }), ['plans']);
  }

  function removeExercise(day: number, id: string) {
    const exercise = data.dayPlans.find((plan) => plan.day === day)?.exercises.find((item) => item.id === id);
    if (!exercise || !window.confirm(`Remove ${exercise.name} from ${DAY_NAMES[day]}? Completed history will stay unchanged.`)) return;
    updateData((current) => ({ ...current, dayPlans: current.dayPlans.map((plan) => plan.day === day
      ? { ...plan, exercises: plan.exercises.filter((item) => item.id !== id) } : plan) }), ['plans']);
  }

  async function resetMyData() {
    const confirmation = window.prompt('This clears your history, meals, plans and active workout. Type RESET to continue.');
    if (confirmation !== 'RESET') return;
    setSyncState('syncing');
    try {
      if (saveTimeout.current !== null) {
        window.clearTimeout(saveTimeout.current);
        saveTimeout.current = null;
      }
      scheduledRevision.current = latestDirtyRevision.current;
      await saveQueue.current.catch(() => undefined);
      const response = await authenticatedFetch(user, '/api/data', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRevision: serverRevision.current }),
      });
      if (!response.ok) throw new Error('Reset failed');
      const payload = await response.json() as { data: WorkoutData; revision: number };
      const resetData = normalizeWorkoutData(payload.data);
      serverRevision.current = payload.revision;
      latestDirtyRevision.current = 0;
      savedDirtyRevision.current = 0;
      scheduledRevision.current = 0;
      scopeRevisions.current.clear();
      latestData.current = resetData;
      syncedData.current = resetData;
      window.localStorage.removeItem(recoveryKey);
      setDirtyRevision(0);
      setData(resetData);
      setHistoryPage({ nextBefore: null, hasMore: false });
      setSyncState('synced');
      setToast('Your Workout data is back to zero');
      setView('today');
    } catch { setSyncState('error'); setToast('Your data could not be reset'); }
  }

  if (loadError) return <main className="load-error"><Database size={28} /><h1>We couldn’t load your workout data.</h1><p>{loadError}</p><button onClick={() => location.reload()}>Try again</button></main>;
  if (!dataReady) return <AuthLoading />;

  const heading = view === 'today'
    ? { eyebrow: new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(today).toUpperCase(), title: `Welcome back, ${firstName}.` }
    : ({ history: { eyebrow: 'PROGRESS & MOMENTUM', title: 'History that shows progress.' }, meals: { eyebrow: 'DAILY NUTRITION', title: 'Plan food with purpose.' }, calendar: { eyebrow: 'TRAINING & NUTRITION', title: 'Your calendar.' }, settings: { eyebrow: 'ACCOUNT & DATA', title: 'Settings.' } } as const)[view];

  return (
    <main className="app-shell">
      <Sidebar view={view} navigate={navigate} syncState={syncState} retrySave={() => enqueueSave(latestData.current, latestDirtyRevision.current, [...scopeRevisions.current.keys()])} user={user} signOutUser={signOutUser} />
      <section className="main-panel">
        {syncState === 'error' && <button className="sync-error-banner" onClick={() => enqueueSave(latestData.current, latestDirtyRevision.current, [...scopeRevisions.current.keys()])}><Database size={15} /> Save needs attention. Tap to retry.</button>}
        <header className="topbar"><div><span className="eyebrow">{heading.eyebrow}</span><h1>{heading.title}</h1></div><button className={`icon-button ${view === 'calendar' ? 'active' : ''}`} aria-label="Open calendar" onClick={() => navigate('calendar')}><CalendarDays size={20} /></button></header>
        {view === 'today' && <Dashboard plan={todayPlan} dayPlans={data.dayPlans} scheduledDay={todayPlanDay} defaultDay={todayDay} meals={todayMeals} workouts={data.workouts} exerciseHistory={data.exerciseHistory} levelResetAt={data.levelResetAt} active={active} completedToday={completedToday} schedulePlan={(planDay) => schedulePlan(todayKey, planDay)} openWorkout={startOrResumeWorkout} openMeals={() => { setSelectedMealDate(todayKey); openNewMeal('date'); }} openLibrary={() => { setSelectedPlanDay(todayPlanDay >= 0 ? todayPlanDay : todayDay); setLibraryOpen(true); }} navigate={navigate} latestWorkout={data.workouts[0]} />}
        {view === 'history' && <HistoryView workouts={data.workouts} exerciseHistory={data.exerciseHistory} dayPlans={data.dayPlans} totalVolume={historyVolume} now={clock} goToday={() => navigate('today')} editWorkout={setEditingWorkout} deleteWorkout={deleteWorkout} downloadHistory={downloadHistory} historyHasMore={historyPage.hasMore} historyLoading={historyLoading || syncState !== 'synced'} loadOlderHistory={loadOlderHistory} />}
        {view === 'meals' && <MealsView todayKey={todayKey} selectedDate={selectedMealDate} meals={selectedMeals} toggleMeal={toggleMeal} addMeal={openNewMeal} editMeal={editMeal} deleteMeal={deleteMeal} openCalendar={() => navigate('calendar')} scanLabel={scanNutritionLabel} nutritionState={nutritionState} nutritionError={nutritionError} />}
        {view === 'calendar' && <CalendarView todayKey={todayKey} selectedDate={selectedMealDate} selectDate={(date) => setSelectedMealDate(date)} workouts={data.workouts} meals={data.meals} dayPlans={data.dayPlans} datePlanOverrides={data.datePlanOverrides} schedulePlan={schedulePlan} openMeals={() => navigate('meals')} />}
        {view === 'settings' && <SettingsView user={user} reset={resetMyData} signOutUser={signOutUser} isAdmin={isAdmin} clearLocalHistory={() => setData((current) => ({ ...current, workouts: [], exerciseHistory: [], activeWorkout: null }))} />}
      </section>
      <MobileNav view={view} navigate={navigate} />
      {workoutOpen && active && <WorkoutModal workout={active} exerciseHistory={data.exerciseHistory} finishedSets={finishedSets} totalSets={allSets.length} totalVolume={totalVolume} cardioMinutes={cardioMinutes} updateSet={updateSet} addSet={addSet} deleteSet={deleteSet} updateRestTimer={updateRestTimer} close={() => setWorkoutOpen(false)} discard={discardWorkout} complete={completeWorkout} />}
      {mealOpen && <MealModal date={selectedMealDate} draft={mealDraft} meal={editingMeal} scope={mealScope} close={() => { setMealOpen(false); setMealDraft(null); setEditingMeal(null); }} submit={saveMeal} />}
      {libraryOpen && <ExerciseLibraryModal plans={data.dayPlans} selectedDay={selectedPlanDay} setSelectedDay={setSelectedPlanDay} todayDay={todayDay} close={() => setLibraryOpen(false)} updatePlan={updatePlan} add={addExercise} update={updateExercise} remove={removeExercise} />}
      {editingWorkout && <HistorySessionModal workout={editingWorkout} records={data.exerciseHistory.filter((record) => record.sessionId === editingWorkout.id)} close={() => setEditingWorkout(null)} save={saveWorkoutCorrection} />}
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </main>
  );
}
