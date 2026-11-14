import { logger } from './logger';

export interface CanvasProfileSummary {
  id?: number;
  name?: string;
  shortName?: string;
  sortableName?: string;
  email?: string;
  sisUserId?: string;
  loginId?: string;
}

export interface StudentVueProfileSummary {
  name?: string;
  permId?: string;
  email?: string;
  school?: string;
  grade?: string;
}

export interface AccountComparisonResult {
  matched: boolean;
  confidence: 'high' | 'medium' | 'low';
  matchReasons: string[];
  mismatchReasons: string[];
  warnings: string[];
  canvasProfile: CanvasProfileSummary;
  studentVueProfile: StudentVueProfileSummary;
  checkedAt: string;
}

export interface StudentVueVerifyRequest {
  apiServerUrl: string;
  apiUsername: string;
  apiPassword: string;
  districtDomain: string;
  edupointUsername: string;
  edupointPassword: string;
  isParent: boolean;
  canvasDomain: string;
  canvasToken: string;
  useProxy: boolean;
}

export type VerifyStage =
  | 'config'
  | 'canvas_profile'
  | 'api_auth'
  | 'edupoint_session'
  | 'student_info'
  | 'unknown';

export type StudentVueVerifyOutcome =
  | { ok: true; comparison: AccountComparisonResult }
  | { ok: false; stage: VerifyStage; error: string };

const DEFAULT_TIMEOUT_MS = 20000;

export interface SynergyEndpointOption {
  domain: string;
  label: string;
}

export const SYNERGY_ENDPOINT_OPTIONS: SynergyEndpointOption[] = [
  { domain: 'md-mcps-psv.edupoint.com', label: 'Montgomery County Public Schools (MD)' },
  { domain: 'portal.sfusd.edu', label: 'San Francisco Unified (CA)' },
  { domain: 'sisstudent.fcps.edu', label: 'Fairfax County Public Schools (VA)' },
  { domain: 'or-psd-psv.edupoint.com', label: 'Portland Public Schools (OR)' },
  { domain: 'studentvue.beaverton.k12.or.us', label: 'Beaverton School District (OR)' },
];

/**
 * Extract clean Synergy district hostname from URL, path, or bare host input.
 */
export function normalizeSynergyDomain(raw?: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .trim();
}

/**
 * Suggest a plausible Synergy endpoint based on the active Canvas domain when recognizable.
 */
export function inferSuggestedSynergyDomain(canvasDomain?: string): string {
  if (typeof canvasDomain !== 'string') return '';
  const lower = canvasDomain.toLowerCase();
  if (lower.includes('mcpsmd')) return 'md-mcps-psv.edupoint.com';
  if (lower.includes('sfusd')) return 'portal.sfusd.edu';
  if (lower.includes('fcps')) return 'sisstudent.fcps.edu';
  if (lower.includes('pps.net')) return 'or-psd-psv.edupoint.com';
  if (lower.includes('beaverton')) return 'studentvue.beaverton.k12.or.us';
  return '';
}

/**
 * Safely convert unknown API/FastAPI/Synergy error payloads into readable strings without throwing or returning "[object Object]".
 */
export function formatApiErrorDetail(detail: unknown, fallbackStatus?: number): string {
  if (typeof detail === 'string') {
    const trimmed = detail.trim();
    if (trimmed) return trimmed;
  } else if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const loc = Array.isArray(rec.loc) ? rec.loc.filter((l) => l !== 'body').join('.') : '';
          const msg = typeof rec.msg === 'string' ? rec.msg : JSON.stringify(item);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(item ?? '');
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join('; ');
  } else if (detail && typeof detail === 'object') {
    const rec = detail as Record<string, unknown>;
    const candidate = rec.message ?? rec.error ?? rec.detail ?? rec.ErrorMessage;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    try {
      return JSON.stringify(detail).slice(0, 300);
    } catch {
      // ignore stringify errors on weird objects
    }
  }
  return fallbackStatus ? `HTTP ${fallbackStatus}` : 'Unknown server error';
}

/**
 * Unwrap badgerfish XML-to-JSON values like { "$": "John Doe" } or plain strings.
 */
