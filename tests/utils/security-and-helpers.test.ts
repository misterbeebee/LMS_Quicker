import { describe, it, expect } from 'vitest';
import { validateProxyTargetUrl } from '../../utils/proxySecurity';
import {
  extractStudentFirstName,
  isAssignmentSubmitted,
  isPresumedCompleted,
  getAssignmentLockInfo,
  getAssignmentFeedbackComments,
  linkifyHtml,
  formatPoints,
  formatRelativeDueDate,
  formatCalendarEventDate,
  isPastCalendarEvent,
  isCourseInPastTerm,
  isAssignmentObsolete,
} from '../../utils/dashboard-helpers';
import { computeCourseAbbreviations, pruneCourseTitle } from '../../utils/courseAbbreviations';
import { extractSearchTokens, findContainingModule, findRelatedModuleContent } from '../../utils/moduleSearch';
import {
  sanitizeCanvasDomain,
  sanitizeCanvasToken,
  getHumanModuleItemWebUrl,
  getCalendarEventWebUrl,
  extractAssignmentFromTodo,
} from '../../utils/canvasUrls';
import { CanvasAssignment, CanvasModule, CourseData } from '../../types';

describe('proxySecurity validateProxyTargetUrl SSRF protections', () => {
  it('permits legitimate public HTTPS/HTTP Canvas URLs and public mapped IPv6', () => {
    expect(validateProxyTargetUrl('https://mcpsmd.instructure.com/api/v1/users/self').valid).toBe(true);
    expect(validateProxyTargetUrl('https://canvas.school.edu:8443/api/v1/courses').valid).toBe(true);
    expect(validateProxyTargetUrl('http://[::ffff:8.8.8.8]/api/v1/ping').valid).toBe(true);
  });

  it('blocks loopback, metadata, private IPv4/IPv6, CGNAT, obfuscated numeric/octal IPs, trailing dots, and credentials', () => {
    const blockedUrls = [
      'http://localhost:3000/api/health',
      'http://localhost./api/health',
      'http://sub.localhost/secret',
      'http://school.local/admin',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://127.0.0.1:8080/',
      'http://10.0.0.1/',
      'http://172.16.5.4/',
      'http://172.31.255.254/',
      'http://192.168.1.1/',
      'http://100.64.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://198.18.0.1/',
      'http://224.0.0.1/',
      'http://2130706433/',
      'http://0x7f000001/',
      'http://0177.0.0.1/',
      'http://[::1]:3000/',
      'http://[fe80::1]/',
      'http://[fd12:3456::1]/',
      'http://[64:ff9b::127.0.0.1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:7f00:1]/',
      'https://user:pass@mcpsmd.instructure.com/api/v1/users/self',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'not-a-url',
    ];

    for (const url of blockedUrls) {
      expect(validateProxyTargetUrl(url).valid, `expected blocked: ${url}`).toBe(false);
    }
  });
});

