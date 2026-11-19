import { CanvasAssignment, ALL_COURSES_ID } from '../types';
import {
  StudentVueAssignmentItem,
  StudentVueCourseGrade,
  StudentVueCourseMatch,
  StudentVueGradebookSnapshot,
} from '../services/studentvueGrades';
import { isAssignmentSubmitted } from './dashboard-helpers';
import { pruneCourseTitle } from './courseAbbreviations';

export type CanvasAlignmentMode = 'due_padded' | 'graded_or_activity';
export type TimelineGranularity = 'week' | 'day';
export type TimelineWindow = 14 | 30 | 90 | 'all';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse Synergy / Canvas date strings safely into local-noon (for date-only strings)
 * or exact timestamp milliseconds (for full ISO date-times).
 * Avoids JS `new Date("YYYY-MM-DD")` UTC-midnight off-by-one-day shifts.
 */
export function parseFlexibleLocalDateMs(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Date-only ISO: YYYY-MM-DD
  const isoDateOnly = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const month = Number(isoDateOnly[2]);
    const day = Number(isoDateOnly[3]);
    const dt = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }

  // US date: MM/DD/YYYY or M/D/YY
  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDate) {
    const month = Number(slashDate[1]);
    const day = Number(slashDate[2]);
    let year = Number(slashDate[3]);
    if (year < 100) year += 2000;
    const dt = new Date(year, month - 1, day, 12, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }

  const parsed = new Date(trimmed).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function getLocalDayStartMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/**
 * Monday-start school week boundary in local time (Monday 00:00:00).
 * Keeps Mon-Fri classwork and weekend grading together in the same school week.
 */
export function getSchoolWeekStartMs(ms: number): number {
  const d = new Date(ms);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday, 0, 0, 0, 0).getTime();
}

