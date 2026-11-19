import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecretStore } from '@velm/core';

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface StoredSecretEntry {
  readonly encoding: 'safeStorage' | 'plain-fallback';
  readonly data: string;
}

interface SecretStoreFile {
  readonly version: 1;
  readonly entries: Record<string, StoredSecretEntry>;
}

/**
 * SecretStore backed by Electron's `safeStorage` (macOS Keychain, Windows DPAPI,
 * Linux Secret Service / KWallet) with atomic 0600 file persistence in `userData`.
 */
export function createSafeStorageSecretStore(
  filePath: string,
  safeStorage: SafeStorageLike
): SecretStore {
  let cache: Record<string, StoredSecretEntry> | null = null;

  async function load(): Promise<Record<string, StoredSecretEntry>> {
    if (cache !== null) return cache;
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SecretStoreFile>;
      if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        cache = { ...parsed.entries };
        return cache;
      }
    } catch {
      // File doesn't exist yet or couldn't be parsed; start fresh.
    }
    cache = {};
    return cache;
  }

  async function persist(entries: Record<string, StoredSecretEntry>): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const payload: SecretStoreFile = { version: 1, entries };
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    await fs.rename(tmpPath, filePath);
  }

  return {
    async get(key: string): Promise<string | null> {
      const entries = await load();
      const entry = entries[key];
      if (!entry) return null;
      if (entry.encoding === 'safeStorage') {
        if (!safeStorage.isEncryptionAvailable()) {
          return null;
        }
        try {
          return safeStorage.decryptString(Buffer.from(entry.data, 'base64'));
        } catch {
          return null;
        }
      }
      return Buffer.from(entry.data, 'base64').toString('utf-8');
    },

    async set(key: string, value: string): Promise<void> {
      const entries = await load();
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(value);
        entries[key] = {
          encoding: 'safeStorage',
          data: encrypted.toString('base64'),
        };
      } else {
        entries[key] = {
          encoding: 'plain-fallback',
          data: Buffer.from(value, 'utf-8').toString('base64'),
        };
      }
      await persist(entries);
    },

    async del(key: string): Promise<void> {
      const entries = await load();
      if (key in entries) {
        delete entries[key];
        await persist(entries);
      }
    },
  };
}
