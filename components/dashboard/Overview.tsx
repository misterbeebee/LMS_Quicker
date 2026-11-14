import React, { useMemo, useState } from 'react';
import {
  CourseData,
  ALL_COURSES_ID,
  CanvasCalendarEvent,
  CanvasAnnouncement,
} from '../../types';
import {
  ExternalLink,
  GraduationCap,
  ClipboardList,
  Layers,
  Settings,
  Compass,
  Play,
  Bell,
  Calendar,
  ChevronDown,
  MapPin,
  Database,
} from 'lucide-react';
import { getCourseIdFromEvent, getCourseIdFromAnnouncement } from '../../services/canvas';
import {
  isAssignmentSubmitted,
  isAssignmentObsolete,
  isPastCalendarEvent,
  formatCalendarEventDate,
  stripHtml,
} from '../../utils/dashboard-helpers';
import { getCalendarEventWebUrl } from '../../utils/canvasUrls';
import { getEffectiveCourseGrade } from '../../utils/gradeInspector';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, getGradeStyle } from '../../services/gradeScale';
import { CourseCustomization } from '../../services/courseCustomization';
import { TutorialId } from './InteractiveTutorialModal';

interface OverviewProps {
  course: CourseData;
  allCoursesData?: CourseData[];
  onNavigate: (tab: 'overview' | 'assignments' | 'calendar' | 'modules') => void;
  showScores?: boolean;
  showObsolete?: boolean;
  showArchived?: boolean;
  archivedAssignmentIds?: Set<number>;
  showCalendarEvents?: boolean;
  showPastEvents?: boolean;
  calendarEvents?: CanvasCalendarEvent[];
  announcements?: CanvasAnnouncement[];
  getCourseName?: (id: number) => string;
  canvasUrl?: string;
  gradeConfig?: GradeScaleConfig;
  onOpenGradeSettings?: () => void;
  onInspectCourseGrade?: (courseId: number) => void;
  courseCustomizations?: Record<number, CourseCustomization>;
  onSelectCourse?: (courseId: number) => void;
  onStartTutorial?: (tutorialId?: TutorialId) => void;
}

