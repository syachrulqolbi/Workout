'use client';

import { Activity, ChevronDown, Dumbbell, ExternalLink } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import {
  MUSCLE_LABELS, STRENGTH_LEVELS, createStrengthLevelResolver, musclesForExercise, strengthLevelForExercise,
  type ExerciseMuscles, type MuscleGroup,
} from '@/lib/exercise-profile';
import { DAY_NAMES, type DayPlan, type ExerciseRecord, type LibraryExercise, type StrengthProfile } from '@/lib/workout-data';
import { pullUpTargetSetup, requiredWorkingWeight } from '@/lib/strength-calculations';
import { formatNumber } from '@/lib/workout-ui';
import { BodyFigure } from '@/features/workout/components/body-figure';

type SummaryMuscle = { group: MuscleGroup; score: number; direct: boolean; color: string };

function summarizePlan(exercises: LibraryExercise[], resolveLevel: ReturnType<typeof createStrengthLevelResolver>) {
  const stats = new Map<MuscleGroup, { score: number; direct: boolean }>();
  const strengthLevels = new Map<string, number>();
  for (const exercise of exercises) {
    const muscles = musclesForExercise(exercise);
    const level = resolveLevel(exercise);
    if (level && !strengthLevels.has(exercise.id)) strengthLevels.set(exercise.id, level.index);
    const loadWeight = level ? 1 + level.index / 20 : 1;
    const trainingDose = exercise.type === 'strength' ? Math.max(1, exercise.sets) : Math.max(1, exercise.durationMinutes / 15);
    for (const group of muscles.primary) {
      const current = stats.get(group) ?? { score: 0, direct: false };
      stats.set(group, { score: current.score + 2 * loadWeight * trainingDose, direct: true });
    }
    for (const group of muscles.secondary) {
      const current = stats.get(group) ?? { score: 0, direct: false };
      stats.set(group, { score: current.score + loadWeight * trainingDose, direct: current.direct });
    }
  }
  const maximum = Math.max(1, ...[...stats.values()].map((item) => item.score));
  const muscles: SummaryMuscle[] = [...stats].map(([group, item]) => {
    const intensity = item.score / maximum;
    const color = intensity > .66 ? '#303030' : intensity > .33 ? '#777777' : '#b6b6b6';
    return { group, ...item, color };
  }).sort((a, b) => b.score - a.score);
  return {
    muscles,
    map: {
      primary: muscles.filter((item) => item.direct).map((item) => item.group),
      secondary: muscles.filter((item) => !item.direct).map((item) => item.group),
    } satisfies ExerciseMuscles,
    colors: Object.fromEntries(muscles.map((item) => [item.group, item.color])) as Partial<Record<MuscleGroup, string>>,
    averageLevel: strengthLevels.size ? [...strengthLevels.values()].reduce((sum, item) => sum + item, 0) / strengthLevels.size : null,
    gradedExerciseCount: strengthLevels.size,
  };
}

