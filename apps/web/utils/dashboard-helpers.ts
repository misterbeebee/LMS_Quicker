

import React from 'react';
import { CanvasAssignment, CanvasCourse, CanvasSubmissionComment, CanvasAnnouncement } from '../types';
import { CheckCircle, Clock, AlertCircle, Calendar, MessageSquare, Lock } from 'lucide-react';

// Helper to strip HTML tags for clean text display
export const stripHtml = (html: string | null | undefined) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

// Check if an instruction/description is meaningless filler or Canvas syllabus boilerplate
export const isFillerDescription = (text: string | null | undefined): boolean => {
  if (!text) return true;
  const normalized = text.toLowerCase().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  // If the description ONLY contains boilerplate guidelines without real assignment instructions
  const withoutBoilerplate = normalized
    .replace(/detailed guidelines, grading criteria, and instructions from the course syllabus\.?/gi, '')
    .trim();
  return withoutBoilerplate.length === 0;
};

// Clean instructions HTML, suppressing filler and returning empty string if no real content
export const cleanAssignmentDescription = (html: string | null | undefined): string => {
  if (!html) return "";
  if (isFillerDescription(html)) return "";
  
  const cleaned = html
    .replace(/<p[^>]*>\s*Detailed guidelines, grading criteria, and instructions from the course syllabus\.?\s*<\/p>/gi, '')
    .replace(/Detailed guidelines, grading criteria, and instructions from the course syllabus\.?/gi, '')
    .trim();

  const textOnly = cleaned.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return textOnly ? cleaned : "";
};

// Extract all feedback comments for an assignment
export const getAssignmentFeedbackComments = (assignment: CanvasAssignment | Partial<CanvasAssignment>): CanvasSubmissionComment[] => {
  if (!assignment) return [];
  const sub = assignment.submission;
  const rawComments: CanvasSubmissionComment[] = (sub?.submission_comments && sub.submission_comments.length > 0)
    ? sub.submission_comments
    : ((assignment as any).submission_comments || []);
  const studentUserId = sub?.user_id;

  const validComments = rawComments.filter(c => {
    if (studentUserId && c.author_id && c.author_id === studentUserId) {
      return false; // Student's own comment
    }
    return true;
  });

  // Also include rubric_assessment comments from instructor if present
  if (sub && (sub as any).rubric_assessment) {
    const rubricAssessment = (sub as any).rubric_assessment;
    Object.entries(rubricAssessment).forEach(([critId, val]: [string, any]) => {
      if (val && typeof val.comments === 'string' && val.comments.trim().length > 0) {
        const rubricCommentId = `rubric_${critId}`;
        if (!validComments.some(c => String(c.id) === rubricCommentId)) {
          validComments.push({
            id: rubricCommentId as any,
            author_id: (sub as any).grader_id || 0,
            author_name: 'Instructor (Rubric)',
            comment: val.comments.trim(),
            created_at: (sub as any).graded_at || new Date().toISOString()
          });
        }
      }
    });
  }

  return validComments;
};

// Check if an assignment has any unacknowledged feedback comments
export const hasUnacknowledgedFeedback = (
  assignment: CanvasAssignment, 
  acknowledgedFeedbackIds: Set<string | number>
): boolean => {
  const feedback = getAssignmentFeedbackComments(assignment);
  if (feedback.length === 0) return false;
  return feedback.some(c => !acknowledgedFeedbackIds.has(c.id) && !acknowledgedFeedbackIds.has(String(c.id)));
};

// Count total assignments with unacknowledged feedback
export const getUnacknowledgedFeedbackCount = (
  assignments: CanvasAssignment[], 
  acknowledgedFeedbackIds: Set<string | number>
): number => {
  return assignments.filter(a => hasUnacknowledgedFeedback(a, acknowledgedFeedbackIds)).length;
};

