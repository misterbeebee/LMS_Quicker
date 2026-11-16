import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssignmentsTable } from '../../components/dashboard/AssignmentsTable';
import { AssignmentsBoard } from '../../components/dashboard/AssignmentsBoard';
import { Dashboard } from '../../components/Dashboard';
import * as canvasService from '../../services/canvas';
import { saveStudent } from '../../services/students';
import { parseSynergyGradebook, saveStudentVueGrades } from '../../services/studentvueGrades';
import {
  buildRecentGradesTimeline,
  parseFlexibleLocalDateMs,
} from '../../utils/recentGradesTimeline';
import { ALL_COURSES_ID, CanvasAssignment, CourseData } from '../../types';

// Fixed reference "now" in local time: Thursday Nov 12, 2026 12:00 PM
const NOW_MS = new Date(2026, 10, 12, 12, 0, 0, 0).getTime();

const sampleRawSynergy = {
  Gradebook: {
    '@Type': 'Traditional',
    ReportingPeriod: { '@Index': '1', '@GradePeriod': 'MP2', '@GU': 'GP-2' },
    ReportingPeriods: {
      ReportPeriod: [{ '@Index': '1', '@GradePeriod': 'MP2', '@GU': 'GP-2' }],
    },
    Courses: {
      Course: [
        {
          '@Title': 'Honors Chemistry (SCI2001)',
          '@CourseID': 'SCI2001',
          '@Period': '1',
          '@Staff': 'Curie, Marie',
          Marks: {
            Mark: {
              '@MarkName': 'MP2',
              '@CalculatedScoreString': 'A',
              '@CalculatedScoreRaw': '94.6',
              GradeCalculationSummary: { AssignmentGradeCalc: [] },
              Assignments: {
                Assignment: [
                  {
                    '@GradebookID': 'SYN-1',
                    '@Measure': 'Stoichiometry Quiz (Synergy)',
                    '@Type': 'All Tasks / Assessments',
                    '@Date': '11/09/2026', // Monday Nov 9
                    '@DueDate': '11/06/2026',
                    '@Score': '48 / 50',
                    '@Points': '48 / 50',
                    '@Notes': 'Great work',
                  },
                  {
                    '@GradebookID': 'SYN-2',
                    '@Measure': 'Safety Pre-Check',
                    '@Type': 'Practice / Preparation',
                    '@Date': '10/01/2026', // >30 days earlier
                    '@Score': 'Not Graded',
                  },
                ],
              },
            },
          },
        },
        {
          '@Title': 'AP Calculus AB (MAT4010)',
          '@CourseID': 'MAT4010',
          '@Period': '3',
          '@Staff': 'Euler, Leonhard',
          Marks: {
            Mark: {
              '@MarkName': 'MP2',
              '@CalculatedScoreString': 'B',
              '@CalculatedScoreRaw': '86.4',
              Assignments: {
                Assignment: [
                  {
                    '@GradebookID': 'SYN-3',
                    '@Measure': 'Derivatives Checkpoint',
                    '@Type': 'Assessments',
                    '@Date': '11/11/2026', // Wednesday Nov 11
                    '@Score': '18 / 20',
                    '@Points': '18 / 20',
                  },
                ],
              },
            },
          },
        },
      ],
    },
  },
};

const chemAssignments: CanvasAssignment[] = [
  {
    id: 7001,
    name: 'Canvas Stoichiometry Assessment',
    description: '',
    due_at: new Date(2026, 10, 6, 23, 59, 0, 0).toISOString(), // Friday Nov 6
    points_possible: 50,
    course_id: 501,
    html_url: 'https://school.instructure.com/courses/501/assignments/7001',
    submission_types: ['online_quiz'],
    submission: {
      submitted_at: new Date(2026, 10, 6, 15, 0, 0, 0).toISOString(),
      graded_at: new Date(2026, 10, 9, 10, 0, 0, 0).toISOString(), // Monday Nov 9
      grade: '47',
      score: 47,
    },
  },
  {
    id: 7002,
    name: 'Canvas Lab Reflection (Ungraded)',
    description: '',
    due_at: new Date(2026, 10, 10, 23, 59, 0, 0).toISOString(), // Tuesday Nov 10
    points_possible: 10,
    course_id: 501,
    html_url: 'https://school.instructure.com/courses/501/assignments/7002',
    submission_types: ['online_upload'],
    submission: {
      submitted_at: new Date(2026, 10, 10, 14, 0, 0, 0).toISOString(),
      graded_at: null,
      grade: null,
      score: null,
    },
  },
];

