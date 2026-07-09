import type { ChatMessage } from '@/lib/llm';

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

const INSIGHTS_SYSTEM_PROMPT =
  'You are a strength & conditioning coach. Give concise, specific, actionable advice grounded in the data.';

export function buildInsightsMessages(summary: string): {
  system: string;
  messages: ChatMessage[];
} {
  return {
    system: INSIGHTS_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          'Based on this week-by-week training data, give 3–4 short insights on',
          'progress and how to improve next week (progression, volume, balance).',
          'Keep the whole reply under 150 words as a numbered list.',
          '',
          summary,
        ].join('\n'),
      },
    ],
  };
}
