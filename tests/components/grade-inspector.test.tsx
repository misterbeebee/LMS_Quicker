import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../../components/Dashboard';
import * as canvasService from '../../services/canvas';
import { CourseData } from '../../types';

const englishMismatchCourse: CourseData = {
  course: {
    id: 401,
    name: 'English 10 Honors',
    course_code: 'ENG10',
    is_favorite: true,
    term: { id: 1, name: 'Fall 2026' },
  },
  assignments: [
    {
      id: 4001,
      name: 'Literary Analysis Essay',
      description: 'Analyze theme and motif',
      due_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
      points_possible: 50,
      course_id: 401,
      html_url: 'https://school.instructure.com/courses/401/assignments/4001',
      submission_types: ['online_upload'],
      submission: {
        submitted_at: new Date(Date.now() - 4 * 86400_000).toISOString(),
        grade: '46',
        score: 46,
      },
    },
    {
      id: 4002,
      name: 'Grammar Warmup (Ungraded)',
      description: '',
      due_at: new Date(Date.now() + 2 * 86400_000).toISOString(),
      points_possible: 10,
      course_id: 401,
      html_url: 'https://school.instructure.com/courses/401/assignments/4002',
      submission_types: ['online_quiz'],
    },
  ],
  modules: [],
  enrollment: {
    id: 901,
    course_id: 401,
    type: 'ObserverEnrollment',
    enrollment_state: 'active',
    grades: {
      current_score: 0,
      current_grade: 'F',
      final_score: 92,
      final_grade: 'A-',
      unposted_current_score: 92,
      unposted_current_grade: 'A-',
    },
  },
  gradeSourceMeta: {
    endpoint: '/courses/401/enrollments?user_id=self&include[]=total_scores&include[]=current_grading_period_scores',
    fetchedAt: '2026-11-14T10:00:00Z',
    selectedEnrollmentId: 901,
    enrollmentsCount: 1,
  },
};

const mathNormalCourse: CourseData = {
  course: {
    id: 402,
    name: 'Geometry',
    course_code: 'MATH200',
    is_favorite: true,
    term: { id: 1, name: 'Fall 2026' },
  },
  assignments: [
    {
      id: 4003,
      name: 'Triangle Proofs',
      description: '',
      due_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
      points_possible: 100,
      course_id: 402,
      html_url: 'https://school.instructure.com/courses/402/assignments/4003',
      submission_types: ['online_upload'],
      submission: {
        submitted_at: new Date(Date.now() - 86400_000).toISOString(),
        grade: '95',
        score: 95,
      },
    },
  ],
  modules: [],
  enrollment: {
    id: 902,
    course_id: 402,
    type: 'ObserverEnrollment',
    enrollment_state: 'active',
    grades: {
      current_score: 95,
      current_grade: 'A',
      final_score: 95,
      final_grade: 'A',
    },
  },
};