export function MuscleVisualization({ plans, history, resetAt, profile }: { plans: DayPlan[]; history: ExerciseRecord[]; resetAt: string; profile: StrengthProfile }) {
  const planExercises = useMemo(() => plans.flatMap((plan) => plan.exercises.map((exercise) => ({ key: `${plan.day}:${exercise.id}`, day: plan.day, exercise }))), [plans]);
  const exercises = useMemo(() => planExercises.map((item) => item.exercise), [planExercises]);
  const resolveLevel = useMemo(() => createStrengthLevelResolver(history, resetAt, profile), [history, resetAt, profile]);
  const levels = useMemo(() => new Map(planExercises.map((item) => [item.key, resolveLevel(item.exercise)])), [planExercises, resolveLevel]);
  const [selectedId, setSelectedId] = useState('summary');
  const selectedEntry = selectedId === 'summary' ? undefined : planExercises.find((item) => item.key === selectedId);
  const selected = selectedEntry?.exercise;
  const summary = useMemo(() => summarizePlan(exercises, resolveLevel), [exercises, resolveLevel]);
  const muscles = useMemo(() => selected ? musclesForExercise(selected) : summary.map, [selected, summary]);
  const level = selectedEntry ? levels.get(selectedEntry.key) ?? null : null;
  const uniqueExerciseCount = useMemo(() => new Set(exercises.map((exercise) => exercise.id)).size, [exercises]);

  const color = selected ? level?.color ?? '#4b4b4b' : '#303030';
  const labels = [...muscles.primary, ...muscles.secondary].map((group) => MUSCLE_LABELS[group]).join(', ');

  return (
    <section className="card muscle-card" style={{ '--muscle-color': color } as CSSProperties}>
      <div className="section-heading muscle-heading">
        <div><span className="muted-label">MUSCLE VISUALIZATION</span><h3>Weekly training map</h3><p>See coverage across every plan, or select one exercise to inspect its muscles and level.</p></div>
        <span className="muscle-heading-icon"><Activity size={19} /></span>
      </div>

      {exercises.length ? (
        <>
          <label className="muscle-view-picker">
            <span>SELECT EXERCISE</span>
            <div><Dumbbell size={17} /><select value={selectedEntry?.key ?? 'summary'} onChange={(event) => setSelectedId(event.target.value)} aria-label="Choose an exercise for the muscle map"><option value="summary">Full weekly plan summary</option>{plans.filter((plan) => plan.exercises.length).map((plan) => <optgroup key={plan.day} label={`${DAY_NAMES[plan.day]} · ${plan.name}`}>{plan.exercises.map((exercise) => { const exerciseLevel = levels.get(`${plan.day}:${exercise.id}`); return <option key={exercise.id} value={`${plan.day}:${exercise.id}`}>{exercise.name} · {exerciseLevel ? `L${exerciseLevel.index} ${exerciseLevel.name}` : exercise.type === 'cardio' ? 'Cardio' : 'No level standard'}</option>; })}</optgroup>)}</select><ChevronDown size={17} /></div>
            <small>{selectedEntry ? `${DAY_NAMES[selectedEntry.day]} plan · ${level ? `Level ${level.index} ${level.name}` : 'Cardio'}` : `${exercises.length} planned slots · ${uniqueExerciseCount} unique exercises`}</small>
          </label>

          <div className="muscle-content">
            <div className="body-map-panel">
              <div className="body-map-title"><span>{selected?.name ?? 'Full weekly coverage'}</span><small>{selected ? labels || 'Muscle groups unavailable' : `${uniqueExerciseCount} unique exercises · ${summary.muscles.length} groups trained`}</small></div>
              <div className="body-map-pair" role="img" aria-label={selected ? `${selected.name} trains ${labels}` : `The complete weekly plan trains ${labels}`}>
                <BodyFigure view="front" muscles={muscles} colors={selected ? undefined : summary.colors} />
                <BodyFigure view="back" muscles={muscles} colors={selected ? undefined : summary.colors} />
              </div>
              {!selected ? <div className="summary-muscle-key"><span><i className="light" /> Light</span><span><i className="medium" /> Moderate</span><span><i className="high" /> High emphasis</span></div> : <div className="muscle-key"><span><i className="primary" /> Primary</span><span><i className="secondary" /> Supporting</span></div>}
            </div>

            <div className="muscle-detail-panel">
              {!selected ? <PlanSummaryDetail exercises={exercises} muscles={summary.muscles} averageLevel={summary.averageLevel} gradedExerciseCount={summary.gradedExerciseCount} /> : level ? <StrengthLevelDetail key={`${selectedEntry.key}:${level.index}:${profile.bodyweightKg}:${profile.ageYears}`} level={level} exercise={selected} profile={profile} /> : selected.type === 'cardio' ? <CardioDetail exercise={selected} /> : <UngradedStrengthDetail exercise={selected} />}
              <div className="trained-groups">
                <span className="muted-label">{selected ? 'TRAINED MUSCLES' : 'PLAN COVERAGE'}</span>
                <div>{muscles.primary.map((group) => <b key={group}>{MUSCLE_LABELS[group]}</b>)}{muscles.secondary.map((group) => <span key={group}>{MUSCLE_LABELS[group]}</span>)}</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="muscle-empty"><span><Dumbbell size={21} /></span><strong>No exercises planned</strong><p>Add exercises to a weekday plan to build your training map.</p></div>
      )}
    </section>
  );
}

