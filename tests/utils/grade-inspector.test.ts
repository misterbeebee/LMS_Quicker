import { describe, it, expect } from 'vitest';
import {
  selectPrimaryEnrollment,
  computeUnweightedCourseAverage,
  getEffectiveCourseGrade,
  inspectCourseGrade,
} from '../../utils/gradeInspector';
import { CourseData, CanvasEnrollment } from '../../types';

describe('gradeInspector ground-truth resolution & audit', () => {
  it('selectPrimaryEnrollment prefers active enrollment with numeric score over inactive/concluded rows', () => {
    const enrollments: CanvasEnrollment[] = [
      {
        id: 11,
        course_id: 201,
        type: 'StudentEnrollment',
        enrollment_state: 'inactive',
        grades: { current_score: 0, current_grade: 'F', final_score: 0, final_grade: 'F' },
      },
      {
        id: 12,
        course_id: 201,
        type: 'StudentEnrollment',
        enrollment_state: 'active',
        grades: { current_score: 91.5, current_grade: 'A-', final_score: 91.5, final_grade: 'A-' },
      },
    ];

    const picked = selectPrimaryEnrollment(enrollments, 201);
    expect(picked?.id).toBe(12);
    expect(picked?.grades.current_score).toBe(91.5);
  });

  it('excludes excused, omitted, ungraded, and calendar items from unweighted calculation', () => {
    const avg = computeUnweightedCourseAverage([
      {
        id: 1,
        name: 'Essay 1',
        description: '',
        due_at: null,
        points_possible: 50,
        course_id: 201,
        html_url: '#',
        submission_types: ['online_upload'],
        submission: { submitted_at: '2026-10-01T10:00:00Z', grade: '45', score: 45 },
      },
      {
        id: 2,
        name: 'Excused Quiz',
        description: '',
        due_at: null,
        points_possible: 50,
        course_id: 201,
        html_url: '#',
        submission_types: ['online_quiz'],
        submission: { submitted_at: null, grade: 'EX', score: 0, excused: true },
      },
      {
        id: 3,
        name: 'Omitted Practice',
        description: '',
        due_at: null,
        points_possible: 100,
        course_id: 201,
        html_url: '#',
        submission_types: ['none'],
        omit_from_final_grade: true,
        submission: { submitted_at: null, grade: '0', score: 0 },
      },
      {
        id: -4,
        name: 'Class Seminar',
        description: '',
        due_at: null,
        points_possible: 0,
        course_id: 201,
        html_url: '#',
        submission_types: ['calendar_event'],
        is_calendar_event: true,
      },
    ]);

    expect(avg).not.toBeNull();
    expect(avg?.earnedPoints).toBe(45);
    expect(avg?.possiblePoints).toBe(50);
    expect(avg?.score).toBe(90);
    expect(avg?.gradedCount).toBe(1);
    expect(avg?.zeroScoreCount).toBe(0);
  });

  it('suppresses Canvas 0% placeholder when gradedCount === 0 and reports suppression in inspectCourseGrade', () => {
    const courseData: CourseData = {
      course: {
        id: 301,
        name: 'English 11 Honors',
        course_code: 'ENG301',
        is_favorite: true,
      },
      assignments: [
        {
          id: 10,
          name: 'Upcoming Essay',
          description: '',
          due_at: null,
          points_possible: 100,
          course_id: 301,
          html_url: 'https://school.instructure.com/courses/301/assignments/10',
          submission_types: ['online_upload'],
        },
      ],
      modules: [],
      enrollment: {
        id: 99,
        course_id: 301,
        type: 'ObserverEnrollment',
        enrollment_state: 'active',
        grades: { current_score: 0, current_grade: 'F', final_score: 0, final_grade: 'F' },
      },
    };

    expect(getEffectiveCourseGrade(courseData)).toBeNull();

    const report = inspectCourseGrade(courseData);
    expect(report.displayed.source).toBe('suppressed_zero_ungraded');
    expect(report.displayed.score).toBeNull();
    expect(report.fetched.currentScore).toBe(0);
    expect(report.calculated.percentage).toBeNull();
    expect(report.anomalies.some((a) => a.title.includes('0% with 0 graded assignments'))).toBe(true);
  });

  it('flags mismatch when Canvas enrollment reports 0% despite positive graded assignments and calculates weighted groups', () => {
    const courseData: CourseData = {
      course: {
        id: 302,
        name: 'English 10',
        course_code: 'ENG201',
        is_favorite: true,
      },
      assignments: [
        {
          id: 21,
          name: 'Rhetorical Analysis',
          description: '',
          due_at: null,
          points_possible: 50,
          course_id: 302,
          assignment_group_id: 1,
          html_url: 'https://school.instructure.com/courses/302/assignments/21',
          submission_types: ['online_upload'],
          submission: { submitted_at: '2026-10-12T12:00:00Z', grade: '46', score: 46 },
        },
        {
          id: 22,
          name: 'Reading Check',
          description: '',
          due_at: null,
          points_possible: 20,
          course_id: 302,
          assignment_group_id: 2,
          html_url: 'https://school.instructure.com/courses/302/assignments/22',
          submission_types: ['online_quiz'],
          submission: { submitted_at: null, grade: '0', score: 0, missing: true },
        },
      ],
      modules: [],
      enrollment: {
        id: 77,
        course_id: 302,
        type: 'StudentEnrollment',
        enrollment_state: 'active',
        grades: {
          current_score: 0,
          current_grade: 'F',
          final_score: 65.7,
          final_grade: 'D',
          unposted_current_score: 73.6,
          current_period_computed_current_score: 0,
        },
      },
    };

    const report = inspectCourseGrade(courseData, {
      courseId: 302,
      fetchedAt: '2026-11-14T12:00:00Z',
      courseRaw: { id: 302, apply_assignment_group_weights: true },
      enrollmentsRaw: [courseData.enrollment!],
      assignmentGroupsRaw: [
        { id: 1, name: 'Essays', group_weight: 80 },
        { id: 2, name: 'Daily Checks', group_weight: 20 },
      ],
      endpoints: ['/courses/302', '/courses/302/enrollments', '/courses/302/assignment_groups'],
      errors: [],
    });

    expect(report.displayed.source).toBe('canvas_enrollment');
    expect(report.displayed.score).toBe(0);
    expect(report.calculated.earnedPoints).toBe(46);
    expect(report.calculated.possiblePoints).toBe(70);
    expect(report.calculated.percentage).toBe(65.7);
    expect(report.calculated.zeroScoreCount).toBe(1);
    expect(report.calculated.applyAssignmentGroupWeights).toBe(true);
    // Weighted: Essays = 92% * 0.8 = 73.6; Daily Checks = 0% * 0.2 = 0 -> 73.6%
    expect(report.calculated.weightedPercentage).toBe(73.6);
    expect(report.anomalies.some((a) => a.title.includes('current_score = 0%'))).toBe(true);
    expect(report.anomalies.some((a) => a.title.includes('1 graded assignment has score = 0'))).toBe(true);
    expect(report.anomalies.some((a) => a.title.includes('Other Canvas score fields differ'))).toBe(true);
  });

  it('suppresses 0% when only a low fraction of work is graded or no recent work is graded (e.g. 0/5 pts out of 12 items) and isolates graded JSON', () => {
    const now = Date.now();
    const ungradedItems = Array.from({ length: 11 }, (_, idx) => ({
      id: 500 + idx,
      name: `Essay & Reading ${idx + 1}`,
      description: '',
      due_at: new Date(now - (idx + 2) * 86400_000).toISOString(),
      points_possible: 40,
      course_id: 303,
      html_url: `https://school.instructure.com/courses/303/assignments/${500 + idx}`,
      submission_types: ['on_paper'],
    }));

    const courseData: CourseData = {
      course: {
        id: 303,
        name: 'English 11',
        course_code: 'ENG11',
        is_favorite: true,
      },
      assignments: [
        {
          id: 499,
          name: 'Syllabus Sign-Off',
          description: '',
          due_at: new Date(now - 60 * 86400_000).toISOString(),
          points_possible: 5,
          course_id: 303,
          html_url: 'https://school.instructure.com/courses/303/assignments/499',
          submission_types: ['on_paper'],
          submission: {
            submitted_at: null,
            graded_at: new Date(now - 55 * 86400_000).toISOString(),
            grade: '0',
            score: 0,
          },
        },
        ...ungradedItems,
      ],
      modules: [],
      enrollment: {
        id: 888,
        course_id: 303,
        type: 'ObserverEnrollment',
        enrollment_state: 'active',
        grades: { current_score: 0, current_grade: 'F', final_score: 0, final_grade: 'F' },
      },
    };

    // Dashboard grade resolution suppresses misleading 0%
    expect(getEffectiveCourseGrade(courseData, now)).toBeNull();

    const report = inspectCourseGrade(courseData, null, now);
    expect(report.displayed.source).toBe('suppressed_zero_unreliable');
    expect(report.displayed.score).toBeNull();
    expect(report.coverage.gradedAssignmentsCount).toBe(1);
    expect(report.coverage.gradableAssignmentsCount).toBe(12);
    expect(report.coverage.isLowGradedFraction).toBe(true);
    expect(report.coverage.hasNoRecentGradedWork).toBe(true);
    expect(report.coverage.isPerfectZeroCourse).toBe(true);
    expect(report.gradedAssignments).toHaveLength(1);
    expect(report.gradedAssignments[0].pointsSharePercent).toBe(100);
    expect(report.rawPayloads.gradedAssignments).toHaveLength(1);
    expect(report.rawPayloads.gradedAssignments[0].id).toBe(499);
    expect(report.rawPayloads.ungradedOrExcludedAssignments).toHaveLength(11);
    expect(report.anomalies.some((a) => a.title.includes('Low fraction of coursework is graded'))).toBe(true);
    expect(report.anomalies.some((a) => a.title.includes('No recent work graded'))).toBe(true);
    expect(report.anomalies.some((a) => a.title.includes('Perfect 0% course grade suppressed'))).toBe(true);
  });
});