// Helper to format submission types
export const formatSubmissionType = (types: string[] | undefined) => {
  if (!types || types.length === 0) return "None";
  return types.map(t => {
    switch(t) {
      case 'calendar_event': return 'Calendar Event';
      case 'online_upload': return 'File Upload';
      case 'online_text_entry': return 'Text Entry';
      case 'online_url': return 'Website URL';
      case 'on_paper': return 'On Paper';
      case 'none': return 'None';
      case 'external_tool': return 'External Tool';
      case 'discussion_topic': return 'Discussion';
      case 'online_quiz': return 'Quiz';
      case 'media_recording': return 'Media Recording';
      case 'student_annotation': return 'Annotation';
      case 'not_graded': return 'Not Graded';
      case 'wiki_page': return 'Page';
      default: return t.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }).join(', ');
};

// Check if an assignment's due date is in the past
export const isAssignmentPastDue = (a: CanvasAssignment): boolean => {
  if (!a.due_at) return false;
  const dueTime = new Date(a.due_at).getTime();
  return !isNaN(dueTime) && dueTime < Date.now();
};

export interface LockInfoResult {
  isLocked: boolean;
  isLockedUntil: boolean; // Locked until a future unlock date
  isLockedForever: boolean; // Locked forever after deadline/due date
  unlockAt: string | null;
  lockExplanation?: string;
  badgeText: string;
}

// Get comprehensive lock info, distinguishing "locked until [date]" from "locked forever"
export const getAssignmentLockInfo = (a: CanvasAssignment): LockInfoResult => {
  const now = Date.now();
  
  // 1. Direct unlock_at check
  const unlockTime = a.unlock_at ? new Date(a.unlock_at).getTime() : null;
  const isFutureUnlock = unlockTime !== null && !isNaN(unlockTime) && unlockTime > now;

  // 2. lock_info object from Canvas API (if present on payload)
  const lockInfo = (a as any).lock_info;
  const lockInfoUnlockTime = lockInfo?.unlock_at ? new Date(lockInfo.unlock_at).getTime() : null;
  const isLockInfoFutureUnlock = lockInfoUnlockTime !== null && !isNaN(lockInfoUnlockTime) && lockInfoUnlockTime > now;

  // 3. lock_explanation string check
  const explanation = a.lock_explanation || lockInfo?.lock_explanation || '';
  const explanationLower = explanation.toLowerCase();
  const explanationSaysLockedUntil = explanationLower.includes('locked until') || explanationLower.includes('will unlock');

  const isLockedUntil = isFutureUnlock || isLockInfoFutureUnlock || explanationSaysLockedUntil;

  // 4. Past lock_at check (locked forever after deadline)
  const lockTime = a.lock_at ? new Date(a.lock_at).getTime() : null;
  const isPastLock = lockTime !== null && !isNaN(lockTime) && lockTime < now;

  const isLocked = a.locked_for_user === true || isPastLock || isLockedUntil;
  const isLockedForever = isLocked && !isLockedUntil;

  const effectiveUnlock = a.unlock_at || lockInfo?.unlock_at;
  let badgeText = 'Locked';

  if (isLockedUntil) {
    if (effectiveUnlock) {
      const d = new Date(effectiveUnlock);
      badgeText = `Locked until ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    } else if (explanation) {
      const match = explanation.match(/locked until ([^.,\n]+)/i);
      badgeText = match ? `Locked until ${match[1].trim()}` : 'Locked until future date';
    } else {
      badgeText = 'Locked until date';
    }
  }

  return {
    isLocked,
    isLockedUntil,
    isLockedForever,
    unlockAt: effectiveUnlock || null,
    lockExplanation: explanation,
    badgeText
  };
};

// Check if an assignment is locked in Canvas
export const isAssignmentLocked = (a: CanvasAssignment): boolean => {
  return getAssignmentLockInfo(a).isLocked;
};

// Check if an assignment is an external tool submission or contains an external submission URL in instructions
export const hasExternalSubmissionUrl = (assignment: CanvasAssignment): boolean => {
  const types = assignment.submission_types || [];
  if (types.includes('external_tool')) return true;

  const html = assignment.description;
  if (!html) return false;

  // Check for external links (not pointing to Canvas / instructure.com)
  const linkMatches = html.match(/href=["'](https?:\/\/[^"']+)["']/gi);
  if (linkMatches) {
    for (const match of linkMatches) {
      const url = match.replace(/href=["']/i, '').replace(/["']$/, '').toLowerCase();
      // If it's an external URL (not an internal canvas link)
      if (!url.includes('instructure.com') && !url.includes('/courses/')) {
        return true;
      }
    }
  }

  // Common external tool keywords in text/description
  const text = stripHtml(html).toLowerCase();
  const externalKeywords = [
    'google doc', 'google drive', 'google form', 'google sheet', 'google slide',
    'edpuzzle', 'nearpod', 'kami', 'deltamath', 'desmos', 'quizlet',
    'kahoot', 'padlet', 'flipgrid', 'flip.com', 'geogebra', 'formative',
    'newsela', 'commonlit', 'aleks', 'savvas', 'external tool', 'external link'
  ];
  return externalKeywords.some(kw => text.includes(kw));
};

// Detect "Trabajo en clase" or classwork submitted on paper
export const isClassworkOnPaper = (a: CanvasAssignment): boolean => {
  const name = (a.name || '').toLowerCase();
  const desc = stripHtml(a.description || '').toLowerCase();
  const types = a.submission_types || [];
  
  const isClassworkText = 
    name.includes('trabajo en clase') || 
    name.includes('trabajo de clase') || 
    name.includes('en clase') ||
    name.includes('classwork') || 
    desc.includes('trabajo en clase');

  return isClassworkText && (types.includes('on_paper') || types.includes('none') || types.length === 0);
};

// Determine if past-due assignment should be automatically moved to (presumed) completed
export const isPresumedCompleted = (a: CanvasAssignment): { presumed: boolean; reason?: 'zero_points' | 'locked_external' } => {
  if (a.is_calendar_event) return { presumed: false };

  const isPast = isAssignmentPastDue(a);
  if (!isPast) return { presumed: false };

  // 1. Past-due 0pt assignments should be automatically moved to (presumed) completed
  const isZeroPoints = a.points_possible === 0 || a.points_possible === null || (typeof a.points_possible === 'number' && a.points_possible <= 0);
  if (isZeroPoints) {
    return { presumed: true, reason: 'zero_points' };
  }

  // 2. Locked forever past-due assignment to be submitted in an external tool (URL in instructions) -> presume completed
  // Note: An assignment locked with a future unlock date is not presumed completed!
  const lockInfo = getAssignmentLockInfo(a);
  if (lockInfo.isLockedForever && hasExternalSubmissionUrl(a)) {
    return { presumed: true, reason: 'locked_external' };
  }

  return { presumed: false };
};

export const isAssignmentSubmitted = (a: CanvasAssignment): boolean => {
  if (a.is_calendar_event) return false;
  if (a.manual_marked_submitted) return true;
  if (a.submission?.submitted_at) return true;

  const sub = a.submission;
  if (sub) {
    // Positive score always means completed and graded
    if (typeof sub.score === 'number' && sub.score > 0) {
      return true;
    }

    // Zero score on a zero-point activity (e.g. participation, practice, syllabus check)
    if (typeof sub.score === 'number' && (a.points_possible === 0 || a.points_possible === null)) {
      return true;
    }

    // Meaningful grade entered by instructor (e.g. 'complete', letter grades, points as string)
    if (sub.grade !== null && sub.grade !== undefined && sub.grade !== '') {
      const g = sub.grade.toString().toLowerCase().trim();
      if (g !== 'incomplete' && g !== 'unsubmitted' && g !== 'missing') {
        return true;
      }
    }

    // Canvas submission workflow state
    const workflowState = (sub as any)?.workflow_state;
    if (workflowState === 'graded' || workflowState === 'submitted') {
      return true;
    }

    // Passive types when any score is recorded
    const types = a.submission_types || [];
    const isPassive = types.includes('on_paper') || types.includes('none') || types.includes('external_tool') || types.includes('not_graded');
    const hasScore = sub.score !== null && sub.score !== undefined;
    if (isPassive && hasScore) {
      return true;
    }
  }

  // Presumed completed:
  // - past-due 0pt assignments
  // - past-due locked assignments with external tool / URL in instructions
  const presumed = isPresumedCompleted(a);
  if (presumed.presumed) {
    return true;
  }

  return false;
};

// Helper to determine status
export const getAssignmentStatus = (assignment: CanvasAssignment) => {
  if (assignment.is_calendar_event) {
    return { label: 'Event', color: 'bg-purple-100 text-purple-700', icon: Calendar };
  }

  const isSubmitted = isAssignmentSubmitted(assignment);
  const score = assignment.submission?.score;
  const hasScore = score !== null && score !== undefined;
  const presumed = isPresumedCompleted(assignment);
  
  if (isSubmitted) {
      if (assignment.manual_marked_submitted) {
         return { label: 'Marked Submitted', color: 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/60', icon: CheckCircle };
      }
      if (presumed.presumed) {
         if (presumed.reason === 'zero_points') {
           return { label: 'Completed (0 pts)', color: 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/60', icon: CheckCircle };
         }
         if (presumed.reason === 'locked_external') {
           return { label: 'Presumed Complete (External)', color: 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/60', icon: CheckCircle };
         }
      }
      if (hasScore) {
         return { label: 'Graded', color: 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/60', icon: CheckCircle };
      }
      return { label: 'Submitted', color: 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/60', icon: CheckCircle };
  }

  // Not submitted logic
  const lockInfo = getAssignmentLockInfo(assignment);
  if (isAssignmentPastDue(assignment)) {
     if (lockInfo.isLockedForever) {
        return { label: 'Missing (Locked)', color: 'bg-red-100 text-red-800 border border-red-200', icon: AlertCircle };
     }
     return { label: 'Missing', color: 'bg-red-100 text-red-700', icon: AlertCircle };
  }

  if (lockInfo.isLockedUntil) {
     return { label: lockInfo.badgeText, color: 'bg-amber-50 text-amber-800 border border-amber-200', icon: Lock };
  }

  return { label: 'Pending', color: 'bg-slate-100 text-slate-600', icon: Clock };
};

// Helper to format points with proper singular/plural grammar ("1 pt" vs "X pts")
export const formatPoints = (pts: number | null | undefined): string => {
  if (pts === null || pts === undefined) return '';
  return pts === 1 ? '1 pt' : `${pts} pts`;
};

// Helper to format dates with relative "Today, [time]" / "Tomorrow, [time]" for imminent dates
export const formatRelativeDueDate = (dateStr: string | null, now: Date = new Date()): string => {
  if (!dateStr) return 'No due date';
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) return 'No due date';

  // Compare calendar dates (midnight to midnight)
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((targetDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));

  // Time formatter (e.g., "11:59 PM")
  const hasTime = target.getHours() !== 0 || target.getMinutes() !== 0;
  const timeStr = hasTime 
    ? target.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) 
    : '';

  if (diffDays === 0) {
    return timeStr ? `Today, ${timeStr}` : 'Today';
  }
  if (diffDays === 1) {
    return timeStr ? `Tomorrow, ${timeStr}` : 'Tomorrow';
  }
  if (diffDays === -1) {
    return timeStr ? `Yesterday, ${timeStr}` : 'Yesterday';
  }
  
  // Future dates within 6 days: show day of week e.g. "Wed, Nov 12"
  if (diffDays > 1 && diffDays <= 6) {
    const weekday = target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return timeStr ? `${weekday}, ${timeStr}` : weekday;
  }

  // Otherwise standard short date: "Nov 15" or "Nov 15, 11:59 PM"
  const formatted = target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return timeStr ? `${formatted}, ${timeStr}` : formatted;
};

/**
 * Formats calendar event dates explicitly with weekday, month, day, and 4-digit year
 * (plus time when non-all-day) for Agenda and List views.
 */
export const formatCalendarEventDate = (
  input:
    | string
    | null
    | undefined
    | {
        due_at?: string | null;
        start_at?: string | null;
        end_at?: string | null;
        all_day_date?: string | null;
      }
): string => {
  if (!input) return 'Date TBD';

  let dateStr: string | null | undefined;
  let isAllDay = false;

  if (typeof input === 'string') {
    dateStr = input;
  } else {
    if (input.all_day_date && !input.start_at) {
      dateStr = `${input.all_day_date}T12:00:00`;
      isAllDay = true;
    } else {
      dateStr = input.start_at || input.due_at || input.end_at;
    }
  }

  if (!dateStr) return 'Date TBD';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Date TBD';

  if (isAllDay) {
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
};

// Helper to format dates - for past-due homework, time of day doesn't need to be shown
export const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "No due date";
  const d = new Date(dateStr);
  const isPast = d.getTime() < Date.now();
  if (isPast) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Helper to extract value for filtering
export const getFilterValue = (a: CanvasAssignment, key: string): string => {
    switch(key) {
        case 'id': return String(a.id);
        case 'name': return a.name;
        case 'due_at': return formatDate(a.due_at);
        case 'type': return formatSubmissionType(a.submission_types);
        case 'status': return getAssignmentStatus(a).label;
        case 'submitted': {
            return isAssignmentSubmitted(a) ? "Yes" : "No";
        }
        case 'locked': return a.locked_for_user ? "Yes" : "No";
        case 'score': {
             if (a.submission?.score !== null && a.submission?.score !== undefined) return String(a.submission.score);
             return "Not Graded";
        }
        case 'points': return String(a.points_possible);
        default: return "";
    }
};

// Helper to determine row style and tooltip based on meta-status
export const getRowMeta = (a: CanvasAssignment) => {
  const isSubmitted = isAssignmentSubmitted(a);
  const hasScore = (a.submission?.score !== null && a.submission?.score !== undefined);
  const isComplete = a.submission?.grade?.toLowerCase() === 'complete';
  const points = a.points_possible || 0;
  const now = new Date();
  const dueDate = a.due_at ? new Date(a.due_at) : null;
  const types = a.submission_types || [];
  const isPassive = types.includes('on_paper') || types.includes('none') || types.includes('external_tool') || types.includes('not_graded');

  // 1. Graded (>0 pts) OR 0 Points OR Complete OR Presumed Complete -> Pale Grey
  const presumed = isPresumedCompleted(a);
  if (presumed.presumed) {
      return { 
        style: "bg-gray-50 text-slate-500 hover:bg-gray-100", 
        reason: presumed.reason === 'zero_points' ? "Presumed complete (0 points)" : "Presumed complete (External tool)" 
      };
  }
  if (hasScore || isComplete) {
      return { style: "bg-gray-50 text-slate-500 hover:bg-gray-100", reason: "Graded" };
  }
  if (points === 0) {
      return { style: "bg-gray-50 text-slate-500 hover:bg-gray-100", reason: "Ungraded assignment (0 points)" };
  }

  // 2. Submitted but Not Graded
  if (isSubmitted && !hasScore) {
      // Manual Override Style
      if (a.manual_marked_submitted) {
          return { style: "bg-emerald-50 hover:bg-emerald-100", reason: "Manually marked as submitted" };
      }

      if (!dueDate || dueDate > now) {
          return { style: "bg-emerald-50 hover:bg-emerald-100", reason: "Submitted, pending grade (Future due date)" };
      }
      
      const diffTime = now.getTime() - dueDate.getTime();
      const diffDays = diffTime / (1000 * 3600 * 24);
      
      if (diffDays <= 14) {
          return { style: "bg-yellow-50 hover:bg-yellow-100", reason: "Submitted recently (<2 weeks), pending grade" };
      }
      return { style: "bg-orange-50 hover:bg-orange-100", reason: "Submitted over 2 weeks ago, pending grade" };
  }

  // 3. Not Submitted
  if (dueDate) {
      if (dueDate < now) {
          const diffTime = now.getTime() - dueDate.getTime();
          const diffDays = diffTime / (1000 * 3600 * 24);
          
          // Special handling for passive types: Pending Teacher action?
          if (isPassive) {
               return { style: "bg-yellow-50 hover:bg-yellow-100", reason: "Teacher processing assignment?" };
          }
          
          // Fallback for generic assignments
          if (diffDays > 42) {
              return { style: "bg-yellow-100 hover:bg-yellow-200", reason: "Teacher abandoned assignment?" };
          }

          return { style: "bg-rose-50/70 text-slate-800 hover:bg-rose-100/70", reason: "Overdue: Not submitted" };
      }
      return { style: "bg-white hover:bg-slate-50", reason: "To Do: Due in future" };
  }

  return { style: "bg-white hover:bg-slate-50", reason: "No due date, not submitted" };
};

/**
 * Heuristically extracts a student's clean first name from raw LMS name strings.
 * Examples:
 * - "LastName, FirstName MiddleInitial (Student)" -> "FirstName"
 * - "Smith, John A. (Student)" -> "John"
 * - "Doe, Jane" -> "Jane"
 * - "Alex Rivera (Student)" -> "Alex"
 * - "Sarah" -> "Sarah"
 */
export function extractStudentFirstName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== 'string') return '';
  
  // 1. Strip role tags like (Student), (Observer), (Faculty), [Student], etc.
  let cleaned = rawName
    .replace(/\s*\((student|observer|faculty|teacher|user|guardian)\)/gi, '')
    .replace(/\s*\[(student|observer|faculty|teacher|user|guardian)\]/gi, '')
    .trim();

  if (!cleaned) return '';

  // 2. Check for "LastName, FirstName Middle..." format
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length >= 2) {
      const afterComma = parts[1].trim();
      const tokens = afterComma.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        // Return first token, stripping trailing dots if single initial
        const candidate = tokens[0].replace(/[.,]/g, '').trim();
        if (candidate.length > 1) {
          return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
        }
        // If first token is just a single letter initial, check if there's a second token
        if (tokens.length > 1) {
          const second = tokens[1].replace(/[.,]/g, '').trim();
          if (second) {
            return second.charAt(0).toUpperCase() + second.slice(1).toLowerCase();
          }
        }
        if (candidate) {
          return candidate.toUpperCase();
        }
      }
    }
  }

  // 3. Fallback: "FirstName Middle LastName" or "FirstName" format
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const first = tokens[0].replace(/[.,]/g, '').trim();
    if (first) {
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
  }

  return cleaned;
}

// Helper to determine the style for scores based on percentage with solid color interpolation
export const getScoreStyle = (score: number, points: number): { className: string, style?: React.CSSProperties } => {
    if (points === 0) return { className: 'bg-slate-50 text-slate-500 border border-slate-200' };
    
    const percent = Math.min(100, Math.max(0, (score / points) * 100));
    
    // < 80%: Red, bold outline
    if (percent < 80) {
        return { 
            className: 'bg-red-100 text-red-900 border-2 border-red-300 font-bold'
        };
    }

    // Soft, desaturated tones for score badge interpolation
    // Red (ish): #fca5a5 (252, 165, 165)
    // Amber:     #fcd34d (252, 211, 77)
    // Green (desaturated sage): #c4e2d2 (196, 226, 210)
    
    const cRed = { r: 252, g: 165, b: 165 };
    const cAmber = { r: 252, g: 211, b: 77 };
    const cGreen = { r: 196, g: 226, b: 210 };

    let start, end, ratio;

    if (percent >= 90) {
        // 90% to 100%: Amber to Green
        start = cAmber;
        end = cGreen;
        ratio = (percent - 90) / 10;
    } else {
        // 80% to 90%: Red to Amber
        start = cRed;
        end = cAmber;
        ratio = (percent - 80) / 10;
    }

    const r = Math.round(start.r + (end.r - start.r) * ratio);
    const g = Math.round(start.g + (end.g - start.g) * ratio);
    const b = Math.round(start.b + (end.b - start.b) * ratio);

    return {
        className: 'text-slate-900 border border-slate-300/50 font-medium',
        style: { backgroundColor: `rgb(${r}, ${g}, ${b})` }
    };
};

/**
 * Safely converts plain text URLs into clickable <a> tags in HTML without
 * corrupting existing HTML tags, attributes, or existing <a> elements.
 */
export const linkifyText = (text: string): string => {
  const urlRegex = /(h?https?:\/\/[^\s<>"'()]+|(?<![\/\w])www\.[^\s<>"'()]+)/gi;
  return text.replace(urlRegex, (url) => {
    let cleanUrl = url;
    let trailingPunct = '';
    const match = cleanUrl.match(/[.,;:?!)]+$/);
    if (match) {
      trailingPunct = match[0];
      cleanUrl = cleanUrl.slice(0, -trailingPunct.length);
    }
    let href = cleanUrl;
    if (/^hhttps?:\/\//i.test(href)) {
      href = href.replace(/^h/i, '');
    } else if (!href.startsWith('http://') && !href.startsWith('https://')) {
      href = `https://${href}`;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline font-medium break-words cursor-pointer inline">${cleanUrl}</a>${trailingPunct}`;
  });
};

export const linkifyHtml = (html?: string): string => {
  if (!html) return '';
  const tokens = html.split(/(<[^>]+>)/g);
  let insideAnchor = false;
  return tokens.map(token => {
    if (!token) return '';
    if (token.startsWith('<') && token.endsWith('>')) {
      if (/^<a\b/i.test(token)) {
        insideAnchor = true;
      } else if (/^<\/a>/i.test(token)) {
        insideAnchor = false;
      }
      return token;
    }
    if (insideAnchor) {
      return token;
    }
    return linkifyText(token);
  }).join('');
};

export const sanitizeRichHtml = (html?: string): string => {
  if (!html) return '';
  let clean = html
    .replace(/<(script|iframe|object|embed|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|iframe|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1="#"');
  clean = linkifyHtml(clean);
  return clean;
};

export const OBSOLETE_DAYS_THRESHOLD = 42; // 6 weeks

export const isAssignmentObsolete = (
  assignment: Pick<CanvasAssignment, 'due_at' | 'is_calendar_event' | 'submission' | 'manual_marked_submitted' | 'submission_types'>,
  nowMs: number = Date.now()
): boolean => {
  if (!assignment || assignment.is_calendar_event || isAssignmentSubmitted(assignment as CanvasAssignment)) {
    return false;
  }
  if (!assignment.due_at) return false;
  const dueTime = new Date(assignment.due_at).getTime();
  if (isNaN(dueTime)) return false;
  const diffDays = (nowMs - dueTime) / (1000 * 3600 * 24);
  return diffDays > OBSOLETE_DAYS_THRESHOLD;
};

export const isAnnouncementObsolete = (
  ann: Pick<CanvasAnnouncement, 'posted_at' | 'created_at'>,
  nowMs: number = Date.now()
): boolean => {
  const dateStr = ann.posted_at || ann.created_at;
  if (!dateStr) return false;
  const postedTime = new Date(dateStr).getTime();
  if (isNaN(postedTime)) return false;
  const diffDays = (nowMs - postedTime) / (1000 * 3600 * 24);
  return diffDays > OBSOLETE_DAYS_THRESHOLD;
};

export const isPastCalendarEvent = (
  ev: {
    start_at?: string | null;
    end_at?: string | null;
    all_day_date?: string | null;
    due_at?: string | null;
  },
  nowMs: number = Date.now()
): boolean => {
  const dateStr =
    ev.end_at ||
    ev.start_at ||
    (ev.all_day_date ? `${ev.all_day_date}T23:59:59` : null) ||
    ev.due_at ||
    null;
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return !isNaN(t) && t < nowMs;
};

/**
 * Determines whether a course belongs to an ended/past academic term.
 * Checks explicit Canvas term.end_at, course.end_at, workflow_state === 'completed',
 * then infers seasonal or year-range academic terms (e.g., "Spring 2025", "2024-2025", "24-25", "SY25").
 */
export const isCourseInPastTerm = (
  course: CanvasCourse | null | undefined,
  nowMs: number = Date.now()
): boolean => {
  if (!course) return false;

  // 1. Explicit Canvas term end date
  if (course.term?.end_at) {
    const termEnd = new Date(course.term.end_at).getTime();
    if (!isNaN(termEnd)) {
      return termEnd < nowMs;
    }
  }

  // 2. Explicit course end date
  if (course.end_at) {
    const courseEnd = new Date(course.end_at).getTime();
    if (!isNaN(courseEnd)) {
      return courseEnd < nowMs;
    }
  }

  // 3. Explicit Canvas workflow_state concluded check
  if ((course as any).workflow_state === 'completed') {
    return true;
  }

  // 4. Heuristic based on term name (ignoring ongoing labels)
  const termName = (course.term?.name || '').trim();
  if (!termName || /default term|ongoing|permanent|continuous/i.test(termName)) {
    return false;
  }

  const nowDate = new Date(nowMs);
  const currentYear = nowDate.getFullYear();

  // Year range like "2024-2025", "2023/24", "24-25", or "SY 24-25"
  const rangeMatch = termName.match(/\b(?:SY|AY)?\s*(?:20)?(\d{2})\s*[-/]\s*(?:20)?(\d{2})\b/i);
  if (rangeMatch) {
    const startYear = 2000 + parseInt(rangeMatch[1], 10);
    const endYear = 2000 + parseInt(rangeMatch[2], 10);
    if (endYear >= startYear && endYear <= startYear + 2) {
      const inferredEnd = new Date(endYear, 6, 1).getTime(); // July 1 of ending year
      return inferredEnd < nowMs;
    }
  }

  // Prefixed school/fiscal year like "SY25", "SY 2025", "FY24"
  const schoolYearMatch = termName.match(/\b(?:SY|AY|FY)\s*(?:20)?(\d{2})\b/i);
  if (schoolYearMatch) {
    const endYear = 2000 + parseInt(schoolYearMatch[1], 10);
    return new Date(endYear, 6, 1).getTime() < nowMs;
  }

  // Season/Semester/Quarter + 4-digit year
  const yearMatch = termName.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (/winter/i.test(termName)) {
      return new Date(yr, 3, 1).getTime() < nowMs; // Ended April 1
    }
    if (/spring/i.test(termName)) {
      return new Date(yr, 6, 1).getTime() < nowMs; // Ended July 1
    }
    if (/summer/i.test(termName)) {
      return new Date(yr, 8, 1).getTime() < nowMs; // Ended Sept 1
    }
    if (/fall|autumn/i.test(termName)) {
      return new Date(yr + 1, 0, 1).getTime() < nowMs; // Ended Jan 1 next year
    }
    if (yr < currentYear) {
      return true;
    }
  }

  return false;
};
