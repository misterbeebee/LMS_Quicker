import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { asCookieScopeId, createLocalBackend, createMemorySecretStore } from '@velm/core';
import { accountIdToPartition, createElectronCookieScope } from './adapters/cookie-scope.js';
import { createElectronHttpTransport } from './adapters/electron-transport.js';
import { createSafeStorageSecretStore, type SafeStorageLike } from './adapters/safe-storage.js';
import { registerVelmIpcHandlers, VELM_IPC_CHANNELS, type IpcMainLike } from './ipc.js';

const tmpDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'velm-desktop-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('@velm/desktop adapters and IPC', () => {
  it('maps student account IDs to sanitized persistent Electron partitions', async () => {
    expect(accountIdToPartition('Student #1 (Maya)')).toBe('persist:svue-student_1_maya');
    expect(accountIdToPartition('   ')).toBe('persist:svue-default');

    const scope = createElectronCookieScope();
    const lease = await scope.acquire('alice@school.edu');
    expect(lease.id).toBe('persist:svue-alice_school_edu');
    await lease.release();
  });

  it('encrypts, persists, reloads, and deletes secrets with SafeStorageSecretStore', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'secrets.v1.json');

    // Simple reversible XOR mock for Electron safeStorage
    const mockSafeStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: (plain) => Buffer.from(Buffer.from(plain, 'utf-8').map((b) => b ^ 0x5a)),
      decryptString: (enc) => Buffer.from(enc.map((b) => b ^ 0x5a)).toString('utf-8'),
    };

    const store1 = createSafeStorageSecretStore(filePath, mockSafeStorage);
    await store1.set('llm:openai', 'sk-test-12345');
    expect(await store1.get('llm:openai')).toBe('sk-test-12345');

    // Ensure plaintext is NOT stored on disk
    const rawDisk = await fs.readFile(filePath, 'utf-8');
    expect(rawDisk).not.toContain('sk-test-12345');
    expect(rawDisk).toContain('"safeStorage"');

    // Fresh instance reloads encrypted secret from disk
    const store2 = createSafeStorageSecretStore(filePath, mockSafeStorage);
    expect(await store2.get('llm:openai')).toBe('sk-test-12345');

    await store2.del('llm:openai');
    expect(await store2.get('llm:openai')).toBeNull();
  });

  it('routes requests through per-partition fetch in ElectronHttpTransport', async () => {
    const seenScopes: Array<string | undefined> = [];
    const transport = createElectronHttpTransport({
      getFetchForScope(scope) {
        seenScopes.push(scope);
        return async (url) =>
          new Response(JSON.stringify({ ok: true, url }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
      },
    });

    const res = await transport.request({
      url: 'https://sis.example.edu/PXP2_Login.aspx',
      method: 'GET',
      scope: asCookieScopeId('persist:svue-student_a'),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(await res.text())).toEqual({
      ok: true,
      url: 'https://sis.example.edu/PXP2_Login.aspx',
    });
    expect(seenScopes).toEqual(['persist:svue-student_a']);
  });

  it('validates IPC payloads with Zod and blocks non-http(s) URLs in httpRequest', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const ipcMain: IpcMainLike = {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
    };

    const transport = createElectronHttpTransport({
      getFetchForScope: () => async () =>
        new Response('{"hello":"world"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    const backend = createLocalBackend({
      version: '1.8.0-desktop-test',
      platform: 'desktop',
      transport,
      secretStore: createMemorySecretStore(),
      cookieScope: createElectronCookieScope(),
    });

    registerVelmIpcHandlers(ipcMain, backend);

    const meta = await handlers.get(VELM_IPC_CHANNELS.getMeta)?.({});
    expect(meta).toMatchObject({
      platform: 'desktop',
      version: '1.8.0-desktop-test',
      multiStudentSupported: true,
    });

    // Reject file:// SSRF attempt
    await expect(
      handlers.get(VELM_IPC_CHANNELS.httpRequest)?.({}, {
        url: 'file:///etc/passwd',
        method: 'GET',
      })
    ).rejects.toThrow();

    // Reject loopback SSRF attempts via httpRequest (local LLM uses dedicated llm:* IPC channels)
    await expect(
      handlers.get(VELM_IPC_CHANNELS.httpRequest)?.({}, {
        url: 'http://127.0.0.1:11434/api/tags',
        method: 'GET',
      })
    ).rejects.toThrow();

    await expect(
      handlers.get(VELM_IPC_CHANNELS.httpRequest)?.({}, {
        url: 'https://localhost:8443/internal',
        method: 'GET',
      })
    ).rejects.toThrow();

    // Allow https:// request
    const httpRes = await handlers.get(VELM_IPC_CHANNELS.httpRequest)?.({}, {
      url: 'https://canvas.example.edu/api/v1/courses',
      method: 'GET',
    });
    expect(httpRes).toMatchObject({ status: 200, text: '{"hello":"world"}' });

    // Secrets round-trip via IPC
    await handlers.get(VELM_IPC_CHANNELS.secretsSet)?.({}, { key: 'llm:gemini', value: 'AIza-test' });
    expect(await handlers.get(VELM_IPC_CHANNELS.secretsHas)?.({}, 'llm:gemini')).toBe(true);
    await handlers.get(VELM_IPC_CHANNELS.secretsDel)?.({}, 'llm:gemini');
    expect(await handlers.get(VELM_IPC_CHANNELS.secretsHas)?.({}, 'llm:gemini')).toBe(false);
  });
});
