import { CanvasModuleItem, CanvasAssignment, CanvasTodoItem, CanvasModule, CourseData } from '../types';
import { pruneCourseTitle } from './courseAbbreviations';

/**
 * Strips whitespace, accidental wrapping quotes, and any redundant "Bearer " prefix
 * from a Canvas API access token so headers never send "Bearer Bearer ...".
 */
export function sanitizeCanvasToken(rawToken?: string | null): string {
  if (!rawToken) return '';
  let cleaned = String(rawToken).trim();
  cleaned = cleaned.replace(/^["']+|["']+$/g, '').trim();
  cleaned = cleaned.replace(/^bearer\s+/i, '').trim();
  return cleaned;
}

/**
 * Normalizes a Canvas domain or pasted school URL down to a clean hostname (or scheme + host).
 * Example: "https://mcpsmd.instructure.com/courses/123/" -> "mcpsmd.instructure.com"
 */
export function sanitizeCanvasDomain(rawDomain?: string | null): string {
  if (!rawDomain) return '';
  let cleaned = String(rawDomain).trim().replace(/^["']+|["']+$/g, '');
  if (!cleaned) return '';
  if (cleaned.toUpperCase() === 'DEMO') return 'DEMO';
  try {
    const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
    const parsed = new URL(withProtocol);
    return parsed.host;
  } catch {
    return cleaned.replace(/^https?:\/\//i, '').split('/')[0].replace(/\/+$/, '');
  }
}

/**
 * Normalizes Canvas URLs to ensure they link to student-facing human web pages,
 * NEVER to API endpoints (like /api/v1/courses/... or /api/v1/courses/.../module_item_redirect/...)
 * which return raw JSON or require API authentication and fail in a normal browser tab.
 */
export function getHumanModuleItemWebUrl(
  item?: CanvasModuleItem | null,
  courseId?: number,
  canvasDomain?: string
): string | null {
  if (!item) return null;

  // 1. If item is an ExternalUrl with a dedicated external_url field
  if (item.type === 'ExternalUrl' && (item as any).external_url) {
    const ext = (item as any).external_url;
    if (!ext.includes('/api/v1/') && !ext.includes('/api/canvas')) {
      return ext;
    }
  }

  // 2. Normalize Canvas domain base (e.g. "https://school.instructure.com")
  let domain = (canvasDomain || '').trim();
  if (domain && !domain.startsWith('http://') && !domain.startsWith('https://')) {
    domain = `https://${domain}`;
  }
  domain = domain.replace(/\/+$/, '');

  const cId = courseId || (item as any)?.course_id;

  // 3. Check for specific Canvas content types with direct human URLs
  if (cId && domain) {
    if (item.type === 'Page' && (item as any).page_url) {
      return `${domain}/courses/${cId}/pages/${encodeURIComponent((item as any).page_url)}`;
    }
    if (item.type === 'Assignment' && item.content_id) {
      return `${domain}/courses/${cId}/assignments/${item.content_id}`;
    }
    if (item.type === 'Quiz' && item.content_id) {
      return `${domain}/courses/${cId}/quizzes/${item.content_id}`;
    }
    if (item.type === 'Discussion' && item.content_id) {
      return `${domain}/courses/${cId}/discussion_topics/${item.content_id}`;
    }
    if (item.type === 'File' && item.content_id) {
      return `${domain}/courses/${cId}/files/${item.content_id}`;
    }
  }

  // 4. Clean existing html_url or url
  let rawUrl = item.html_url || (item as any).url || '';
  if (rawUrl) {
    // Canvas proxy unwrap if needed
    if (rawUrl.includes('/api/canvas?url=')) {
      const match = rawUrl.match(/url=([^&]+)/);
      if (match) {
        rawUrl = decodeURIComponent(match[1]);
      }
    }

    // Convert Canvas module_item_redirect API endpoint to human module item page:
    // /api/v1/courses/:course_id/module_item_redirect/:id -> /courses/:course_id/modules/items/:id
    rawUrl = rawUrl.replace(/\/api\/v1\/courses\/(\d+)\/module_item_redirect\/(\d+)/, '/courses/$1/modules/items/$2');

    // Convert API pages endpoint to human pages web URL:
    // /api/v1/courses/:course_id/pages/:page_url -> /courses/:course_id/pages/$1
    rawUrl = rawUrl.replace(/\/api\/v1\/courses\/(\d+)\/pages\//, '/courses/$1/pages/');

    // Convert any other /api/v1/ prefix in Canvas URLs
    rawUrl = rawUrl.replace(/\/api\/v1\//g, '/');

    // If URL has no domain scheme but has domain available
    if (rawUrl.startsWith('/')) {
      if (domain) {
        rawUrl = `${domain}${rawUrl}`;
      }
    }

    // Double check that it does not contain API prefixes
    if (!rawUrl.includes('/api/v1/')) {
      return rawUrl;
    }
  }

  // 5. Fallback: if we have domain, courseId, and item.id
  if (domain && cId && item.id) {
    return `${domain}/courses/${cId}/modules/items/${item.id}`;
  }

  // Fallback to module page if available
  if (domain && cId) {
    return `${domain}/courses/${cId}/modules`;
  }

  return null;
}

/**
 * Resolves a human-usable Canvas web URL for a calendar event.
 * - Cleans relative URLs, proxy wrappers, and `/api/v1/calendar_events/:id` API paths.
 * - Falls back to `https://<domain>/calendar?event_id=<id>&include_contexts=<context>`
 *   when Canvas omits `html_url` (or passes `'#'`).
 * - Never returns `'#'` so broken self-links are never rendered.
 */
export function getCalendarEventWebUrl(
  ev?: {
    id?: number | string | null;
    html_url?: string | null;
    url?: string | null;
    context_code?: string | null;
    effective_context_code?: string | null;
    course_id?: number | null;
  } | null,
  canvasDomain?: string | null
): string | null {
  if (!ev) return null;

  const cleanedDomain = sanitizeCanvasDomain(canvasDomain);
  const domainBase =
    cleanedDomain && cleanedDomain.toUpperCase() !== 'DEMO'
      ? `https://${cleanedDomain}`
      : '';

  let rawUrl = String(ev.html_url || ev.url || '').trim();
  if (rawUrl && rawUrl !== '#') {
    if (rawUrl.includes('/api/canvas?url=')) {
      const match = rawUrl.match(/url=([^&]+)/);
      if (match) {
        try {
          rawUrl = decodeURIComponent(match[1]);
        } catch {
          rawUrl = match[1];
        }
      }
    }

    // Convert API calendar event paths into Canvas web calendar deep links
    rawUrl = rawUrl.replace(/\/api\/v1\/calendar_events\/(\d+)/i, '/calendar?event_id=$1');
    rawUrl = rawUrl.replace(/\/api\/v1\//g, '/');

    if (rawUrl.startsWith('/') && domainBase) {
      rawUrl = `${domainBase}${rawUrl}`;
    }

    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
  }

  const numericId = ev.id !== undefined && ev.id !== null ? Math.abs(Number(ev.id)) : 0;
  if (domainBase && numericId > 0 && !isNaN(numericId)) {
    const context =
      ev.effective_context_code ||
      ev.context_code ||
      (ev.course_id && ev.course_id > 0 ? `course_${ev.course_id}` : '');
    const contextQuery = context ? `&include_contexts=${encodeURIComponent(context)}` : '';
    return `${domainBase}/calendar?event_id=${numericId}${contextQuery}`;
  }

  return null;
}

export interface ExtractedTodoAssignment {
  assignment: CanvasAssignment;
  assignmentId: number;
  courseId: number;
  courseName: string;
  modules: CanvasModule[];
}

/**
 * Robustly resolves the underlying Canvas assignment from a Canvas To-Do item.
 * Canvas To-Do items may store assignment references under:
 * - item.assignment (complete or partial)
 * - item.assignment_id or (item as any).assignment_id
 * - item.html_url (e.g. /courses/101/assignments/12345)
 * - item.url (e.g. /courses/101/assignments/12345)
 * - item.ignore (e.g. .../assignment_12345/submitting)
 * - item.quiz.assignment_id or item.quiz.id
 * - Matching by title or course in loaded courses data
 */
export function extractAssignmentFromTodo(
  item: CanvasTodoItem,
  courses: CourseData[] = [],
  canvasUrl?: string
): ExtractedTodoAssignment | null {
  if (!item) return null;

  // 1. Resolve Course ID
  let courseId = item.course_id || item.assignment?.course_id || item.context_id;

  // Check URL for course ID: /courses/(\d+)
  if (!courseId) {
    const urlToCheck = item.html_url || (item as any).url || item.ignore || '';
    const courseMatch = urlToCheck.match(/\/courses\/(\d+)/);
    if (courseMatch) {
      courseId = Number(courseMatch[1]);
    }
  }

  // Match by context_name in courses
  if (!courseId && item.context_name && courses.length > 0) {
    const foundCourse = courses.find(
      c => c.course.name === item.context_name || 
           c.course.course_code === item.context_name ||
           pruneCourseTitle(c.course.name) === pruneCourseTitle(item.context_name || '')
    );
    if (foundCourse) {
      courseId = foundCourse.course.id;
    }
  }

  // 2. Resolve Assignment ID
  let assignmentId: number | undefined = item.assignment?.id || (item as any).assignment_id;

  if (!assignmentId && item.quiz?.assignment_id) {
    assignmentId = item.quiz.assignment_id;
  }

  // Extract from html_url / url: /assignments/(\d+)
  const urlToCheck = item.html_url || (item as any).url || '';
  if (!assignmentId && urlToCheck) {
    const match = urlToCheck.match(/\/assignments\/(\d+)/);
    if (match) {
      assignmentId = Number(match[1]);
    }
  }

  // Extract from ignore URL: /assignment_(\d+)/
  if (!assignmentId && item.ignore) {
    const match = item.ignore.match(/assignment_(\d+)/);
    if (match) {
      assignmentId = Number(match[1]);
    }
  }

  const title = (item.assignment?.name || item.quiz?.title || (item as any).title || 'Canvas Assignment').trim();
  const titleLower = title.toLowerCase();

  // 3. Search in loaded courses data
  let matchedAssignment: CanvasAssignment | null = null;
  let matchedCourseData: CourseData | undefined;

  // First search in specific course
  if (courseId) {
    matchedCourseData = courses.find(c => c.course.id === courseId);
    if (matchedCourseData) {
      if (assignmentId) {
        matchedAssignment = matchedCourseData.assignments.find(a => a.id === assignmentId) || null;
      }
      if (!matchedAssignment && titleLower) {
        matchedAssignment = matchedCourseData.assignments.find(
          a => (a.name || '').trim().toLowerCase() === titleLower
        ) || null;
      }
    }
  }

  // If not found in specific course, search across all courses
  if (!matchedAssignment && courses.length > 0) {
    for (const c of courses) {
      if (assignmentId) {
        const found = c.assignments.find(a => a.id === assignmentId);
        if (found) {
          matchedAssignment = found;
          matchedCourseData = c;
          courseId = c.course.id;
          break;
        }
      }
      if (titleLower) {
        const found = c.assignments.find(a => (a.name || '').trim().toLowerCase() === titleLower);
        if (found) {
          matchedAssignment = found;
          matchedCourseData = c;
          courseId = c.course.id;
          break;
        }
      }
    }
  }

  // 4. Resolve fallback course data if not yet found
  if (!matchedCourseData && courseId) {
    matchedCourseData = courses.find(c => c.course.id === courseId);
  }

  const finalCourseId = courseId || matchedCourseData?.course.id || 0;
  const courseName = matchedCourseData?.course.name 
    ? pruneCourseTitle(matchedCourseData.course.name) 
    : (item.context_name ? pruneCourseTitle(item.context_name) : 'Course');
  const modules = matchedCourseData?.modules || [];

  // 5. If we have a matched assignment from course data, return it
  if (matchedAssignment) {
    return {
      assignment: matchedAssignment,
      assignmentId: matchedAssignment.id,
      courseId: finalCourseId,
      courseName,
      modules
    };
  }

  // 6. If we have an assignmentId or item.assignment, synthesize a valid CanvasAssignment
  const finalAssignmentId = assignmentId || (item.assignment?.id) || (item as { id?: number }).id;
  if (!finalAssignmentId) return null;

  // Build clean html_url
  let htmlUrl = item.html_url || '';
  if (htmlUrl.includes('/api/v1/')) {
    htmlUrl = htmlUrl.replace(/\/api\/v1\//g, '/');
  }
  if (!htmlUrl && canvasUrl && finalCourseId) {
    const base = canvasUrl.startsWith('http') ? canvasUrl.replace(/\/+$/, '') : `https://${canvasUrl.replace(/\/+$/, '')}`;
    htmlUrl = `${base}/courses/${finalCourseId}/assignments/${finalAssignmentId}`;
  }

  const synthesizedAssignment: CanvasAssignment = {
    id: Number(finalAssignmentId),
    name: title,
    description: item.assignment?.description || item.quiz?.description || '',
    due_at: item.assignment?.due_at || item.quiz?.due_at || null,
    points_possible: item.assignment?.points_possible ?? item.quiz?.points_possible ?? 0,
    course_id: finalCourseId,
    html_url: htmlUrl,
    submission: item.assignment?.submission,
    locked_for_user: false,
    submission_types: item.assignment?.submission_types || ['online_text_entry'],
    ...item.assignment
  };

  return {
    assignment: synthesizedAssignment,
    assignmentId: Number(finalAssignmentId),
    courseId: finalCourseId,
    courseName,
    modules
  };
}
