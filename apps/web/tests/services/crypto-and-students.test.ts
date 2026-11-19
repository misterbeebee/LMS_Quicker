import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOrCreateDeviceSecret,
  sealProfileToken,
  unsealProfileToken,
  encryptData,
  decryptData,
} from '../../services/crypto';
import {
  getSavedStudents,
  saveStudent,
  updateStudent,
  updateStudentName,
  removeStudent,
  getActiveStudent,
  getActiveStudentId,
  setActiveStudentId,
  ensureProfileForLogin,
  getAcknowledgedFeedback,
  toggleAcknowledgeFeedback,
  acknowledgeAllComments,
} from '../../services/students';

describe('crypto service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates and persists a device secret', () => {
    const first = getOrCreateDeviceSecret();
    const second = getOrCreateDeviceSecret();
    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(second).toBe(first);
  });

  it('seals and unseals ASCII, Unicode, and long tokens without stack overflow', () => {
    const shortTok = '1234~abcd_XYZ-token';
    const sealed = sealProfileToken(shortTok);
    expect(sealed).toMatch(/^velm_tok_v1:/);
    expect(sealed).not.toContain(shortTok);
    expect(unsealProfileToken(sealed)).toBe(shortTok);

    // Idempotent sealing
    expect(sealProfileToken(sealed)).toBe(sealed);

    // Unicode / emoji handling
    const unicodeTok = 'tok_ñ_日本語_🔐';
    expect(unsealProfileToken(sealProfileToken(unicodeTok))).toBe(unicodeTok);

    // Long token (>32KB chunk boundary)
    const longTok = 'A'.repeat(70_000) + '~end';
    expect(unsealProfileToken(sealProfileToken(longTok))).toBe(longTok);
  });

  it('passes through legacy plaintext tokens and returns empty string on corrupt sealed tokens', () => {
    expect(unsealProfileToken('legacy_plaintext_token')).toBe('legacy_plaintext_token');
    expect(unsealProfileToken('velm_tok_v1:!!!not-valid-base64!!!')).toBe('');
    expect(sealProfileToken('')).toBe('');
    expect(unsealProfileToken('')).toBe('');
  });

  it('encrypts and decrypts payloads with AES-GCM and rejects wrong passphrases', async () => {
    const secretToken = '9876~super_secret_canvas_token';
    const encrypted = await encryptData(secretToken, 'correct-horse-battery');
    expect(encrypted.cipherText).not.toContain(secretToken);

    const decrypted = await decryptData(encrypted, 'correct-horse-battery');
    expect(decrypted).toBe(secretToken);

    await expect(decryptData(encrypted, 'wrong-passphrase')).rejects.toThrow(/Invalid passphrase/i);
  });
});

describe('students service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seals tokens at rest in localStorage and sanitizes domain/token on save & update', () => {
    const created = saveStudent({
      name: 'Alice',
      domain: 'https://mcpsmd.instructure.com/courses/101',
      apiKey: '  Bearer 1111~alice_tok  ',
      useProxy: true,
      batchSize: 4,
    });

    expect(created.domain).toBe('mcpsmd.instructure.com');
    expect(created.apiKey).toBe('1111~alice_tok');
    expect(getActiveStudentId()).toBe(created.id);

    const rawStored = localStorage.getItem('canvas_student_profiles_v2') || '';
    expect(rawStored).toContain('velm_tok_v1:');
    expect(rawStored).not.toContain('1111~alice_tok');

    const loaded = getSavedStudents();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].apiKey).toBe('1111~alice_tok');

    updateStudent({
      ...created,
      domain: 'https://other.instructure.com/',
      apiKey: 'Bearer 1111~updated_tok',
    });
    expect(getActiveStudent()?.domain).toBe('other.instructure.com');
    expect(getActiveStudent()?.apiKey).toBe('1111~updated_tok');
  });

  it('renames, deduplicates login profiles, and removes students with active fallback + ack cleanup', () => {
    const s1 = saveStudent({
      name: 'Student One',
      domain: 'school.instructure.com',
      apiKey: '1000~one',
      useProxy: true,
      batchSize: 2,
    });
    const s2 = saveStudent({
      name: 'Student Two',
      domain: 'school.instructure.com',
      apiKey: '2000~two',
      useProxy: true,
      batchSize: 2,
    });

    const renamed = updateStudentName(s1.id, '  Maya  ');
    expect(renamed?.name).toBe('Maya');

    // Deduplicates by sanitized domain + token
    const matched = ensureProfileForLogin('https://school.instructure.com/', 'Bearer 1000~one');
    expect(matched.id).toBe(s1.id);
    expect(getSavedStudents()).toHaveLength(2);
    expect(getActiveStudentId()).toBe(s1.id);

    // Feedback acknowledgments per student
    toggleAcknowledgeFeedback(s1.id, 901);
    acknowledgeAllComments(s2.id, [801, '802']);
    expect(getAcknowledgedFeedback(s1.id).has(901)).toBe(true);
    expect(getAcknowledgedFeedback(s2.id).has('802')).toBe(true);

    // Removing active student falls back to remaining student and cleans feedback acks
    setActiveStudentId(s2.id);
    removeStudent(s2.id);
    expect(getActiveStudentId()).toBe(s1.id);
    expect(getAcknowledgedFeedback(s2.id).size).toBe(0);
    expect(getAcknowledgedFeedback(s1.id).has(901)).toBe(true);
  });
});
