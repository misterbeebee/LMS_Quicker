

import React, { useMemo, useState } from 'react';
import { CanvasAssignment } from '../../types';
import { Calendar, AlertCircle, Clock, ArrowRight, AlertTriangle, CheckCircle2, Lock, FileCheck, Archive, ArchiveRestore, HelpCircle, MessageSquare, BookOpen, MapPin, Maximize2, Check, FileText } from 'lucide-react';
import { getAssignmentStatus, stripHtml, isAssignmentSubmitted, getScoreStyle, hasUnacknowledgedFeedback, getUnacknowledgedFeedbackCount, isAssignmentPastDue, isAssignmentLocked, isPresumedCompleted, isClassworkOnPaper, getAssignmentLockInfo, getAssignmentFeedbackComments } from '../../utils/dashboard-helpers';
import { AssignmentZoomModal } from './AssignmentZoomModal';
import { CourseCustomization } from '../../services/courseCustomization';

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
  showIds = false,
  canvasUrl = '',
  apiKey = '',
  useProxy = false,
  acknowledgedFeedbackIds,
  onToggleAcknowledgeComment,
  onAcknowledgeAllComments,
  filterFeedbackOnly = false,
  onToggleFilterFeedback,
  showClassAverages = false
}) => {
  const [zoomedAssignment, setZoomedAssignment] = useState<CanvasAssignment | null>(null);
  const [confirmingBoardAckAll, setConfirmingBoardAckAll] = useState(false);
  const [localFilterFeedback, setLocalFilterFeedback] = useState(false);
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
      // Feedback filter: if active, show only items with unacknowledged feedback
      if (activeFilterFeedback && !hasUnacknowledgedFeedback(a, acknowledgedFeedbackIds || new Set())) {
        return;
      }

      // 1. Archived filter: hide unless showArchived is true
      const isArchived = archivedAssignmentIds?.has(a.id);
      if (isArchived && !showArchived) {
        return;
      }

      // Use consolidated submission logic
      const isSubmitted = isAssignmentSubmitted(a);

      // 2. Submitted filter: hide unless showSubmitted is true (bypass when filtering specifically for feedback)
      if (!activeFilterFeedback && isSubmitted && !showSubmitted) {
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
         buckets.overdue.push(a);
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

    // If limitCompletedToRecent is true, filter completed items to only show those from the last 7 days (bypass when filtering specifically for feedback)
    if (limitCompletedToRecent && !activeFilterFeedback) {
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
  }, [assignments, limitCompletedToRecent, archivedAssignmentIds, showArchived, showSubmitted, showObsolete, activeFilterFeedback, acknowledgedFeedbackIds]);

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

    // Redundant color codes removed per user request: only Overdue items use distinct red vs amber borders.
    let borderClass = 'border-l-slate-300 hover:border-l-slate-400 hover:shadow-xs';
    if (a.is_calendar_event) {
      borderClass = 'border-l-purple-400 hover:shadow-purple-50';
    } else if (finalVariant === 'red') {
      borderClass = 'border-l-red-500 hover:shadow-red-50';
    } else if (finalVariant === 'orange') {
      borderClass = 'border-l-amber-500 hover:shadow-amber-50';
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
    
    if (hasScore && showScores) {
        scoreBadge = getScoreStyle(a.submission!.score, a.points_possible);
    }

    // Determine the "Display Date" for completed items
    let completedDateLabel = status.label;
    if (presumed.presumed) {
        if (presumed.reason === 'zero_points') {
            completedDateLabel = a.due_at 
              ? `0 pts • Due ${new Date(a.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` 
              : 'Completed (0 pts)';
        } else if (presumed.reason === 'locked_external') {
            completedDateLabel = a.due_at 
              ? `External • Due ${new Date(a.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` 
              : 'Presumed Complete (External)';
        }
    } else if (variant === 'green' && isAssignmentSubmitted(a)) {
        const sub = a.submission;
        let latestTime = 0;
        let latestLabel = 'Submitted';
        
        if (sub?.submitted_at) {
            const t = new Date(sub.submitted_at).getTime();
            if (t > latestTime) { latestTime = t; latestLabel = `Submitted ${new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`; }
        }
        if (sub?.graded_at) {
             const t = new Date(sub.graded_at).getTime();
             if (t > latestTime) { latestTime = t; latestLabel = `Graded ${new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`; }
        }
        if (sub?.submission_comments && sub.submission_comments.length > 0) {
             // Find last comment
             const lastC = sub.submission_comments.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime())[0];
             const t = new Date(lastC.created_at).getTime();
             if (t > latestTime) { latestTime = t; latestLabel = `Commented ${new Date(t).toLocaleDateString(undefined, {month:'short', day:'numeric'})}`; }
        }
        
        if (latestTime > 0) {
            completedDateLabel = latestLabel;
        } else if (a.manual_marked_submitted) {
            completedDateLabel = "Marked Done";
        }
    }

    const customCourse = courseCustomizations?.[a.course_id];

    return (
      <div 
        key={a.id}
        onClick={() => setZoomedAssignment(a)}
        className={`bg-white rounded-xl shadow-xs border border-slate-200/90 border-l-4 ${borderClass} hover:shadow-md hover:border-slate-300 transition-all group cursor-pointer flex flex-col justify-between overflow-hidden ${isArchived ? 'opacity-60 grayscale' : ''}`}
        title="Click card to zoom for details"
      >
        {/* Top bonded header bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/90 border-b border-slate-100 text-[11px] gap-2">
          {/* Class Title & Badges bonded flush to top-left */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span 
              className="font-bold text-slate-700 uppercase tracking-wider truncate max-w-[170px]" 
              title={getCourseName(a.course_id)}
            >
              {customCourse?.emoji ? `${customCourse.emoji} ` : ''}{getCourseName(a.course_id)}
            </span>
            {a.is_calendar_event && (
              <span className="text-[10px] font-bold text-purple-700 flex items-center gap-0.5 shrink-0">
                <Calendar className="w-3 h-3" /> Event
              </span>
            )}
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
            {a.points_possible > 0 && (
              <span 
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${scoreBadge.className}`}
                style={scoreBadge.style}
              >
                {hasScore && showScores ? `${a.submission!.score} / ${a.points_possible}` : `${a.points_possible} pts`}
              </span>
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
            {a.html_url ? (
              <a 
                href={a.html_url} 
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
            
            <span className={`font-medium truncate ${finalVariant === 'red' ? 'font-semibold text-red-700' : ''}`}>
              {variant === 'green' ? completedDateLabel : (a.due_at ? (
                new Date(a.due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
              ) : 'No Due Date')}
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
                className={`inline-flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded text-[10px] font-medium transition ${
                  a.manual_marked_submitted
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : (isClasswork || isPassive || showMaybeSubmitted)
                      ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200/70'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
                onClick={(e) => e.stopPropagation()}
                title={
                  isClasswork
                    ? (a.manual_marked_submitted ? "Classwork on paper (marked done)" : "Classwork on paper — click to mark submitted")
                    : (isPassive || showMaybeSubmitted)
                      ? (a.manual_marked_submitted ? "Paper/external work (marked done)" : "Paper/external submission — click to mark submitted")
                      : (a.manual_marked_submitted ? "Marked done" : "Click to mark as submitted")
                }
              >
                <span>
                  {a.manual_marked_submitted ? 'Submitted' : 'Submitted?'}
                </span>
                <input
                  type="checkbox"
                  checked={!!a.manual_marked_submitted}
                  onChange={() => onToggleMarkedSubmitted(a.id)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer"
                />
              </label>
            )}

            {a.html_url && (
              <a 
                href={a.html_url} 
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

  if (isEmpty) {
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
      {/* Board Feedback Filter Bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFeedbackFilter}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
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
          {activeFilterFeedback && (
            <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2.5 py-1 rounded-lg">
              Showing assignments with feedback ({(Object.values(grouped) as any[][]).reduce((acc: number, curr: any[]) => acc + curr.length, 0)})
            </span>
          )}
        </div>
      </div>

      {activeFilterFeedback ? (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-600 text-white shadow-xs">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Instructor Feedback to Review ({feedbackAssignments.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any card to read teacher comments and rubric criteria, or check the box to acknowledge.
                </p>
              </div>
            </div>
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
          </div>

          {feedbackAssignments.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h4 className="font-bold text-slate-800 text-base">All Caught Up!</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">No unreviewed instructor feedback at this time.</p>
              <button
                onClick={toggleFeedbackFilter}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                Return to Due Date Board
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {feedbackAssignments.map(a => renderCard(a, 'blue'))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Column 1: Overdue & Past */}
          <div className="lg:col-span-1 space-y-6">
            {grouped.overdue.length > 0 && (
                <div className="space-y-3 animate-fadeIn">
                    <h3 className="text-sm font-bold text-red-600 flex items-center gap-2 uppercase tracking-wide">
                        <AlertCircle className="w-4 h-4" /> Past due ({grouped.overdue.length})
                    </h3>
                    <div className="flex flex-col gap-3">
                        {grouped.overdue.map(a => renderCard(a, 'red'))}
                    </div>
                </div>
            )}
          </div>

          {/* Column 2: Due Soon / Up Next */}
          <div className="lg:col-span-1 space-y-6">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <Clock className="w-4 h-4 text-slate-400" /> Up Next (2 days)
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

          {/* Column 4: Later & Completed */}
          <div className="lg:col-span-1 space-y-6">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <ArrowRight className="w-4 h-4 text-slate-400" /> Later & Undated
            </h3>
            <div className="flex flex-col gap-3 animate-fadeIn">
                {grouped.later.map(a => renderCard(a, 'gray'))}
                {grouped.noDate.map(a => renderCard(a, 'gray'))}
                {grouped.later.length === 0 && grouped.noDate.length === 0 && (!showSubmitted || grouped.completed.length === 0) && (
                    <p className="text-sm text-slate-400 italic">No upcoming assignments.</p>
                )}
            </div>

            {showSubmitted && grouped.completed.length > 0 && (
                 <div className="space-y-3 pt-4 border-t border-slate-200 animate-fadeIn">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Completed ({grouped.completed.length})
                    </h3>
                    <div className="flex flex-col gap-3">
                        {grouped.completed.map(a => renderCard(a, 'green'))}
                    </div>
                 </div>
            )}
          </div>

        </div>
      )}

      {/* Centered Zoom Modal */}
      <AssignmentZoomModal 
        assignment={zoomedAssignment}
        courseName={zoomedAssignment ? getCourseName(zoomedAssignment.course_id) : ''}
        canvasUrl={canvasUrl}
        apiKey={apiKey}
        useProxy={useProxy}
        onClose={() => setZoomedAssignment(null)}
        acknowledgedFeedbackIds={acknowledgedFeedbackIds}
        onToggleAcknowledgeComment={onToggleAcknowledgeComment}
        onAcknowledgeAllComments={onAcknowledgeAllComments}
      />
    </>
  );
};