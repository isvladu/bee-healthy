import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionImportForm } from './SubscriptionImportForm';

const sample = JSON.stringify({
  title: 'My Plan',
  summary: 'A gym-aware plan.',
  days: [
    {
      label: 'Monday — Gym (AM)',
      meals: [
        { name: 'Breakfast', items: [{ name: 'Eggs', quantity: 3, unit: 'pieces' }] },
      ],
    },
    {
      label: 'Tuesday',
      meals: [
        { name: 'Lunch', items: [{ name: 'Beef', quantity: 200, unit: 'g' }] },
      ],
    },
  ],
});

describe('SubscriptionImportForm', () => {
  it('imports pasted JSON and calls savePlan with a mapped draft', async () => {
    const savePlan = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionImportForm goalPrompt="cut" totalDays={2} savePlan={savePlan} />,
    );

    const textarea = screen.getByPlaceholderText(/Paste the JSON reply/i);
    fireEvent.change(textarea, {
      target: { value: '```json\n' + sample + '\n```' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Import plan/i }));

    await waitFor(() => expect(savePlan).toHaveBeenCalledOnce());

    const draft = savePlan.mock.calls[0][0];
    expect(draft.title).toBe('My Plan');
    expect(draft.days).toHaveLength(2);
    expect(draft.days[0].label).toBe('Monday — Gym (AM)');
    expect(draft.days[0].meals[0].macros).toBeUndefined();
  });

  it('shows an error for unparseable text', async () => {
    const savePlan = vi.fn();
    render(
      <SubscriptionImportForm goalPrompt="cut" totalDays={2} savePlan={savePlan} />,
    );

    const textarea = screen.getByPlaceholderText(/Paste the JSON reply/i);
    fireEvent.change(textarea, { target: { value: 'no json here' } });
    fireEvent.click(screen.getByRole('button', { name: /Import plan/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(savePlan).not.toHaveBeenCalled();
  });
});
