import { CourseData } from '../types';
import { logger } from './logger';
import { isErr } from '@velm/core';
import { getLocalBackend, resolveLocalSynergySession } from './backend';
import {
  checkSchoolviewAuthRequired,
  formatApiErrorDetail,
  LinkedStudentVueProfile,
  normalizeSynergyDomain,
  resolveSchoolviewBaseUrl,
} from './studentvue';

export interface StudentVueReportingPeriod {
  index: number;
  name: string;
  gu?: string;
  startDate?: string;
  endDate?: string;
}

export interface StudentVueCategoryWeight {
  type: string;
  weightPercent: number | null;
  weightLabel: string;
  pointsEarned: number | null;
  pointsPossible: number | null;
  calculatedMark?: string;
}

export interface StudentVueAssignmentItem {
  id: string;
  title: string;
  category?: string;
  date?: string;
  dueDate?: string;
  scoreText?: string;
  pointsText?: string;
  scorePercent: number | null;
  notes?: string;
}

export interface StudentVueCourseGrade {
  key: string;
  title: string;
  courseId?: string;
  period?: string;
  room?: string;
  staff?: string;
  staffEmail?: string;
  markName?: string;
  scorePercent: number | null;
  letterGrade?: string;
  scoreRawText?: string;
  categories: StudentVueCategoryWeight[];
  assignments: StudentVueAssignmentItem[];
}

export interface StudentVueGradebookSnapshot {
  syncedAt: string;
  districtDomain: string;
  isParent: boolean;
  studentName?: string;
  permId?: string;
  agu?: string;
  reportingPeriodIndex?: number;
  reportingPeriodName?: string;
  reportingPeriodGu?: string;
  reportingPeriods: StudentVueReportingPeriod[];
  courses: StudentVueCourseGrade[];
  manualMappings?: Record<number, string>;
  rawGradebook?: unknown;
}

export interface StudentVueCourseMatch {
  course: StudentVueCourseGrade;
  matchReason: string;
  isManual: boolean;
  confidence: 'high' | 'medium';
}

export interface StudentVueGradeSyncRequest {
  apiServerUrl: string;
  apiUsername: string;
  apiPassword: string;
  districtDomain: string;
  edupointUsername: string;
  edupointPassword: string;
  isParent: boolean;
  agu?: string;
  permId?: string;
  studentName?: string;
  reportPeriod?: number;
  reportPeriodGu?: string;
}

export type StudentVueGradeSyncOutcome =
  | { ok: true; snapshot: StudentVueGradebookSnapshot }
  | { ok: false; stage: 'config' | 'api_auth' | 'edupoint_session' | 'gradebook' | 'unknown'; error: string };

const STUDENTVUE_GRADES_PREFIX = 'velm_studentvue_grades_v1_';
export const SYNERGY_NO_MATCH_KEY = '__NONE__';

function asArray<T>(val: T | T[] | null | undefined): T[] {
  if (Array.isArray(val)) return val;
  if (val !== null && val !== undefined) return [val];
  return [];
}

function readAttr(obj: Record<string, any> | null | undefined, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    if (val && typeof val === 'object' && '$' in val && (typeof val.$ === 'string' || typeof val.$ === 'number')) {
      const inner = String(val.$).trim();
      if (inner) return inner;
    }
  }
  return undefined;
}

export function parseSynergyPercent(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || /^(n\/a|na|--|-|not graded|ungraded)$/i.test(trimmed)) return null;

  // Percentage e.g. "94.6%"
  const pctMatch = trimmed.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const n = Number(pctMatch[1]);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }

  // Ratio e.g. "48 / 50" or "48/50"
  const ratioMatch = trimmed.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (ratioMatch) {
    const earned = Number(ratioMatch[1]);
    const possible = Number(ratioMatch[2]);
    if (Number.isFinite(earned) && Number.isFinite(possible) && possible > 0) {
      return Math.round((earned / possible) * 1000) / 10;
    }
  }

  // Pure numeric string e.g. "94.6"
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  }

  return null;
}

