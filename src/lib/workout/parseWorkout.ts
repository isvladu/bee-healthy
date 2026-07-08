import type {
  Exercise,
  ExerciseSet,
  ExerciseType,
  WorkoutSession,
  WorkoutWeek,
} from '@/lib/db/types';

export interface ParsedWorkout {
  title: string;
  weeks: WorkoutWeek[];
}

const KG_PER_LB = 0.45359237;

const WEEK_RE = /^week\s*(\d+)/i;
const SETS_RE = /(\d+)\s*[x×]\s*(\d+)/i; // 3x8, 3 x 8
const WEIGHT_RE = /@\s*(\d+(?:\.\d+)?)\s*(kg|lbs?)?/i; // @60kg, @135lb
const DURATION_RE = /(\d+(?:\.\d+)?)\s*(min|mins|minutes|hours?|hrs?)\b/i;
const SECONDS_RE = /(\d+)\s*(sec|secs|seconds|s)\b/i;
const DISTANCE_RE = /(\d+(?:\.\d+)?)\s*(km|miles?|mi|m)\b/i;

function looksLikeExercise(line: string): boolean {
  return (
    SETS_RE.test(line) ||
    /@\s*\d/.test(line) ||
    DURATION_RE.test(line) ||
    DISTANCE_RE.test(line)
  );
}

/** Parse a single exercise line like "Bench press 3x8 @60kg" or "Run 30min". */
export function parseExerciseLine(text: string): Exercise {
  let name = text;
  let reps: number | undefined;
  let weightKg: number | undefined;
  let setsCount = 1;
  let durationSec: number | undefined;
  let distanceKm: number | undefined;
  let cardio = false;

  const sets = SETS_RE.exec(text);
  if (sets) {
    setsCount = Number.parseInt(sets[1], 10);
    reps = Number.parseInt(sets[2], 10);
    name = name.replace(sets[0], ' ');
  }

  const weight = WEIGHT_RE.exec(text);
  if (weight) {
    const value = Number.parseFloat(weight[1]);
    const unit = (weight[2] ?? 'kg').toLowerCase();
    weightKg = unit.startsWith('lb') ? value * KG_PER_LB : value;
    name = name.replace(weight[0], ' ');
  }

  const duration = DURATION_RE.exec(text);
  if (duration) {
    const value = Number.parseFloat(duration[1]);
    const mult = duration[2].toLowerCase().startsWith('h') ? 3600 : 60;
    durationSec = value * mult;
    cardio = true;
    name = name.replace(duration[0], ' ');
  } else {
    const secs = SECONDS_RE.exec(text);
    if (secs) {
      durationSec = Number.parseInt(secs[1], 10);
      cardio = true;
      name = name.replace(secs[0], ' ');
    }
  }

  // Only treat a distance as cardio when there's no set/rep pattern (avoids
  // misreading the "8" in "3x8" or units inside a weight token).
  if (!sets) {
    const dist = DISTANCE_RE.exec(name);
    if (dist) {
      const value = Number.parseFloat(dist[1]);
      const unit = dist[2].toLowerCase();
      distanceKm =
        unit === 'm' ? value / 1000 : unit.startsWith('mi') ? value * 1.60934 : value;
      cardio = true;
      name = name.replace(dist[0], ' ');
    }
  }

  name = name
    .replace(/@/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[-–:]\s*$/, '')
    .trim();
  if (!name) name = text.trim();

  const type: ExerciseType = cardio && reps == null ? 'cardio' : 'strength';

  let setList: ExerciseSet[];
  if (type === 'cardio') {
    setList = [{ durationSec, distanceKm }];
  } else if (reps != null) {
    setList = Array.from({ length: Math.max(1, setsCount) }, () => ({
      reps,
      weightKg,
    }));
  } else {
    setList = weightKg != null ? [{ weightKg }] : [];
  }

  return { name, type, sets: setList };
}

/**
 * Parse a raw workout string into weeks → sessions → exercises. Week headers
 * ("Week 1"), session headers ("Mon — Push"), and exercise lines are detected by
 * shape and indentation. Robust to missing week/session headers.
 */
export function parseWorkout(raw: string): ParsedWorkout {
  const weeksMap = new Map<number, WorkoutSession[]>();
  let currentWeek = 1;
  let currentSession: WorkoutSession | null = null;

  function ensureWeek(index: number): WorkoutSession[] {
    let sessions = weeksMap.get(index);
    if (!sessions) {
      sessions = [];
      weeksMap.set(index, sessions);
    }
    return sessions;
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const week = WEEK_RE.exec(trimmed);
    if (week) {
      currentWeek = Number.parseInt(week[1], 10) || currentWeek;
      ensureWeek(currentWeek);
      currentSession = null;
      continue;
    }

    const indented = /^\s+/.test(rawLine);
    if (indented || looksLikeExercise(trimmed)) {
      if (!currentSession) {
        currentSession = { id: crypto.randomUUID(), exercises: [] };
        ensureWeek(currentWeek).push(currentSession);
      }
      currentSession.exercises.push(parseExerciseLine(trimmed));
    } else {
      currentSession = { id: crypto.randomUUID(), title: trimmed, exercises: [] };
      ensureWeek(currentWeek).push(currentSession);
    }
  }

  const weeks: WorkoutWeek[] = Array.from(weeksMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([weekIndex, sessions]) => ({ weekIndex, sessions }));

  return { title: 'Imported workout', weeks };
}
