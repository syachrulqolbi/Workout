'use client';

import { Activity, ChevronDown, Dumbbell } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  MUSCLE_LABELS, STRENGTH_LEVELS, createStrengthLevelResolver, musclesForExercise, strengthLevelForExercise,
  type ExerciseMuscles, type MuscleGroup,
} from '@/lib/exercise-profile';
import { DAY_NAMES, type DayPlan, type ExerciseRecord, type LibraryExercise } from '@/lib/workout-data';

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

export function MuscleVisualization({ plans, history, resetAt }: { plans: DayPlan[]; history: ExerciseRecord[]; resetAt: string }) {
  const planExercises = useMemo(() => plans.flatMap((plan) => plan.exercises.map((exercise) => ({ key: `${plan.day}:${exercise.id}`, day: plan.day, exercise }))), [plans]);
  const exercises = useMemo(() => planExercises.map((item) => item.exercise), [planExercises]);
  const resolveLevel = useMemo(() => createStrengthLevelResolver(history, resetAt), [history, resetAt]);
  const levels = useMemo(() => new Map(planExercises.map((item) => [item.key, resolveLevel(item.exercise)])), [planExercises, resolveLevel]);
  const [selectedId, setSelectedId] = useState('summary');
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [compactViewport, setCompactViewport] = useState(true);
  const selectedEntry = selectedId === 'summary' ? undefined : planExercises.find((item) => item.key === selectedId);
  const selected = selectedEntry?.exercise;
  const summary = useMemo(() => summarizePlan(exercises, resolveLevel), [exercises, resolveLevel]);
  const muscles = useMemo(() => selected ? musclesForExercise(selected) : summary.map, [selected, summary]);
  const level = selectedEntry ? levels.get(selectedEntry.key) ?? null : null;
  const uniqueExerciseCount = useMemo(() => new Set(exercises.map((exercise) => exercise.id)).size, [exercises]);

  const color = selected ? level?.color ?? '#4b4b4b' : '#303030';
  const labels = [...muscles.primary, ...muscles.secondary].map((group) => MUSCLE_LABELS[group]).join(', ');
  const showDetailedMap = !compactViewport || mobileExpanded;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const update = () => setCompactViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

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
            <div><Dumbbell size={17} /><select value={selectedEntry?.key ?? 'summary'} onChange={(event) => { setSelectedId(event.target.value); setMobileExpanded(true); }} aria-label="Choose an exercise for the muscle map"><option value="summary">Full weekly plan summary</option>{plans.filter((plan) => plan.exercises.length).map((plan) => <optgroup key={plan.day} label={`${DAY_NAMES[plan.day]} · ${plan.name}`}>{plan.exercises.map((exercise) => { const exerciseLevel = levels.get(`${plan.day}:${exercise.id}`); return <option key={exercise.id} value={`${plan.day}:${exercise.id}`}>{exercise.name} · {exerciseLevel ? `L${exerciseLevel.index} ${exerciseLevel.name}` : exercise.type === 'cardio' ? 'Cardio' : 'No level standard'}</option>; })}</optgroup>)}</select><ChevronDown size={17} /></div>
            <small>{selectedEntry ? `${DAY_NAMES[selectedEntry.day]} plan · ${level ? `Level ${level.index} ${level.name}` : 'Cardio'}` : `${exercises.length} planned slots · ${uniqueExerciseCount} unique exercises`}</small>
          </label>

          <button className="muscle-mobile-toggle" type="button" aria-expanded={mobileExpanded} onClick={() => setMobileExpanded((expanded) => !expanded)}>
            {mobileExpanded ? 'Hide detailed map' : 'View detailed map'}
            <ChevronDown size={16} aria-hidden="true" />
          </button>

          {showDetailedMap && <div className="muscle-content">
            <div className="body-map-panel">
              <div className="body-map-title"><span>{selected?.name ?? 'Full weekly coverage'}</span><small>{selected ? labels || 'Muscle groups unavailable' : `${uniqueExerciseCount} unique exercises · ${summary.muscles.length} groups trained`}</small></div>
              <div className="body-map-pair" role="img" aria-label={selected ? `${selected.name} trains ${labels}` : `The complete weekly plan trains ${labels}`}>
                <BodyFigure view="front" muscles={muscles} colors={selected ? undefined : summary.colors} />
                <BodyFigure view="back" muscles={muscles} colors={selected ? undefined : summary.colors} />
              </div>
              {!selected ? <div className="summary-muscle-key"><span><i className="light" /> Light</span><span><i className="medium" /> Moderate</span><span><i className="high" /> High emphasis</span></div> : <div className="muscle-key"><span><i className="primary" /> Primary</span><span><i className="secondary" /> Supporting</span></div>}
            </div>

            <div className="muscle-detail-panel">
              {!selected ? <PlanSummaryDetail exercises={exercises} muscles={summary.muscles} averageLevel={summary.averageLevel} gradedExerciseCount={summary.gradedExerciseCount} /> : level ? <StrengthLevelDetail key={`${selectedEntry.key}:${level.index}`} level={level} /> : selected.type === 'cardio' ? <CardioDetail exercise={selected} /> : <UngradedStrengthDetail exercise={selected} />}
              <div className="trained-groups">
                <span className="muted-label">{selected ? 'TRAINED MUSCLES' : 'PLAN COVERAGE'}</span>
                <div>{muscles.primary.map((group) => <b key={group}>{MUSCLE_LABELS[group]}</b>)}{muscles.secondary.map((group) => <span key={group}>{MUSCLE_LABELS[group]}</span>)}</div>
              </div>
            </div>
          </div>}
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
  const averageDisplay = averageLevel === null ? null : averageLevel.toFixed(1);
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

function StrengthLevelDetail({ level }: { level: NonNullable<ReturnType<typeof strengthLevelForExercise>> }) {
  const [selectedIndex, setSelectedIndex] = useState(level.index);
  const levelNames = level.levelNames ?? STRENGTH_LEVELS.map((tier) => tier.name);
  const selectedTier = { ...STRENGTH_LEVELS[selectedIndex - 1], name: levelNames[selectedIndex - 1] };
  const selectedRange = level.ranges[selectedIndex - 1] ?? { min: level.rangeMin, max: level.rangeMax };
  const selectedMilestone = level.milestones?.[selectedIndex - 1];
  const formatWeightedHold = (weight: number, seconds: number) => `${weight ? `+${weight} kg added` : 'Bodyweight'} · ${seconds} sec`;
  const formatMetric = (value: number) => level.metric === 'assistanceEquivalent'
    ? value < 0 ? `${Math.abs(value)} kg assistance` : value === 0 ? 'Bodyweight' : `+${value} kg added`
    : level.isAddedWeight ? value === 0 ? 'Bodyweight' : `+${value} kg added`
    : `${value} ${level.unit}`;
  const loadSuffix = level.metric === 'weight' && !level.isAddedWeight ? level.isAssistance ? ' assistance' : level.loadMode === 'perSide' ? ' per side' : ' total' : '';
  const load = level.metric === 'weightedHold'
    ? formatWeightedHold(level.bestWeight ?? 0, level.bestSeconds ?? 0)
    : `${formatMetric(level.load)}${loadSuffix}`;
  const range = selectedMilestone
    ? formatWeightedHold(selectedMilestone.weight, selectedMilestone.seconds)
    : selectedRange.max === null
    ? level.isAddedWeight ? `${formatMetric(selectedRange.min)} or more` : `${formatMetric(selectedRange.min)}+`
    : level.isAssistance && level.metric === 'weight'
      ? `${formatMetric(selectedRange.min)}–${formatMetric(selectedRange.max)} assistance`
      : `${formatMetric(selectedRange.min)} to under ${formatMetric(selectedRange.max)}`;
  return (
    <div className="strength-level-detail">
      <span className="level-kicker">{selectedIndex === level.index ? 'CURRENT' : 'VIEWING'} LEVEL {selectedIndex} OF 10</span>
      <div className="level-title"><h4>{selectedTier.name}</h4><span style={{ background: selectedTier.color }}>{selectedIndex}</span></div>
      <div className="level-metrics">
        <div><span>{level.hasHistory ? 'BEST LOGGED' : 'PLAN LOAD'}</span><strong>{load}</strong></div>
        <div><span>LEVEL {selectedIndex} {selectedMilestone ? 'REQUIREMENT' : 'RANGE'}</span><strong>{range}</strong></div>
      </div>
      {selectedIndex !== level.index && <div className="level-current-note">CURRENT LEVEL · <strong>L{level.index} {level.name}</strong></div>}
      <div className="level-scale-heading"><span>EXPLORE LEVELS</span><small>Tap a level to view its range</small></div>
      <div className="level-scale" aria-label={`Current level ${level.index} of 10, ${level.name}. Choose a level to show its range.`}>
        {STRENGTH_LEVELS.map((tier, index) => {
          const tierIndex = index + 1;
          const tierName = levelNames[index];
          const classes = [tierIndex <= level.index ? 'reached' : '', tierIndex === level.index ? 'achieved' : '', tierIndex === selectedIndex ? 'selected' : ''].filter(Boolean).join(' ');
          return <button key={`${tierIndex}-${tierName}`} type="button" className={classes} style={{ '--tier-color': tier.color } as CSSProperties} aria-label={`Show level ${tierIndex}, ${tierName}, range${tierIndex === level.index ? ', current level' : ''}`} aria-pressed={tierIndex === selectedIndex} onClick={() => setSelectedIndex(tierIndex)}><span>{tierIndex}</span>{tierIndex === level.index && <i aria-hidden="true" />}</button>;
        })}
      </div>
      <div className="level-scale-labels"><span><b>L1</b> {levelNames[0]}</span><span><b>L6</b> {levelNames[5]}</span><span><b>L10</b> {levelNames[9]}</span></div>
      <p>{level.metric === 'weightedHold' ? 'Each level requires both the shown added weight and hold time. Your best completed set determines the current level.' : level.metric === 'assistanceEquivalent' ? 'Assistance is converted to an equivalent load: machine assistance is negative, while added external weight is positive.' : level.isAddedWeight ? 'Levels use only the external weight held at your chest; bodyweight is Level 1. Your best logged added load sets the level.' : level.isAssistance && level.metric === 'weight' ? 'Lower machine assistance is stronger. Your lowest logged assistance sets this level.' : level.metric === 'reps' ? 'Your best completed repetitions set this level.' : level.metric === 'seconds' ? 'Your best completed hold duration sets this level.' : level.loadMode === 'perSide' ? 'This exercise is measured per side. Personal targets do not change its level bands.' : 'Your best logged load sets the level. Personal targets are tracked separately and do not change the level bands.'}</p>
    </div>
  );
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
      <div className="level-metrics"><div><span>DURATION</span><strong>{exercise.durationMinutes} min</strong></div><div><span>TARGET</span><strong>{exercise.calories ? `${exercise.calories} kcal` : exercise.distanceKm ? `${exercise.distanceKm} km` : 'Time based'}</strong></div></div>
      <p>Cardio trains the highlighted muscles but is excluded from KG-based levels.</p>
    </div>
  );
}

