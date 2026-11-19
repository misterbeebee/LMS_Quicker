import { createLocalBackend, type VelmBackend } from '@velm/core';
import { createBrowserHttpTransport } from './adapters/browser-transport.js';
import { createChromeBuiltinAdapter } from './adapters/chrome-builtin-ai.js';
import { createChromeSecretStore, type ExtensionStorageArea } from './adapters/chrome-secret-store.js';

declare global {
  interface Window {
    __VELM_BACKEND__?: VelmBackend;
  }
}

function getExtensionStorage(): ExtensionStorageArea {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return {
      get: (keys) => chrome.storage.local.get(keys),
      set: (items) => chrome.storage.local.set(items),
      remove: (keys) => chrome.storage.local.remove(keys),
    };
  }
  // Fallback for local preview outside extension runtime
  const mem = new Map<string, unknown>();
  return {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (mem.has(k)) out[k] = mem.get(k);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        mem.set(k, v);
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) mem.delete(k);
    },
  };
}

async function ensureHostPermission(originPattern: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) {
    return true;
  }
  try {
    const has = await chrome.permissions.contains({ origins: [originPattern] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [originPattern] });
  } catch {
    // Request may fail outside a user gesture; proceed so caller gets a clean fetch error if blocked.
    return false;
  }
}

const version =
  typeof chrome !== 'undefined' && chrome.runtime?.getManifest
    ? chrome.runtime.getManifest().version
    : '1.8.0';

const backend = createLocalBackend({
  version,
  platform: 'extension',
  transport: createBrowserHttpTransport({ ensureHostPermission }),
  secretStore: createChromeSecretStore(getExtensionStorage()),
  chromeBuiltin: createChromeBuiltinAdapter(),
});

window.__VELM_BACKEND__ = backend;