const calcAssignments: CanvasAssignment[] = [
  {
    id: 7003,
    name: 'Canvas Chain Rule Practice',
    description: '',
    due_at: new Date(2026, 10, 11, 23, 59, 0, 0).toISOString(), // Wednesday Nov 11
    points_possible: 20,
    course_id: 502,
    html_url: 'https://school.instructure.com/courses/502/assignments/7003',
    submission_types: ['online_upload'],
    submission: {
      submitted_at: new Date(2026, 10, 11, 16, 0, 0, 0).toISOString(),
      graded_at: new Date(2026, 10, 11, 19, 0, 0, 0).toISOString(),
      grade: '19',
      score: 19,
    },
  },
];

const chemCourse: CourseData = {
  course: {
    id: 501,
    name: 'Honors Chemistry A',
    course_code: 'SCI2001-01',
    is_favorite: true,
    term: { id: 1, name: 'Fall 2026' },
  },
  assignments: chemAssignments,
  modules: [],
  enrollment: {
    id: 901,
    course_id: 501,
    type: 'ObserverEnrollment',
    enrollment_state: 'active',
    grades: { current_score: null, current_grade: null, final_score: null, final_grade: null },
  },
};

const calcCourse: CourseData = {
  course: {
    id: 502,
    name: 'AP Calculus AB',
    course_code: 'MAT4010-01',
    is_favorite: true,
    term: { id: 1, name: 'Fall 2026' },
  },
  assignments: calcAssignments,
  modules: [],
  enrollment: {
    id: 902,
    course_id: 502,
    type: 'ObserverEnrollment',
    enrollment_state: 'active',
    grades: { current_score: null, current_grade: null, final_score: null, final_grade: null },
  },
};