function parseOptionalNumber(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[%,\s]/g, '');
  if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function looksLikeLetterGrade(raw?: string | null): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed || /^(n\/a|na|--|-)$/i.test(trimmed)) return false;
  // E.g. A, A-, B+, CR, P, S, N, I, E, W, pass/fail
  return /^[A-Za-z][A-Za-z0-9+\-\/]{0,5}$/.test(trimmed) && !/^\d/.test(trimmed);
}

export function getSynergyCourseKey(course: Pick<StudentVueCourseGrade, 'courseId' | 'period' | 'title'>): string {
  const cid = (course.courseId || '').trim().toUpperCase();
  const per = (course.period || '').trim();
  const title = (course.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${cid}|${per}|${title}`;
}

/**
 * Parse a Synergy GetGradebook Badgerfish JSON payload into clean structured course totals,
 * reporting periods, weighted categories, and individual Synergy assignment items.
 */
export function parseSynergyGradebook(
  rawData: Record<string, any>,
  meta: {
    districtDomain: string;
    isParent: boolean;
    studentName?: string;
    permId?: string;
    agu?: string;
    syncedAt?: string;
    previousManualMappings?: Record<number, string>;
  }
): StudentVueGradebookSnapshot {
  const gb = (rawData?.Gradebook && typeof rawData.Gradebook === 'object' ? rawData.Gradebook : rawData) || {};

  // Reporting periods
  const rawPeriods = asArray<Record<string, any>>(gb?.ReportingPeriods?.ReportPeriod);
  const reportingPeriods: StudentVueReportingPeriod[] = rawPeriods.map((rp, idx) => {
    const parsedIdx = Number(readAttr(rp, '@Index', 'Index'));
    return {
      index: Number.isFinite(parsedIdx) ? parsedIdx : idx,
      name: readAttr(rp, '@GradePeriod', 'GradePeriod', '@MarkName', 'Name') || `Period ${idx + 1}`,
      gu: readAttr(rp, '@GU', 'GU'),
      startDate: readAttr(rp, '@StartDate', 'StartDate'),
      endDate: readAttr(rp, '@EndDate', 'EndDate'),
    };
  });

  const activeRpRaw = gb?.ReportingPeriod && typeof gb.ReportingPeriod === 'object' ? gb.ReportingPeriod : null;
  const activeRpIndexNum = Number(readAttr(activeRpRaw, '@Index', 'Index'));
  const reportingPeriodIndex = Number.isFinite(activeRpIndexNum)
    ? activeRpIndexNum
    : reportingPeriods[0]?.index;
  const reportingPeriodGu =
    readAttr(activeRpRaw, '@GU', 'GU') ||
    reportingPeriods.find((p) => p.index === reportingPeriodIndex)?.gu;
  const reportingPeriodName =
    readAttr(activeRpRaw, '@GradePeriod', 'GradePeriod', 'Name') ||
    reportingPeriods.find((p) => p.index === reportingPeriodIndex)?.name;

  // Courses
  const rawCourses = asArray<Record<string, any>>(gb?.Courses?.Course);
  const courses: StudentVueCourseGrade[] = rawCourses
    .map((c, cIdx) => {
      const title = readAttr(c, '@Title', 'Title', '@CourseTitle') || `Course ${cIdx + 1}`;
      let courseId = readAttr(c, '@CourseID', 'CourseID', '@CourseId');
      if (!courseId) {
        const parenMatch = title.match(/\(([A-Za-z0-9._-]{3,20})\)\s*$/);
        if (parenMatch) courseId = parenMatch[1];
      }
      const period = readAttr(c, '@Period', 'Period');
      const room = readAttr(c, '@Room', 'Room');
      const staff = readAttr(c, '@Staff', 'Staff');
      const staffEmail = readAttr(c, '@StaffEMail', '@StaffEmail', 'StaffEMail');

      const marks = asArray<Record<string, any>>(c?.Marks?.Mark);
      // Prefer first mark with a valid numeric score, else first mark
      const primaryMark =
        marks.find((m) => parseSynergyPercent(readAttr(m, '@CalculatedScoreRaw', '@CalculatedScoreString')) !== null) ||
        marks[0] ||
        {};

      const markName = readAttr(primaryMark, '@MarkName', 'MarkName') || reportingPeriodName;
      const calcRaw = readAttr(primaryMark, '@CalculatedScoreRaw', 'CalculatedScoreRaw');
      const calcStr = readAttr(primaryMark, '@CalculatedScoreString', 'CalculatedScoreString');

      const scorePercent =
        parseSynergyPercent(calcRaw) ??
        parseSynergyPercent(calcStr) ??
        null;

      const letterGrade = looksLikeLetterGrade(calcStr) ? calcStr : undefined;
      const scoreRawText = calcRaw || calcStr;

      // Category weights
      const rawCalcs = asArray<Record<string, any>>(
        primaryMark?.GradeCalculationSummary?.AssignmentGradeCalc
      );
      const categories: StudentVueCategoryWeight[] = rawCalcs
        .map((cat) => {
          const type = readAttr(cat, '@Type', 'Type') || 'Category';
          const weightLabel = readAttr(cat, '@Weight', 'Weight') || '';
          const weightPercent = parseOptionalNumber(weightLabel);
          const pointsEarned = parseOptionalNumber(readAttr(cat, '@Points', 'Points'));
          const pointsPossible = parseOptionalNumber(readAttr(cat, '@PointsPossible', 'PointsPossible'));
          const calculatedMark = readAttr(cat, '@CalculatedMark', 'CalculatedMark');
          return {
            type,
            weightPercent,
            weightLabel: weightLabel || (weightPercent !== null ? `${weightPercent}%` : '—'),
            pointsEarned,
            pointsPossible,
            calculatedMark,
          };
        })
        .filter((cat) => !/^total$/i.test(cat.type.trim()));

      // Individual Synergy assignments
      const rawAsgns = asArray<Record<string, any>>(primaryMark?.Assignments?.Assignment);
      const assignments: StudentVueAssignmentItem[] = rawAsgns.map((a, aIdx) => {
        const asgnTitle = readAttr(a, '@Measure', 'Measure', '@Title', 'Title') || `Item ${aIdx + 1}`;
        const id = readAttr(a, '@GradebookID', 'GradebookID') || `${cIdx}-${aIdx}-${asgnTitle.slice(0, 24)}`;
        const category = readAttr(a, '@Type', 'Type', '@Category');
        const date = readAttr(a, '@Date', 'Date');
        const dueDate = readAttr(a, '@DueDate', 'DueDate');
        const scoreText = readAttr(a, '@Score', 'Score', '@DisplayScore');
        const pointsText = readAttr(a, '@Points', 'Points');
        const notes = readAttr(a, '@Notes', 'Notes');
        const asgnPercent =
          parseSynergyPercent(scoreText) ??
          parseSynergyPercent(pointsText);

        return {
          id,
          title: asgnTitle,
          category,
          date,
          dueDate,
          scoreText,
          pointsText,
          scorePercent: asgnPercent,
          notes,
        };
      });

      const baseCourse = { title, courseId, period };
      return {
        key: getSynergyCourseKey(baseCourse),
        title,
        courseId,
        period,
        room,
        staff,
        staffEmail,
        markName,
        scorePercent,
        letterGrade,
        scoreRawText,
        categories,
        assignments,
      };
    })
    .filter((c) => Boolean(c.title));

  return {
    syncedAt: meta.syncedAt || new Date().toISOString(),
    districtDomain: normalizeSynergyDomain(meta.districtDomain),
    isParent: Boolean(meta.isParent),
    studentName: meta.studentName,
    permId: meta.permId,
    agu: meta.agu,
    reportingPeriodIndex,
    reportingPeriodName,
    reportingPeriodGu,
    reportingPeriods,
    courses,
    manualMappings: meta.previousManualMappings ? { ...meta.previousManualMappings } : undefined,
    rawGradebook: rawData,
  };
}

function normalizeCourseTokens(raw?: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const stopWords = new Set(['ap', 'honors', 'hon', 'my', 'and', 'the', 'of', 'for', 'a', 'b', 'sem', 'semester', 'mp1', 'mp2', 'mp3', 'mp4', 'q1', 'q2', 'q3', 'q4', 'fy']);
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));
}

function extractTeacherLastNames(courseData: CourseData): string[] {
  const courseWithTeachers = courseData.course as CourseData['course'] & {
    teachers?: Array<{ display_name?: string }>;
  };
  const teachers = Array.isArray(courseWithTeachers.teachers) ? courseWithTeachers.teachers : [];
  const names: string[] = [];
  for (const t of teachers) {
    const raw = (t?.display_name || '').trim();
    if (!raw) continue;
    if (raw.includes(',')) {
      names.push(raw.split(',')[0].trim().toLowerCase());
    } else {
      const parts = raw.split(/\s+/);
      if (parts.length > 0) names.push(parts[parts.length - 1].toLowerCase());
    }
  }
  return names.filter((n) => n.length >= 2);
}

/**
 * Match a Canvas course to its corresponding StudentVUE Synergy course using:
 * 1) Explicit user manual override (or __NONE__ exclusion),
 * 2) Course code / SIS ID substring match,
 * 3) Course title token overlap + teacher surname match.
 */
export function matchSynergyCourseToCanvas(
  courseData: CourseData,
  snapshot: StudentVueGradebookSnapshot | null | undefined
): StudentVueCourseMatch | null {
  if (!snapshot || !Array.isArray(snapshot.courses) || snapshot.courses.length === 0) {
    return null;
  }

  const manualKey = snapshot.manualMappings?.[courseData.course.id];
  if (manualKey === SYNERGY_NO_MATCH_KEY) {
    return null;
  }
  if (manualKey) {
    const manualCourse = snapshot.courses.find((c) => c.key === manualKey);
    if (manualCourse) {
      return {
        course: manualCourse,
        matchReason: 'Manually linked in Course Inspector',
        isManual: true,
        confidence: 'high',
      };
    }
  }

  const canvasCode = (courseData.course.course_code || '').toUpperCase();
  const canvasSis = (courseData.course.sis_course_id || '').toUpperCase();
  const canvasFullName = `${courseData.course.name || ''} ${courseData.course.nickname || ''}`.trim();
  const canvasTokens = new Set(normalizeCourseTokens(canvasFullName));
  const teacherLastNames = extractTeacherLastNames(courseData);

  let best: { course: StudentVueCourseGrade; score: number; reason: string } | null = null;

  for (const sv of snapshot.courses) {
    let score = 0;
    const reasons: string[] = [];

    const svCid = (sv.courseId || '').trim().toUpperCase();
    if (svCid && svCid.length >= 3) {
      if (canvasCode.includes(svCid) || canvasSis.includes(svCid) || canvasFullName.toUpperCase().includes(svCid)) {
        score += 100;
        reasons.push(`Course ID match (${svCid})`);
      }
    }

    const svTokens = normalizeCourseTokens(sv.title);
    if (svTokens.length > 0 && canvasTokens.size > 0) {
      let overlap = 0;
      for (const tok of svTokens) {
        if (canvasTokens.has(tok)) overlap++;
      }
      const ratio = overlap / Math.min(svTokens.length, canvasTokens.size);
      if (overlap >= 2 || (overlap === 1 && svTokens.length === 1)) {
        score += Math.round(ratio * 60) + overlap * 5;
        reasons.push(`Title match (${sv.title})`);
      }
    }

    const svStaffLower = (sv.staff || '').toLowerCase();
    if (svStaffLower && teacherLastNames.some((ln) => svStaffLower.includes(ln))) {
      score += 25;
      reasons.push('Teacher match');
    }

    if (score >= 45 && (!best || score > best.score)) {
      best = {
        course: sv,
        score,
        reason: reasons.join(' • '),
      };
    }
  }

  if (!best) return null;
  return {
    course: best.course,
    matchReason: best.reason,
    isManual: false,
    confidence: best.score >= 85 ? 'high' : 'medium',
  };
}

export function buildSynergyCourseMatchMap(
  courses: CourseData[],
  snapshot: StudentVueGradebookSnapshot | null | undefined
): Map<number, StudentVueCourseMatch> {
  const map = new Map<number, StudentVueCourseMatch>();
  if (!snapshot) return map;
  for (const c of courses) {
    const match = matchSynergyCourseToCanvas(c, snapshot);
    if (match) {
      map.set(c.course.id, match);
    }
  }
  return map;
}

export function getSavedStudentVueGrades(studentId?: string): StudentVueGradebookSnapshot | null {
  try {
    const raw = localStorage.getItem(`${STUDENTVUE_GRADES_PREFIX}${studentId || 'default'}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.courses)) {
      return null;
    }
    return parsed as StudentVueGradebookSnapshot;
  } catch {
    return null;
  }
}