const formatAnnouncementShortDate = (dateStr?: string | null): string => {
  if (!dateStr) return 'Recently';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const Overview: React.FC<OverviewProps> = ({
  course,
  allCoursesData = [],
  onNavigate,
  showScores = true,
  showObsolete = false,
  showArchived = false,
  archivedAssignmentIds,
  showCalendarEvents = true,
  showPastEvents = false,
  calendarEvents = [],
  announcements = [],
  getCourseName,
  canvasUrl = '',
  gradeConfig = DEFAULT_GRADE_CONFIG,
  onOpenGradeSettings,
  onInspectCourseGrade,
  courseCustomizations,
  onSelectCourse,
  onStartTutorial,
}) => {
  const [isAnnouncementsExpanded, setIsAnnouncementsExpanded] = useState(true);
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);

  const isMultiCourse = course.course.id === ALL_COURSES_ID;

  const getEffectiveGrade = (c: CourseData) => getEffectiveCourseGrade(c);

  const singleGradeInfo = getEffectiveGrade(course);
  const notSubmittedCount = (course?.assignments || []).filter((a) => {
    if (a.is_calendar_event) return false;
    if (isAssignmentSubmitted(a)) return false;
    if (!showArchived && (archivedAssignmentIds?.has(a.id) ?? false)) return false;
    if (!showObsolete && isAssignmentObsolete(a)) return false;
    return true;
  }).length;

  const relevantCalendarEvents = useMemo(() => {
    if (!showCalendarEvents) return [];
    if (isMultiCourse && course.course.course_code === 'NONE') return [];
    const nowMs = Date.now();

    const activeCourseIdSet =
      isMultiCourse && allCoursesData.length > 0
        ? new Set(allCoursesData.map((c) => c.course.id))
        : null;

    const fromCourse = (course?.assignments || []).filter((a) => !!a.is_calendar_event);
    const list =
      fromCourse.length > 0
        ? fromCourse
            .filter((a) => showPastEvents || !isPastCalendarEvent(a, nowMs))
            .map((a) => ({
              ...a,
              html_url:
                getCalendarEventWebUrl(a, canvasUrl) ||
                (a.html_url && a.html_url !== '#' ? a.html_url : ''),
            }))
        : calendarEvents && calendarEvents.length > 0
          ? calendarEvents
              .filter((ev) => {
                if (!showPastEvents && isPastCalendarEvent(ev, nowMs)) return false;
                const selectedId = course?.course?.id;
                const cId = getCourseIdFromEvent(ev);
                if (!selectedId || selectedId === ALL_COURSES_ID) {
                  if (cId === null || ev.context_code === 'user_self') return true;
                  return activeCourseIdSet ? activeCourseIdSet.has(cId) : true;
                }
                return cId === selectedId || cId === null || ev.context_code === 'user_self';
              })
              .map((ev) => {
                const cId = getCourseIdFromEvent(ev);
                return {
                  id: -Math.abs(ev.id || 99999),
                  name: ev.title || 'Untitled Event',
                  description:
                    ev.description || (ev.location_name ? `Location: ${ev.location_name}` : ''),
                  due_at:
                    ev.start_at ||
                    ev.end_at ||
                    (ev.all_day_date ? `${ev.all_day_date}T23:59:59Z` : null),
                  start_at: ev.start_at,
                  end_at: ev.end_at,
                  all_day_date: ev.all_day_date,
                  context_code: ev.effective_context_code || ev.context_code,
                  points_possible: 0,
                  course_id: cId || 0,
                  html_url: getCalendarEventWebUrl(ev, canvasUrl) || '',
                  submission_types: ['calendar_event'],
                  locked_for_user: false,
                  is_calendar_event: true,
                  location_name: ev.location_name,
                } as any;
              })
          : [];

    return [...list].sort((a, b) => {
      const ta = new Date(a.start_at || a.due_at || a.end_at || 0).getTime() || 0;
      const tb = new Date(b.start_at || b.due_at || b.end_at || 0).getTime() || 0;
      return ta - tb;
    });
  }, [
    course?.assignments,
    course?.course?.id,
    course?.course?.course_code,
    isMultiCourse,
    allCoursesData,
    calendarEvents,
    showCalendarEvents,
    showPastEvents,
    canvasUrl,
  ]);

  const eventCount = relevantCalendarEvents.length;
  const summaryEvents = relevantCalendarEvents.slice(0, 4);

  // Announcements summary metrics & headlines (prioritize unread first, newest within group)
  const unreadAnnouncements = useMemo(
    () => announcements.filter((a) => a.read_state !== 'read'),
    [announcements]
  );
  const unreadAnnouncementCount = unreadAnnouncements.length;
  const totalAnnouncementCount = announcements.length;
  const hasReadAnnouncements = totalAnnouncementCount > unreadAnnouncementCount;

  const summaryAnnouncements = useMemo(() => {
    const sorted = [...announcements].sort((a, b) => {
      const aUnread = a.read_state !== 'read' ? 1 : 0;
      const bUnread = b.read_state !== 'read' ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const ta = new Date(a.posted_at || 0).getTime() || 0;
      const tb = new Date(b.posted_at || 0).getTime() || 0;
      return tb - ta;
    });
    return sorted.slice(0, 3);
  }, [announcements]);

  const resolveCourseLabel = (ann: CanvasAnnouncement): string => {
    const cId = ann.course_id || getCourseIdFromAnnouncement(ann);
    if (cId && getCourseName) return getCourseName(cId);
    if (cId) {
      const match = allCoursesData.find((c) => c.course.id === cId) || (course.course.id === cId ? course : undefined);
      if (match) return pruneCourseTitle(match.course.nickname || match.course.name);
    }
    return ann.context_code || 'Course';
  };

  return (
    <div className="space-y-6">
      {/* Calm, Neutral Guided Walkthroughs Banner */}
      {onStartTutorial && (
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-800 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-slate-200/70 text-slate-700 shrink-0">
              <Compass className="w-4 h-4 text-slate-700" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-slate-800">Guided Walkthroughs</h3>
              <p className="text-[11px] text-slate-500">
                Automated interactive tours showcasing interface controls and navigation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onStartTutorial('major_views')}
              className="px-3 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Tour Major UI Views (Overview, Board, Table, Calendar, Modules)"
            >
              <Play className="w-3 h-3 text-blue-600 fill-blue-600" />
              <span>Tour Major Views</span>
            </button>
            <button
              type="button"
              onClick={() => onStartTutorial('filters_and_controls')}
              className="px-3 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Tour Display popover, filters, calendar events, and color thresholds"
            >
              <Settings className="w-3 h-3 text-slate-500" />
              <span>Tour Filters & Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Grade Card */}
        <div
          className="bg-white px-4 py-3 rounded-xl shadow-xs border border-slate-200/90 flex items-center justify-between group relative"
          title="Course Grade Summary"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {isMultiCourse ? 'Active Courses' : 'Current Grade'}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                {isMultiCourse ? (
                  <span className="text-xl font-bold text-slate-900">
                    {allCoursesData.length} classes
                  </span>
                ) : singleGradeInfo && singleGradeInfo.hasData && showScores ? (
                  (() => {
                    const style = getGradeStyle(singleGradeInfo.score, 100, gradeConfig, {
                      isCourseGrade: true,
                    });
                    return (
                      <>
                        <span
                          className="text-xl font-bold"
                          style={{ color: style.style.color || undefined }}
                        >
                          {singleGradeInfo.score}%
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.2 rounded ${style.badgeClass}`}>
                          {singleGradeInfo.letter || style.letter}
                        </span>
                        {singleGradeInfo.isEstimated && (
                          <span
                            className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded font-medium cursor-help"
                            title="Estimated Course Grade: Canvas does not provide an official course grade for this class, so this is calculated as a heuristic unweighted average of your graded assignments."
                          >
                            Est
                          </span>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <span className="text-xs font-medium text-slate-400 italic">
                    {!showScores ? 'Hidden (Settings)' : 'No Grade Data (Hidden by teacher)'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isMultiCourse && onInspectCourseGrade && (
              <button
                type="button"
                data-testid="overview-inspect-single-grade"
                onClick={() => onInspectCourseGrade(course.course.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 border border-blue-200/80 transition cursor-pointer"
                title="Inspect how this course grade is fetched or calculated"
              >
                <Database className="w-3 h-3" />
                <span>Inspect</span>
              </button>
            )}
            {onOpenGradeSettings && (
              <button
                type="button"
                onClick={onOpenGradeSettings}
                className="p-1 rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Configure Grade Threshold Colors"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Assignments Card - Compact & Clickable */}
        <div
          onClick={() => onNavigate('assignments')}
          className="bg-white px-4 py-3 rounded-xl shadow-xs border border-slate-200/90 cursor-pointer hover:border-blue-300 hover:shadow-xs transition-all group flex items-center justify-between"
          title="Click to view Assignments"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0 group-hover:bg-blue-100 transition-colors">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-blue-600 transition-colors">
                Assignments
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  {notSubmittedCount}
                </span>
                <span className="text-xs text-slate-500">not submitted</span>
                {eventCount > 0 && (
                  <span
                    className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded-full"
                    title="Calendar events merged in"
                  >
                    +{eventCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Modules Card - Compact & Clickable */}
        <div
          onClick={() => onNavigate('modules')}
          className="bg-white px-4 py-3 rounded-xl shadow-xs border border-slate-200/90 cursor-pointer hover:border-blue-300 hover:shadow-xs transition-all group flex items-center justify-between"
          title="Click to view Modules"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 group-hover:bg-indigo-100 transition-colors">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-blue-600 transition-colors">
                Modules
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  {course?.modules?.length || 0}
                </span>
                <span className="text-xs text-slate-500">units</span>
              </div>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Overview Summaries Grid: Announcements Summary & Calendar Events Summary */}
      <div
        className={`grid grid-cols-1 ${showCalendarEvents ? 'lg:grid-cols-2' : ''} gap-4`}
      >
        {/* Collapsible Announcements Summary */}
        <section
          data-testid="overview-announcements-summary"
          aria-label="Announcements Summary"
          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col"
        >
          <div
            className={`flex items-center justify-between gap-2 flex-wrap ${
              isAnnouncementsExpanded ? 'mb-3.5' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/80 shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Announcements Summary</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                {unreadAnnouncementCount} unread
                {hasReadAnnouncements ? ` / ${totalAnnouncementCount} total` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('assignments')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-md hover:bg-blue-50/70 transition cursor-pointer"
              >
                View All Announcements
              </button>
              <button
                type="button"
                aria-expanded={isAnnouncementsExpanded}
                aria-label={
                  isAnnouncementsExpanded
                    ? 'Collapse announcements summary'
                    : 'Expand announcements summary'
                }
                onClick={() => setIsAnnouncementsExpanded((prev) => !prev)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50/70 hover:bg-slate-100 transition cursor-pointer"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    isAnnouncementsExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {isAnnouncementsExpanded && (
            summaryAnnouncements.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 text-center">
                <p className="text-xs font-medium text-slate-600">
                  No active announcements for the selected courses.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {summaryAnnouncements.map((ann) => {
                  const hasLink = !!(ann.html_url && ann.html_url !== '#');
                  const isUnread = ann.read_state !== 'read';
                  const snippet = stripHtml(ann.message).trim();
                  const courseLabel = resolveCourseLabel(ann);

                  return (
                    <div
                      key={ann.id}
                      className="p-3 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-amber-200 transition flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-slate-600 truncate">
                          {courseLabel}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                              isUnread
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {isUnread ? 'Unread' : 'Read'}
                          </span>
                          <span className="text-slate-400">
                            {formatAnnouncementShortDate(ann.posted_at)}
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        {hasLink ? (
                          <a
                            href={ann.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-xs text-slate-900 hover:text-amber-700 hover:underline inline-flex items-center gap-1 max-w-full"
                          >
                            <span className="truncate">{ann.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                          </a>
                        ) : (
                          <div className="font-semibold text-xs text-slate-900 truncate">
                            {ann.title}
                          </div>
                        )}
                        {snippet && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{snippet}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {totalAnnouncementCount > summaryAnnouncements.length && (
                  <div className="text-right pt-0.5">
                    <button
                      type="button"
                      onClick={() => onNavigate('assignments')}
                      className="text-[11px] font-semibold text-amber-700 hover:underline cursor-pointer"
                    >
                      +{totalAnnouncementCount - summaryAnnouncements.length} more announcements
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </section>

        {/* Collapsible Calendar Events Summary */}
        {showCalendarEvents && (
          <section
            data-testid="overview-calendar-summary"
            aria-label="Calendar Summary"
            className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col"
          >
            <div
              className={`flex items-center justify-between gap-2 flex-wrap ${
                isCalendarExpanded ? 'mb-3.5' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200/80 shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {showPastEvents ? 'Calendar Events' : 'Upcoming Calendar Events'} ({eventCount})
                </h3>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 px-2 py-1 rounded-md hover:bg-purple-50 transition cursor-pointer"
                >
                  Open Calendar
                </button>
                <button
                  type="button"
                  aria-expanded={isCalendarExpanded}
                  aria-label={
                    isCalendarExpanded
                      ? 'Collapse calendar summary'
                      : 'Expand calendar summary'
                  }
                  onClick={() => setIsCalendarExpanded((prev) => !prev)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-slate-50/70 hover:bg-slate-100 transition cursor-pointer"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      isCalendarExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {isCalendarExpanded && (
              summaryEvents.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 text-center">
                  <p className="text-xs font-medium text-slate-600">
                    {showPastEvents ? 'No calendar events' : 'No upcoming calendar events'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {summaryEvents.map((ev) => {
                    const formattedDate = formatCalendarEventDate(ev);
                    const eventUrl =
                      getCalendarEventWebUrl(ev, canvasUrl) ||
                      (ev.html_url && ev.html_url !== '#' ? ev.html_url : null);

                    return (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-purple-200 transition flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            {eventUrl ? (
                              <a
                                href={eventUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-semibold text-xs text-slate-900 hover:text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
                                title={`Open "${ev.name}" in Canvas`}
                              >
                                <span className="truncate">{ev.name}</span>
                                <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                              </a>
                            ) : (
                              <div className="font-semibold text-xs text-slate-900 truncate">
                                {ev.name}
                              </div>
                            )}
                          </div>
                          {eventUrl && (
                            <a
                              href={eventUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5 shrink-0"
                            >
                              <span>Canvas</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-600 truncate">
                            {formattedDate}
                          </span>
                          {ev.location_name && (
                            <span
                              className="truncate max-w-[140px] text-slate-500 inline-flex items-center gap-0.5 shrink-0"
                              title={ev.location_name}
                            >
                              <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                              <span className="truncate">{ev.location_name}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {eventCount > summaryEvents.length && (
                    <div className="text-right pt-0.5">
                      <button
                        type="button"
                        onClick={() => onNavigate('calendar')}
                        className="text-[11px] font-semibold text-purple-700 hover:underline cursor-pointer"
                      >
                        +{eventCount - summaryEvents.length} more in Calendar
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </section>
        )}
      </div>

      {/* Multi-Course View: Course Grade & Workload Grid */}
      {isMultiCourse && allCoursesData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Course Academic Standing & Workload
              </h3>
            </div>
            {onOpenGradeSettings && (
              <button
                type="button"
                onClick={onOpenGradeSettings}
                className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Grade Scales</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allCoursesData.map((c) => {
              const gradeInfo = getEffectiveGrade(c);
              const custom = courseCustomizations?.[c.course.id];
              const displayName = pruneCourseTitle(c.course.nickname || c.course.name);
              const emoji = custom?.emoji;
              const pending = (c.assignments || []).filter((a) => {
                if (a.is_calendar_event) return false;
                if (isAssignmentSubmitted(a)) return false;
                if (!showArchived && (archivedAssignmentIds?.has(a.id) ?? false)) return false;
                if (!showObsolete && isAssignmentObsolete(a)) return false;
                return true;
              }).length;

              return (
                <div
                  key={c.course.id}
                  onClick={() => onSelectCourse && onSelectCourse(c.course.id)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer bg-slate-50/40 hover:bg-white flex flex-col justify-between group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {emoji ? <span className="text-base shrink-0">{emoji}</span> : null}
                      <span
                        className="font-semibold text-xs text-slate-900 truncate group-hover:text-blue-600 transition-colors"
                        title={c.course.name}
                      >
                        {displayName}
                      </span>
                    </div>

                    {gradeInfo && gradeInfo.hasData && showScores ? (
                      (() => {
                        const style = getGradeStyle(gradeInfo.score, 100, gradeConfig, {
                          isCourseGrade: true,
                        });
                        return (
                          <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                            <span
                              className="text-xs font-bold w-12 text-right"
                              style={{ color: style.style.color || undefined }}
                            >
                              {gradeInfo.score}%
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded w-7 text-center shrink-0 ${style.badgeClass}`}
                            >
                              {gradeInfo.letter || style.letter}
                            </span>
                            <span className="w-7 flex justify-center shrink-0">
                              {gradeInfo.isEstimated ? (
                                <span
                                  className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded font-medium cursor-help"
                                  title="Estimated Course Grade: Canvas does not provide an official course grade for this class, so this is calculated as a heuristic unweighted average of your graded assignments."
                                >
                                  Est
                                </span>
                              ) : null}
                            </span>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-slate-400 italic">
                          {!showScores ? 'Hidden' : 'No Data'}
                        </span>
                        <span className="w-7 shrink-0" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                    <span>
                      {pending} pending {pending === 1 ? 'task' : 'tasks'}
                    </span>
                    <div className="flex items-center gap-2">
                      {onInspectCourseGrade && (
                        <button
                          type="button"
                          data-testid={`overview-inspect-grade-${c.course.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectCourseGrade(c.course.id);
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-200/70 transition cursor-pointer"
                          title={`Inspect how ${displayName}'s grade is fetched or calculated`}
                        >
                          <Database className="w-2.5 h-2.5" />
                          <span>Inspect</span>
                        </button>
                      )}
                      <span className="text-slate-400 group-hover:text-blue-600 transition-colors flex items-center gap-0.5">
                        View <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};