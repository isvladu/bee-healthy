// Friendly text for the server's machine-readable error codes.
//
// The server deliberately answers with bare codes so it never leaks a database
// message or hints at whether an account exists; turning those into sentences
// is the client's job, and doing it in one place keeps the wording consistent
// across the settings card and the verify/reset pages.

import { BackendError } from './client';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'That email and password combination didn’t match.',
  account_locked:
    'Too many failed attempts. Try again in a few minutes, or reset your password.',
  rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
  email_taken: 'An account already exists for that email — try signing in.',
  invalid_input: 'Check the form: your email or password looks invalid.',
  invalid_token: 'That link has expired or was already used. Request a new one.',
  unauthenticated: 'Your session expired. Please sign in again.',
  network_unavailable: 'You appear to be offline. Your data is saved on this device.',
  backend_unconfigured: 'Cloud sync isn’t configured on the server yet.',
  backend_unavailable: 'Cloud sync isn’t available on this deployment.',
  forbidden_origin: 'The request was blocked as cross-site. Try reloading the app.',
  payload_too_large: 'That request was too large to send.',
  internal_error: 'Something went wrong on our side. Please try again.',
};

export function backendMessage(err: unknown): string {
  if (err instanceof BackendError) {
    return MESSAGES[err.code] ?? 'Something went wrong. Please try again.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
