// Client-side mirror of the server's input limits.
//
// The browser and the `api/` tier are separate TypeScript projects, so these
// can't be imported from `api/_lib/password.ts` directly. `limits.test.ts`
// imports both and asserts they match, so the form can't start accepting a
// password the server will reject.

/** Keep in sync with `MIN_PASSWORD_LENGTH` in `api/_lib/password.ts`. */
export const MIN_PASSWORD_LENGTH = 10;

/** Keep in sync with `MAX_PASSWORD_LENGTH` in `api/_lib/password.ts`. */
export const MAX_PASSWORD_LENGTH = 200;
