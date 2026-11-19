import { describe, expect, it } from 'vitest';
import { createMemoryKvStore, createMemorySecretStore, systemClock } from './ports.js';

describe('@velm/core ports helpers', () => {
  it('stores, retrieves, and deletes secrets in memory', async () => {
    const store = createMemorySecretStore();
    expect(await store.get('missing')).toBeNull();
    await store.set('apiKey', 'secret-123');
    expect(await store.get('apiKey')).toBe('secret-123');
    await store.del('apiKey');
    expect(await store.get('apiKey')).toBeNull();
  });

  it('stores, retrieves, lists, and deletes kv entries in memory', async () => {
    const kv = createMemoryKvStore();
    await kv.set('student:1', { name: 'Maya' });
    await kv.set('student:2', { name: 'Sam' });
    await kv.set('settings:theme', 'light');
    expect(await kv.get<{ name: string }>('student:1')).toEqual({ name: 'Maya' });
    expect(await kv.keys?.('student:')).toEqual(['student:1', 'student:2']);
    await kv.del('student:1');
    expect(await kv.get('student:1')).toBeNull();
  });

  it('provides an ISO timestamp from systemClock', () => {
    expect(systemClock.isoNow()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