function BodyFigure({ view, muscles, colors }: { view: 'front' | 'back'; muscles: ExerciseMuscles; colors?: Partial<Record<MuscleGroup, string>> }) {
  const region = (group: MuscleGroup) => ({
    className: muscles.primary.includes(group) ? 'muscle-region primary' : muscles.secondary.includes(group) ? 'muscle-region secondary' : 'muscle-region',
    style: colors?.[group] ? { '--region-color': colors[group] } as CSSProperties : undefined,
  });

  return (
    <figure className="body-figure">
      <svg viewBox="0 0 190 380" aria-hidden="true">
        <g className="body-silhouette">
          <path d="M95 8c-15 0-22 12-19 31l4 14c4 8 10 13 15 13s11-5 15-13l4-14c3-19-4-31-19-31z" />
          <path d="M83 55l-2 19c-13 3-27 8-35 19l-13 55 13 4 14-47 5 72c7 12 18 20 30 20s23-8 30-20l5-72 14 47 13-4-13-55c-8-11-22-16-35-19l-2-19c-7 8-17 8-24 0z" />
          <path d="M47 148l-13-3-13 55 10 3 18-37zM143 148l13-3 13 55-10 3-18-37z" />
          <path d="M21 198l10 2 3 20-5 16-4-2 1-13-3 12-4-2 2-14-4 12-4-3 5-21zM169 198l-10 2-3 20 5 16 4-2-1-13 3 12 4-2-2-14 4 12 4-3-5-21z" />
          <path d="M66 174c-5 20-5 39-2 59l9 55 16-1 6-77 6 77 16 1 9-55c3-20 3-39-2-59-18 15-40 15-58 0z" />
          <path d="M73 283l16-1-1 61-10 27H65l5-26zM117 283l-16-1 1 61 10 27h13l-5-26z" />
          <path d="M65 368h14l11 5v5H61zM125 368h-14l-11 5v5h29z" />
        </g>
        <g className="anatomy-lines">
          <path d="M95 67v127M64 177q31 18 62 0M48 99l14 8M142 99l-14 8M73 288l15 8M117 288l-15 8" />
        </g>
        {view === 'front' ? (
          <g>
            <path {...region('shoulders')} d="M81 76c-14 1-25 5-32 15l9 15c8-8 15-11 23-12zM109 76c14 1 25 5 32 15l-9 15c-8-8-15-11-23-12z" />
            <path {...region('chest')} d="M62 96c7-9 18-13 31-12v32c-15 3-27-2-35-10zM128 96c-7-9-18-13-31-12v32c15 3 27-2 35-10z" />
            <path {...region('biceps')} d="M47 107c8 2 12 10 10 25l-8 23-10-4 3-30zM143 107c-8 2-12 10-10 25l8 23 10-4-3-30z" />
            <path {...region('forearms')} d="M38 153l11 4-13 42-13-3zM152 153l-11 4 13 42 13-3z" />
            <g {...region('abs')}><rect x="83" y="120" width="10" height="16" rx="4" /><rect x="97" y="120" width="10" height="16" rx="4" /><rect x="82" y="139" width="11" height="16" rx="4" /><rect x="97" y="139" width="11" height="16" rx="4" /><rect x="83" y="158" width="10" height="16" rx="4" /><rect x="97" y="158" width="10" height="16" rx="4" /></g>
            <path {...region('obliques')} d="M64 116l16 4-2 52-12 8-6-34zM126 116l-16 4 2 52 12 8 6-34z" />
            <path {...region('adductors')} d="M91 203h4l-5 78-12-53zM99 203h-4l5 78 12-53z" />
            <path {...region('quads')} d="M69 199c8-3 15-1 22 5l-5 76-13 2-9-52zM121 199c-8-3-15-1-22 5l5 76 13 2 9-52z" />
            <path {...region('calves')} d="M72 292c8 1 13 9 13 25l-9 43-9 1 3-33zM118 292c-8 1-13 9-13 25l9 43 9 1-3-33z" />
          </g>
        ) : (
          <g>
            <path {...region('rearDelts')} d="M81 77c-13 1-24 5-32 15l9 14c8-7 15-11 23-12zM109 77c13 1 24 5 32 15l-9 14c-8-7-15-11-23-12z" />
            <path {...region('traps')} d="M84 68c6 8 16 8 22 0l18 17-29 34-29-34z" />
            <path {...region('upperBack')} d="M61 98l31 20-15 31-20-36zM129 98l-31 20 15 31 20-36z" />
            <path {...region('lats')} d="M58 110l19 40-8 31-12-15-3-42zM132 110l-19 40 8 31 12-15 3-42z" />
            <path {...region('triceps')} d="M47 107c8 2 12 10 10 25l-8 23-10-4 3-30zM143 107c-8 2-12 10-10 25l8 23 10-4-3-30z" />
            <path {...region('forearms')} d="M38 153l11 4-13 42-13-3zM152 153l-11 4 13 42 13-3z" />
            <path {...region('lowerBack')} d="M77 150h36l8 31-26 15-26-15z" />
            <path {...region('glutes')} d="M66 190c11-6 21-5 28 5l-2 29c-15 8-25 3-29-8zM124 190c-11-6-21-5-28 5l2 29c15 8 25 3 29-8z" />
            <path {...region('hamstrings')} d="M66 226c9-5 18-3 26 1l-6 54-13 1-9-50zM124 226c-9-5-18-3-26 1l6 54 13 1 9-50z" />
            <path {...region('calves')} d="M72 292c8 1 13 9 13 25l-9 43-9 1 3-33zM118 292c-8 1-13 9-13 25l9 43 9 1-3-33z" />
          </g>
        )}
      </svg>
      <figcaption>{view.toUpperCase()}</figcaption>
    </figure>
  );
}
