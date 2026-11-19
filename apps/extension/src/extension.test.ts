import { describe, expect, it } from 'vitest';
import { createLocalBackend } from '@velm/core';
import { createBrowserHttpTransport } from './adapters/browser-transport.js';
import { createChromeBuiltinAdapter } from './adapters/chrome-builtin-ai.js';
import { createChromeSecretStore, type ExtensionStorageArea } from './adapters/chrome-secret-store.js';

function createMemoryExtensionStorage(): {
  area: ExtensionStorageArea;
  backing: Map<string, unknown>;
} {
  const backing = new Map<string, unknown>();
  const area: ExtensionStorageArea = {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (backing.has(k)) out[k] = backing.get(k);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        backing.set(k, v);
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) {
        backing.delete(k);
      }
    },
  };
  return { area, backing };
}

describe('@velm/extension MV3 adapters', () => {
  it('encrypts secrets with WebCrypto AES-GCM in ChromeSecretStore', async () => {
    const { area, backing } = createMemoryExtensionStorage();
    const store = createChromeSecretStore(area);

    await store.set('llm:gemini', 'AIzaSy-secret-key-999');
    expect(await store.get('llm:gemini')).toBe('AIzaSy-secret-key-999');

    // Stored value must not contain plaintext
    const rawBlob = JSON.stringify(backing.get('velm_ext_secret_v1:llm:gemini'));
    expect(rawBlob).not.toContain('AIzaSy-secret-key-999');
    expect(rawBlob).toContain('ciphertext');

    // Fresh store instance reuses persisted key from storage
    const store2 = createChromeSecretStore(area);
    expect(await store2.get('llm:gemini')).toBe('AIzaSy-secret-key-999');

    await store2.del('llm:gemini');
    expect(await store2.get('llm:gemini')).toBeNull();
  });

  it('requests optional host permissions and sends credentials: include in BrowserHttpTransport', async () => {
    const requestedOrigins: string[] = [];
    const seenInits: Array<RequestInit | undefined> = [];

    const transport = createBrowserHttpTransport({
      ensureHostPermission: async (origin) => {
        requestedOrigins.push(origin);
        return true;
      },
      fetchImpl: async (_url, init) => {
        seenInits.push(init);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const res = await transport.request({
      url: 'https://sis.example.edu/PXP2_Gradebook.aspx',
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(requestedOrigins).toEqual(['https://sis.example.edu/*']);
    expect(seenInits[0]?.credentials).toBe('include');
  });

  it('feature-detects Chrome Built-in AI and enforces single-student-per-profile metadata (D4)', async () => {
    const unavailable = createChromeBuiltinAdapter({});
    expect(await unavailable.isAvailable()).toBe(false);

    let destroyed = false;
    const available = createChromeBuiltinAdapter({
      LanguageModel: {
        availability: async () => 'available',
        create: async () => ({
          prompt: async (p: string) => `Nano reply: ${p}`,
          destroy: () => {
            destroyed = true;
          },
        }),
      },
    });

    expect(await available.isAvailable()).toBe(true);
    expect(await available.generate('Hello')).toBe('Nano reply: Hello');
    expect(destroyed).toBe(true);

    const { area } = createMemoryExtensionStorage();
    const backend = createLocalBackend({
      version: '1.8.0-ext-test',
      platform: 'extension',
      transport: createBrowserHttpTransport({
        fetchImpl: async () => new Response('{}', { status: 200 }),
      }),
      secretStore: createChromeSecretStore(area),
      chromeBuiltin: available,
    });

    const meta = await backend.getMeta();
    expect(meta.platform).toBe('extension');
    expect(meta.multiStudentSupported).toBe(false);

    const presets = await backend.llm.listPresets();
    expect(presets.some((p) => p.id === 'chrome-builtin')).toBe(true);
    expect(presets.some((p) => p.id === 'ollama')).toBe(false);
  });
});
