import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { issuePaths } from './issuePaths';
import { parseImportedDietPlan } from './dietImport';

const Schema = z.object({
  title: z.string(),
  days: z.array(z.object({ meals: z.array(z.object({ name: z.string() })) })),
});

function failure(input: unknown) {
  const result = Schema.safeParse(input);
  if (result.success) throw new Error('expected a validation failure');
  return result.error;
}

describe('issuePaths', () => {
  it('reports the field path of each issue', () => {
    const paths = issuePaths(
      failure({ title: 1, days: [{ meals: [{ name: 'omelette' }] }] }),
    );
    expect(paths).toBe('title');
  });

  it('reports nested paths with their indexes', () => {
    const paths = issuePaths(
      failure({ title: 'Cut', days: [{ meals: [{ name: 42 }] }] }),
    );
    expect(paths).toBe('days.0.meals.0.name');
  });

  it('emits the path but never the value sitting at it', () => {
    const error = failure({
      title: 'Cut',
      days: [{ meals: [{ name: ['chicken and rice'] }] }],
    });
    const paths = issuePaths(error);
    expect(paths).toBe('days.0.meals.0.name');
    expect(paths).not.toContain('chicken');
    // zod's own message is never included — it describes the received input.
    expect(paths).not.toMatch(/expected|received|invalid/i);
  });

  it('caps at three paths', () => {
    const paths = issuePaths(failure({ days: [{ meals: [{}] }, { meals: [{}] }] }));
    expect(paths.split(', ').length).toBeLessThanOrEqual(3);
  });

  it('names the root when an issue has no path', () => {
    expect(issuePaths(failure('not an object'))).toBe('(root)');
  });
});

describe('parseImportedDietPlan failure reporting', () => {
  it('surfaces a path, not the pasted content', () => {
    const pasted = JSON.stringify({
      title: 'Cut',
      days: [{ meals: [{ name: 'secret omelette', items: 'not-an-array' }] }],
    });
    expect(() => parseImportedDietPlan(pasted)).toThrow(/expected diet format/);
    // The thrown user-facing message must stay generic too.
    try {
      parseImportedDietPlan(pasted);
    } catch (err) {
      expect((err as Error).message).not.toContain('omelette');
    }
  });
});
