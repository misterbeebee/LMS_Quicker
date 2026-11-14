
export interface EncryptedPayload {
  cipherText: string;
  salt: string;
  iv: string;
}

export interface StoredCredentials {
  domain: string;
  useProxy: boolean;
  batchSize?: number;
  security: EncryptedPayload;
}

// Legacy fallback secret (kept only for migrating previously saved sessions)
export const APP_SECRET = "CANVAS_APP_INTERNAL_SECURE_KEY_V1_DO_NOT_SHARE";
const DEVICE_SECRET_KEY = "velm_device_key_v1";
const SEALED_PREFIX = "velm_tok_v1:";

/**
 * Returns a per-browser secret stored separately from encrypted/sealed payloads.
 */
export const getOrCreateDeviceSecret = (): string => {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(DEVICE_SECRET_KEY);
      if (existing && existing.length >= 16) return existing;
      const bytes = new Uint8Array(24);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      const generated = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_SECRET_KEY, generated);
      return generated;
    }
  } catch {
    // Fallback in non-browser contexts
  }
  return APP_SECRET;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Synchronously seals a profile token at rest in localStorage using the device secret.
 */
export const sealProfileToken = (token: string): string => {
  if (!token) return '';
  if (token.startsWith(SEALED_PREFIX)) return token;
  const secret = getOrCreateDeviceSecret();
  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(token);
  const keyBytes = encoder.encode(secret);
  const out = new Uint8Array(tokenBytes.length);
  for (let i = 0; i < tokenBytes.length; i++) {
    out[i] = tokenBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  const base64 = bytesToBase64(out);
  return `${SEALED_PREFIX}${base64}`;
};

/**
 * Unseals a stored profile token; transparently passes through legacy plaintext values.
 */
export const unsealProfileToken = (stored: string): string => {
  if (!stored) return '';
  if (!stored.startsWith(SEALED_PREFIX)) return stored;
  try {
    const raw = stored.slice(SEALED_PREFIX.length);
    const bytes = base64ToBytes(raw);
    const secret = getOrCreateDeviceSecret();
    const keyBytes = new TextEncoder().encode(secret);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return new TextDecoder().decode(out);
  } catch {
    return '';
  }
};

const ITERATIONS = 100000;
const SALT_LEN = 16;
const IV_LEN = 12;

// Utility to convert ArrayBuffer to Base64
const buffToBase64 = (buff: ArrayBuffer): string => bytesToBase64(new Uint8Array(buff));

// Utility to convert Base64 to Uint8Array
const base64ToBuff = (b64: string): Uint8Array => base64ToBytes(b64);

// 1. Generate Key Material from Password
const getKeyMaterial = (password: string): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
};

// 2. Derive the actual Encryption Key using PBKDF2
const getKey = (keyMaterial: CryptoKey, salt: Uint8Array): Promise<CryptoKey> => {
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const encryptData = async (text: string, passphrase: string): Promise<EncryptedPayload> => {
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LEN));
  
  const keyMaterial = await getKeyMaterial(passphrase);
  const key = await getKey(keyMaterial, salt);
  
  const enc = new TextEncoder();
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    enc.encode(text)
  );

  return {
    cipherText: buffToBase64(encrypted),
    salt: buffToBase64(salt),
    iv: buffToBase64(iv)
  };
};

export const decryptData = async (payload: EncryptedPayload, passphrase: string): Promise<string> => {
  const salt = base64ToBuff(payload.salt);
  const iv = base64ToBuff(payload.iv);
  const data = base64ToBuff(payload.cipherText);

  const keyMaterial = await getKeyMaterial(passphrase);
  const key = await getKey(keyMaterial, salt);

  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    throw new Error("Invalid passphrase or corrupted data");
  }
};
