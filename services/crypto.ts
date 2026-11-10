
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

// Hardcoded application key for auto-login functionality
export const APP_SECRET = "CANVAS_APP_INTERNAL_SECURE_KEY_V1_DO_NOT_SHARE";

const ITERATIONS = 100000;
const SALT_LEN = 16;
const IV_LEN = 12;

// Utility to convert ArrayBuffer to Base64
const buffToBase64 = (buff: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buff)));

// Utility to convert Base64 to Uint8Array
const base64ToBuff = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

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
