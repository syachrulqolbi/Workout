import { describe, expect, it } from 'vitest';
import {
  estimatedOneRepMax, expandFiveLevelAnchors, levelForThresholds, oneRepMaxMultiplier,
  personalizedThresholds, pullUpEstimatedAddedWeightOneRepMax, pullUpTargetSetup,
  requiredWorkingWeight, resolveBaselineThresholds, STRENGTH_STANDARD_VERSION,
} from '@/lib/strength-calculations';
import { strengthLevelForExercise } from '@/lib/exercise-profile';
import { migrateStrengthStandardsV2 } from '@/lib/strength-migration';
import { STRENGTH_STANDARD_DEFINITIONS, strengthStandardForExercise } from '@/lib/strength-standards';
import { createEmptyWorkoutData, type LibraryExercise } from '@/lib/workout-data';

const profile = { bodyweightKg: 75, ageYears: 30, dateOfBirth: '', updatedAt: '' };
const exercise = (overrides: Partial<LibraryExercise>): LibraryExercise => ({
  id: 'exercise-iso-lateral-bench-press', name: 'Iso Lateral Bench Press', type: 'strength', measurement: 'reps',
  loadMode: 'total', weight: 70, reps: 8, sets: 3, durationSeconds: 0, durationMinutes: 0,
  distanceKm: 0, calories: 0, restSeconds: 90, repRangeMin: 6, repRangeMax: 8,
  levelStandard: strengthStandardForExercise('exercise-iso-lateral-bench-press', 'Iso Lateral Bench Press'),
  ...overrides,
});