function PlanSummaryDetail({ exercises, muscles, averageLevel, gradedExerciseCount }: { exercises: LibraryExercise[]; muscles: SummaryMuscle[]; averageLevel: number | null; gradedExerciseCount: number }) {
  const uniqueExercises = [...new Map(exercises.map((exercise) => [exercise.id, exercise])).values()];
  const strengthCount = uniqueExercises.filter((exercise) => exercise.type === 'strength').length;
  const cardioCount = uniqueExercises.length - strengthCount;
  const averageTier = averageLevel === null ? null : STRENGTH_LEVELS[Math.max(0, Math.min(9, Math.round(averageLevel) - 1))];
  const averageDisplay = averageLevel === null ? null : formatNumber(averageLevel);
  return (
    <div className="strength-level-detail plan-summary-detail">
      <span className="level-kicker">WEEKLY PLAN SUMMARY</span>
      <div className="level-title"><h4>{averageTier?.name ?? 'No strength level'}</h4><span style={averageTier ? { background: averageTier.color } : undefined}>{averageDisplay ?? <Dumbbell size={18} />}</span></div>
      {averageTier && averageDisplay && <div className="summary-average-tier">OVERALL LEVEL · <strong>{averageDisplay} OF 10</strong></div>}
      <div className="level-metrics summary-level-metrics"><div><span>MUSCLES</span><strong>{muscles.length} groups</strong></div><div><span>UNIQUE STRENGTH</span><strong>{strengthCount} exercises</strong></div><div><span>UNIQUE CARDIO</span><strong>{cardioCount} {cardioCount === 1 ? 'exercise' : 'exercises'}</strong></div></div>
      <div className="summary-emphasis"><span>HIGHEST EMPHASIS</span>{muscles.slice(0, 3).map((item) => <strong key={item.group}>{MUSCLE_LABELS[item.group]}</strong>)}</div>
      <p>{averageTier ? `Overall level is calculated from ${gradedExerciseCount} unique graded strength exercises. ` : ''}Darker muscles reflect exercise frequency and planned sets across every weekday plan. Select an exercise above to inspect its muscles and level.</p>
    </div>
  );
}

