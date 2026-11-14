

import React, { useMemo, useState, useEffect } from 'react';
import { CanvasAssignment, CanvasTodoItem, CanvasAnnouncement, CourseData } from '../../types';
import { 
  Calendar, AlertCircle, ArrowRight, AlertTriangle, CheckCircle2, 
  Lock, FileCheck, Archive, ArchiveRestore, HelpCircle, MessageSquare, 
  BookOpen, MapPin, Maximize2, Check, FileText, Settings, Languages, Globe,
  ChevronDown, ChevronRight, Megaphone, Loader2, ExternalLink
} from 'lucide-react';
import { getAssignmentStatus, stripHtml, isAssignmentSubmitted, getScoreStyle, hasUnacknowledgedFeedback, getUnacknowledgedFeedbackCount, isAssignmentPastDue, isAssignmentLocked, isPresumedCompleted, isClassworkOnPaper, getAssignmentLockInfo, getAssignmentFeedbackComments, formatPoints, formatRelativeDueDate, formatCalendarEventDate, isPastCalendarEvent } from '../../utils/dashboard-helpers';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import { AssignmentZoomModal } from './AssignmentZoomModal';
import { TranslationModal } from './TranslationModal';
import { detectWorldLanguage, WorldLanguageMatch, isItemTranslated, isTranslationInProgress } from '../../services/translation';
import { CourseCustomization } from '../../services/courseCustomization';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, getGradeStyle } from '../../services/gradeScale';
import { useNow } from '../../utils/useRelativeTime';
import { extractAssignmentFromTodo, getCalendarEventWebUrl } from '../../utils/canvasUrls';
import { AnnouncementsWidget } from './AnnouncementsWidget';

interface AssignmentsBoardProps {
  assignments: CanvasAssignment[];
  getCourseName: (id: number) => string;
  courseCustomizations?: Record<number, CourseCustomization>;
  archivedAssignmentIds?: Set<number>;
  onToggleArchived?: (id: number) => void;
  onToggleMarkedSubmitted?: (id: number) => void;
  showScores?: boolean;
  limitCompletedToRecent?: boolean; // New prop for Overview section
  showArchived?: boolean;
  showSubmitted?: boolean;
  showObsolete?: boolean;
  showPastEvents?: boolean;
  showIds?: boolean;
  canvasUrl?: string;
  apiKey?: string;
  useProxy?: boolean;
  acknowledgedFeedbackIds?: Set<string | number>;
  onToggleAcknowledgeComment?: (commentId: string | number) => void;
  onAcknowledgeAllComments?: (commentIds: (string | number)[]) => void;
  filterFeedbackOnly?: boolean;
  onToggleFilterFeedback?: (val: boolean) => void;
  showClassAverages?: boolean;
  gradeConfig?: GradeScaleConfig;
  onOpenGradeSettings?: () => void;
  todoItems?: CanvasTodoItem[];
  onMarkTodoDone?: (item: CanvasTodoItem) => Promise<void>;
  announcements?: CanvasAnnouncement[];
  onDismissAnnouncement?: (announcement: CanvasAnnouncement) => Promise<void>;
  courses?: CourseData[];
}