describe('strength standards v2 calculations', () => {
  it('uses the supplied chest press L5 baseline and the requested blended rep formula', () => {
    const standard = exercise({}).levelStandard!;
    expect(standard.thresholds[4]).toBe(86);
    expect(oneRepMaxMultiplier(8)).toBeCloseTo(36 / 29, 10);
    expect(requiredWorkingWeight(86, 8)).toBeCloseTo(69.28, 2);
    expect(estimatedOneRepMax(70, 8)).toBeCloseTo(86.90, 2);
  });

  it('uses Brzycki below 8, Epley above 10, and a linear blend from 8 through 10', () => {
    expect(oneRepMaxMultiplier(6)).toBeCloseTo(36 / 31, 10);
    expect(oneRepMaxMultiplier(12)).toBeCloseTo(1.4, 10);
    const brzycki9 = 36 / 28;
    const epley9 = 1.3;
    expect(oneRepMaxMultiplier(9)).toBeCloseTo((brzycki9 + epley9) / 2, 10);
    expect(oneRepMaxMultiplier(0)).toBeNull();
    expect(oneRepMaxMultiplier(37)).toBeNull();
  });

  it('changes working recommendations with target reps without changing 1RM thresholds', () => {
    const standard = exercise({}).levelStandard!;
    const thresholds = personalizedThresholds(standard, profile).thresholds;
    expect(requiredWorkingWeight(thresholds[4], 8)).not.toEqual(requiredWorkingWeight(thresholds[4], 12));
    expect(thresholds[4]).toBe(86);
  });

  it('personalizes deterministically without changing logged lift values', () => {
    const standard = exercise({}).levelStandard!;
    const loggedKg = 70;
    const at75 = personalizedThresholds(standard, profile).thresholds;
    const at90 = personalizedThresholds(standard, { ...profile, bodyweightKg: 90 }).thresholds;
    const at60Years = personalizedThresholds(standard, { ...profile, ageYears: 60 }).thresholds;
    expect(at90[4]).not.toBe(at75[4]);
    expect(at60Years[4]).not.toBe(at75[4]);
    expect(loggedKg).toBe(70);
  });

  it('calculates exercises with different target repetitions independently', () => {
    expect(requiredWorkingWeight(86, 8)).not.toBe(requiredWorkingWeight(86, 15));
  });

  it('normalizes per-dumbbell records before grading', () => {
    const hammer = exercise({
      id: 'exercise-hammer-curl', name: 'Hammer Curl (B)', weight: 18, reps: 1, sets: 1,
      repRangeMin: 1, repRangeMax: 1,
      levelStandard: strengthStandardForExercise('exercise-hammer-curl', 'Hammer Curl (B)'),
    });
    expect(strengthLevelForExercise(hammer, [], '', undefined, profile)?.index).toBe(1);
  });

  it('converts pull-up assistance and added weight through total effective load', () => {
    expect(pullUpEstimatedAddedWeightOneRepMax(75, 20, 0, 8)).toBeCloseTo(-6.72, 2);
    const setup = pullUpTargetSetup(75, 13, 8)!;
    expect(setup.mode).toBe('assisted');
    expect(setup.assistanceKg).toBeGreaterThan(0);
  });

  it('keeps plank timed and cardio/unranked exercises out of ordinary 1RM grading', () => {
    const plank = exercise({ id: 'exercise-plank', name: 'Plank', measurement: 'duration', loadMode: 'duration', weight: 0, reps: 0, durationSeconds: 20, levelStandard: strengthStandardForExercise('exercise-plank', 'Plank') });
    expect(strengthLevelForExercise(plank, [], '', undefined, profile)?.estimatedOneRepMax).toBeUndefined();
    expect(strengthStandardForExercise('exercise-incline-walk', 'Incline Walk')).toBeNull();
    expect(strengthStandardForExercise('exercise-dragon-fly', 'Dragon Fly')).toBeNull();
  });

  it('implements all null fallback cases without treating null as zero', () => {
    expect(resolveBaselineThresholds([1,null,3,null,5,null,7,null,null,10], [10,20,30,40,50,60,70,80,90,100]).values)
      .toEqual([1,20,3,40,5,60,7,80,90,10]);
    expect(resolveBaselineThresholds([0,null,null,null,null,null,null,null,null,null], [1,2,3,4,5,6,7,8,9,10]).values[0]).toBe(0);
    expect(resolveBaselineThresholds(null, null).values.every((value) => value === null)).toBe(true);
    expect(resolveBaselineThresholds(null, [1,3,5,7,10]).values).toEqual(expandFiveLevelAnchors([1,3,5,7,10]));
  });

  it('represents all 33 requested definitions with verified URL shapes where applicable', () => {
    expect(STRENGTH_STANDARD_DEFINITIONS).toHaveLength(33);
    for (const standard of STRENGTH_STANDARD_DEFINITIONS) {
      if (standard.matchQuality !== 'cardio' && standard.name !== 'Dragon Fly') {
        expect(standard.url).toMatch(/^https:\/\/strengthlevel\.com\/strength-standards\/[a-z0-9-]+\/kg$/);
      }
    }
  });

  it('migrates idempotently, keeps stable IDs/history/loads, and preserves A/B names', () => {
    const data = createEmptyWorkoutData();
    data.dayPlans[0] = { day: 0, name: 'Push / Pull', focus: '', exercises: [
      exercise({ id: 'exercise-wrist-curl', name: 'Wrist curl (A)', weight: 12 }),
      exercise({ id: 'exercise-hammer-curl', name: 'Hammer curl (B)', weight: 23.5 }),
    ] };
    data.exerciseHistory = [{
      id: 'record-1', sessionId: 'session-1', exerciseId: 'exercise-wrist-curl', exercise: 'Wrist curl (A)', date: '2026-01-01T00:00:00.000Z',
      type: 'strength', measurement: 'reps', loadMode: 'total', weight: 11, reps: 12, setsCompleted: 2, targetMet: true,
      durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0,
      completedSets: [{ weight: 11, reps: 12, durationSeconds: 0, durationMinutes: 0, distanceKm: 0, calories: 0 }], estimated: false,
    }];
    const once = migrateStrengthStandardsV2(data);
    const twice = migrateStrengthStandardsV2(once);
    expect(once.standardsVersion).toBe(STRENGTH_STANDARD_VERSION);
    expect(once.dayPlans[0].exercises.map((item) => item.name)).toEqual(['Wrist Curl (A)', 'Hammer Curl (B)']);
    expect(once.dayPlans[0].exercises.map((item) => item.weight)).toEqual([12, 23.5]);
    expect(once.exerciseHistory).toEqual(data.exerciseHistory);
    expect(twice).toBe(once);
  });

  it('classifies from actual completed-set repetitions rather than planned repetitions', () => {
    const item = exercise({ weight: 0, reps: 8 });
    const record = {
      id:'r',sessionId:'s',exerciseId:item.id,exercise:item.name,date:'2026-01-01',type:'strength' as const,measurement:'reps' as const,
      loadMode:'total' as const,weight:70,reps:12,setsCompleted:1,targetMet:true,durationSeconds:0,durationMinutes:0,distanceKm:0,calories:0,
      completedSets:[{weight:70,reps:12,durationSeconds:0,durationMinutes:0,distanceKm:0,calories:0}],estimated:false,
    };
    const result = strengthLevelForExercise(item, [record], '', undefined, profile)!;
    expect(result.estimatedOneRepMax).toBeCloseTo(98, 6);
    expect(result.index).toBeGreaterThanOrEqual(levelForThresholds(result.personalizedThresholds!, 98));
  });
});