describe('Course Grade Data Inspector Modal & Entry Points', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens Grade Data Inspector from Overview card, shows Fetched vs Calculated breakdown & anomalies, refreshes live ground truth, and switches to Raw JSON', async () => {
    const user = userEvent.setup();
    const diagSpy = vi
      .spyOn(canvasService, 'fetchCourseGradeDiagnostics')
      .mockResolvedValue({
        courseId: 401,
        fetchedAt: '2026-11-14T12:30:00Z',
        courseRaw: { id: 401, name: 'English 10 Honors', apply_assignment_group_weights: true },
        enrollmentsRaw: [englishMismatchCourse.enrollment!],
        assignmentGroupsRaw: [
          {
            id: 55,
            name: 'Major Essays',
            group_weight: 100,
            assignments: [englishMismatchCourse.assignments[0]],
          },
        ],
        endpoints: [
          '/courses/401?include[]=total_scores',
          '/courses/401/enrollments?user_id=self&include[]=total_scores&include[]=current_grading_period_scores',
          '/courses/401/assignment_groups?include[]=assignments&include[]=submission',
        ],
        errors: [],
      });

    render(
      <Dashboard
        data={[englishMismatchCourse, mathNormalCourse]}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="inspector_student_1"
      />
    );

    // Click Inspect directly on English course card in Overview without switching away
    const englishInspectBtn = await screen.findByTestId('overview-inspect-grade-401');
    await user.click(englishInspectBtn);

    const modal = await screen.findByTestId('course-grade-inspector-modal');
    expect(within(modal).getByText(/Grade Data Inspector: English 10 Honors/i)).toBeInTheDocument();

    // Displayed vs Fetched vs Calculated comparison cards
    const displayedCard = within(modal).getByTestId('inspector-displayed-card');
    expect(displayedCard).toHaveTextContent('0%');
    expect(displayedCard).toHaveTextContent(/Fetched from Canvas Enrollment API/i);

    const fetchedCard = within(modal).getByTestId('inspector-fetched-card');
    expect(fetchedCard).toHaveTextContent('0% (F)');
    expect(fetchedCard).toHaveTextContent('92% (A-)');

    const calculatedCard = within(modal).getByTestId('inspector-calculated-card');
    expect(calculatedCard).toHaveTextContent('92%');
    expect(calculatedCard).toHaveTextContent('46 / 50 pts');

    // Diagnostic mismatch banner explains 0% vs 92%
    const anomalies = within(modal).getByTestId('inspector-anomalies');
    expect(anomalies).toHaveTextContent(/Canvas reports current_score = 0%, but graded assignments sum to 92%/i);
    expect(anomalies).toHaveTextContent(/Other Canvas score fields differ from current_score/i);

    // Filter assignments ledger to Excluded and back to All
    const ledger = within(modal).getByTestId('inspector-assignment-ledger');
    await user.click(within(ledger).getByRole('button', { name: /Excluded \(1\)/i }));
    expect(within(ledger).getByText('Grammar Warmup (Ungraded)')).toBeInTheDocument();
    expect(within(ledger).queryByText('Literary Analysis Essay')).not.toBeInTheDocument();

    await user.click(within(ledger).getByRole('button', { name: /All \(2\)/i }));
    expect(within(ledger).getByText('Literary Analysis Essay')).toBeInTheDocument();

    // Fetch live ground truth populates Assignment Groups weighting table
    await user.click(within(modal).getByRole('button', { name: /Fetch Live Ground Truth/i }));
    await waitFor(() => {
      expect(diagSpy).toHaveBeenCalledWith('school.instructure.com', '1234~live_token', 401, true);
    });
    const groupsSection = await within(modal).findByTestId('inspector-assignment-groups');
    expect(within(groupsSection).getByText('Major Essays')).toBeInTheDocument();
    expect(within(modal).getByText(/Weighted: 92%/i)).toBeInTheDocument();

    // Switch to Raw Canvas Data (JSON) tab
    await user.click(within(modal).getByRole('button', { name: /Raw Canvas Data/i }));
    const rawPanel = await within(modal).findByTestId('inspector-raw-json-panel');
    expect(rawPanel).toHaveTextContent('"current_score": 0');
    expect(rawPanel).toHaveTextContent('"unposted_current_score": 92');

    // Close modal
    await user.click(within(modal).getByRole('button', { name: /Close Grade Data Inspector/i }));
    expect(screen.queryByTestId('course-grade-inspector-modal')).not.toBeInTheDocument();
  });

  it('opens Grade Data Inspector from Sidebar grade badge and Single-Course header Inspect button', async () => {
    const user = userEvent.setup();
    render(
      <Dashboard
        data={[englishMismatchCourse, mathNormalCourse]}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="inspector_student_2"
      />
    );

    // Click grade badge inside Sidebar for English (401)
    const sidebarGradeBadge = await screen.findByTestId('sidebar-inspect-grade-401');
    await user.click(sidebarGradeBadge);

    let modal = await screen.findByTestId('course-grade-inspector-modal');
    expect(within(modal).getByText(/Grade Data Inspector: English 10 Honors/i)).toBeInTheDocument();
    await user.click(within(modal).getByRole('button', { name: /^Close$/i }));
    expect(screen.queryByTestId('course-grade-inspector-modal')).not.toBeInTheDocument();

    // Select single course Geometry (402) and click Course Header Inspect button
    await user.click(screen.getByTitle('Focus ONLY on Geometry'));
    const headerInspectBtn = await screen.findByTestId('course-header-inspect-grade');
    await user.click(headerInspectBtn);

    modal = await screen.findByTestId('course-grade-inspector-modal');
    expect(within(modal).getByText(/Grade Data Inspector: Geometry/i)).toBeInTheDocument();
    expect(within(modal).getByTestId('inspector-displayed-card')).toHaveTextContent('95%');
  });

  it('suppresses false 0% for sparse 0/5 English grade, highlights the single graded assignment with inline JSON, and separates ungraded assignments in Raw JSON', async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const manyUngraded = Array.from({ length: 14 }, (_, idx) => ({
      id: 7100 + idx,
      name: `English Unit Task ${idx + 1}`,
      description: '',
      due_at: new Date(now - (idx + 1) * 86400_000).toISOString(),
      points_possible: 30,
      course_id: 701,
      html_url: `https://school.instructure.com/courses/701/assignments/${7100 + idx}`,
      submission_types: ['on_paper'],
    }));

    const sparseEnglishCourse: CourseData = {
      course: {
        id: 701,
        name: 'English 9',
        course_code: 'ENG9',
        is_favorite: true,
        term: { id: 1, name: 'Fall 2026' },
      },
      assignments: [
        {
          id: 7099,
          name: 'Quarter 1 Reading Log Check',
          description: '',
          due_at: new Date(now - 55 * 86400_000).toISOString(),
          points_possible: 5,
          course_id: 701,
          html_url: 'https://school.instructure.com/courses/701/assignments/7099',
          submission_types: ['on_paper'],
          submission: {
            submitted_at: null,
            graded_at: new Date(now - 50 * 86400_000).toISOString(),
            grade: '0',
            score: 0,
            workflow_state: 'graded',
          },
        },
        ...manyUngraded,
      ],
      modules: [],
      enrollment: {
        id: 7701,
        course_id: 701,
        type: 'ObserverEnrollment',
        enrollment_state: 'active',
        grades: { current_score: 0, current_grade: 'F', final_score: 0, final_grade: 'F' },
      },
    };

    render(
      <Dashboard
        data={[sparseEnglishCourse]}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="sparse_zero_student"
      />
    );

    // Sidebar hides unreliable 0% badge and Overview suppresses false 0%
    expect(screen.queryByTestId('sidebar-inspect-grade-701')).not.toBeInTheDocument();

    const inspectBtn = await screen.findByTestId('overview-inspect-grade-701');
    await user.click(inspectBtn);

    const modal = await screen.findByTestId('course-grade-inspector-modal');
    expect(within(modal).getByTestId('inspector-displayed-card')).toHaveTextContent('Suppressed (No Data)');
    expect(within(modal).getByTestId('inspector-displayed-card')).toHaveTextContent('0% Filtered');

    // Coverage strip flags Low Fraction and No Recent Grades
    const coverageStrip = within(modal).getByTestId('inspector-coverage-strip');
    expect(coverageStrip).toHaveTextContent('1 / 15');
    expect(coverageStrip).toHaveTextContent('Low Fraction');
    expect(coverageStrip).toHaveTextContent('No Recent Grades');

    // Highlighted graded work spotlight shows full detail for ONLY that 1 graded assignment
    const spotlight = within(modal).getByTestId('inspector-graded-work-spotlight');
    expect(spotlight).toHaveTextContent('Graded Work Contributing to Score (1)');
    expect(spotlight).toHaveTextContent('Quarter 1 Reading Log Check');
    expect(spotlight).toHaveTextContent('0 / 5 pts (0%)');
    expect(spotlight).toHaveTextContent('100% of graded pts');

    // Toggle inline single-assignment JSON right inside Graded Work spotlight
    await user.click(within(spotlight).getByTestId('inspect-graded-item-json-7099'));
    const singleJsonBox = within(spotlight).getByTestId('graded-item-json-box-7099');
    expect(singleJsonBox).toHaveTextContent('"Quarter 1 Reading Log Check"');
    expect(singleJsonBox).not.toHaveTextContent('English Unit Task 1');

    // Raw Canvas Data tab isolates Graded Assignments Only (1) and collapses Ungraded (14)
    await user.click(within(modal).getByRole('button', { name: /Raw Canvas Data/i }));
    const gradedJsonOnly = within(modal).getByTestId('raw-graded-assignments-json');
    expect(gradedJsonOnly).toHaveTextContent('Quarter 1 Reading Log Check');
    expect(gradedJsonOnly).not.toHaveTextContent('English Unit Task 1');
    expect(within(modal).getByText(/Ungraded \/ Excluded Assignments \(14\)/i)).toBeInTheDocument();
  });
});