describe('dashboard-helpers pure logic', () => {
  it('extracts clean first names from LMS formatted names', () => {
    expect(extractStudentFirstName('Smith, John A. (Student)')).toBe('John');
    expect(extractStudentFirstName('DOE, J. Elena [Observer]')).toBe('Elena');
    expect(extractStudentFirstName('Alex Rivera (Student)')).toBe('Alex');
    expect(extractStudentFirstName('')).toBe('');
  });

  it('handles submission detection, presumed completion, and lock state distinctions', () => {
    const pastIso = new Date(Date.now() - 86400_000).toISOString();
    const futureIso = new Date(Date.now() + 3 * 86400_000).toISOString();

    const zeroPtPast: CanvasAssignment = {
      id: 1,
      name: 'Syllabus Practice',
      description: '',
      due_at: pastIso,
      points_possible: 0,
      course_id: 1,
      html_url: '',
      locked_for_user: false,
      submission_types: ['none'],
    };
    expect(isPresumedCompleted(zeroPtPast)).toEqual({ presumed: true, reason: 'zero_points' });
    expect(isAssignmentSubmitted(zeroPtPast)).toBe(true);

    const lockedExternalPast: CanvasAssignment = {
      id: 2,
      name: 'Desmos Activity',
      description: '<p>Complete on <a href="https://student.desmos.com/123">Desmos</a></p>',
      due_at: pastIso,
      points_possible: 20,
      course_id: 1,
      html_url: '',
      locked_for_user: true,
      lock_at: pastIso,
      submission_types: ['external_tool'],
    };
    expect(getAssignmentLockInfo(lockedExternalPast).isLockedForever).toBe(true);
    expect(isPresumedCompleted(lockedExternalPast)).toEqual({ presumed: true, reason: 'locked_external' });

    const lockedUntilFuture: CanvasAssignment = {
      id: 3,
      name: 'Unit Quiz',
      description: '',
      due_at: futureIso,
      unlock_at: futureIso,
      points_possible: 50,
      course_id: 1,
      html_url: '',
      locked_for_user: true,
      submission_types: ['online_quiz'],
    };
    const lockInfo = getAssignmentLockInfo(lockedUntilFuture);
    expect(lockInfo.isLocked).toBe(true);
    expect(lockInfo.isLockedUntil).toBe(true);
    expect(lockInfo.isLockedForever).toBe(false);
  });

  it('filters student self-comments and appends instructor rubric comments', () => {
    const assignment: CanvasAssignment = {
      id: 10,
      name: 'Essay',
      description: '',
      due_at: null,
      points_possible: 100,
      course_id: 1,
      html_url: '',
      submission_types: ['online_upload'],
      submission: {
        user_id: 777,
        submitted_at: '2026-11-10T12:00:00Z',
        grade: '90',
        score: 90,
        submission_comments: [
          { id: 1, author_id: 777, author_name: 'Student', comment: 'Here is my file', created_at: '2026-11-10T12:00:00Z' },
          { id: 2, author_id: 99, author_name: 'Teacher', comment: 'Nice thesis', created_at: '2026-11-11T12:00:00Z' },
        ],
        rubric_assessment: {
          crit_1: { points: 50, comments: 'Strong evidence throughout.' },
        },
      } as any,
    };

    const comments = getAssignmentFeedbackComments(assignment);
    expect(comments).toHaveLength(2);
    expect(comments[0].comment).toBe('Nice thesis');
    expect(comments[1].author_name).toBe('Instructor (Rubric)');
  });

  it('linkifies plain URLs without double-wrapping existing anchors and formats points/dates', () => {
    const input = '<p>See <a href="https://a.com">already</a> and https://b.com/path.</p>';
    const out = linkifyHtml(input);
    expect(out).toContain('<a href="https://a.com">already</a>');
    expect(out).toContain('<a href="https://b.com/path"');
    expect(out).toContain('</a>.</p>');

    expect(formatPoints(1)).toBe('1 pt');
    expect(formatPoints(25)).toBe('25 pts');
    expect(formatPoints(null)).toBe('');

    const now = new Date('2026-11-13T12:00:00');
    expect(formatRelativeDueDate('2026-11-13T23:59:00', now)).toMatch(/^Today,/);
    expect(formatRelativeDueDate('2026-11-14T23:59:00', now)).toMatch(/^Tomorrow,/);
    expect(formatRelativeDueDate(null, now)).toBe('No due date');
  });
});

