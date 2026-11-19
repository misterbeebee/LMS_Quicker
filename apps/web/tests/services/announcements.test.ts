import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchAnnouncements,
  dismissAnnouncement,
  getMockAnnouncements,
  getCourseIdFromAnnouncement,
} from '../../services/canvas';
import {
  getDismissedAnnouncements,
  saveDismissedAnnouncements,
  dismissAnnouncementLocal,
  saveStudent,
  removeStudent,
} from '../../services/students';
import {
  sanitizeRichHtml,
  isAnnouncementObsolete,
  OBSOLETE_DAYS_THRESHOLD,
} from '../../utils/dashboard-helpers';
import { CanvasAnnouncement } from '../../types';

describe('Canvas Announcements service & per-student dismissal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves mock announcements in Demo mode with zero network fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const items = await fetchAnnouncements('DEMO', 'DEMO', false, [101, 102]);
    expect(items.length).toBe(getMockAnnouncements().length);
    expect(fetchSpy).not.toHaveBeenCalled();

    const dismissResult = await dismissAnnouncement('DEMO', 'DEMO', false, items[0]);
    expect(dismissResult).toEqual({ ok: true, syncedToCanvas: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('extracts course_id from context_code or html_url cleanly', () => {
    expect(getCourseIdFromAnnouncement({ course_id: 222 })).toBe(222);
    expect(getCourseIdFromAnnouncement({ context_code: 'course_333' })).toBe(333);
    expect(
      getCourseIdFromAnnouncement({
        html_url: 'https://school.instructure.com/courses/444/discussion_topics/99',
      })
    ).toBe(444);
    expect(getCourseIdFromAnnouncement({ context_code: 'user_self' })).toBeNull();
  });

  it('fetches live announcements in batches, filters deleted, sorts newest-first, and sends PUT read on dismiss', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/announcements?')) {
        return new Response(
          JSON.stringify([
            {
              id: 11,
              title: 'Older Post',
              message: '<p>Read ch 2</p>',
              posted_at: '2026-11-01T10:00:00Z',
              context_code: 'course_101',
              read_state: 'read',
              workflow_state: 'active',
            },
            {
              id: 12,
              title: 'Deleted Post',
              message: '<p>Ignore</p>',
              posted_at: '2026-11-03T10:00:00Z',
              context_code: 'course_101',
              workflow_state: 'deleted',
            },
            {
              id: 13,
              title: 'Newest Post',
              message: '<p>Quiz moved to Friday</p>',
              posted_at: '2026-11-05T14:00:00Z',
              context_code: 'course_102',
              read_state: 'unread',
              workflow_state: 'active',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/courses/102/discussion_topics/13/read') && init?.method === 'PUT') {
        return new Response(null, { status: 204 });
      }
      return new Response('Not Found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const announcements = await fetchAnnouncements(
      'school.instructure.com',
      '1000~tok',
      false,
      [101, 102]
    );

    expect(announcements.map(a => a.id)).toEqual([13, 11]);
    expect(announcements[0].course_id).toBe(102);
    expect(announcements[1].course_id).toBe(101);

    const res = await dismissAnnouncement(
      'school.instructure.com',
      '1000~tok',
      false,
      announcements[0] as CanvasAnnouncement
    );
    expect(res).toEqual({ ok: true, syncedToCanvas: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/courses/102/discussion_topics/13/read'),
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('gracefully keeps ok=true when Canvas read endpoint returns non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: ['forbidden'] }), { status: 403 }))
    );

    const res = await dismissAnnouncement('school.instructure.com', '1000~tok', true, {
      id: 99,
      title: 'Note',
      message: '',
      posted_at: null,
      course_id: 101,
    });
    expect(res).toEqual({ ok: true, syncedToCanvas: false });
  });

  it('isolates dismissed announcement IDs per student and cleans them up on student deletion', () => {
    const s1 = saveStudent({ name: 'Alice', domain: 'DEMO', apiKey: 'DEMO' });
    const s2 = saveStudent({ name: 'Bob', domain: 'DEMO', apiKey: 'DEMO' });

    dismissAnnouncementLocal(s1.id, 5001);
    saveDismissedAnnouncements(s2.id, new Set([5002]));

    expect(getDismissedAnnouncements(s1.id).has(5001)).toBe(true);
    expect(getDismissedAnnouncements(s1.id).has(5002)).toBe(false);
    expect(getDismissedAnnouncements(s2.id).has(5002)).toBe(true);
    expect(getDismissedAnnouncements(s2.id).has(5001)).toBe(false);

    removeStudent(s1.id);
    expect(getDismissedAnnouncements(s1.id).size).toBe(0);
    expect(getDismissedAnnouncements(s2.id).has(5002)).toBe(true);
  });

  it('sanitizes dangerous tags/handlers while linkifying URLs in sanitizeRichHtml', () => {
    const dirty =
      '<p onclick="alert(1)">Check https://example.com/syllabus</p><script>evil()</script><a href="javascript:steal()">Bad</a>';
    const clean = sanitizeRichHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('href="https://example.com/syllabus"');
  });

  it('flags announcements older than 42 days (6 weeks) as obsolete while keeping recent ones', () => {
    const now = Date.now();
    const recent = { posted_at: new Date(now - 41 * 24 * 3600_000).toISOString() };
    const stale = { posted_at: new Date(now - (OBSOLETE_DAYS_THRESHOLD + 1) * 24 * 3600_000).toISOString() };
    const missingDate = { posted_at: null, created_at: null };

    expect(isAnnouncementObsolete(recent, now)).toBe(false);
    expect(isAnnouncementObsolete(stale, now)).toBe(true);
    expect(isAnnouncementObsolete(missingDate, now)).toBe(false);
  });
});
