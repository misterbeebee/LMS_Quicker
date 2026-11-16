import React, { useMemo, useState } from 'react';
import {
  ALL_COURSES_ID,
  CanvasAssignment,
  CourseData,
} from '../../types';
import {
  StudentVueCourseMatch,
  StudentVueGradebookSnapshot,
} from '../../services/studentvueGrades';
import { DEFAULT_GRADE_CONFIG, GradeScaleConfig, getGradeStyle } from '../../services/gradeScale';
import { CourseCustomization } from '../../services/courseCustomization';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import {
  buildRecentGradesTimeline,
  CanvasAlignmentMode,
  formatShortDate,
  TimelineGranularity,
  TimelineWindow,
} from '../../utils/recentGradesTimeline';
import {
  Calendar,
  Clock,
  Columns2,
  ExternalLink,
  Filter,
  Link2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getAssignmentFeedbackComments } from '../../utils/dashboard-helpers';

interface RecentGradesTimelineProps {
  assignments: CanvasAssignment[];
  courses?: CourseData[];
  selectedCourseId?: number | null;
  visibleCourseIds?: Set<number>;
  getCourseName?: (id: number) => string;
  courseCustomizations?: Record<number, CourseCustomization>;
  archivedAssignmentIds?: Set<number>;
  showArchived?: boolean;
  showScores?: boolean;
  gradeConfig?: GradeScaleConfig;
  synergySnapshot?: StudentVueGradebookSnapshot | null;
  synergyCourseMap?: Map<number, StudentVueCourseMatch>;
  onZoomAssignment?: (assignment: CanvasAssignment) => void;
  onOpenSynergySync?: () => void;
  onInspectCourseGrade?: (courseId: number, initialTab?: 'breakdown' | 'synergy' | 'raw') => void;
  canvasUrl?: string;
}

const PAD_DAY_OPTIONS = [0, 1, 2, 3, 5, 7];