export function formatShortDate(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'No date';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatWeekBandLabel(weekStartMs: number, nowMs: number): string {
  const weekEndMs = weekStartMs + 6 * MS_PER_DAY;
  const currentWeekStart = getSchoolWeekStartMs(nowMs);
  const lastWeekStart = currentWeekStart - 7 * MS_PER_DAY;

  const startStr = new Date(weekStartMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const endDate = new Date(weekEndMs);
  const startDate = new Date(weekStartMs);
  const endStr =
    startDate.getMonth() === endDate.getMonth()
      ? String(endDate.getDate())
      : endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const yearSuffix =
    endDate.getFullYear() !== new Date(nowMs).getFullYear() ? `, ${endDate.getFullYear()}` : '';

  const range = `${startStr} – ${endStr}${yearSuffix}`;
  if (weekStartMs === currentWeekStart) return `This Week · ${range}`;
  if (weekStartMs === lastWeekStart) return `Last Week · ${range}`;
  return `Week of ${range}`;
}

function formatDayBandLabel(dayStartMs: number, nowMs: number): string {
  const todayStart = getLocalDayStartMs(nowMs);
  const yesterdayStart = todayStart - MS_PER_DAY;
  const dateStr = new Date(dayStartMs).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (dayStartMs === todayStart) return `Today · ${dateStr}`;
  if (dayStartMs === yesterdayStart) return `Yesterday · ${dateStr}`;
  return dateStr;
}

function toDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface TimelineCanvasEntry {
  id: number;
  assignment: CanvasAssignment;
  courseId: number;
  courseName: string;
  courseEmoji?: string;
  linkedSynergyCourseKey?: string;
  title: string;
  dueAtMs: number | null;
  gradedAtMs: number | null;
  submittedAtMs: number | null;
  alignedMs: number | null;
  anchorSource: 'due' | 'graded' | 'submitted' | 'undated';
  appliedPadDays: number;
  hasScore: boolean;
  score: number | null;
  pointsPossible: number;
  gradeLabel: string | null;
  isSubmitted: boolean;
}

export interface TimelineSynergyEntry {
  id: string;
  item: StudentVueAssignmentItem;
  synergyCourseKey: string;
  synergyCourseTitle: string;
  period?: string;
  linkedCanvasCourseId?: number;
  linkedCanvasCourseName?: string;
  linkedCourseEmoji?: string;
  dateMs: number | null;
  dueDateMs: number | null;
  alignedMs: number | null;
  hasGrade: boolean;
}

export interface TimelineBand {
  key: string;
  label: string;
  isUndated: boolean;
  sortMs: number;
  canvasItems: TimelineCanvasEntry[];
  synergyItems: TimelineSynergyEntry[];
}

export interface BuildTimelineOptions {
  assignments: CanvasAssignment[];
  selectedCourseId?: number | null;
  visibleCourseIds?: Set<number>;
  courseNamesById?: Map<number, string>;
  courseEmojisById?: Map<number, string>;
  archivedAssignmentIds?: Set<number>;
  showArchived?: boolean;
  synergySnapshot?: StudentVueGradebookSnapshot | null;
  synergyCourseMap?: Map<number, StudentVueCourseMatch>;
  granularity: TimelineGranularity;
  canvasAlignment: CanvasAlignmentMode;
  canvasPadDays: number;
  windowDays: TimelineWindow;
  gradedOnly?: boolean;
  courseFilterKey?: string; // 'ALL' | `canvas:<id>` | `synergy:<key>`
  nowMs?: number;
}

export interface TimelineCourseFilterOption {
  value: string;
  label: string;
  hasCanvas: boolean;
  hasSynergy: boolean;
}

export interface BuiltRecentGradesTimeline {
  bands: TimelineBand[];
  totalCanvasEligible: number;
  totalSynergyEligible: number;
  shownCanvasCount: number;
  shownSynergyCount: number;
  hiddenByWindowCanvasCount: number;
  hiddenByWindowSynergyCount: number;
  courseFilterOptions: TimelineCourseFilterOption[];
}

const UNGRADED_TEXT_RE = /^(n\/a|na|--|-|not graded|ungraded)$/i;

export function isSynergyItemGraded(item: StudentVueAssignmentItem): boolean {
  if (item.scorePercent !== null && item.scorePercent !== undefined) return true;
  const score = (item.scoreText || '').trim();
  const points = (item.pointsText || '').trim();
  if (score && !UNGRADED_TEXT_RE.test(score)) return true;
  if (points && !UNGRADED_TEXT_RE.test(points)) return true;
  return false;
}

export function buildRecentGradesTimeline(options: BuildTimelineOptions): BuiltRecentGradesTimeline {
  const {
    assignments,
    selectedCourseId = ALL_COURSES_ID,
    visibleCourseIds,
    courseNamesById,
    courseEmojisById,
    archivedAssignmentIds,
    showArchived = false,
    synergySnapshot = null,
    synergyCourseMap,
    granularity,
    canvasAlignment,
    canvasPadDays,
    windowDays,
    gradedOnly = false,
    courseFilterKey = 'ALL',
    nowMs = Date.now(),
  } = options;

  // Build reverse index: synergyCourseKey -> linked Canvas course metadata
  const synergyKeyToCanvas = new Map<
    string,
    { canvasCourseId: number; canvasCourseName: string; emoji?: string }
  >();
  if (synergyCourseMap) {
    synergyCourseMap.forEach((match, canvasCourseId) => {
      if (match?.course?.key && !synergyKeyToCanvas.has(match.course.key)) {
        synergyKeyToCanvas.set(match.course.key, {
          canvasCourseId,
          canvasCourseName: courseNamesById?.get(canvasCourseId) || `Course #${canvasCourseId}`,
          emoji: courseEmojisById?.get(canvasCourseId),
        });
      }
    });
  }

  // Determine course filter options across Canvas & Synergy
  const courseFilterMap = new Map<string, TimelineCourseFilterOption>();

  // 1. Collect eligible Canvas entries (completed / submitted / graded, non-calendar-event)
  const rawCanvasEntries: TimelineCanvasEntry[] = [];
  for (const a of assignments) {
    if (a.is_calendar_event) continue;
    const isArchived = archivedAssignmentIds?.has(a.id) ?? false;
    if (isArchived && !showArchived) continue;

    const sub = a.submission;
    const hasScore = sub?.score !== null && sub?.score !== undefined;
    const gradedAtMs = parseFlexibleLocalDateMs(sub?.graded_at || sub?.posted_at);
    const submittedAtMs = parseFlexibleLocalDateMs(sub?.submitted_at);
    const dueAtMs = parseFlexibleLocalDateMs(a.due_at);
    const submitted = isAssignmentSubmitted(a);

    if (!submitted && !hasScore && gradedAtMs === null) continue;
    if (gradedOnly && !hasScore && gradedAtMs === null) continue;

    let alignedMs: number | null = null;
    let anchorSource: TimelineCanvasEntry['anchorSource'] = 'undated';
    let appliedPadDays = 0;

    if (canvasAlignment === 'due_padded') {
      if (dueAtMs !== null) {
        alignedMs = dueAtMs + canvasPadDays * MS_PER_DAY;
        anchorSource = 'due';
        appliedPadDays = canvasPadDays;
      } else if (gradedAtMs !== null) {
        alignedMs = gradedAtMs;
        anchorSource = 'graded';
      } else if (submittedAtMs !== null) {
        alignedMs = submittedAtMs;
        anchorSource = 'submitted';
      }
    } else {
      if (gradedAtMs !== null) {
        alignedMs = gradedAtMs;
        anchorSource = 'graded';
      } else if (submittedAtMs !== null) {
        alignedMs = submittedAtMs;
        anchorSource = 'submitted';
      } else if (dueAtMs !== null) {
        alignedMs = dueAtMs;
        anchorSource = 'due';
      }
    }

    const courseName = courseNamesById?.get(a.course_id) || `Course #${a.course_id}`;
    const courseEmoji = courseEmojisById?.get(a.course_id);
    const linkedSynergyCourseKey = synergyCourseMap?.get(a.course_id)?.course?.key;

    const filterOptKey = `canvas:${a.course_id}`;
    if (!courseFilterMap.has(filterOptKey)) {
      courseFilterMap.set(filterOptKey, {
        value: filterOptKey,
        label: courseEmoji ? `${courseEmoji} ${courseName}` : courseName,
        hasCanvas: true,
        hasSynergy: Boolean(linkedSynergyCourseKey),
      });
    }

    rawCanvasEntries.push({
      id: a.id,
      assignment: a,
      courseId: a.course_id,
      courseName,
      courseEmoji,
      linkedSynergyCourseKey,
      title: a.name,
      dueAtMs,
      gradedAtMs,
      submittedAtMs,
      alignedMs,
      anchorSource,
      appliedPadDays,
      hasScore,
      score: hasScore ? Number(sub!.score) : null,
      pointsPossible: Number(a.points_possible || 0),
      gradeLabel: sub?.grade ?? null,
      isSubmitted: submitted,
    });
  }

  // 2. Collect eligible Synergy entries
  const rawSynergyEntries: TimelineSynergyEntry[] = [];
  if (synergySnapshot && Array.isArray(synergySnapshot.courses)) {
    const isSingleCourse =
      selectedCourseId !== null &&
      selectedCourseId !== undefined &&
      selectedCourseId !== ALL_COURSES_ID;

    let candidateSynergyCourses: StudentVueCourseGrade[] = [];
    if (isSingleCourse) {
      const matched = synergyCourseMap?.get(selectedCourseId!)?.course;
      if (matched) candidateSynergyCourses = [matched];
    } else {
      candidateSynergyCourses = synergySnapshot.courses.filter((sc) => {
        const linked = synergyKeyToCanvas.get(sc.key);
        // If course is linked to a Canvas course that is hidden in sidebar visibility, respect visibleCourseIds
        if (linked && visibleCourseIds && visibleCourseIds.size > 0) {
          return visibleCourseIds.has(linked.canvasCourseId);
        }
        return true;
      });
    }

    for (const sc of candidateSynergyCourses) {
      const linked = synergyKeyToCanvas.get(sc.key);
      const filterOptKey = linked ? `canvas:${linked.canvasCourseId}` : `synergy:${sc.key}`;
      const existingOpt = courseFilterMap.get(filterOptKey);
      if (existingOpt) {
        existingOpt.hasSynergy = true;
      } else {
        courseFilterMap.set(filterOptKey, {
          value: filterOptKey,
          label: linked
            ? `${linked.emoji ? `${linked.emoji} ` : ''}${linked.canvasCourseName}`
            : `${pruneCourseTitle(sc.title)}${sc.period ? ` (Per ${sc.period})` : ''}`,
          hasCanvas: Boolean(linked),
          hasSynergy: true,
        });
      }

      for (const item of sc.assignments || []) {
        const graded = isSynergyItemGraded(item);
        if (gradedOnly && !graded) continue;

        const dateMs = parseFlexibleLocalDateMs(item.date);
        const dueDateMs = parseFlexibleLocalDateMs(item.dueDate);
        const alignedMs = dateMs ?? dueDateMs;

        rawSynergyEntries.push({
          id: `${sc.key}::${item.id}`,
          item,
          synergyCourseKey: sc.key,
          synergyCourseTitle: sc.title,
          period: sc.period,
          linkedCanvasCourseId: linked?.canvasCourseId,
          linkedCanvasCourseName: linked?.canvasCourseName,
          linkedCourseEmoji: linked?.emoji,
          dateMs,
          dueDateMs,
          alignedMs,
          hasGrade: graded,
        });
      }
    }
  }

  // 3. Apply Course Filter across both columns
  const canvasAfterCourseFilter = rawCanvasEntries.filter((entry) => {
    if (courseFilterKey === 'ALL') return true;
    if (courseFilterKey.startsWith('canvas:')) {
      return `canvas:${entry.courseId}` === courseFilterKey;
    }
    if (courseFilterKey.startsWith('synergy:')) {
      return entry.linkedSynergyCourseKey === courseFilterKey.slice('synergy:'.length);
    }
    return true;
  });

  const synergyAfterCourseFilter = rawSynergyEntries.filter((entry) => {
    if (courseFilterKey === 'ALL') return true;
    if (courseFilterKey.startsWith('canvas:')) {
      const targetId = Number(courseFilterKey.slice('canvas:'.length));
      return entry.linkedCanvasCourseId === targetId;
    }
    if (courseFilterKey.startsWith('synergy:')) {
      return entry.synergyCourseKey === courseFilterKey.slice('synergy:'.length);
    }
    return true;
  });

  // 4. Apply Recency Window Filter (windowDays from nowMs)
  const cutoffMs =
    windowDays === 'all' ? null : getLocalDayStartMs(nowMs) - windowDays * MS_PER_DAY;
  // Allow upcoming items (e.g., due tomorrow + padded +2d) cleanly without filtering them out
  const upperFutureBoundMs = nowMs + 14 * MS_PER_DAY;

  let hiddenByWindowCanvasCount = 0;
  let hiddenByWindowSynergyCount = 0;

  const windowedCanvas = canvasAfterCourseFilter.filter((entry) => {
    if (cutoffMs === null) return true;
    if (entry.alignedMs === null) return false;
    const inWindow = entry.alignedMs >= cutoffMs && entry.alignedMs <= upperFutureBoundMs;
    if (!inWindow) hiddenByWindowCanvasCount++;
    return inWindow;
  });

  const windowedSynergy = synergyAfterCourseFilter.filter((entry) => {
    if (cutoffMs === null) return true;
    if (entry.alignedMs === null) return false;
    const inWindow = entry.alignedMs >= cutoffMs && entry.alignedMs <= upperFutureBoundMs;
    if (!inWindow) hiddenByWindowSynergyCount++;
    return inWindow;
  });

  // 5. Group into aligned Week or Day bands
  const bandMap = new Map<string, TimelineBand>();

  const ensureBand = (ms: number | null): TimelineBand => {
    if (ms === null || !Number.isFinite(ms)) {
      const key = 'undated';
      let band = bandMap.get(key);
      if (!band) {
        band = {
          key,
          label: 'Undated Items',
          isUndated: true,
          sortMs: -Infinity,
          canvasItems: [],
          synergyItems: [],
        };
        bandMap.set(key, band);
      }
      return band;
    }

    const startMs =
      granularity === 'week' ? getSchoolWeekStartMs(ms) : getLocalDayStartMs(ms);
    const key = `${granularity}:${toDayKey(startMs)}`;
    let band = bandMap.get(key);
    if (!band) {
      band = {
        key,
        label:
          granularity === 'week'
            ? formatWeekBandLabel(startMs, nowMs)
            : formatDayBandLabel(startMs, nowMs),
        isUndated: false,
        sortMs: startMs,
        canvasItems: [],
        synergyItems: [],
      };
      bandMap.set(key, band);
    }
    return band;
  };

  for (const c of windowedCanvas) {
    ensureBand(c.alignedMs).canvasItems.push(c);
  }
  for (const s of windowedSynergy) {
    ensureBand(s.alignedMs).synergyItems.push(s);
  }

  // Sort bands newest first (undated last), and items newest first within each band
  const bands = Array.from(bandMap.values()).sort((a, b) => {
    if (a.isUndated && !b.isUndated) return 1;
    if (!a.isUndated && b.isUndated) return -1;
    return b.sortMs - a.sortMs;
  });

  for (const band of bands) {
    band.canvasItems.sort((a, b) => (b.alignedMs ?? 0) - (a.alignedMs ?? 0));
    band.synergyItems.sort((a, b) => (b.alignedMs ?? 0) - (a.alignedMs ?? 0));
  }

  const courseFilterOptions = Array.from(courseFilterMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  return {
    bands,
    totalCanvasEligible: canvasAfterCourseFilter.length,
    totalSynergyEligible: synergyAfterCourseFilter.length,
    shownCanvasCount: windowedCanvas.length,
    shownSynergyCount: windowedSynergy.length,
    hiddenByWindowCanvasCount,
    hiddenByWindowSynergyCount,
    courseFilterOptions,
  };
}
