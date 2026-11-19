import type { SecretStore } from '@velm/core';

export interface ExtensionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

const MASTER_KEY_STORAGE_ID = 'velm_ext_aes_key_v1';
const SECRET_PREFIX = 'velm_ext_secret_v1:';

interface EncryptedSecretBlob {
  readonly iv: string;
  readonly ciphertext: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * SecretStore for Chrome MV3 extension using WebCrypto AES-GCM-256 backed by
 * `chrome.storage.local` (extension-isolated, never touches page localStorage).
 */
export function createChromeSecretStore(storage: ExtensionStorageArea): SecretStore {
  let cachedKey: CryptoKey | null = null;

  async function getOrCreateKey(): Promise<CryptoKey> {
    if (cachedKey) return cachedKey;
    const existing = await storage.get(MASTER_KEY_STORAGE_ID);
    const rawB64 = existing[MASTER_KEY_STORAGE_ID];
    if (typeof rawB64 === 'string' && rawB64.length > 0) {
      const rawBytes = base64ToBytes(rawB64);
      cachedKey = await globalThis.crypto.subtle.importKey(
        'raw',
        rawBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      return cachedKey;
    }

    const generated = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', generated));
    await storage.set({ [MASTER_KEY_STORAGE_ID]: bytesToBase64(exported) });
    cachedKey = generated;
    return generated;
  }

  return {
    async get(key: string): Promise<string | null> {
      const storageKey = `${SECRET_PREFIX}${key}`;
      const result = await storage.get(storageKey);
      const blob = result[storageKey] as EncryptedSecretBlob | undefined;
      if (!blob || typeof blob.iv !== 'string' || typeof blob.ciphertext !== 'string') {
        return null;
      }
      try {
        const cryptoKey = await getOrCreateKey();
        const iv = base64ToBytes(blob.iv);
        const ciphertext = base64ToBytes(blob.ciphertext);
        const plainBuf = await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          cryptoKey,
          ciphertext
        );
        return new TextDecoder('utf-8').decode(plainBuf);
      } catch {
        return null;
      }
    },

    async set(key: string, value: string): Promise<void> {
      const cryptoKey = await getOrCreateKey();
      const iv = new Uint8Array(new ArrayBuffer(12));
      globalThis.crypto.getRandomValues(iv);
      const encoded = new TextEncoder().encode(value);
      const cipherBuf = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encoded
      );
      const blob: EncryptedSecretBlob = {
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
      };
      await storage.set({ [`${SECRET_PREFIX}${key}`]: blob });
    },

    async del(key: string): Promise<void> {
      await storage.remove(`${SECRET_PREFIX}${key}`);
    },
  };
}