function unwrapBadgerfish(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string' || typeof val === 'number') {
    const s = String(val).trim();
    return s.length > 0 ? s : undefined;
  }
  if (typeof val === 'object' && '$' in (val as Record<string, unknown>)) {
    const inner = (val as Record<string, unknown>)['$'];
    if (typeof inner === 'string' || typeof inner === 'number') {
      const s = String(inner).trim();
      return s.length > 0 ? s : undefined;
    }
  }
  return undefined;
}

/**
 * Normalize a person's name so "Doe, John" and "John Doe" compare cleanly.
 */
function normalizeNameTokens(raw?: string): string[] {
  if (typeof raw !== 'string') return [];
  // Remove parenthetical nicknames/pronouns and punctuation
  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .trim();
  if (!cleaned) return [];
  return cleaned.split(/\s+/).filter(Boolean);
}

function namesMatch(a?: string, b?: string): boolean {
  const tokensA = normalizeNameTokens(a);
  const tokensB = normalizeNameTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Exact sorted token match (handles "Last, First" vs "First Last")
  const sortedA = [...tokensA].sort().join(' ');
  const sortedB = [...tokensB].sort().join(' ');
  if (sortedA === sortedB) return true;

  // Subset match when one source includes a middle name/initial and the other doesn't
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;
  if (smaller.size >= 2) {
    let allPresent = true;
    for (const t of smaller) {
      if (!larger.has(t)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) return true;
  }

  return false;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeParseJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { detail: text.slice(0, 300) };
    }
  } catch {
    return {};
  }
}

