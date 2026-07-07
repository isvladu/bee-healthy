import { describe, expect, it } from 'vitest';
import { buildDietPlanPrompt, buildSubscriptionPrompt } from './diet';

const base = { goalPrompt: 'high protein', uniqueDays: 7, totalDays: 7 };

describe('buildDietPlanPrompt', () => {
  it('includes allergies and country when provided', () => {
    const prompt = buildDietPlanPrompt({
      ...base,
      avoid: 'peanuts, shellfish',
      country: 'Romania',
    });
    expect(prompt).toContain('STRICTLY EXCLUDE');
    expect(prompt).toContain('peanuts, shellfish');
    expect(prompt).toContain('Romania');
  });

  it('omits the constraint lines when not provided', () => {
    const prompt = buildDietPlanPrompt(base);
    expect(prompt).not.toContain('STRICTLY EXCLUDE');
    expect(prompt).not.toContain('lives in');
  });

  it('ignores whitespace-only values', () => {
    const prompt = buildDietPlanPrompt({ ...base, avoid: '   ', country: '  ' });
    expect(prompt).not.toContain('STRICTLY EXCLUDE');
    expect(prompt).not.toContain('lives in');
  });
});

describe('buildSubscriptionPrompt', () => {
  it('includes allergies and country in the copy-paste prompt', () => {
    const prompt = buildSubscriptionPrompt({
      ...base,
      avoid: 'dairy',
      country: 'Japan',
    });
    expect(prompt).toContain('STRICTLY EXCLUDE');
    expect(prompt).toContain('dairy');
    expect(prompt).toContain('Japan');
    // still asks for a JSON block
    expect(prompt).toContain('```json');
  });
});