function StrengthLevelDetail({ level, exercise, profile }: { level: NonNullable<ReturnType<typeof strengthLevelForExercise>>; exercise: LibraryExercise; profile: StrengthProfile }) {
  const achievedIndex = Math.max(0, level.index);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(1, achievedIndex));
  const [targetReps, setTargetReps] = useState(Math.max(1, exercise.reps || exercise.repRangeMax || exercise.repRangeMin || 1));
  const levelNames = STRENGTH_LEVELS.map((tier) => tier.name);
  const selectedTier = { ...STRENGTH_LEVELS[selectedIndex - 1], name: levelNames[selectedIndex - 1] };
  const selectedRange = level.ranges[selectedIndex - 1] ?? { min: level.rangeMin, max: level.rangeMax };
  const selectedMilestone = level.milestones?.[selectedIndex - 1];
  const formatWeightedHold = (weight: number, seconds: number) => `${weight ? `+${formatNumber(weight)} kg added` : 'Bodyweight'} · ${formatNumber(seconds)} sec`;
  const formatMetric = (value: number) => level.metric === 'assistanceEquivalent'
    ? value < 0 ? `${formatNumber(Math.abs(value))} kg assistance` : value === 0 ? 'Bodyweight' : `+${formatNumber(value)} kg added`
    : level.isAddedWeight ? value === 0 ? 'Bodyweight' : `+${formatNumber(value)} kg added`
    : `${formatNumber(value)} ${level.unit}`;
  const loadSuffix = level.metric === 'weight' && !level.isAddedWeight ? level.isAssistance ? ' assistance' : level.loadMode === 'perSide' ? ' per side' : ' total' : '';
  const load = level.metric === 'weightedHold'
    ? formatWeightedHold(level.bestWeight ?? 0, level.bestSeconds ?? 0)
    : level.estimatedOneRepMax !== undefined ? `${formatMetric(level.load)} estimated 1RM` : `${formatMetric(level.load)}${loadSuffix}`;
  const range = selectedMilestone
    ? formatWeightedHold(selectedMilestone.weight, selectedMilestone.seconds)
    : selectedRange.max === null
    ? level.isAddedWeight ? `${formatMetric(selectedRange.min)} or more` : `${formatMetric(selectedRange.min)}+`
    : level.isAssistance && level.metric === 'weight'
      ? `${formatMetric(selectedRange.min)}–${formatMetric(selectedRange.max)} assistance`
      : `${formatMetric(selectedRange.min)} to under ${formatMetric(selectedRange.max)}`;
  return (
    <div className="strength-level-detail">
      <span className="level-kicker">{selectedIndex === achievedIndex ? 'CURRENT' : 'VIEWING'} LEVEL {selectedIndex} OF 10</span>
      <div className="level-title"><h4>{selectedTier.name}</h4><span style={{ background: selectedTier.color }}>{selectedIndex}</span></div>
      {exercise.levelStandard?.url && <a className="standard-source-link" href={exercise.levelStandard.url} target="_blank" rel="noreferrer">Strength Level reference <ExternalLink size={13} /></a>}
      {exercise.levelStandard?.note && <p className="standard-match-note"><strong>{(exercise.levelStandard.matchQuality ?? 'custom').toUpperCase()} MATCH</strong> · {exercise.levelStandard.note}</p>}
      <div className="level-metrics">
        <div><span>{level.hasHistory ? 'BEST LOGGED' : 'PLAN LOAD'}</span><strong>{load}</strong></div>
        <div><span>LEVEL {selectedIndex} {selectedMilestone ? 'REQUIREMENT' : 'RANGE'}</span><strong>{range}</strong></div>
      </div>
      {achievedIndex === 0 && <div className="level-current-note">CURRENT RESULT · <strong>Below L1</strong></div>}
      {achievedIndex > 0 && selectedIndex !== achievedIndex && <div className="level-current-note">CURRENT LEVEL · <strong>L{achievedIndex} {level.name}</strong></div>}
      <div className="level-scale-heading"><span>EXPLORE LEVELS</span><small>Tap a level to view its range</small></div>
      <div className="level-scale" aria-label={`Current level ${level.index} of 10, ${level.name}. Choose a level to show its range.`}>
        {STRENGTH_LEVELS.map((tier, index) => {
          const tierIndex = index + 1;
          const tierName = levelNames[index];
          const classes = [tierIndex <= achievedIndex ? 'reached' : '', tierIndex === achievedIndex ? 'achieved' : '', tierIndex === selectedIndex ? 'selected' : ''].filter(Boolean).join(' ');
          return <button key={`${tierIndex}-${tierName}`} type="button" className={classes} style={{ '--tier-color': tier.color } as CSSProperties} aria-label={`Show level ${tierIndex}, ${tierName}, range${tierIndex === achievedIndex ? ', current level' : ''}`} aria-pressed={tierIndex === selectedIndex} onClick={() => setSelectedIndex(tierIndex)}><span>{tierIndex}</span>{tierIndex === achievedIndex && <i aria-hidden="true" />}</button>;
        })}
      </div>
      <div className="level-scale-labels"><span><b>L1</b> {levelNames[0]}</span><span><b>L6</b> {levelNames[5]}</span><span><b>L10</b> {levelNames[9]}</span></div>
      {level.personalizedThresholds && level.metric === 'weight' && <PersonalizedLevelTable exercise={exercise} profile={profile} level={level} targetReps={targetReps} setTargetReps={setTargetReps} />}
      <p className="personalization-note">{level.personalizationLabel}{level.approximate ? ' · approximate' : ''}</p>
      <p>{level.metric === 'weightedHold' ? 'Each level requires both the shown added weight and hold time. Your best completed set determines the current level.' : level.metric === 'assistanceEquivalent' ? 'Assistance is converted to an equivalent load: machine assistance is negative, while added external weight is positive.' : level.isAddedWeight ? 'Levels use only the external weight held at your chest; bodyweight is Level 1. Your best logged added load sets the level.' : level.isAssistance && level.metric === 'weight' ? 'Lower machine assistance is stronger. Your lowest logged assistance sets this level.' : level.metric === 'reps' ? 'Your best completed repetitions set this level.' : level.metric === 'seconds' ? 'Your best completed hold duration sets this level.' : level.loadMode === 'perSide' ? 'This exercise is measured per side. Personal targets do not change its level bands.' : 'Your best logged load sets the level. Personal targets are tracked separately and do not change the level bands.'}</p>
    </div>
  );
}