function buildCanvasUrl(domain: string, endpointPath: string, useProxy: boolean): string {
  const cleanDomain = (typeof domain === 'string' ? domain : '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const targetUrl = `https://${cleanDomain}${cleanPath}`;
  if (useProxy) {
    return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  }
  return targetUrl;
}

/**
 * Fetch the active Canvas user's profile info (/api/v1/users/self + /users/self/profile).
 * Never throws; returns null on failure after logging.
 */
async function fetchCanvasProfileForVerification(
  domain: string,
  token: string,
  useProxy: boolean
): Promise<{ ok: true; profile: CanvasProfileSummary } | { ok: false; error: string }> {
  if (!domain || !token) {
    return { ok: false, error: 'Active Canvas session credentials are missing.' };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/json',
  };

  const summary: CanvasProfileSummary = {};
  let anySucceeded = false;

  try {
    const selfRes = await fetchWithTimeout(
      buildCanvasUrl(domain, '/api/v1/users/self', useProxy),
      { headers },
      15000
    );
    if (selfRes.ok) {
      const data = await safeParseJson(selfRes);
      anySucceeded = true;
      summary.id = typeof data?.id === 'number' ? data.id : undefined;
      summary.name = typeof data?.name === 'string' ? data.name.trim() : undefined;
      summary.shortName = typeof data?.short_name === 'string' ? data.short_name.trim() : undefined;
      summary.sortableName = typeof data?.sortable_name === 'string' ? data.sortable_name.trim() : undefined;
      summary.sisUserId = typeof data?.sis_user_id === 'string' ? data.sis_user_id.trim() : undefined;
      summary.loginId = typeof data?.login_id === 'string' ? data.login_id.trim() : undefined;
      summary.email = typeof data?.email === 'string' ? data.email.trim() : undefined;
    }
  } catch (err: any) {
    logger.warn('[StudentVUE Verify] Canvas /users/self fetch failed', err?.message || String(err));
  }

  try {
    const profRes = await fetchWithTimeout(
      buildCanvasUrl(domain, '/api/v1/users/self/profile', useProxy),
      { headers },
      15000
    );
    if (profRes.ok) {
      const data = await safeParseJson(profRes);
      anySucceeded = true;
      summary.id = summary.id ?? (typeof data?.id === 'number' ? data.id : undefined);
      summary.name = summary.name || (typeof data?.name === 'string' ? data.name.trim() : undefined);
      summary.shortName = summary.shortName || (typeof data?.short_name === 'string' ? data.short_name.trim() : undefined);
      summary.sortableName = summary.sortableName || (typeof data?.sortable_name === 'string' ? data.sortable_name.trim() : undefined);
      summary.sisUserId = summary.sisUserId || (typeof data?.sis_user_id === 'string' ? data.sis_user_id.trim() : undefined);
      summary.loginId = summary.loginId || (typeof data?.login_id === 'string' ? data.login_id.trim() : undefined);
      summary.email =
        summary.email ||
        (typeof data?.primary_email === 'string' ? data.primary_email.trim() : undefined) ||
        (typeof data?.email === 'string' ? data.email.trim() : undefined);
    }
  } catch (err: any) {
    logger.warn('[StudentVUE Verify] Canvas /users/self/profile fetch failed', err?.message || String(err));
  }

  if (!anySucceeded) {
    return {
      ok: false,
      error: 'Could not retrieve Canvas user profile. (Demo mode or restricted Canvas token?)',
    };
  }

  return { ok: true, profile: summary };
}

/**
 * Compare Canvas profile info with StudentVUE StudentInfo.
 */
export function compareStudentProfiles(
  canvasProfile: CanvasProfileSummary,
  studentVueProfile: StudentVueProfileSummary
): AccountComparisonResult {
  const matchReasons: string[] = [];
  const mismatchReasons: string[] = [];
  const warnings: string[] = [];

  // 1. Compare Names
  const canvasNames = [canvasProfile?.name, canvasProfile?.shortName, canvasProfile?.sortableName].filter(
    (n): n is string => typeof n === 'string' && Boolean(n.trim())
  );
  const svName = typeof studentVueProfile?.name === 'string' ? studentVueProfile.name : undefined;

  if (svName && canvasNames.length > 0) {
    const anyNameMatched = canvasNames.some((cn) => namesMatch(cn, svName));
    if (anyNameMatched) {
      matchReasons.push(`Name matches ("${svName}")`);
    } else {
      mismatchReasons.push(
        `Name differs: Canvas "${canvasNames[0]}" vs StudentVUE "${svName}"`
      );
    }
  } else {
    warnings.push('Could not compare names (missing name in one of the profiles).');
  }

  // 2. Compare Student ID (PermID vs sis_user_id / login_id)
  const svPermId = typeof studentVueProfile?.permId === 'string' ? studentVueProfile.permId.trim() : '';
  const canvasIds = [canvasProfile?.sisUserId, canvasProfile?.loginId]
    .filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
    .map((v) => v.trim());

  if (svPermId && canvasIds.length > 0) {
    const idMatched = canvasIds.some(
      (cid) =>
        cid.toLowerCase() === svPermId.toLowerCase() ||
        cid.toLowerCase().startsWith(`${svPermId.toLowerCase()}@`)
    );
    if (idMatched) {
      matchReasons.push(`Student ID matches (${svPermId})`);
    } else {
      warnings.push(
        `Canvas ID (${canvasIds[0]}) did not directly match StudentVUE PermID (${svPermId}).`
      );
    }
  }

  // 3. Compare Email (if available in both)
  const svEmail = typeof studentVueProfile?.email === 'string' ? studentVueProfile.email.trim().toLowerCase() : '';
  const canvasEmail = typeof canvasProfile?.email === 'string' ? canvasProfile.email.trim().toLowerCase() : '';
  if (svEmail && canvasEmail) {
    if (svEmail === canvasEmail) {
      matchReasons.push(`Email matches (${svEmail})`);
    } else {
      mismatchReasons.push(`Email differs: Canvas "${canvasEmail}" vs StudentVUE "${svEmail}"`);
    }
  }

  const matched = matchReasons.length > 0 && mismatchReasons.length === 0;
  const confidence: 'high' | 'medium' | 'low' =
    matchReasons.length >= 2 && mismatchReasons.length === 0
      ? 'high'
      : matched
      ? 'medium'
      : 'low';

  return {
    matched,
    confidence,
    matchReasons,
    mismatchReasons,
    warnings,
    canvasProfile: canvasProfile || {},
    studentVueProfile: studentVueProfile || {},
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Transiently log into schoolview-api -> StudentVUE, fetch StudentInfo,
 * and compare against the active Canvas account profile.
 *
 * Guarantees:
 * - Never stores Edupoint/StudentVUE username or password anywhere.
 * - Catches, wraps, and logs every error so the main Canvas app is never affected.
 */
export async function verifyStudentVueAccount(
  req: StudentVueVerifyRequest
): Promise<StudentVueVerifyOutcome> {
  let stage: VerifyStage = 'config';

  try {
    const baseUrl = (typeof req?.apiServerUrl === 'string' ? req.apiServerUrl : '').trim().replace(/\/+$/, '');
    if (!baseUrl || (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://'))) {
      return {
        ok: false,
        stage: 'config',
        error: 'API server URL must start with http:// or https://.',
      };
    }
    const apiUsername = (typeof req?.apiUsername === 'string' ? req.apiUsername : '').trim();
    const apiPassword = typeof req?.apiPassword === 'string' ? req.apiPassword : '';
    if (!apiUsername || !apiPassword) {
      return {
        ok: false,
        stage: 'config',
        error: 'API server username and password are required.',
      };
    }

    const districtDomain = normalizeSynergyDomain(req?.districtDomain);
    const edupointUsername = (typeof req?.edupointUsername === 'string' ? req.edupointUsername : '').trim();
    const edupointPassword = typeof req?.edupointPassword === 'string' ? req.edupointPassword : '';
    if (!districtDomain || !edupointUsername || !edupointPassword) {
      return {
        ok: false,
        stage: 'config',
        error: 'Synergy endpoint domain, username, and password are required.',
      };
    }

    logger.info(`[StudentVUE Verify] Starting verification against ${baseUrl} (district: ${districtDomain})`);

    // Step 1: Fetch Canvas profile for comparison
    stage = 'canvas_profile';
    const canvasResult = await fetchCanvasProfileForVerification(
      req.canvasDomain,
      req.canvasToken,
      req.useProxy
    );
    if (!canvasResult.ok) {
      const errMsg = 'error' in canvasResult ? canvasResult.error : 'Canvas profile fetch failed.';
      logger.warn('[StudentVUE Verify] Canvas profile fetch failed', errMsg);
      return { ok: false, stage: 'canvas_profile', error: errMsg };
    }

    // Step 2: Obtain short-lived JWT from schoolview-api (/auth/token)
    stage = 'api_auth';
    let tokenRes: Response;
    try {
      tokenRes = await fetchWithTimeout(`${baseUrl}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: apiUsername,
          password: apiPassword,
        }),
      });
    } catch (netErr: any) {
      const msg =
        netErr?.name === 'AbortError'
          ? 'Timed out connecting to StudentVUE API server.'
          : `Unable to reach StudentVUE API server (${netErr?.message || 'network/CORS error'}).`;
      logger.error('[StudentVUE Verify] API auth network error', msg);
      return { ok: false, stage: 'api_auth', error: msg };
    }

    const tokenData = await safeParseJson(tokenRes);
    if (!tokenRes.ok || typeof tokenData?.access_token !== 'string' || !tokenData.access_token) {
      const detail = formatApiErrorDetail(tokenData?.detail ?? tokenData, tokenRes.status);
      logger.warn('[StudentVUE Verify] API server authentication failed', detail);
      return {
        ok: false,
        stage: 'api_auth',
        error: `API server login failed: ${detail}`,
      };
    }
    const bearerToken: string = tokenData.access_token;

    // Step 3: Create transient encrypted Edupoint session (/api/v1/edupoint/session)
    stage = 'edupoint_session';
    let sessionRes: Response;
    try {
      sessionRes = await fetchWithTimeout(`${baseUrl}/api/v1/edupoint/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          username: edupointUsername,
          password: edupointPassword,
          district_domain: districtDomain,
          is_parent: Boolean(req.isParent),
        }),
      });
    } catch (netErr: any) {
      const msg =
        netErr?.name === 'AbortError'
          ? 'Timed out waiting for StudentVUE portal login.'
          : `StudentVUE session request failed (${netErr?.message || 'network error'}).`;
      logger.error('[StudentVUE Verify] Edupoint session network error', msg);
      return { ok: false, stage: 'edupoint_session', error: msg };
    }

    const sessionData = await safeParseJson(sessionRes);
    if (!sessionRes.ok || typeof sessionData?.edupoint_session !== 'string' || !sessionData.edupoint_session) {
      const detail = formatApiErrorDetail(sessionData?.detail ?? sessionData, sessionRes.status);
      logger.warn('[StudentVUE Verify] StudentVUE login failed', detail);
      return {
        ok: false,
        stage: 'edupoint_session',
        error: `StudentVUE login failed: ${detail}`,
      };
    }
    const edupointSession: string = sessionData.edupoint_session;

    // Step 4: Fetch StudentInfo via encrypted session (/api/v1/edupoint/student-info)
    stage = 'student_info';
    let infoRes: Response;
    try {
      infoRes = await fetchWithTimeout(`${baseUrl}/api/v1/edupoint/student-info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
          'X-Edupoint-Session': edupointSession,
        },
        body: JSON.stringify({}),
      });
    } catch (netErr: any) {
      const msg =
        netErr?.name === 'AbortError'
          ? 'Timed out fetching StudentVUE profile.'
          : `Failed to fetch StudentVUE profile (${netErr?.message || 'network error'}).`;
      logger.error('[StudentVUE Verify] StudentInfo network error', msg);
      return { ok: false, stage: 'student_info', error: msg };
    }

    const infoJson = await safeParseJson(infoRes);
    if (!infoRes.ok || !infoJson?.data || typeof infoJson.data !== 'object') {
      const detail = formatApiErrorDetail(infoJson?.detail ?? infoJson, infoRes.status);
      logger.warn('[StudentVUE Verify] StudentInfo fetch returned error', detail);
      return {
        ok: false,
        stage: 'student_info',
        error: `Failed to fetch StudentVUE profile: ${detail}`,
      };
    }

    const rawData = infoJson.data as Record<string, unknown>;
    const rtError = rawData.RT_ERROR as Record<string, unknown> | undefined;
    if (rtError) {
      const soapErr =
        unwrapBadgerfish(rtError) ||
        formatApiErrorDetail(rtError['@ERROR_MESSAGE'] ?? rtError['@ErrorMessage'] ?? rtError, infoRes.status);
      logger.warn('[StudentVUE Verify] Synergy RT_ERROR payload received', soapErr);
      return {
        ok: false,
        stage: 'student_info',
        error: `Synergy returned an error: ${soapErr}`,
      };
    }

    const rawInfoCandidate = rawData.StudentInfo ?? rawData;
    const rawInfo = (
      rawInfoCandidate && typeof rawInfoCandidate === 'object' ? rawInfoCandidate : {}
    ) as Record<string, unknown>;

    const portalError =
      (typeof rawInfo['@ErrorMessage'] === 'string' && rawInfo['@ErrorMessage'].trim()) ||
      (typeof rawInfo.ErrorMessage === 'string' && rawInfo.ErrorMessage.trim());
    if (portalError) {
      logger.warn('[StudentVUE Verify] Synergy StudentInfo error message', portalError);
      return {
        ok: false,
        stage: 'student_info',
        error: `Synergy returned an error: ${portalError}`,
      };
    }

    const studentVueProfile: StudentVueProfileSummary = {
      name:
        unwrapBadgerfish(rawInfo.FormattedName) ||
        unwrapBadgerfish(rawInfo.NickName) ||
        unwrapBadgerfish(rawInfo.Name),
      permId: unwrapBadgerfish(rawInfo.PermID),
      email: unwrapBadgerfish(rawInfo.EMail),
      school: unwrapBadgerfish(rawInfo.CurrentSchool),
      grade: unwrapBadgerfish(rawInfo.Grade),
    };

    const comparison = compareStudentProfiles(canvasResult.profile, studentVueProfile);
    logger.info(
      `[StudentVUE Verify] Comparison complete. Matched=${comparison.matched} (${comparison.confidence})`,
      {
        matchReasons: comparison.matchReasons,
        mismatchReasons: comparison.mismatchReasons,
      }
    );

    return { ok: true, comparison };
  } catch (err: any) {
    const message = err?.message || String(err) || 'Unexpected verification error';
    logger.error(`[StudentVUE Verify] Unhandled error at stage "${stage}"`, message);
    return {
      ok: false,
      stage,
      error: `Experimental StudentVUE check failed (${stage}): ${message}`,
    };
  }
}