export function saveStudentVueGrades(
  studentId: string | undefined,
  snapshot: StudentVueGradebookSnapshot
): StudentVueGradebookSnapshot {
  // Preserve manual course mappings across re-syncs unless explicitly overridden
  const existing = getSavedStudentVueGrades(studentId);
  const merged: StudentVueGradebookSnapshot = {
    ...snapshot,
    manualMappings: snapshot.manualMappings ?? existing?.manualMappings,
  };
  try {
    localStorage.setItem(`${STUDENTVUE_GRADES_PREFIX}${studentId || 'default'}`, JSON.stringify(merged));
  } catch (err: any) {
    logger.warn('[StudentVUE Grades] Failed to save gradebook snapshot:', err?.message || String(err));
  }
  return merged;
}

export function updateStudentVueCourseMapping(
  studentId: string | undefined,
  canvasCourseId: number,
  synergyCourseKey: string | null
): StudentVueGradebookSnapshot | null {
  const current = getSavedStudentVueGrades(studentId);
  if (!current) return null;
  const nextMappings: Record<number, string> = { ...(current.manualMappings || {}) };
  if (synergyCourseKey === null) {
    delete nextMappings[canvasCourseId];
  } else {
    nextMappings[canvasCourseId] = synergyCourseKey;
  }
  const updated: StudentVueGradebookSnapshot = {
    ...current,
    manualMappings: Object.keys(nextMappings).length > 0 ? nextMappings : undefined,
  };
  try {
    localStorage.setItem(`${STUDENTVUE_GRADES_PREFIX}${studentId || 'default'}`, JSON.stringify(updated));
  } catch {
    // ignore storage quota errors
  }
  return updated;
}