function PersonalizedLevelTable({ exercise, profile, level, targetReps, setTargetReps }: {
  exercise: LibraryExercise;
  profile: StrengthProfile;
  level: NonNullable<ReturnType<typeof strengthLevelForExercise>>;
  targetReps: number;
  setTargetReps: (value: number) => void;
}) {
  const standard = exercise.levelStandard!;
  const pullUp = exercise.id === 'exercise-pull-up';
  const direct = standard.matchQuality === 'custom' && standard.loadRepresentation === 'addedWeight';
  const thresholds = level.personalizedThresholds ?? standard.thresholds;
  const minReps = Math.max(1, exercise.repRangeMin || exercise.reps || 1);
  const maxReps = Math.max(minReps, exercise.repRangeMax || exercise.reps || minReps);
  const formatRecommendation = (threshold: number) => {
    if (pullUp) {
      if (!profile.bodyweightKg) return 'Set bodyweight';
      const setup = pullUpTargetSetup(profile.bodyweightKg, threshold, targetReps);
      if (!setup) return 'Unavailable';
      if (setup.mode === 'assisted') return `${formatNumber(setup.assistanceKg)} kg assistance`;
      if (setup.mode === 'weighted') return `+${formatNumber(setup.addedWeightKg)} kg`;
      return 'Bodyweight';
    }
    const value = direct ? threshold : requiredWorkingWeight(threshold, targetReps);
    if (value === null) return 'Unavailable';
    const suffix = standard.loadRepresentation === 'perDumbbell' ? ' kg / dumbbell'
      : standard.loadRepresentation === 'perSide' ? ' kg / side'
        : standard.loadRepresentation === 'addedWeight' ? ' kg added' : ' kg';
    return `${formatNumber(value)}${suffix}`;
  };
  return <div className="personalized-level-table"><div className="level-table-heading"><div><strong>L1–L10 working weights</strong><small>Personalized from immutable 1RM benchmarks</small></div><label><span>VIEW AT REPS</span><select value={targetReps} onChange={(event) => setTargetReps(Number(event.target.value))}>{Array.from({ length: Math.max(1, maxReps - minReps + 1) }, (_, index) => minReps + index).map((reps) => <option key={reps} value={reps}>{reps} reps</option>)}</select></label></div><div className="level-table-rows">{STRENGTH_LEVELS.map((tier, index) => <div key={tier.name} className={index + 1 === level.index ? 'current' : ''}><span>L{index + 1}</span><strong>{tier.name}</strong><b>{formatRecommendation(thresholds[index])}</b><small>{formatNumber((level.baselineThresholds ?? standard.thresholds)[index])} kg 1RM baseline</small></div>)}</div><p>Calculated recommendations use the same rep multiplier in both directions. High-rep or non-failure sets are approximate.</p></div>;
}

function UngradedStrengthDetail({ exercise }: { exercise: LibraryExercise }) {
  return (
    <div className="strength-level-detail cardio-detail">
      <span className="level-kicker">STRENGTH EXERCISE</span>
      <div className="level-title"><h4>No level standard</h4><span><Dumbbell size={18} /></span></div>
      <div className="level-metrics"><div><span>EXERCISE</span><strong>{exercise.name}</strong></div><div><span>PLAN</span><strong>{exercise.measurement === 'duration' ? `${exercise.sets} sets · ${exercise.durationSeconds} sec` : `${exercise.sets} sets · ${exercise.reps} reps`}</strong></div></div>
      <p>This exercise remains in the plan and muscle map but is excluded from the 10-level average.</p>
    </div>
  );
}

function CardioDetail({ exercise }: { exercise: LibraryExercise }) {
  return (
    <div className="strength-level-detail cardio-detail">
      <span className="level-kicker">CARDIO EXERCISE</span>
      <div className="level-title"><h4>No strength level</h4><span><Activity size={18} /></span></div>
      <div className="level-metrics"><div><span>DURATION</span><strong>{formatNumber(exercise.durationMinutes)} min</strong></div><div><span>TARGET</span><strong>{exercise.calories ? `${formatNumber(exercise.calories)} kcal` : exercise.distanceKm ? `${formatNumber(exercise.distanceKm)} km` : 'Time based'}</strong></div></div>
      <p>Cardio trains the highlighted muscles but is excluded from KG-based levels.</p>
    </div>
  );
}