export const RecentGradesTimeline: React.FC<RecentGradesTimelineProps> = ({
  assignments,
  courses = [],
  selectedCourseId = ALL_COURSES_ID,
  visibleCourseIds,
  getCourseName,
  courseCustomizations,
  archivedAssignmentIds,
  showArchived = false,
  showScores = true,
  gradeConfig = DEFAULT_GRADE_CONFIG,
  synergySnapshot = null,
  synergyCourseMap,
  onZoomAssignment,
  onOpenSynergySync,
  onInspectCourseGrade,
}) => {
  const [granularity, setGranularity] = useState<TimelineGranularity>('week');
  const [canvasAlignment, setCanvasAlignment] = useState<CanvasAlignmentMode>('due_padded');
  const [canvasPadDays, setCanvasPadDays] = useState<number>(2);
  const [windowDays, setWindowDays] = useState<TimelineWindow>(30);
  const [gradedOnly, setGradedOnly] = useState<boolean>(false);
  const [courseFilterKey, setCourseFilterKey] = useState<string>('ALL');
  const [hoveredLink, setHoveredLink] = useState<{
    canvasCourseId?: number;
    synergyKey?: string;
  } | null>(null);

  const courseNamesById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of courses) {
      map.set(
        c.course.id,
        getCourseName
          ? getCourseName(c.course.id)
          : pruneCourseTitle(c.course.nickname || c.course.name)
      );
    }
    if (getCourseName) {
      for (const a of assignments) {
        if (!map.has(a.course_id)) {
          map.set(a.course_id, getCourseName(a.course_id));
        }
      }
    }
    return map;
  }, [courses, assignments, getCourseName]);

  const courseEmojisById = useMemo(() => {
    const map = new Map<number, string>();
    if (courseCustomizations) {
      (Object.entries(courseCustomizations) as Array<[string, CourseCustomization]>).forEach(
        ([idStr, custom]) => {
          if (custom?.emoji) map.set(Number(idStr), custom.emoji);
        }
      );
    }
    return map;
  }, [courseCustomizations]);

  const effectiveCourseFilterKey = useMemo(() => {
    if (selectedCourseId && selectedCourseId !== ALL_COURSES_ID) {
      return 'ALL';
    }
    return courseFilterKey;
  }, [selectedCourseId, courseFilterKey]);

  const timeline = useMemo(
    () =>
      buildRecentGradesTimeline({
        assignments,
        selectedCourseId,
        visibleCourseIds,
        courseNamesById,
        courseEmojisById,
        archivedAssignmentIds,
        showArchived,
        synergySnapshot,
        synergyCourseMap,
        granularity,
        canvasAlignment,
        canvasPadDays,
        windowDays,
        gradedOnly,
        courseFilterKey: effectiveCourseFilterKey,
      }),
    [
      assignments,
      selectedCourseId,
      visibleCourseIds,
      courseNamesById,
      courseEmojisById,
      archivedAssignmentIds,
      showArchived,
      synergySnapshot,
      synergyCourseMap,
      granularity,
      canvasAlignment,
      canvasPadDays,
      windowDays,
      gradedOnly,
      effectiveCourseFilterKey,
    ]
  );

  const totalHiddenByWindow =
    timeline.hiddenByWindowCanvasCount + timeline.hiddenByWindowSynergyCount;

  const isSingleCourse =
    selectedCourseId !== null &&
    selectedCourseId !== undefined &&
    selectedCourseId !== ALL_COURSES_ID;
  const singleCourseMatchedSynergy = isSingleCourse
    ? synergyCourseMap?.get(selectedCourseId!)?.course
    : null;

  return (
    <div className="space-y-4 animate-fadeIn" data-testid="recent-grades-timeline">
      {/* Header & Alignment Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-50 to-emerald-50 border border-slate-200 text-slate-700">
              <Columns2 className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  Side-by-Side Recent Grades Timeline
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {timeline.shownCanvasCount} Canvas
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {timeline.shownSynergyCount} Synergy
                </span>
                {synergySnapshot?.reportingPeriodName && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {synergySnapshot.reportingPeriodName}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Compare Canvas work on the left against official Synergy grades on the right, aligned horizontally by date band without fragile auto-merging.
              </p>
            </div>
          </div>

          {onOpenSynergySync && (
            <button
              type="button"
              data-testid="timeline-sync-synergy-btn"
              onClick={onOpenSynergySync}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{synergySnapshot ? 'Refresh Synergy' : 'Sync Synergy Grades'}</span>
            </button>
          )}
        </div>

        {/* Control Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 text-xs">
          {/* Granularity: Week vs Day */}
          <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1.5">
              Group:
            </span>
            <button
              type="button"
              data-testid="timeline-group-week"
              onClick={() => setGranularity('week')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                granularity === 'week'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              data-testid="timeline-group-day"
              onClick={() => setGranularity('day')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                granularity === 'day'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day
            </button>
          </div>

          {/* Canvas Date Anchor Mode */}
          <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1.5">
              Canvas Date:
            </span>
            <button
              type="button"
              data-testid="timeline-align-due"
              onClick={() => setCanvasAlignment('due_padded')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                canvasAlignment === 'due_padded'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Place Canvas assignments using their Due Date (plus optional late pad)"
            >
              Due Date
            </button>
            <button
              type="button"
              data-testid="timeline-align-activity"
              onClick={() => setCanvasAlignment('graded_or_activity')}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                canvasAlignment === 'graded_or_activity'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Place Canvas assignments using Canvas Graded Date / Submitted Date"
            >
              Graded / Activity
            </button>
          </div>

          {/* Canvas Late-Pad Bias Selector (when aligned on Due Date) */}
          {canvasAlignment === 'due_padded' && (
            <div
              className="inline-flex items-center gap-1 bg-blue-50/70 p-0.5 rounded-lg border border-blue-200/80"
              title="Shifts Canvas due dates forward by N days so they line up horizontally with Synergy grading dates (which often post 1-3 days after a Canvas deadline)."
            >
              <Clock className="w-3 h-3 text-blue-600 ml-1.5 shrink-0" />
              <label
                htmlFor="canvas-late-pad-select"
                className="text-[11px] font-semibold text-blue-900 pr-0.5"
              >
                Late Bias:
              </label>
              <select
                id="canvas-late-pad-select"
                data-testid="timeline-pad-days-select"
                value={canvasPadDays}
                onChange={(e) => setCanvasPadDays(Number(e.target.value))}
                className="bg-white border border-blue-200 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-blue-800 focus:outline-hidden cursor-pointer"
              >
                {PAD_DAY_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days === 0 ? '+0d (Exact Due)' : `+${days}d later`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Recency Window */}
          <div className="inline-flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1.5">
              Window:
            </span>
            {([14, 30, 90, 'all'] as TimelineWindow[]).map((w) => (
              <button
                key={String(w)}
                type="button"
                data-testid={`timeline-window-${w}`}
                onClick={() => setWindowDays(w)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  windowDays === w
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {w === 'all' ? 'All' : `${w}d`}
              </button>
            ))}
          </div>

          {/* Course Filter (Multi-Course Mode) */}
          {!isSingleCourse && timeline.courseFilterOptions.length > 1 && (
            <div className="inline-flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200">
              <Filter className="w-3 h-3 text-slate-400 shrink-0" />
              <select
                aria-label="Filter timeline by course"
                data-testid="timeline-course-filter"
                value={courseFilterKey}
                onChange={(e) => setCourseFilterKey(e.target.value)}
                className="text-[11px] font-semibold text-slate-700 bg-transparent focus:outline-hidden max-w-[180px] cursor-pointer"
              >
                <option value="ALL">All Courses ({timeline.courseFilterOptions.length})</option>
                {timeline.courseFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Graded Only Toggle */}
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="timeline-graded-only-checkbox"
              checked={gradedOnly}
              onChange={(e) => setGradedOnly(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-slate-700">Graded only</span>
          </label>
        </div>
      </div>

      {/* Warning banner if Synergy isn't synced OR single selected course isn't linked */}
      {!synergySnapshot ? (
        <div
          className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
          data-testid="timeline-no-synergy-banner"
        >
          <div className="flex items-center gap-2.5 text-xs text-emerald-950">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Sync your <span className="font-bold">StudentVUE / ParentVUE</span> gradebook to populate official Synergy grades alongside your Canvas work.
            </span>
          </div>
          {onOpenSynergySync && (
            <button
              type="button"
              onClick={onOpenSynergySync}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              Sync Official Grades
            </button>
          )}
        </div>
      ) : isSingleCourse && !singleCourseMatchedSynergy && onInspectCourseGrade ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
          <span>
            This Canvas course isn&apos;t linked to a Synergy class yet, so the Synergy column is empty.
          </span>
          <button
            type="button"
            onClick={() => onInspectCourseGrade(selectedCourseId!, 'synergy')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100 transition cursor-pointer"
          >
            <Link2 className="w-3 h-3" />
            Link Synergy Course
          </button>
        </div>
      ) : null}

      {/* Column Legend Header (Desktop) */}
      {timeline.bands.length > 0 && (
        <div className="hidden lg:grid lg:grid-cols-2 gap-3 px-1">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-200/80 text-xs">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Canvas Work &amp; Grades</span>
            </div>
            <span className="text-[11px] font-medium text-blue-700">
              {canvasAlignment === 'due_padded'
                ? canvasPadDays === 0
                  ? 'Aligned by Due Date'
                  : `Aligned by Due Date (+${canvasPadDays}d late bias)`
                : 'Aligned by Graded / Submitted Date'}
            </span>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>Synergy Official Gradebook</span>
            </div>
            <span className="text-[11px] font-medium text-emerald-700">
              Aligned by Synergy Item Date
            </span>
          </div>
        </div>
      )}

      {/* Timeline Bands */}
      {timeline.bands.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-10 text-center space-y-2.5">
          <Calendar className="w-9 h-9 text-slate-300 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800">
            No items in this {windowDays === 'all' ? 'timeline' : `${windowDays}-day window`}
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {totalHiddenByWindow > 0
              ? `There ${totalHiddenByWindow === 1 ? 'is' : 'are'} ${totalHiddenByWindow} older ${totalHiddenByWindow === 1 ? 'entry' : 'entries'} outside the current ${windowDays}-day window.`
              : gradedOnly
              ? 'Try unchecking "Graded only" or syncing official Synergy grades.'
              : 'Submitted or graded Canvas assignments and synced Synergy gradebook entries will appear here.'}
          </p>
          {totalHiddenByWindow > 0 && (
            <button
              type="button"
              data-testid="timeline-show-all-dates-btn"
              onClick={() => setWindowDays('all')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              Show All Dates ({totalHiddenByWindow} more)
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {timeline.bands.map((band) => (
            <section
              key={band.key}
              data-testid={`timeline-band-${band.key}`}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden"
            >
              {/* Shared Date Band Divider */}
              <div className="px-4 py-2 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <h4 className="text-xs font-bold text-slate-800">{band.label}</h4>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <span className="px-2 py-0.5 rounded-full bg-blue-100/80 text-blue-800">
                    {band.canvasItems.length} Canvas
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800">
                    {band.synergyItems.length} Synergy
                  </span>
                </div>
              </div>

              {/* Dual Date-Aligned Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/80">
                {/* LEFT COLUMN: Canvas */}
                <div className="p-3 space-y-2.5 bg-slate-50/20">
                  <div className="lg:hidden text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    Canvas ({band.canvasItems.length})
                  </div>

                  {band.canvasItems.length === 0 ? (
                    <div className="h-full min-h-[64px] rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center p-3 text-[11px] text-slate-400 italic">
                      No Canvas items aligned to this {granularity === 'week' ? 'week' : 'day'}
                    </div>
                  ) : (
                    band.canvasItems.map((entry) => {
                      const a = entry.assignment;
                      const isHighlighted =
                        hoveredLink !== null &&
                        (hoveredLink.canvasCourseId === entry.courseId ||
                          (entry.linkedSynergyCourseKey &&
                            hoveredLink.synergyKey === entry.linkedSynergyCourseKey));

                      const feedbackCount = getAssignmentFeedbackComments(a).length;
                      const style =
                        entry.hasScore && showScores
                          ? getGradeStyle(entry.score, entry.pointsPossible, gradeConfig, {
                              isCourseGrade: false,
                            })
                          : null;

                      const pct =
                        entry.hasScore && entry.pointsPossible > 0
                          ? Math.round((entry.score! / entry.pointsPossible) * 1000) / 10
                          : null;

                      return (
                        <div
                          key={`canvas-${entry.id}`}
                          data-testid={`timeline-canvas-card-${entry.id}`}
                          onMouseEnter={() =>
                            setHoveredLink({
                              canvasCourseId: entry.courseId,
                              synergyKey: entry.linkedSynergyCourseKey,
                            })
                          }
                          onMouseLeave={() => setHoveredLink(null)}
                          onClick={() => onZoomAssignment && onZoomAssignment(a)}
                          className={`rounded-xl border p-3 bg-white transition-all flex flex-col gap-1.5 relative overflow-hidden ${
                            onZoomAssignment ? 'cursor-pointer hover:shadow-xs' : ''
                          } ${
                            isHighlighted
                              ? 'border-blue-400 ring-2 ring-blue-200/80 bg-blue-50/20'
                              : 'border-slate-200/90 hover:border-blue-300'
                          }`}
                          title={onZoomAssignment ? 'Click to view Canvas assignment details' : undefined}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500/80" />

                          <div className="flex items-start justify-between gap-2 pl-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200/70 truncate max-w-[190px]">
                                  {entry.courseEmoji ? `${entry.courseEmoji} ` : ''}
                                  {entry.courseName}
                                </span>
                                {feedbackCount > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    <MessageSquare className="w-2.5 h-2.5" />
                                    {feedbackCount}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                                <span className="line-clamp-2">{entry.title}</span>
                                {a.html_url && a.html_url !== '#' && (
                                  <a
                                    href={a.html_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-slate-400 hover:text-blue-600 shrink-0"
                                    title="Open in Canvas"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Score Pill */}
                            <div className="shrink-0 text-right">
                              {entry.hasScore && showScores ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                                  style={style?.style}
                                >
                                  <span>
                                    {entry.score}
                                    {entry.pointsPossible > 0 ? ` / ${entry.pointsPossible}` : ''}
                                  </span>
                                  {pct !== null && <span className="opacity-80">({pct}%)</span>}
                                </span>
                              ) : entry.hasScore && !showScores ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  Graded
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  {a.manual_marked_submitted ? 'Marked Done' : 'Submitted'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Dates Footer */}
                          <div className="pl-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                            {entry.dueAtMs !== null && (
                              <span>
                                Due{' '}
                                <span className="font-semibold text-slate-700">
                                  {formatShortDate(entry.dueAtMs)}
                                </span>
                                {entry.anchorSource === 'due' && entry.appliedPadDays > 0 && (
                                  <span className="text-blue-600 font-medium ml-1">
                                    (→ {formatShortDate(entry.alignedMs)} +{entry.appliedPadDays}d)
                                  </span>
                                )}
                              </span>
                            )}
                            {entry.gradedAtMs !== null && (
                              <span>
                                Graded{' '}
                                <span className="font-semibold text-slate-700">
                                  {formatShortDate(entry.gradedAtMs)}
                                </span>
                              </span>
                            )}
                            {entry.submittedAtMs !== null && entry.gradedAtMs === null && (
                              <span>
                                Submitted{' '}
                                <span className="font-semibold text-slate-700">
                                  {formatShortDate(entry.submittedAtMs)}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* RIGHT COLUMN: Official Synergy */}
                <div className="p-3 space-y-2.5 bg-emerald-50/10">
                  <div className="lg:hidden text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    Synergy Official ({band.synergyItems.length})
                  </div>

                  {band.synergyItems.length === 0 ? (
                    <div className="h-full min-h-[64px] rounded-xl border border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center p-3 text-[11px] text-slate-400 italic">
                      No Synergy entries in this {granularity === 'week' ? 'week' : 'day'}
                    </div>
                  ) : (
                    band.synergyItems.map((entry) => {
                      const sItem = entry.item;
                      const isHighlighted =
                        hoveredLink !== null &&
                        (hoveredLink.synergyKey === entry.synergyCourseKey ||
                          (entry.linkedCanvasCourseId !== undefined &&
                            hoveredLink.canvasCourseId === entry.linkedCanvasCourseId));

                      const style =
                        entry.hasGrade && sItem.scorePercent !== null && showScores
                          ? getGradeStyle(sItem.scorePercent, 100, gradeConfig, {
                              isCourseGrade: false,
                            })
                          : null;

                      const displayCourseLabel = entry.linkedCanvasCourseName
                        ? `${entry.linkedCourseEmoji ? `${entry.linkedCourseEmoji} ` : ''}${entry.linkedCanvasCourseName}`
                        : pruneCourseTitle(entry.synergyCourseTitle);

                      return (
                        <div
                          key={entry.id}
                          data-testid={`timeline-synergy-card-${sItem.id}`}
                          onMouseEnter={() =>
                            setHoveredLink({
                              canvasCourseId: entry.linkedCanvasCourseId,
                              synergyKey: entry.synergyCourseKey,
                            })
                          }
                          onMouseLeave={() => setHoveredLink(null)}
                          onClick={() => {
                            if (entry.linkedCanvasCourseId && onInspectCourseGrade) {
                              onInspectCourseGrade(entry.linkedCanvasCourseId, 'synergy');
                            }
                          }}
                          className={`rounded-xl border p-3 bg-white transition-all flex flex-col gap-1.5 relative overflow-hidden ${
                            entry.linkedCanvasCourseId && onInspectCourseGrade
                              ? 'cursor-pointer hover:shadow-xs'
                              : ''
                          } ${
                            isHighlighted
                              ? 'border-emerald-500 ring-2 ring-emerald-200/90 bg-emerald-50/20'
                              : 'border-slate-200/90 hover:border-emerald-300'
                          }`}
                          title={
                            entry.linkedCanvasCourseId && onInspectCourseGrade
                              ? 'Click to open full Synergy Course Gradebook details'
                              : undefined
                          }
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/80" />

                          <div className="flex items-start justify-between gap-2 pl-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded border truncate max-w-[190px] ${
                                    entry.linkedCanvasCourseId
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                                      : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {displayCourseLabel}
                                </span>
                                {entry.period && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    P{entry.period}
                                  </span>
                                )}
                                {sItem.category && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 truncate max-w-[150px]">
                                    {sItem.category}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                                {sItem.title}
                              </div>
                            </div>

                            {/* Official Score Pill */}
                            <div className="shrink-0 text-right">
                              {!showScores && entry.hasGrade ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  Graded
                                </span>
                              ) : sItem.scorePercent !== null && showScores ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                                  style={style?.style}
                                >
                                  <span>{sItem.scoreText || sItem.pointsText}</span>
                                  <span>({sItem.scorePercent}%)</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  {sItem.scoreText || sItem.pointsText || 'Not Graded'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Synergy Date & Notes Footer */}
                          <div className="pl-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                            {entry.dateMs !== null && (
                              <span>
                                Gradebook Date{' '}
                                <span className="font-semibold text-slate-700">
                                  {formatShortDate(entry.dateMs)}
                                </span>
                              </span>
                            )}
                            {entry.dueDateMs !== null && entry.dueDateMs !== entry.dateMs && (
                              <span>
                                Due{' '}
                                <span className="font-semibold text-slate-700">
                                  {formatShortDate(entry.dueDateMs)}
                                </span>
                              </span>
                            )}
                            {sItem.notes && (
                              <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 rounded font-medium">
                                <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                {sItem.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
