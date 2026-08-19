import { describe, expect, it } from 'vitest';
import {
  MAX_PASSWORD_LENGTH as SERVER_MAX,
  MIN_PASSWORD_LENGTH as SERVER_MIN,
} from '../../../api/_lib/password';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './limits';

// `api/` and `src/` are separate TypeScript projects and can't import each
// other at build time, so the client keeps its own copy of these constants.
// Vitest compiles both, which lets this test hold the copies together.
describe('client/server limit mirror', () => {
  it('agrees with the server on the minimum password length', () => {
    // If these drift, the sign-up form happily accepts a password the server
    // rejects with a bare `invalid_input`.
    expect(MIN_PASSWORD_LENGTH).toBe(SERVER_MIN);
  });

  it('agrees with the server on the maximum password length', () => {
    expect(MAX_PASSWORD_LENGTH).toBe(SERVER_MAX);
  });
});
