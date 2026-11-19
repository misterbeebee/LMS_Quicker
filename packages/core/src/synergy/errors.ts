/**
 * Synergy / Edupoint error classification and Result error types.
 */

export type SynergyErrorCode =
  | 'AUTH_FAILED'
  | 'SOAP_DEPRECATED'
  | 'SSO_ONLY'
  | 'NETWORK_ERROR'
  | 'INVALID_DOMAIN'
  | 'PARSE_ERROR'
  | 'SYNERGY_ERROR';

export interface SynergyFailure {
  readonly code: SynergyErrorCode;
  readonly message: string;
}

export class SynergyError extends Error {
  readonly code: SynergyErrorCode;

  constructor(message: string, code: SynergyErrorCode = 'SYNERGY_ERROR') {
    super(message);
    this.name = 'SynergyError';
    this.code = code;
  }
}

export class SynergyAuthError extends SynergyError {
  constructor(message: string) {
    super(message, 'AUTH_FAILED');
    this.name = 'SynergyAuthError';
  }
}

export function extractRtError(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const rtErr = record['RT_ERROR'];
  if (rtErr && typeof rtErr === 'object' && !Array.isArray(rtErr)) {
    const errObj = rtErr as Record<string, unknown>;
    const attrMsg = errObj['@ERROR_MESSAGE'];
    if (typeof attrMsg === 'string' && attrMsg.trim()) return attrMsg.trim();
    const plainMsg = errObj['ERROR_MESSAGE'];
    if (typeof plainMsg === 'string' && plainMsg.trim()) return plainMsg.trim();
    return 'Synergy returned an error';
  }
  return null;
}

export function isDeprecatedSoapError(errMsg: string): boolean {
  const lowered = errMsg.toLowerCase();
  return lowered.includes('deprecated') || lowered.includes('d5517') || lowered.includes('d5518');
}

export function isAuthErrorMessage(errMsg: string): boolean {
  const lowered = errMsg.toLowerCase();
  return (
    lowered.includes('invalid') ||
    lowered.includes('password') ||
    lowered.includes('user id') ||
    lowered.includes('locked')
  );
}

/**
 * Normalize and validate a district domain (host only, stripped of protocol/path).
 * Returns null if invalid or unsafe (e.g. contains whitespace or invalid chars).
 */
export function normalizeDistrictDomain(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutProto = trimmed.replace(/^https?:\/\//i, '');
  const host = (withoutProto.split('/')[0] ?? '').trim().toLowerCase();
  if (!host) return null;
  // Reject localhost / raw IPs? In local-first apps we still allow domain names with at least one dot
  // and valid hostname chars (letters, digits, hyphens, dots, optional port for local test mocks).
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) {
    return null;
  }
  if (!host.includes('.') && !host.startsWith('localhost')) {
    return null;
  }
  return host;
}
