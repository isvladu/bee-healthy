export const WORKOUT_SYSTEM_PROMPT = [
  'You parse raw workout text into structured data.',
  'Identify weeks, sessions (training days), and exercises with sets/reps/weight.',
  'Use 0 for fields that do not apply: weightKg for bodyweight exercises,',
  'sets/reps for cardio, and durationMin for strength exercises.',
].join(' ');

export function buildWorkoutParsePrompt(raw: string): string {
  return [
    'Parse this workout into weeks, sessions, and exercises.',
    'If there are no explicit weeks, put everything in week 1.',
    'For "3x8 @60kg" that means 3 sets of 8 reps at 60 kg.',
    '',
    raw,
  ].join('\n');
}
