import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, dietPlanRepo } from '@/lib/db/repositories';

// Mock the LLM client so we exercise the real generate → map → persist path
// without a live API call.
const hoisted = vi.hoisted(() => {
  const macros = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
  const generated = {
    title: 'Test Plan',
    summary: 'A test plan.',
    days: [
      {
        dayNumber: 1,
        meals: [
          { name: 'Breakfast', items: [{ name: 'Oats', quantity: 80, unit: 'g' }], macros },
        ],
        totalMacros: macros,
      },
      {
        dayNumber: 2,
        meals: [
          { name: 'Lunch', items: [{ name: 'Chicken', quantity: 150, unit: 'g' }], macros },
        ],
        totalMacros: macros,
      },
    ],
  };
  return {
    generated,
    fakeClient: {
      model: 'claude-sonnet-4-6',
      ping: async () => 'ok',
      streamChat: async function* () {},
      generateStructured: async () => generated,
    },
  };
});

vi.mock('@/hooks/useLLMClient', () => ({
  useLLMClient: () => hoisted.fakeClient,
}));

// Imported after the mock is declared (vitest hoists vi.mock above imports).
import { DietPlanner } from './DietPlanner';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('DietPlanner', () => {
  it('generates a plan and persists it to the database', async () => {
    render(
      <MemoryRouter>
        <DietPlanner />
      </MemoryRouter>,
    );

    const textarea = await screen.findByPlaceholderText(/Describe your goal/i);
    await userEvent.type(textarea, 'high protein, no dairy');

    // Request a 5-day plan; the mocked 2-day cycle should tile to fill it.
    const daysInput = screen.getByRole('spinbutton');
    await userEvent.clear(daysInput);
    await userEvent.type(daysInput, '5');

    await userEvent.click(screen.getByRole('button', { name: /Generate plan/i }));

    await waitFor(async () => {
      expect(await dietPlanRepo.listByCreatedDesc()).toHaveLength(1);
    });

    const [plan] = await dietPlanRepo.listByCreatedDesc();
    expect(plan.title).toBe('Test Plan');
    expect(plan.days).toHaveLength(5);
    // Day 1 is today; days are sequential and the cycle repeats.
    const today = new Date().toISOString().slice(0, 10);
    expect(plan.days[0].date).toBe(today);
    expect(plan.days[1].date > plan.days[0].date).toBe(true);
    expect(plan.days[2].meals[0].name).toBe(plan.days[0].meals[0].name);
    expect(plan.goalPrompt).toContain('high protein');
  });
});
