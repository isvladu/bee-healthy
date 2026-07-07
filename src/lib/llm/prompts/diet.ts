import type { ChatMessage } from '@/lib/llm';

export interface DietPlanRequest {
  goalPrompt: string;
  uniqueDays: number; // distinct days to generate (the cycle length)
  totalDays: number; // how long the plan runs
  targetCalories?: number;
}

export const DIET_SYSTEM_PROMPT = [
  'You are a registered dietitian creating practical, realistic meal plans.',
  'Use everyday foods and common measurements (g, ml, cups, pieces).',
  'Provide accurate macros (kcal, protein, carbs, fat in grams) for each meal and',
  'accurate per-day totals. Vary meals across days so the plan is not repetitive.',
  "Respect the user's stated goals, preferences, and restrictions.",
].join(' ');

export function buildDietPlanPrompt(req: DietPlanRequest): string {
  const lines = [
    `Create a ${req.uniqueDays}-day diet plan.`,
    `Goal and preferences: ${req.goalPrompt}`,
  ];
  if (req.targetCalories) {
    lines.push(`Aim for roughly ${req.targetCalories} kcal per day.`);
  }
  if (req.totalDays > req.uniqueDays) {
    lines.push(
      `This ${req.uniqueDays}-day cycle will repeat to cover a ${req.totalDays}-day plan, so keep the days varied and well-suited to weekly rotation.`,
    );
  }
  lines.push(
    `Return exactly ${req.uniqueDays} days numbered 1 to ${req.uniqueDays}.`,
    'Each day should have 3–5 meals with per-meal macros and accurate day totals.',
    'Also include a short title and a one-paragraph summary of the plan.',
  );
  return lines.join('\n');
}

/**
 * Prompt for users who generate their plan in their OWN Claude/ChatGPT subscription
 * and paste the result back. It asks for a single JSON block (so the app can import
 * it) while allowing the rich, training-aware content of a real plan.
 */
export function buildSubscriptionPrompt(req: DietPlanRequest): string {
  const target = req.targetCalories
    ? `Aim for roughly ${req.targetCalories} kcal per day.`
    : 'Estimate sensible portions for the goal.';

  return `You are a sports nutritionist. Create a ${req.totalDays}-day diet plan.

Goal and preferences: ${req.goalPrompt}
${target}

Reply with ONLY a single JSON code block (\`\`\`json … \`\`\`) and no other text. Use exactly this shape:

\`\`\`json
{
  "title": "short plan title",
  "summary": "one or two sentence overview",
  "days": [
    {
      "label": "Monday — Gym (AM)",
      "note": "optional context for the day",
      "meals": [
        {
          "name": "Post-gym",
          "items": [{ "name": "Whey + milk shake", "quantity": 300, "unit": "ml" }],
          "note": "optional",
          "macros": { "kcal": 250, "protein": 30, "carbs": 15, "fat": 6 }
        }
      ],
      "totalMacros": { "kcal": 2600, "protein": 190, "carbs": 260, "fat": 80 }
    }
  ]
}
\`\`\`

Rules:
- Return exactly ${req.totalDays} days.
- Use realistic foods and everyday measurements (g, ml, slice, tbsp, piece).
- Free-form meal names are encouraged (Breakfast, During gym, Post-gym, Lunch, Snack, Dinner…).
- Use "label" to reflect training/rest/event context and "note" for tips.
- "macros" and "totalMacros" are OPTIONAL — include them if you can estimate, otherwise omit those fields entirely.
- Output nothing outside the single JSON code block.`;
}

const COACH_SYSTEM_PROMPT =
  'You are a supportive nutrition coach. Be concise, practical, and encouraging.';

export function buildCoachTipsMessages(
  title: string,
  summary: string,
): { system: string; messages: ChatMessage[] } {
  return {
    system: COACH_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          `Give 3 short, practical tips for sticking to this diet plan.`,
          `Plan title: ${title}`,
          `Summary: ${summary}`,
          'Keep the whole response under 120 words. Use a simple numbered list.',
        ].join('\n'),
      },
    ],
  };
}
