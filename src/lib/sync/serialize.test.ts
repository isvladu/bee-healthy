import { describe, expect, it } from 'vitest';
import {
  mergeRemoteIntoLocal,
  sanitizeForSync,
  shouldApplyRemote,
} from './serialize';

describe('sanitizeForSync', () => {
  it('strips the local-only syncStatus from every table', () => {
    const out = sanitizeForSync('dietPlans', {
      id: '1',
      title: 'Plan',
      syncStatus: 'pending',
    });
    expect(out).not.toHaveProperty('syncStatus');
    expect(out.title).toBe('Plan');
  });

  it('never uploads the settings API key', () => {
    const out = sanitizeForSync('settings', {
      id: 'app',
      apiKey: 'sk-secret',
      units: 'metric',
      syncStatus: 'pending',
    });
    expect(out).not.toHaveProperty('apiKey');
    expect(out).not.toHaveProperty('syncStatus');
    expect(out.units).toBe('metric');
  });
});

describe('shouldApplyRemote', () => {
  it('applies when there is no local record', () => {
    expect(shouldApplyRemote('2026-07-09T00:00:00Z', undefined)).toBe(true);
  });

  it('applies when the remote record is newer or equal', () => {
    expect(shouldApplyRemote('2026-07-09T00:00:02Z', '2026-07-09T00:00:01Z')).toBe(
      true,
    );
    expect(shouldApplyRemote('2026-07-09T00:00:01Z', '2026-07-09T00:00:01Z')).toBe(
      true,
    );
  });

  it('keeps the local record when it is newer', () => {
    expect(shouldApplyRemote('2026-07-09T00:00:00Z', '2026-07-09T00:00:01Z')).toBe(
      false,
    );
  });
});

describe('mergeRemoteIntoLocal', () => {
  it('preserves the on-device API key when merging remote settings', () => {
    const merged = mergeRemoteIntoLocal(
      'settings',
      { id: 'app', units: 'imperial' },
      { id: 'app', apiKey: 'sk-local', units: 'metric' },
    );
    expect(merged.apiKey).toBe('sk-local');
    expect(merged.units).toBe('imperial');
  });

  it('does not invent an API key for non-settings tables', () => {
    const merged = mergeRemoteIntoLocal('dietPlans', { id: '1', title: 'P' }, undefined);
    expect(merged).not.toHaveProperty('apiKey');
  });
});