export function clearSavedStudentVueGrades(studentId?: string): void {
  try {
    localStorage.removeItem(`${STUDENTVUE_GRADES_PREFIX}${studentId || 'default'}`);
  } catch {
    // ignore
  }
}

async function safeParseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 45000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSynergyGradebookWithSession(params: {
  baseUrl: string;
  bearerToken: string;
  edupointSession: string;
  districtDomain: string;
  isParent: boolean;
  agu?: string;
  permId?: string;
  studentName?: string;
  reportPeriod?: number;
  reportPeriodGu?: string;
}): Promise<{ ok: true; snapshot: StudentVueGradebookSnapshot } | { ok: false; error: string }> {
  const localBackend = getLocalBackend();
  if (localBackend) {
    const localSession = resolveLocalSynergySession(params.edupointSession);
    if (!localSession) {
      return { ok: false, error: 'Local StudentVUE session expired. Please re-enter credentials.' };
    }
    const res = await localBackend.synergy.getGradebook({
      username: localSession.username,
      password: localSession.password,
      districtDomain: localSession.districtDomain,
      isParent: localSession.isParent,
      ...(localSession.accountId ? { accountId: localSession.accountId } : {}),
      ...(params.reportPeriod !== undefined ? { reportPeriod: params.reportPeriod } : {}),
      ...(params.reportPeriodGu ? { reportPeriodGu: params.reportPeriodGu } : {}),
      ...(params.agu ? { agu: params.agu } : {}),
      ...(params.permId ? { permId: params.permId } : {}),
      ...(params.studentName ? { studentName: params.studentName } : {}),
    });
    if (isErr(res)) {
      return { ok: false, error: res.error.message };
    }
    const snapshot = parseSynergyGradebook(res.data, {
      districtDomain: params.districtDomain,
      isParent: params.isParent,
      studentName: params.studentName,
      permId: params.permId,
      agu: params.agu,
    });
    logger.info(
      `[StudentVUE Grades] Locally synced ${snapshot.courses.length} course(s) (${snapshot.reportingPeriodName || 'Current'})`
    );
    return { ok: true, snapshot };
  }

  const baseUrl = resolveSchoolviewBaseUrl(params.baseUrl);
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${baseUrl}/api/v1/edupoint/gradebook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.bearerToken}`,
          'X-Edupoint-Session': params.edupointSession,
        },
        body: JSON.stringify({
          report_period: params.reportPeriod ?? null,
          report_period_gu: params.reportPeriodGu || null,
          agu: params.agu || null,
          perm_id: params.permId || null,
          student_name: params.studentName || null,
        }),
      },
      60000
    );
  } catch (netErr: any) {
    const msg =
      netErr?.name === 'AbortError'
        ? 'Timed out waiting for Synergy gradebook response.'
        : `Gradebook request failed (${netErr?.message || 'network error'}).`;
    return { ok: false, error: msg };
  }

  const json = await safeParseJson(res);
  if (!res.ok || !json?.data || typeof json.data !== 'object') {
    const detail = formatApiErrorDetail(json?.detail ?? json, res.status);
    return { ok: false, error: `Failed to fetch StudentVUE gradebook: ${detail}` };
  }

  const snapshot = parseSynergyGradebook(json.data, {
    districtDomain: params.districtDomain,
    isParent: params.isParent,
    studentName: params.studentName,
    permId: params.permId,
    agu: params.agu,
  });

  logger.info(
    `[StudentVUE Grades] Synced ${snapshot.courses.length} course(s) (${snapshot.reportingPeriodName || 'Current'})`
  );
  return { ok: true, snapshot };
}

/**
 * End-to-end transient credential flow to sync official Synergy course totals,
 * weighted categories, and individual Synergy assignments without storing any secrets.
 */
export async function syncStudentVueGradebook(
  req: StudentVueGradeSyncRequest
): Promise<StudentVueGradeSyncOutcome> {
  const localBackend = getLocalBackend();
  const districtDomain = normalizeSynergyDomain(req.districtDomain);

  if (localBackend) {
    if (!districtDomain) {
      return { ok: false, stage: 'config', error: 'Synergy district domain is required.' };
    }
    if (!req.edupointUsername.trim() || !req.edupointPassword) {
      return { ok: false, stage: 'config', error: 'StudentVUE / ParentVUE username and password are required.' };
    }
    const res = await localBackend.synergy.getGradebook({
      username: req.edupointUsername.trim(),
      password: req.edupointPassword,
      districtDomain,
      isParent: Boolean(req.isParent),
      ...(req.reportPeriod !== undefined ? { reportPeriod: req.reportPeriod } : {}),
      ...(req.reportPeriodGu ? { reportPeriodGu: req.reportPeriodGu } : {}),
      ...(req.agu ? { agu: req.agu } : {}),
      ...(req.permId ? { permId: req.permId } : {}),
      ...(req.studentName ? { studentName: req.studentName } : {}),
    });
    if (isErr(res)) {
      return {
        ok: false,
        stage: res.error.code === 'AUTH_FAILED' ? 'edupoint_session' : 'gradebook',
        error: res.error.message,
      };
    }
    const snapshot = parseSynergyGradebook(res.data, {
      districtDomain,
      isParent: req.isParent,
      studentName: req.studentName,
      permId: req.permId,
      agu: req.agu,
    });
    return { ok: true, snapshot };
  }

  const baseUrl = resolveSchoolviewBaseUrl(req.apiServerUrl);

  if (!baseUrl) {
    return { ok: false, stage: 'config', error: 'StudentVUE API Server URL is required.' };
  }
  const apiUsername = (typeof req.apiUsername === 'string' ? req.apiUsername : '').trim();
  const apiPassword = typeof req.apiPassword === 'string' ? req.apiPassword : '';
  if (!apiUsername || !apiPassword) {
    const authRequired = await checkSchoolviewAuthRequired(baseUrl);
    if (authRequired) {
      return { ok: false, stage: 'config', error: 'API server username and password are required.' };
    }
  }
  if (!districtDomain) {
    return { ok: false, stage: 'config', error: 'Synergy district domain is required.' };
  }
  if (!req.edupointUsername.trim() || !req.edupointPassword) {
    return { ok: false, stage: 'config', error: 'StudentVUE / ParentVUE username and password are required.' };
  }

  let stage: 'config' | 'api_auth' | 'edupoint_session' | 'gradebook' | 'unknown' = 'api_auth';
  try {
    // 1. Obtain Bearer token
    let tokenRes: Response;
    try {
      tokenRes = await fetchWithTimeout(`${baseUrl}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: apiUsername,
          password: apiPassword,
        }),
      }, 25000);
    } catch (err: any) {
      return {
        ok: false,
        stage: 'api_auth',
        error: err?.name === 'AbortError'
          ? 'Timed out connecting to StudentVUE API server.'
          : `Unable to reach StudentVUE API server (${err?.message || 'network error'}).`,
      };
    }

    const tokenJson = await safeParseJson(tokenRes);
    if (!tokenRes.ok || typeof tokenJson?.access_token !== 'string' || !tokenJson.access_token) {
      const detail = formatApiErrorDetail(tokenJson?.detail ?? tokenJson, tokenRes.status);
      return { ok: false, stage: 'api_auth', error: `API server login failed: ${detail}` };
    }
    const bearerToken = tokenJson.access_token as string;

    // 2. Create transient encrypted Edupoint session
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
          username: req.edupointUsername.trim(),
          password: req.edupointPassword,
          district_domain: districtDomain,
          is_parent: Boolean(req.isParent),
        }),
      }, 45000);
    } catch (err: any) {
      return {
        ok: false,
        stage: 'edupoint_session',
        error: err?.name === 'AbortError'
          ? 'Timed out waiting for StudentVUE portal login.'
          : `StudentVUE session request failed (${err?.message || 'network error'}).`,
      };
    }

    const sessionJson = await safeParseJson(sessionRes);
    if (!sessionRes.ok || typeof sessionJson?.edupoint_session !== 'string' || !sessionJson.edupoint_session) {
      const detail = formatApiErrorDetail(sessionJson?.detail ?? sessionJson, sessionRes.status);
      return { ok: false, stage: 'edupoint_session', error: `StudentVUE login failed: ${detail}` };
    }
    const edupointSession = sessionJson.edupoint_session as string;

    // 3. Fetch Gradebook
    stage = 'gradebook';
    const gbRes = await fetchSynergyGradebookWithSession({
      baseUrl,
      bearerToken,
      edupointSession,
      districtDomain,
      isParent: req.isParent,
      agu: req.agu,
      permId: req.permId,
      studentName: req.studentName,
      reportPeriod: req.reportPeriod,
      reportPeriodGu: req.reportPeriodGu,
    });

    if (gbRes.ok === false) {
      return { ok: false, stage: 'gradebook', error: gbRes.error };
    }

    return { ok: true, snapshot: gbRes.snapshot };
  } catch (err: any) {
    return {
      ok: false,
      stage,
      error: `Official grade sync failed (${stage}): ${err?.message || String(err)}`,
    };
  }
}

export function buildLinkSummaryLabel(link: LinkedStudentVueProfile | null): string {
  if (!link) return 'Not linked';
  const bits = [link.studentName, link.permId ? `#${link.permId}` : null].filter(Boolean);
  return bits.join(' ');
}
