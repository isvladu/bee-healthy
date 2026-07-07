import type { Table, UpdateSpec } from 'dexie';
import type { BaseRecord, SyncStatus } from '../types';

/** The shape needed to create a record — everything except the managed base fields. */
export type Draft<T extends BaseRecord> = Omit<T, keyof BaseRecord>;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Generic CRUD wrapper that stamps `id`, timestamps, and `syncStatus` so every
 * write goes through a single place (important for the future sync layer).
 */
export class Repository<T extends BaseRecord> {
  constructor(protected readonly table: Table<T, string>) {}

  async create(draft: Draft<T>): Promise<T> {
    const ts = nowIso();
    const record = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: ts,
      updatedAt: ts,
      syncStatus: 'pending' as SyncStatus,
    } as unknown as T;
    await this.table.add(record);
    return record;
  }

  get(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  list(): Promise<T[]> {
    return this.table.toArray();
  }

  async update(id: string, changes: Partial<Draft<T>>): Promise<void> {
    await this.table.update(id, {
      ...changes,
      updatedAt: nowIso(),
      syncStatus: 'pending',
    } as UpdateSpec<T>);
  }

  async remove(id: string): Promise<void> {
    await this.table.delete(id);
  }
}