export const AssignmentsBoard: React.FC<AssignmentsBoardProps> = ({ 
  assignments, 
  getCourseName,
  courseCustomizations,
  archivedAssignmentIds,
  onToggleArchived,
  onToggleMarkedSubmitted,
  showScores = true,
  limitCompletedToRecent = false,
  showArchived = false,
  showSubmitted = false,
  showObsolete = false,
  showPastEvents = false,
  showIds = false,
  canvasUrl = '',
  apiKey = '',
  useProxy = false,
  acknowledgedFeedbackIds,
  onToggleAcknowledgeComment,
  onAcknowledgeAllComments,
  filterFeedbackOnly = false,
  onToggleFilterFeedback,
  showClassAverages = false,
  gradeConfig = DEFAULT_GRADE_CONFIG,
  onOpenGradeSettings,
  todoItems = [],
  onMarkTodoDone,
  announcements = [],
  onDismissAnnouncement,
  courses = []
}) => {
  const now = useNow();
  const [workflowSection, setWorkflowSection] = useState<'upcoming' | 'completed'>('upcoming');
  const [isTodoExpanded, setIsTodoExpanded] = useState(true);
  const [processingTodoKey, setProcessingTodoKey] = useState<string | null>(null);
  const [zoomedAssignment, setZoomedAssignment] = useState<CanvasAssignment | null>(null);
  const [confirmingBoardAckAll, setConfirmingBoardAckAll] = useState(false);
  const [localFilterFeedback, setLocalFilterFeedback] = useState(false);
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'assignments' | 'events'>('all');
  const [, setTransVersion] = useState(0);

  useEffect(() => {
    const handler = () => setTransVersion(v => v + 1);
    window.addEventListener('canvas:translation_changed', handler);
    return () => window.removeEventListener('canvas:translation_changed', handler);
  }, []);

  const [translatingItem, setTranslatingItem] = useState<{
    itemId?: string | number;
    assignmentTitle: string;
    assignmentDescription?: string;
    courseName: string;
    languageMatch: WorldLanguageMatch;
  } | null>(null);

  const handleTodoDone = async (item: CanvasTodoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onMarkTodoDone) return;
    const key = item.ignore || item.html_url;
    setProcessingTodoKey(key);
    try {
      await onMarkTodoDone(item);
    } finally {
      setProcessingTodoKey(null);
    }
  };

  const activeFilterFeedback = onToggleFilterFeedback ? filterFeedbackOnly : localFilterFeedback;
  const toggleFeedbackFilter = onToggleFilterFeedback ? () => onToggleFilterFeedback(!filterFeedbackOnly) : () => setLocalFilterFeedback(!localFilterFeedback);

  const unackTotalCount = useMemo(() => {
    return getUnacknowledgedFeedbackCount(assignments, acknowledgedFeedbackIds || new Set());
  }, [assignments, acknowledgedFeedbackIds]);

  const feedbackAssignments = useMemo(() => {
    return assignments.filter(a => hasUnacknowledgedFeedback(a, acknowledgedFeedbackIds || new Set()));
  }, [assignments, acknowledgedFeedbackIds]);
  
  // Helper to get the latest relevant date for an assignment (Activity Date)
  // For completed items, we care about when it was touched (submitted/graded/commented), not when it was due.
  const getLastActivityTime = (a: CanvasAssignment, includeDueDate: boolean = true) => {
      const sub = a.submission;
      const times: number[] = [];
      
      if (sub?.submitted_at) times.push(new Date(sub.submitted_at).getTime());
      if (sub?.graded_at) times.push(new Date(sub.graded_at).getTime());
      
      if (sub?.submission_comments) {
          sub.submission_comments.forEach(c => times.push(new Date(c.created_at).getTime()));
      }
      
      // Only include due date if requested (usually only for non-completed items sorting)
      if (includeDueDate && a.due_at) times.push(new Date(a.due_at).getTime());
      
      return times.length > 0 ? Math.max(...times) : 0;
  };

  const grouped = useMemo(() => {
    const now = new Date();
    
    // "Due Soon" / "Up Next" threshold: 60 hours from now
    const dueSoonThreshold = new Date(now.getTime() + (60 * 60 * 60 * 1000));
    
    // "This Week" threshold: 7 days from now
    const nextWeekThreshold = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

    const buckets = {
      overdue: [] as CanvasAssignment[],
      today: [] as CanvasAssignment[], // Renamed conceptually to "Up Next"
      thisWeek: [] as CanvasAssignment[],
      later: [] as CanvasAssignment[],
      noDate: [] as CanvasAssignment[],
      completed: [] as CanvasAssignment[]
    };

    assignments.forEach(a => {
      // Item Type filter: All / Assignments Only / Events Only
      if (itemTypeFilter === 'assignments' && a.is_calendar_event) return;
      if (itemTypeFilter === 'events' && !a.is_calendar_event) return;
      if (!showPastEvents && a.is_calendar_event && isPastCalendarEvent(a, now.getTime())) return;

      // 1. Archived filter: hide unless showArchived is true
      const isArchived = archivedAssignmentIds?.has(a.id);
      if (isArchived && !showArchived) {
        return;
      }

      // Use consolidated submission logic
      const isSubmitted = isAssignmentSubmitted(a);

      // 2. Submitted filter: hide unless showSubmitted is true
      if (isSubmitted && !showSubmitted) {
        return;
      }

      // 3. Obsolete filter: hide items >6 weeks overdue (42 days) unless showObsolete is true
      if (!showObsolete && a.due_at && !isSubmitted && !a.is_calendar_event) {
        const dueTime = new Date(a.due_at).getTime();
        const diffDays = (now.getTime() - dueTime) / (1000 * 3600 * 24);
        if (diffDays > 42) {
          return;
        }
      }

      // If submitted, graded, or completed, move to completed bucket immediately
      if (isSubmitted) {
          buckets.completed.push(a);
          return;
      }

      if (!a.due_at) {
        buckets.noDate.push(a);
        return;
      }

      const due = new Date(a.due_at);
      const lockInfo = getAssignmentLockInfo(a);

      if (due < now) {
         if (a.is_calendar_event) {
           // Keep calendar events occurring today or still active in "Up Next" today
           const eventEnd = (a as any).end_at ? new Date((a as any).end_at) : null;
           const isToday = due.toDateString() === now.toDateString();
           if ((eventEnd && eventEnd > now) || isToday) {
             buckets.today.push(a);
           } else {
             // Past calendar events from previous days are completed sessions
             buckets.completed.push(a);
           }
         } else {
           buckets.overdue.push(a);
         }
      } else if (due < dueSoonThreshold) {
        // Assignments locked until a future date cannot be worked on right now.
        // Don't show in "Up Next" (today); push back to "thisWeek" (or "later")
        if (lockInfo.isLockedUntil) {
           if (due < nextWeekThreshold) {
             buckets.thisWeek.push(a);
           } else {
             buckets.later.push(a);
           }
        } else {
           buckets.today.push(a);
        }
      } else if (due < nextWeekThreshold) {
        buckets.thisWeek.push(a);
      } else {
        buckets.later.push(a);
      }
    });

    // If limitCompletedToRecent is true, filter completed items to only show those from the last 7 days
    if (limitCompletedToRecent) {
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000); // Tighter Exception cap

        // 1. Identify the "Most Recent Graded" assignment (Absolute latest activity)
        let mostRecentGradedId = -1;
        let maxGradedDate = 0;

        buckets.completed.forEach(a => {
             const hasScore = a.submission?.score !== null && a.submission?.score !== undefined;
             if (hasScore) {
                 const d = getLastActivityTime(a, false); 
                 if (d > maxGradedDate) {
                     maxGradedDate = d;
                     mostRecentGradedId = a.id;
                 }
             }
        });

        buckets.completed = buckets.completed.filter(a => {
            // Manual Override Handling
            if (a.manual_marked_submitted) {
                 if (!a.due_at) return false; // Hide undated manual items in Snapshot view to avoid clutter
                 const dueTime = new Date(a.due_at).getTime();
                 return dueTime > oneWeekAgo; // Hide manual items due > 1 week ago
            }

            const lastActivity = getLastActivityTime(a, false);
            
            // Safety: If no date data (and not manual), hide it.
            if (lastActivity === 0) return false;

            // Exception: Always show the most recent graded assignment (BUT ONLY if within 14 days)
            if (a.id === mostRecentGradedId) {
                return lastActivity > fourteenDaysAgo;
            }

            // Standard Rule: Only show items with activity in the last 7 days.
            return lastActivity > oneWeekAgo;
        });

        // Resort completed items by "Last Activity" descending for the snapshot view
        buckets.completed.sort((a, b) => getLastActivityTime(b, false) - getLastActivityTime(a, false));

    } else {
        // Standard sort descending for completed/past items (most recent due date first)
        const dateSortDesc = (a: CanvasAssignment, b: CanvasAssignment) => 
          new Date(b.due_at || 0).getTime() - new Date(a.due_at || 0).getTime();
          
        buckets.completed.sort(dateSortDesc);
    }

    // Sort buckets by date
    const dateSort = (a: CanvasAssignment, b: CanvasAssignment) => 
      new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime();

    buckets.overdue.sort(dateSort);
    buckets.today.sort(dateSort);
    buckets.thisWeek.sort(dateSort);
    buckets.later.sort(dateSort);

    return buckets;
  }, [assignments, limitCompletedToRecent, archivedAssignmentIds, showArchived, showSubmitted, showObsolete, showPastEvents, activeFilterFeedback, acknowledgedFeedbackIds, itemTypeFilter]);

  // Fix: Cast 'arr' to CanvasAssignment[] to access .length safely
  const isEmpty = Object.values(grouped).every((arr) => (arr as CanvasAssignment[]).length === 0);

  const renderCard = (a: CanvasAssignment, variant: 'red' | 'orange' | 'blue' | 'gray' | 'green') => {
    const isCompleted = (a.submission?.score !== null && a.submission?.score !== undefined) || a.submission?.grade?.toLowerCase() === 'complete';
    const lockInfo = getAssignmentLockInfo(a);
    const isLocked = lockInfo.isLocked;
    const isPastDue = isAssignmentPastDue(a);
    const presumed = isPresumedCompleted(a);
    const isClasswork = isClassworkOnPaper(a);
    
    const types = a.submission_types || [];
    const isPassive = types.includes('on_paper') || types.includes('none') || types.includes('external_tool') || types.includes('not_graded');
    
    const isArchived = archivedAssignmentIds?.has(a.id);
    const isRealSubmitted = isAssignmentSubmitted(a) && !a.manual_marked_submitted;
    const hasUnack = hasUnacknowledgedFeedback(a, acknowledgedFeedbackIds || new Set());
    
    let finalVariant = variant;
    let showMaybeSubmitted = false;

    if (variant === 'red' && isPassive) {
        finalVariant = 'orange';
        showMaybeSubmitted = true;
    }

    // Desaturated flat left accent stripe (eliminates C-shape curve and tips wrapping around the corner)
    let stripeColor = 'bg-slate-300';
    if (a.is_calendar_event) {
      stripeColor = 'bg-violet-400/80';
    } else if (finalVariant === 'red') {
      stripeColor = 'bg-rose-400/90';
    } else if (finalVariant === 'orange') {
      stripeColor = 'bg-amber-400/80';
    }

    const status = getAssignmentStatus(a);
    // Keep prominent status badge color only for overdue items; keep others clean neutral slate
    const statusColor = a.is_calendar_event 
      ? 'bg-purple-50 text-purple-700 border border-purple-100'
      : (finalVariant === 'red' || finalVariant === 'orange')
        ? status.color
        : 'bg-slate-100/90 text-slate-700 border border-slate-200';
    
    const hasScore = a.submission?.score !== null && a.submission?.score !== undefined;
    let scoreBadge: { className: string; style?: React.CSSProperties } = { className: 'bg-slate-50 text-slate-500 border border-slate-200', style: {} };
    const customGradeStyle = hasScore ? getGradeStyle(a.submission!.score, a.points_possible, gradeConfig, { isCourseGrade: false }) : { className: '', style: {}, letter: '' };
    
    if (hasScore && showScores) {
        scoreBadge = getScoreStyle(a.submission!.score, a.points_possible);
    }

    // Determine the "Display Date" for completed items (Due date or Submitted date; score & 0 pts belong in top-right score entity)
    let completedDateLabel = status.label;
    if (presumed.presumed) {
        completedDateLabel = a.due_at 
          ? `Due ${new Date(a.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` 
          : 'Completed';
    } else if (variant === 'green' && isAssignmentSubmitted(a)) {
        const sub = a.submission;
        let latestLabel = a.due_at 
          ? `Due ${new Date(a.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` 
          : 'Submitted';
        
        if (sub?.submitted_at) {
            latestLabel = `Submitted ${new Date(sub.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        } else if (a.manual_marked_submitted) {
            latestLabel = "Marked Done";
        }
        completedDateLabel = latestLabel;
    }

    const courseName = getCourseName(a.course_id);
    const customCourse = courseCustomizations?.[a.course_id];
    const langMatch = detectWorldLanguage(courseName);
    const safeUrl = (a.is_calendar_event
      ? getCalendarEventWebUrl(a, canvasUrl)
      : (a.html_url && a.html_url !== '#' ? a.html_url : '')) || '';

    return (
      <div 
        key={a.id}
        onClick={() => setZoomedAssignment(a)}
        className={`relative bg-white rounded-xl shadow-xs border border-slate-200/90 hover:shadow-md hover:border-slate-300 transition-all group cursor-pointer flex flex-col justify-between overflow-hidden ${isArchived ? 'opacity-60 grayscale' : ''}`}
        title="Click card to zoom for details"
      >
        {/* Flat left accent stripe (replaces border-l-4 to eliminate C-shape curve and tip hooks) */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${stripeColor} pointer-events-none z-10`} />

        {/* Top bonded header bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/90 border-b border-slate-100 text-[11px] gap-2">
          {/* Class Title & Badges bonded flush to top-left */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span 
              className="font-semibold text-slate-800 text-xs truncate max-w-[170px]" 
              title={courseName}
            >
              {customCourse?.emoji ? `${customCourse.emoji} ` : ''}{courseName}
            </span>
            {a.is_calendar_event && (
              <span className="text-[10px] font-bold text-purple-700 flex items-center gap-0.5 shrink-0">
                <Calendar className="w-3 h-3" /> Event
              </span>
            )}
            {langMatch.isLanguageCourse && !a.is_calendar_event && (() => {
              const isTranslated = isItemTranslated(a.id);
              const isTranslating = isTranslationInProgress(a.id);
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTranslatingItem({
                      itemId: a.id,
                      assignmentTitle: a.name,
                      assignmentDescription: a.description || '',
                      courseName,
                      languageMatch: langMatch
                    });
                  }}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer shrink-0 shadow-2xs ${
                    isTranslating
                      ? 'bg-amber-50 text-amber-800 border border-amber-300 animate-pulse'
                      : isTranslated
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80'
                  }`}
                  title={
                    isTranslating 
                      ? 'Translating assignment in background...'
                      : isTranslated 
                        ? `Translation ready! Click to view instant English translation (${langMatch.languageName})`
                        : `Translate ${langMatch.languageName} assignment to English`
                  }
                >
                  {isTranslating ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                      <span>Translating...</span>
                    </>
                  ) : isTranslated ? (
                    <>
                      <Languages className="w-3 h-3 text-emerald-200" />
                      <span>{langMatch.badgeText} ✓</span>
                    </>
                  ) : (
                    <>
                      <Languages className="w-3 h-3 text-indigo-600" />
                      <span>{langMatch.badgeText}</span>
                    </>
                  )}
                </button>
              );
            })()}
            {lockInfo.isLockedUntil ? (
              <span 
                className="text-[10px] font-semibold text-amber-800 flex items-center gap-0.5 shrink-0"
                title={lockInfo.lockExplanation || `This assignment is locked until ${lockInfo.badgeText}`}
              >
                <Lock className="w-3 h-3 text-amber-600" /> {lockInfo.badgeText}
              </span>
            ) : lockInfo.isLocked ? (
              <span 
                className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5 shrink-0"
                title={a.lock_explanation || "Locked in Canvas"}
              >
                <Lock className="w-3 h-3 text-slate-400" /> Locked
              </span>
            ) : null}
            {showIds && (
              <span 
                className="text-[10px] font-mono text-slate-400 select-all shrink-0" 
                title={a.is_calendar_event ? `Event ID: ${Math.abs(a.id)}` : `Assignment ID: ${a.id}`}
              >
                #{a.is_calendar_event ? Math.abs(a.id) : a.id}
              </span>
            )}
          </div>

            {/* Subwidgets bonded flush to top-right: pts pill & archive button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {showClassAverages && a.points_possible > 0 && a.score_statistics?.mean !== undefined && a.score_statistics.mean !== null && (
              <span 
                className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200/90 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                title={`Class Average: ${Math.round(a.score_statistics.mean * 10) / 10} / ${a.points_possible}${a.score_statistics.min !== undefined ? ` (Low: ${a.score_statistics.min}, High: ${a.score_statistics.max})` : ''}`}
              >
                Avg {Math.round(a.score_statistics.mean * 10) / 10}
              </span>
            )}
            {/* Score / Points / Graded Date entity */}
            {!a.is_calendar_event && (
              <div className="relative group/score inline-flex items-center">
                {hasScore && showScores ? (
                  <>
                    <span 
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1"
                      style={customGradeStyle.style}
                      title={`Score: ${a.submission!.score} / ${a.points_possible}`}
                    >
                      <span>
                        {a.submission!.score} / {a.points_possible}
                      </span>
                    </span>
                    {onOpenGradeSettings && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenGradeSettings();
                        }}
                        className="p-0.5 text-slate-400 hover:text-slate-700 bg-white/80 rounded-full border border-slate-200/80 shadow-2xs opacity-0 group-hover/score:opacity-100 transition-opacity ml-0.5 cursor-pointer"
                        title="Configure grade threshold colors"
                      >
                        <Settings className="w-3 h-3" />
                      </button>
                    )}
                  </>
                ) : (hasScore || a.submission?.graded_at) && !showScores ? (
                  // Graded date in the exact same place as score when score display is disabled
                  <span 
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-50 text-emerald-800 border border-emerald-200/80"
                    title={a.submission?.graded_at ? `Graded on ${new Date(a.submission.graded_at).toLocaleDateString()}` : "Graded"}
                  >
                    {a.submission?.graded_at 
                      ? `Graded ${new Date(a.submission.graded_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}` 
                      : 'Graded'}
                  </span>
                ) : (a.points_possible !== undefined && a.points_possible !== null) ? (
                  // Points possible entity (including 0 pts)
                  <span 
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${scoreBadge.className}`}
                    style={scoreBadge.style}
                  >
                    {formatPoints(a.points_possible)}
                  </span>
                ) : null}
              </div>
            )}
            {onToggleArchived && (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleArchived(a.id);
                }}
                className="text-slate-300 hover:text-slate-600 p-0.5 transition rounded hover:bg-slate-200/60 cursor-pointer"
                title={isArchived ? "Unarchive" : "Archive"}
              >
                {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="p-3 flex-1 min-w-0 bg-white">
          <h4 className="font-semibold text-slate-800 group-hover:text-blue-600 transition text-sm leading-snug line-clamp-2" title={a.name}>
            {safeUrl ? (
              <a 
                href={safeUrl} 
                target="_blank" 
                rel="noreferrer" 
                onClick={(e) => e.stopPropagation()} 
                className="hover:underline"
              >
                {a.name}
              </a>
            ) : a.name}
          </h4>
          {a.location_name && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{a.location_name}</span>
            </div>
          )}
        </div>

        {/* Bottom bonded footer bar */}
        <div className={`px-3 py-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs ${
          finalVariant === 'red' ? 'bg-red-50/70 text-red-700' :
          finalVariant === 'orange' ? 'bg-amber-50/70 text-amber-800' :
          variant === 'green' ? 'bg-emerald-50/40 text-slate-700' :
          'bg-slate-50/80 text-slate-600'
        }`}>
          {/* Due date bonded flush to bottom-left (Date only, no hours/minutes) */}
          <div className="flex items-center gap-1.5 min-w-0">
            {a.is_calendar_event ? (
              <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            ) : ((isCompleted || a.manual_marked_submitted || presumed.presumed) ? (
              <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : null)}
            
            <span className={`font-medium truncate ${finalVariant === 'red' ? 'font-semibold text-rose-700' : ''}`}>
              {a.is_calendar_event
                ? formatCalendarEventDate(a)
                : variant === 'green'
                  ? completedDateLabel
                  : (a.due_at ? formatRelativeDueDate(a.due_at, now) : 'No Due Date')}
            </span>

            {hasUnack && (
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onAcknowledgeAllComments) {
                    const commentIds = getAssignmentFeedbackComments(a).map(c => c.id);
                    onAcknowledgeAllComments(commentIds);
                  }
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100/90 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-300 border border-blue-200/80 px-1.5 py-0.2 rounded-md shrink-0 transition cursor-pointer group/ack"
                title="New feedback available — click to acknowledge"
              >
                <MessageSquare className="w-2.5 h-2.5 text-blue-600 group-hover/ack:hidden" />
                <Check className="w-2.5 h-2.5 text-emerald-600 hidden group-hover/ack:inline" />
                <span className="group-hover/ack:hidden">Feedback</span>
                <span className="hidden group-hover/ack:inline">Acknowledge</span>
              </button>
            )}
          </div>

          {/* Action / submission button bonded flush to bottom-right */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!a.is_calendar_event && onToggleMarkedSubmitted && !isRealSubmitted && (
              <label 
                className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-slate-500 hover:text-slate-800 transition"
                onClick={(e) => e.stopPropagation()}
                title={
                  isClasswork
                    ? (a.manual_marked_submitted ? "Classwork on paper (marked done)" : "Classwork on paper — click to mark submitted")
                    : (isPassive || showMaybeSubmitted)
                      ? (a.manual_marked_submitted ? "Paper/external work (marked done)" : "Paper/external submission — click to mark submitted")
                      : (a.manual_marked_submitted ? "Marked done" : "Click to mark as submitted")
                }
              >
                <span className={a.manual_marked_submitted ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                  {a.manual_marked_submitted ? 'Submitted' : 'Submitted?'}
                </span>
                <input
                  type="checkbox"
                  checked={!!a.manual_marked_submitted}
                  onChange={() => onToggleMarkedSubmitted(a.id)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer accent-emerald-600"
                />
              </label>
            )}

            {safeUrl && (
              <a 
                href={safeUrl} 
                target="_blank" 
                rel="noreferrer" 
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-slate-400 hover:text-blue-600 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Open directly in Canvas"
              >
                <ArrowRight className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  };

  const totalEventsCount = useMemo(() => {
    return assignments.filter(a => !!a.is_calendar_event && (showPastEvents || !isPastCalendarEvent(a))).length;
  }, [assignments, showPastEvents]);

  const totalAssignmentsCount = useMemo(() => {
    return assignments.filter(a => !a.is_calendar_event).length;
  }, [assignments]);

  const upcomingCount = useMemo(() => {
    return grouped.overdue.length + grouped.today.length + grouped.thisWeek.length + grouped.later.length + grouped.noDate.length;
  }, [grouped]);

  const completedCount = useMemo(() => {
    return grouped.completed.length;
  }, [grouped]);

  if (isEmpty && !activeFilterFeedback && (!todoItems || todoItems.length === 0) && (!announcements || announcements.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-white rounded-xl border border-slate-200 border-dashed">
         <div className="bg-green-50 p-4 rounded-full mb-4">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
         </div>
         <h3 className="text-lg font-semibold text-slate-800">No assignments found</h3>
         <p className="text-slate-500">Adjust your filters or check back later.</p>
      </div>
    );
  }

  return (
    <>
      {/* Primary Workflow Sub-Tab & Item Filters Bar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 pb-3 border-b border-slate-200">
        {/* Primary Workflow Selector: Upcoming vs Completed */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 shadow-2xs">
          <button
            type="button"
            onClick={() => setWorkflowSection('upcoming')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-2 ${
              workflowSection === 'upcoming'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Upcoming & Active</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              workflowSection === 'upcoming' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {upcomingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorkflowSection('completed')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-2 ${
              workflowSection === 'completed'
                ? 'bg-white text-emerald-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Completed & Graded</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              workflowSection === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {completedCount}
            </span>
          </button>
        </div>

        {/* Secondary Filter Controls */}
        <div className="flex items-center flex-wrap gap-2">

          <button
            type="button"
            onClick={toggleFeedbackFilter}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
              activeFilterFeedback 
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Filter board to only show assignments with unacknowledged instructor feedback"
          >
            <MessageSquare className={`w-3.5 h-3.5 ${activeFilterFeedback ? 'text-white' : 'text-blue-600'}`} />
            <span>Feedback to Review</span>
            {unackTotalCount > 0 && (
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                activeFilterFeedback ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
              }`}>
                {unackTotalCount}
              </span>
            )}
          </button>
        </div>
      </div>


      {/* FEEDBACK REVIEW PANEL (Displayed above assignments so users can scroll straight past to assignments) */}
      {activeFilterFeedback && (
        <div className="space-y-4 mb-6 pb-6 border-b border-slate-200 animate-fadeIn">
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-600 text-white shadow-xs">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Instructor Feedback to Review ({feedbackAssignments.length})
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {onAcknowledgeAllComments && feedbackAssignments.length > 0 && (
                confirmingBoardAckAll ? (
                  <div className="flex items-center gap-1.5 bg-amber-50 p-1.5 rounded-lg border border-amber-300 shadow-2xs animate-fadeIn">
                    <span className="text-xs font-semibold text-amber-900">Acknowledge all feedback?</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allCommentIds: (string | number)[] = [];
                        feedbackAssignments.forEach(a => {
                          getAssignmentFeedbackComments(a).forEach(c => {
                            if (!acknowledgedFeedbackIds?.has(c.id) && !acknowledgedFeedbackIds?.has(String(c.id))) {
                              allCommentIds.push(c.id);
                            }
                          });
                        });
                        onAcknowledgeAllComments(allCommentIds);
                        setConfirmingBoardAckAll(false);
                      }}
                      className="px-2.5 py-1 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingBoardAckAll(false)}
                      className="px-2 py-1 text-xs font-medium rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingBoardAckAll(true)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-100/60 shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Acknowledge All Feedback
                  </button>
                )
              )}
              <button
                type="button"
                onClick={toggleFeedbackFilter}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {feedbackAssignments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
              <h4 className="font-bold text-slate-800 text-sm">All Caught Up!</h4>
              <p className="text-xs text-slate-500 mt-1">No unreviewed instructor feedback at this time.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {feedbackAssignments.map(a => renderCard(a, 'blue'))}
            </div>
          )}
        </div>
      )}

      {workflowSection === 'completed' ? (
        /* DEDICATED COMPLETED & GRADED WORKSPACE */
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between bg-slate-50/80 px-4 py-3 rounded-xl border border-slate-200/90 gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-slate-800">
                  Completed & Graded Coursework ({grouped.completed.length})
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                {grouped.completed.filter(a => a.submission?.score !== null && a.submission?.score !== undefined).length} with recorded scores
              </span>
            </div>
          </div>

          {grouped.completed.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <h4 className="font-bold text-sm text-slate-800">No Completed Coursework Found</h4>
              <p className="text-xs text-slate-500 mt-1">When you submit assignments or your teacher enters grades, they will appear in this review log.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {grouped.completed.map(a => renderCard(a, 'green'))}
            </div>
          )}
        </div>
      ) : (
        /* UPCOMING & ACTIVE WORKSPACE */
        <div className="space-y-5 animate-fadeIn">
          {/* Collapsible Canvas Announcements Widget above Canvas To-Do */}
          <AnnouncementsWidget
            announcements={announcements}
            onDismissAnnouncement={onDismissAnnouncement}
            getCourseName={getCourseName}
            courseCustomizations={courseCustomizations}
            showIds={showIds}
          />

          {/* Integrated Canvas Priority To-Do Section */}
          {todoItems && todoItems.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-slate-50/60 border border-blue-200/80 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs">
                    <Megaphone className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-xs text-slate-800">Canvas Priority To-Do</h3>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full border border-blue-200/60">
                        {todoItems.length} {todoItems.length === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTodoExpanded(!isTodoExpanded)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-white/80 transition cursor-pointer"
                >
                  <span>{isTodoExpanded ? 'Collapse' : 'Show All'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isTodoExpanded ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {isTodoExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fadeIn">
                  {todoItems.map((item, idx) => {
                    const uniqueKey = item.ignore || item.html_url || String(idx);
                    const extracted = extractAssignmentFromTodo(item, courses || [], canvasUrl);
                    const targetAssignment: CanvasAssignment | null = extracted?.assignment || item.assignment || null;

                    const title = item.assignment?.name || item.quiz?.title || (item as any).title || extracted?.assignment?.name || 'Canvas To-Do Item';
                    const courseId = extracted?.courseId || item.course_id || item.assignment?.course_id || item.context_id;
                    const customCourse = courseId ? courseCustomizations?.[courseId] : undefined;
                    const rawCourseName = extracted?.courseName || (item.context_name ? pruneCourseTitle(item.context_name) : 'Course');
                    const courseName = (courseId && getCourseName) ? getCourseName(courseId) : rawCourseName;
                    const emoji = customCourse?.emoji;
                    const dueAt = targetAssignment?.due_at || item.assignment?.due_at || null;
                    const points = targetAssignment?.points_possible ?? item.assignment?.points_possible;
                    const isProcessing = processingTodoKey === uniqueKey;
                    const canvasLink = targetAssignment?.html_url || item.assignment?.html_url || item.html_url;

                    return (
                      <div
                        key={uniqueKey}
                        onClick={() => {
                          if (targetAssignment) {
                            setZoomedAssignment(targetAssignment);
                          }
                        }}
                        className={`relative rounded-xl border border-slate-200/90 bg-white shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group ${
                          targetAssignment ? 'cursor-pointer' : ''
                        }`}
                        title={targetAssignment ? "Click card to zoom for details" : undefined}
                      >
                        {/* Flat left accent stripe */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-400/80 pointer-events-none z-10" />

                        {/* Top bonded header */}
                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/90 border-b border-slate-100 text-[11px] gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate max-w-[140px]" title={courseName}>
                            {emoji ? `${emoji} ` : ''}{courseName}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {points !== undefined && points !== null && (
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200/80 px-1.5 py-0.2 rounded-full">
                                {formatPoints(points)}
                              </span>
                            )}
                            {canvasLink && (
                              <a
                                href={canvasLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-300 hover:text-blue-600 p-0.5 rounded transition"
                                title="Open in Canvas"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Body */}
                        <div className="p-3 flex-1 min-w-0 bg-white">
                          <h4 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug group-hover:text-blue-600 transition" title={title}>
                            {canvasLink ? (
                              <a
                                href={canvasLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="hover:underline text-slate-900 hover:text-blue-600 transition"
                                title="Open in Canvas"
                              >
                                {title}
                              </a>
                            ) : title}
                          </h4>
                        </div>

                        {/* Bottom bonded footer */}
                        <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs bg-slate-50/80 text-slate-600">
                          <div className="flex items-center gap-1 min-w-0">
                            <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="font-medium text-[11px] truncate">
                              {dueAt ? formatRelativeDueDate(dueAt, now) : 'No Due Date'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {targetAssignment && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setZoomedAssignment(targetAssignment);
                                }}
                                className="text-[10px] font-semibold text-slate-700 hover:text-blue-700 bg-white hover:bg-blue-50 px-2 py-0.5 rounded border border-slate-200 hover:border-blue-300 transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                title="Zoom for Details (instructions, rubrics, feedback, module resources)"
                              >
                                <Maximize2 className="w-2.5 h-2.5 text-slate-500" />
                                <span>Zoom</span>
                              </button>
                            )}

                            {onMarkTodoDone && (
                              <label
                                onClick={(e) => e.stopPropagation()}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer select-none border shadow-2xs ${
                                  isProcessing 
                                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 hover:border-emerald-400'
                                }`}
                                title="Mark as done and dismiss from Canvas To-Do"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={false}
                                    disabled={isProcessing}
                                    onChange={(e) => handleTodoDone(item, e as any)}
                                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3 cursor-pointer"
                                  />
                                )}
                                <span>Done?</span>
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4 Active Due Date Planning Lanes */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Column 1: Overdue & Past */}
            <div className="lg:col-span-1 space-y-6">
              <h3 className="text-sm font-bold text-red-600 flex items-center gap-2 uppercase tracking-wide">
                <AlertCircle className="w-4 h-4" /> Past due ({grouped.overdue.length})
              </h3>
              {grouped.overdue.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No overdue work!</p>
              ) : (
                <div className="flex flex-col gap-3 animate-fadeIn">
                  {grouped.overdue.map(a => renderCard(a, 'red'))}
                </div>
              )}
            </div>

            {/* Column 2: Due Soon / Up Next */}
            <div className="lg:col-span-1 space-y-6">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                Up Next (2 days)
              </h3>
              {grouped.today.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nothing due in the next 2 days.</p>
              ) : (
                <div className="flex flex-col gap-3 animate-fadeIn">
                  {grouped.today.map(a => renderCard(a, 'orange'))}
                </div>
              )}
            </div>

            {/* Column 3: This Week */}
            <div className="lg:col-span-1 space-y-6">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <Calendar className="w-4 h-4 text-slate-400" /> This Week
              </h3>
              {grouped.thisWeek.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nothing else due this week.</p>
              ) : (
                <div className="flex flex-col gap-3 animate-fadeIn">
                  {grouped.thisWeek.map(a => renderCard(a, 'blue'))}
                </div>
              )}
            </div>

            {/* Column 4: Later & Undated */}
            <div className="lg:col-span-1 space-y-6">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <ArrowRight className="w-4 h-4 text-slate-400" /> Later & Undated
              </h3>
              <div className="flex flex-col gap-3 animate-fadeIn">
                {grouped.later.map(a => renderCard(a, 'gray'))}
                {grouped.noDate.map(a => renderCard(a, 'gray'))}
                {grouped.later.length === 0 && grouped.noDate.length === 0 && (
                  <p className="text-sm text-slate-400 italic">No upcoming assignments.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Centered Zoom Modal */}
      {zoomedAssignment && (
        <AssignmentZoomModal 
          assignment={zoomedAssignment}
          courseName={getCourseName(zoomedAssignment.course_id)}
          canvasUrl={canvasUrl}
          apiKey={apiKey}
          useProxy={useProxy}
          onClose={() => setZoomedAssignment(null)}
          acknowledgedFeedbackIds={acknowledgedFeedbackIds}
          onToggleAcknowledgeComment={onToggleAcknowledgeComment}
          onAcknowledgeAllComments={onAcknowledgeAllComments}
          gradeConfig={gradeConfig}
          onOpenGradeSettings={onOpenGradeSettings}
          courseModules={courses ? (courses.find(c => c.course.id === zoomedAssignment.course_id)?.modules || []) : []}
        />
      )}

      {/* World Language Translation Modal */}
      {translatingItem && (
        <TranslationModal
          isOpen={true}
          onClose={() => setTranslatingItem(null)}
          itemId={translatingItem.itemId}
          assignmentTitle={translatingItem.assignmentTitle}
          assignmentDescription={translatingItem.assignmentDescription}
          courseName={translatingItem.courseName}
          languageMatch={translatingItem.languageMatch}
        />
      )}
    </>
  );
};