describe('courseAbbreviations, moduleSearch & canvasUrls', () => {
  it('prunes metadata hyphens cleanly while preserving compound words like Pre-Calculus', () => {
    expect(pruneCourseTitle('Honors Pre-Calculus - Period 4 - Teacher')).toBe('Honors Pre-Calculus');
    expect(pruneCourseTitle('2025-2026 AP Chemistry - Sec 01')).toBe('AP Chemistry');

    const courses: CourseData[] = [
      { course: { id: 1, name: 'AP Chemistry 1 - Pd 1', course_code: 'CHM1' }, assignments: [], modules: [] },
      { course: { id: 2, name: 'Honors Chemistry 2 - Pd 2', course_code: 'CHM2' }, assignments: [], modules: [] },
    ];
    const map = computeCourseAbbreviations(courses);
    expect(map.get(1)).not.toBe(map.get(2));
    expect(map.get(1)?.length).toBe(3);
    expect(map.get(2)?.length).toBe(3);
  });

  it('finds containing and keyword-matched module study materials while excluding self', () => {
    const modules: CanvasModule[] = [
      {
        id: 10,
        name: 'Unit 3: Cellular Respiration',
        course_id: 101,
        items: [
          { id: 1, title: 'Cellular Respiration Slides', type: 'File', module_id: 10 },
          { id: 2, title: 'Unit 3 Lab Worksheet', type: 'Assignment', module_id: 10, content_id: 55 },
        ],
      },
    ];
    const target: CanvasAssignment = {
      id: 55,
      name: 'Unit 3 Lab Worksheet',
      description: '',
      due_at: null,
      points_possible: 20,
      course_id: 101,
      html_url: '',
      submission_types: ['online_upload'],
    };

    expect(extractSearchTokens('Unit 3: Cellular Respiration Lab')).toEqual({
      unitPatterns: ['unit 3'],
      keywords: ['unit', 'cellular', 'respiration', 'lab'],
    });
    expect(findContainingModule(target, modules)?.id).toBe(10);

    const related = findRelatedModuleContent(target, modules);
    expect(related).toHaveLength(1);
    expect(related[0].item?.title).toBe('Cellular Respiration Slides');
  });

  it('sanitizes domains/tokens, produces human module URLs, and extracts Todo assignments', () => {
    expect(sanitizeCanvasToken(' "Bearer 1234~abc" ')).toBe('1234~abc');
    expect(sanitizeCanvasDomain('https://mcpsmd.instructure.com/courses/500/')).toBe('mcpsmd.instructure.com');
    expect(sanitizeCanvasDomain('demo')).toBe('DEMO');

    const redirectUrl = getHumanModuleItemWebUrl(
      {
        id: 88,
        module_id: 1,
        title: 'Guide',
        type: 'SubHeader',
        html_url: 'https://school.instructure.com/api/v1/courses/101/module_item_redirect/88',
      },
      101,
      'school.instructure.com'
    );
    expect(redirectUrl).toBe('https://school.instructure.com/courses/101/modules/items/88');

    const extracted = extractAssignmentFromTodo(
      {
        type: 'submitting',
        context_name: 'AP Biology',
        course_id: 101,
        html_url: 'https://school.instructure.com/api/v1/courses/101/assignments/777',
        assignment: { id: 777, name: 'Lab Quiz' } as any,
      },
      [],
      'school.instructure.com'
    );
    expect(extracted?.assignmentId).toBe(777);
    expect(extracted?.courseId).toBe(101);
    expect(extracted?.assignment.html_url).toBe('https://school.instructure.com/courses/101/assignments/777');
  });

  it('resolves Canvas web URLs for calendar events and detects past events accurately', () => {
    // Strips /api/v1/calendar_events/:id and prefixes relative paths with domain
    expect(
      getCalendarEventWebUrl(
        { id: 4201, html_url: '/api/v1/calendar_events/4201', context_code: 'course_101' },
        'mcpsmd.instructure.com'
      )
    ).toBe('https://mcpsmd.instructure.com/calendar?event_id=4201');

    // Synthesizes Canvas deep link when html_url is omitted or '#'
    expect(
      getCalendarEventWebUrl(
        { id: -5502, html_url: '#', context_code: 'course_101' },
        'https://mcpsmd.instructure.com/'
      )
    ).toBe('https://mcpsmd.instructure.com/calendar?event_id=5502&include_contexts=course_101');

    // Never returns '#' even without domain
    expect(getCalendarEventWebUrl({ id: 99, html_url: '#' }, 'DEMO')).toBeNull();
    expect(
      getCalendarEventWebUrl(
        { id: 9001, html_url: 'https://canvas.instructure.com/calendar?event_id=9001' },
        'DEMO'
      )
    ).toBe('https://canvas.instructure.com/calendar?event_id=9001');

    const nowMs = new Date('2026-11-13T12:00:00Z').getTime();
    expect(isPastCalendarEvent({ start_at: '2026-11-13T09:00:00Z', end_at: '2026-11-13T11:00:00Z' }, nowMs)).toBe(true);
    expect(isPastCalendarEvent({ start_at: '2026-11-13T11:00:00Z', end_at: '2026-11-13T14:00:00Z' }, nowMs)).toBe(false);
    expect(isPastCalendarEvent({ all_day_date: '2026-11-12' }, nowMs)).toBe(true);
    expect(isPastCalendarEvent({ all_day_date: '2026-11-14' }, nowMs)).toBe(false);

    expect(formatCalendarEventDate({ start_at: '2026-11-13T18:30:00Z' })).toContain('2026');
    expect(formatCalendarEventDate({ all_day_date: '2027-02-10' })).toContain('2027');

    // Past-term detection: explicit dates, completed workflow_state, 2-digit/SY year ranges, and season labels
    expect(isCourseInPastTerm({ id: 1, name: 'Old', course_code: 'OLD', term: { id: 2, name: 'Spring 2025', end_at: '2025-06-15T00:00:00Z' } }, nowMs)).toBe(true);
    expect(isCourseInPastTerm({ id: 2, name: 'Old Fall', course_code: 'OLD2', term: { id: 3, name: 'Fall 2024' } }, nowMs)).toBe(true);
    expect(isCourseInPastTerm({ id: 3, name: 'Range', course_code: 'RNG', term: { id: 4, name: '2024-2025 Academic Year' } }, nowMs)).toBe(true);
    expect(isCourseInPastTerm({ id: 6, name: 'Short Range', course_code: 'SR', term: { id: 6, name: 'SY 24-25' } }, nowMs)).toBe(true);
    expect(isCourseInPastTerm({ id: 7, name: 'Short SY', course_code: 'SY25', term: { id: 7, name: 'SY25' } }, nowMs)).toBe(true);
    expect(isCourseInPastTerm({ id: 8, name: 'Concluded', course_code: 'DONE', workflow_state: 'completed' } as any, nowMs)).toBe(true);
    expect(isCourseInPastTerm({ id: 9, name: 'Active Year', course_code: 'ACT', term: { id: 9, name: '26-27' } }, nowMs)).toBe(false);
    expect(isCourseInPastTerm({ id: 4, name: 'Current', course_code: 'CUR', term: { id: 1, name: 'Fall 2026' } }, nowMs)).toBe(false);
    expect(isCourseInPastTerm({ id: 5, name: 'Default', course_code: 'DEF', term: { id: 5, name: 'Default Term' } }, nowMs)).toBe(false);

    // Obsolete assignment threshold (>42 days unsubmitted & non-calendar)
    expect(
      isAssignmentObsolete(
        { due_at: '2026-09-20T00:00:00Z', submission_types: ['online_upload'] },
        nowMs
      )
    ).toBe(true);
    expect(
      isAssignmentObsolete(
        { due_at: '2026-10-20T00:00:00Z', submission_types: ['online_upload'] },
        nowMs
      )
    ).toBe(false);
    expect(
      isAssignmentObsolete(
        { due_at: '2026-09-01T00:00:00Z', submission_types: ['calendar_event'], is_calendar_event: true },
        nowMs
      )
    ).toBe(false);
    expect(
      isAssignmentObsolete(
        {
          due_at: '2026-09-01T00:00:00Z',
          submission_types: ['online_upload'],
          submission: { submitted_at: '2026-09-01T00:00:00Z', grade: '90', score: 90 },
        },
        nowMs
      )
    ).toBe(false);
  });
});
