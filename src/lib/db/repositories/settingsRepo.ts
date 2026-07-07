import type { UpdateSpec } from 'dexie';
import { db, defaultSettings, SETTINGS_ID } from '../schema';
import type { AppSettings } from '../types';

export type SettingsChanges = Partial<Omit<AppSettings, 'id' | 'createdAt'>>;

/** The settings singleton has a fixed id, so it gets its own small repository. */
export const settingsRepo = {
  get(): Promise<AppSettings | undefined> {
    return db.settings.get(SETTINGS_ID);
  },

  async getOrCreate(): Promise<AppSettings> {
    const existing = await db.settings.get(SETTINGS_ID);
    if (existing) return existing;
    const defaults = defaultSettings();
    await db.settings.put(defaults);
    return defaults;
  },

  async update(changes: SettingsChanges): Promise<void> {
    await db.settings.update(SETTINGS_ID, {
      ...changes,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    } as UpdateSpec<AppSettings>);
  },
};