describe('Side-by-Side Date-Aligned Recent Grades Timeline', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aligns Canvas due dates with configurable late-pad bias and Synergy item dates without UTC day shift', () => {
    // Date-only strings stay on the exact calendar day in local time
    const nov6 = parseFlexibleLocalDateMs('11/06/2026');
    const isoNov6 = parseFlexibleLocalDateMs('2026-11-06');
    expect(new Date(nov6!).getDate()).toBe(6);
    expect(new Date(isoNov6!).getDate()).toBe(6);

    const snapshot = parseSynergyGradebook(sampleRawSynergy, {
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
    });

    // +0d exact due keeps Friday Nov 6 in its own Day band separate from Monday Nov 9 Synergy entry
    const exactDayTimeline = buildRecentGradesTimeline({
      assignments: chemAssignments,
      selectedCourseId: 501,
      synergySnapshot: snapshot,
      synergyCourseMap: new Map([[501, { course: snapshot.courses[0], matchReason: 'Course ID', isManual: false, confidence: 'high' }]]),
      granularity: 'day',
      canvasAlignment: 'due_padded',
      canvasPadDays: 0,
      windowDays: 30,
      nowMs: NOW_MS,
    });

    const bandNov6Exact = exactDayTimeline.bands.find((b) => b.key === 'day:2026-11-06');
    const bandNov9Exact = exactDayTimeline.bands.find((b) => b.key === 'day:2026-11-09');
    expect(bandNov6Exact?.canvasItems.map((i) => i.id)).toEqual([7001]);
    expect(bandNov6Exact?.synergyItems).toHaveLength(0);
    expect(bandNov9Exact?.synergyItems.map((i) => i.item.title)).toEqual(['Stoichiometry Quiz (Synergy)']);
    expect(bandNov9Exact?.canvasItems).toHaveLength(0);

    // +3d late bias shifts Friday Nov 6 Canvas due date directly onto Monday Nov 9 alongside Synergy!
    const paddedDayTimeline = buildRecentGradesTimeline({
      assignments: chemAssignments,
      selectedCourseId: 501,
      synergySnapshot: snapshot,
      synergyCourseMap: new Map([[501, { course: snapshot.courses[0], matchReason: 'Course ID', isManual: false, confidence: 'high' }]]),
      granularity: 'day',
      canvasAlignment: 'due_padded',
      canvasPadDays: 3,
      windowDays: 30,
      nowMs: NOW_MS,
    });

    const bandNov9Padded = paddedDayTimeline.bands.find((b) => b.key === 'day:2026-11-09');
    expect(bandNov9Padded?.canvasItems.map((i) => i.id)).toEqual([7001]);
    expect(bandNov9Padded?.synergyItems.map((i) => i.item.title)).toEqual([
      'Stoichiometry Quiz (Synergy)',
    ]);

    // 30d window hides the Oct 1 item; All + gradedOnly includes/excludes cleanly
    expect(paddedDayTimeline.hiddenByWindowSynergyCount).toBe(1);
    const allTimeline = buildRecentGradesTimeline({
      assignments: chemAssignments,
      selectedCourseId: 501,
      synergySnapshot: snapshot,
      synergyCourseMap: new Map([[501, { course: snapshot.courses[0], matchReason: 'Course ID', isManual: false, confidence: 'high' }]]),
      granularity: 'week',
      canvasAlignment: 'due_padded',
      canvasPadDays: 2,
      windowDays: 'all',
      gradedOnly: true,
      nowMs: NOW_MS,
    });
    expect(allTimeline.shownCanvasCount).toBe(1); // ungraded 7002 filtered out
    expect(allTimeline.shownSynergyCount).toBe(1); // ungraded SYN-2 filtered out
  });

  it('toggles Completed & Graded in AssignmentsTable between Current View and Side-by-Side Synergy Timeline without disrupting existing UI', async () => {
    const user = userEvent.setup();
    const snapshot = parseSynergyGradebook(sampleRawSynergy, {
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
    });

    render(
      <AssignmentsTable
        assignments={[...chemAssignments, ...calcAssignments]}
        courses={[chemCourse, calcCourse]}
        selectedCourseId={ALL_COURSES_ID}
        showIds={false}
        showCourseColumn={true}
        getCourseName={(id) => (id === 501 ? 'Honors Chemistry A' : 'AP Calculus AB')}
        archivedAssignmentIds={new Set()}
        onToggleArchived={vi.fn()}
        sortConfig={null}
        onSortChange={vi.fn()}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        filterModes={{}}
        onFilterModeChange={vi.fn()}
        synergySnapshot={snapshot}
        synergyCourseMap={
          new Map([
            [501, { course: snapshot.courses[0], matchReason: 'Course ID', isManual: false, confidence: 'high' }],
            [502, { course: snapshot.courses[1], matchReason: 'Course ID', isManual: false, confidence: 'high' }],
          ])
        }
      />
    );

    // Default tab is Upcoming & Active — toggle button is hidden to avoid cluttering upcoming work
    expect(screen.queryByTestId('toggle-grade-review-timeline')).not.toBeInTheDocument();

    // Switch to Completed & Graded: existing table still renders by default ("Current View")
    await user.click(screen.getByRole('button', { name: /Completed & Graded/i }));
    expect(screen.getByTestId('toggle-grade-review-current')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-grade-review-timeline')).toBeInTheDocument();
    expect(screen.queryByTestId('recent-grades-timeline')).not.toBeInTheDocument();
    expect(screen.getAllByText('Canvas Stoichiometry Assessment').length).toBeGreaterThan(0);

    // Convert to Side-by-Side (Synergy) Timeline view
    await user.click(screen.getByTestId('toggle-grade-review-timeline'));
    const timeline = screen.getByTestId('recent-grades-timeline');
    expect(timeline).toBeInTheDocument();
    expect(within(timeline).getByText('Canvas Stoichiometry Assessment')).toBeInTheDocument();
    expect(within(timeline).getByText('Stoichiometry Quiz (Synergy)')).toBeInTheDocument();
    expect(within(timeline).getByText('Derivatives Checkpoint')).toBeInTheDocument();

    // Switch window to All to inspect all bands, then toggle Day grouping + +3d late bias
    await user.click(screen.getByTestId('timeline-window-all'));
    expect(within(timeline).getByText('Safety Pre-Check')).toBeInTheDocument();

    await user.click(screen.getByTestId('timeline-group-day'));
    await user.selectOptions(screen.getByTestId('timeline-pad-days-select'), '3');
    const nov9Band = screen.getByTestId('timeline-band-day:2026-11-09');
    expect(within(nov9Band).getByText('Canvas Stoichiometry Assessment')).toBeInTheDocument();
    expect(within(nov9Band).getByText('Stoichiometry Quiz (Synergy)')).toBeInTheDocument();

    // Filter to AP Calculus only and check both columns filter together
    await user.selectOptions(screen.getByTestId('timeline-course-filter'), 'canvas:502');
    expect(within(timeline).getByText('Canvas Chain Rule Practice')).toBeInTheDocument();
    expect(within(timeline).getByText('Derivatives Checkpoint')).toBeInTheDocument();
    expect(within(timeline).queryByText('Stoichiometry Quiz (Synergy)')).not.toBeInTheDocument();

    // Toggle back to Current View restores standard table
    await user.click(screen.getByTestId('toggle-grade-review-current'));
    expect(screen.queryByTestId('recent-grades-timeline')).not.toBeInTheDocument();
    expect(screen.getAllByText('Canvas Stoichiometry Assessment').length).toBeGreaterThan(0);
  });

  it('also supports Side-by-Side (Synergy) Timeline from AssignmentsBoard and full Dashboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);

    const profile = saveStudent({
      name: 'Sam Doe',
      domain: 'mcpsmd.instructure.com',
      apiKey: 'tok-123',
      color: 'blue',
    });
    const snapshot = parseSynergyGradebook(sampleRawSynergy, {
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
      studentName: 'Doe, Sam',
      permId: '222002',
    });
    saveStudentVueGrades(profile.id, snapshot);

    // 1. Standalone Board supports toggling into Side-by-Side Timeline
    const { unmount } = render(
      <AssignmentsBoard
        assignments={chemAssignments}
        courses={[chemCourse]}
        selectedCourseId={501}
        getCourseName={() => 'Honors Chemistry A'}
        synergySnapshot={snapshot}
        synergyCourseMap={
          new Map([[501, { course: snapshot.courses[0], matchReason: 'Course ID', isManual: false, confidence: 'high' }]])
        }
      />
    );

    await user.click(screen.getByRole('button', { name: /Completed & Graded/i }));
    await user.click(screen.getByTestId('toggle-grade-review-timeline'));
    expect(screen.getByTestId('recent-grades-timeline')).toBeInTheDocument();
    expect(screen.getByText('Stoichiometry Quiz (Synergy)')).toBeInTheDocument();
    unmount();

    // 2. Full Dashboard threads Synergy snapshot into Assignments -> Completed & Graded -> Side-by-Side
    render(
      <Dashboard
        data={[chemCourse, calcCourse]}
        apiKey="tok-123"
        canvasUrl="mcpsmd.instructure.com"
        useProxy={false}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId={profile.id}
        currentStudentName={profile.name}
      />
    );

    await screen.findByTestId('sidebar-inspect-grade-501');
    await user.click(screen.getByRole('button', { name: /^Assignments$/i }));
    await user.click(screen.getByRole('button', { name: /Completed & Graded/i }));
    await user.click(screen.getByTestId('toggle-grade-review-timeline'));

    const dashTimeline = screen.getByTestId('recent-grades-timeline');
    expect(within(dashTimeline).getByText('Stoichiometry Quiz (Synergy)')).toBeInTheDocument();
    expect(within(dashTimeline).getByText('Derivatives Checkpoint')).toBeInTheDocument();
  });
});
