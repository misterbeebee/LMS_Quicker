import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCourseCustomizations,
  saveCourseCustomization,
  saveCourseCustomizationsBulk,
  getSavedCourseOrder,
  saveCourseOrder,
  suggestCourseCustomization,
} from '../../services/courseCustomization';
import {
  getSavedGradeConfig,
  saveGradeConfig,
  getLetterGrade,
  getGradeStyle,
  DEFAULT_GRADE_CONFIG,
} from '../../services/gradeScale';
import {
  setCachedUserId,
  getCachedUserId,
  clearCanvasMemoryCaches,
  getCourseIdFromEvent,
  fetchCalendarEvents,
} from '../../services/canvas';

describe('multi-student course customization isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isolates course customizations and order per student without reading or overwriting _default', () => {
    saveCourseCustomization(101, { emoji: '🧬', abbreviation: 'BIO1' }, 'student_a');
    saveCourseOrder([101, 102], 'student_a');

    // Different student sees clean slate (no cross-student or _default leakage)
    expect(getCourseCustomizations('student_b')).toEqual({});
    expect(getSavedCourseOrder('student_b')).toEqual([]);
    expect(getCourseCustomizations()).toEqual({});
    expect(getSavedCourseOrder()).toEqual([]);

    // Default bucket cannot leak into named students either
    saveCourseCustomization(999, { emoji: '📝', abbreviation: 'DFLT' });
    saveCourseOrder([999]);
    expect(getCourseCustomizations('student_a')).toEqual({
      101: { emoji: '🧬', abbreviation: 'BIO1' },
    });
    expect(getSavedCourseOrder('student_a')).toEqual([101, 102]);
  });

  it('deep-merges bulk course customizations and normalizes string/number keys', () => {
    saveCourseCustomization(101, { emoji: '💻' }, 'student_a');
    const merged = saveCourseCustomizationsBulk(
      {
        101: { abbreviation: 'CSCI' },
        102: { emoji: '♾️', abbreviation: 'CALC' },
      },
      'student_a'
    );
    expect(merged[101]).toEqual({ emoji: '💻', abbreviation: 'CSCI' });
    expect(merged[102]).toEqual({ emoji: '♾️', abbreviation: 'CALC' });
    expect(getCourseCustomizations('student_b')).toEqual({});
  });

  it('suggests expected thematic emoji and 4-letter code for known and unknown subjects', () => {
    expect(suggestCourseCustomization('AP Calculus BC')).toMatchObject({ emoji: '♾️', abbreviation: 'CALC' });
    expect(suggestCourseCustomization('Honors Chemistry')).toMatchObject({ emoji: '🧪', abbreviation: 'CHEM' });
    expect(suggestCourseCustomization('Robotics Engineering - Pd 2')).toMatchObject({
      emoji: '💻',
      abbreviation: 'CSCI',
    });
    expect(suggestCourseCustomization('Underwater Basketweaving - Pd 3')).toMatchObject({
      emoji: '📝',
      abbreviation: 'UNDE',
    });
  });
});

describe('grade scale isolation, letter resolution & NaN-free blending', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isolates saved grade configs per student and resolves letter grades accurately', () => {
    saveGradeConfig({ greenMin: 93, yellowMin: 85, orangeMin: 75, enableBlending: false }, 'student_a');
    expect(getSavedGradeConfig('student_a').greenMin).toBe(93);
    expect(getSavedGradeConfig('student_b')).toEqual(DEFAULT_GRADE_CONFIG);

    const cfg = getSavedGradeConfig('student_a');
    expect(getLetterGrade(93, cfg)).toBe('A');
    expect(getLetterGrade(85, cfg)).toBe('B');
    expect(getLetterGrade(75, cfg)).toBe('C');
    expect(getLetterGrade(66, cfg)).toBe('D');
    expect(getLetterGrade(50, cfg)).toBe('F');
  });

  it('distinguishes real 0% from missing/null scores and prevents NaN when thresholds collapse', () => {
    const nullStyle = getGradeStyle(null, 100);
    expect(nullStyle.hasScore).toBe(false);
    expect(nullStyle.letter).toBe('-');

    const zeroStyle = getGradeStyle(0, 100);
    expect(zeroStyle.hasScore).toBe(true);
    expect(zeroStyle.percentage).toBe(0);
    expect(zeroStyle.letter).toBe('F');

    // Degenerate / equal threshold boundaries must never produce NaN RGB values
    const collapsed = { greenMin: 100, yellowMin: 100, orangeMin: 0, enableBlending: true };
    const at100 = getGradeStyle(100, 100, collapsed);
    const at50 = getGradeStyle(50, 100, collapsed);
    const at0 = getGradeStyle(0, 50, collapsed);
    for (const s of [at100, at50, at0]) {
      expect(String(s.style.backgroundColor)).not.toContain('NaN');
      expect(String(s.style.borderColor)).not.toContain('NaN');
      expect(String(s.style.color)).not.toContain('NaN');
    }
  });
});

describe('canvas credential cache scoping and calendar helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCanvasMemoryCaches();
  });

  it('scopes cached user IDs by (domain, token) while supporting legacy 1-arg default', () => {
    setCachedUserId('1001', 'school.instructure.com', '1000~tokA');
    setCachedUserId('2002', 'school.instructure.com', '2000~tokB');
    setCachedUserId('9999'); // legacy single-arg default

    expect(getCachedUserId('school.instructure.com', '1000~tokA')).toBe('1001');
    expect(getCachedUserId('https://school.instructure.com/', 'Bearer 1000~tokA')).toBe('1001');
    expect(getCachedUserId('school.instructure.com', '2000~tokB')).toBe('2002');
    expect(getCachedUserId()).toBe('9999');

    // Clearing memory cache still reads back from scoped localStorage
    clearCanvasMemoryCaches();
    expect(getCachedUserId('school.instructure.com', '1000~tokA')).toBe('1001');
    expect(getCachedUserId('school.instructure.com', '2000~tokB')).toBe('2002');
  });

  it('extracts course IDs from calendar events and serves demo events in DEMO mode', async () => {
    expect(
      getCourseIdFromEvent({
        id: 1,
        title: 'Lab',
        start_at: '2026-11-12T10:00:00Z',
        end_at: '2026-11-12T11:00:00Z',
        context_code: 'course_456',
      })
    ).toBe(456);
    expect(
      getCourseIdFromEvent({
        id: 2,
        title: 'Personal Advising',
        start_at: '2026-11-12T10:00:00Z',
        end_at: '2026-11-12T11:00:00Z',
        context_code: 'user_self',
      })
    ).toBeNull();

    const events = await fetchCalendarEvents('DEMO', 'DEMO', false, [101, 102]);
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.every(e => e.workflow_state !== 'deleted')).toBe(true);
  });
});
