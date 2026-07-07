import { describe, expect, it } from 'vitest';
import { createLLMClient, LLMError } from './index';
import { mapAnthropicError } from './anthropic';

describe('createLLMClient', () => {
  it('builds an Anthropic client with the expected surface', () => {
    const client = createLLMClient({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test-not-real',
    });
    expect(client.model).toBe('claude-sonnet-4-6');
    expect(typeof client.ping).toBe('function');
    expect(typeof client.streamChat).toBe('function');
    expect(typeof client.generateStructured).toBe('function');
  });

  it('throws a friendly error for not-yet-supported providers', () => {
    expect(() =>
      createLLMClient({ provider: 'openai', model: 'x', apiKey: 'x' }),
    ).toThrowError(LLMError);
  });
});

describe('mapAnthropicError', () => {
  it('passes existing LLMErrors through unchanged', async () => {
    const original = new LLMError('boom', 'parse');
    expect(await mapAnthropicError(original)).toBe(original);
  });

  it('falls back to a generic message for unknown errors', async () => {
    const mapped = await mapAnthropicError(new Error('weird'));
    expect(mapped).toBeInstanceOf(LLMError);
    expect(mapped.kind).toBe('unknown');
  });
});
