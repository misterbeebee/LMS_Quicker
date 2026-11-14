import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from '../../components/Login';
import { StudentSwitcher } from '../../components/dashboard/StudentSwitcher';
import { GradeThresholdModal } from '../../components/dashboard/GradeThresholdModal';
import { Dashboard } from '../../components/Dashboard';
import { AssignmentsBoard } from '../../components/dashboard/AssignmentsBoard';
import { AssignmentsTable } from '../../components/dashboard/AssignmentsTable';
import { Overview } from '../../components/dashboard/Overview';
import { CalendarEventsPanel } from '../../components/dashboard/CalendarEventsPanel';
import App from '../../App';
import { saveStudent } from '../../services/students';
import { DEFAULT_GRADE_CONFIG, getSavedGradeConfig } from '../../services/gradeScale';
import { CourseData, CanvasTodoItem, CanvasAnnouncement, CanvasCalendarEvent } from '../../types';
import * as canvasService from '../../services/canvas';

const sampleCourses: CourseData[] = [
  {
    course: {
      id: 101,
      name: 'AP Biology - Pd 2',
      course_code: 'BIO101',
      is_favorite: true,
      term: { id: 1, name: 'Fall 2026' },
    },
    assignments: [
      {
        id: 1,
        name: 'Cell Lab',
        description: 'Complete lab',
        due_at: new Date(Date.now() + 86400_000).toISOString(),
        points_possible: 50,
        course_id: 101,
        html_url: 'https://school.instructure.com/courses/101/assignments/1',
        locked_for_user: false,
        submission_types: ['online_upload'],
      },
    ],
    modules: [],
    enrollment: {
      id: 1,
      course_id: 101,
      type: 'StudentEnrollment',
      grades: { current_score: 88, current_grade: 'B+', final_score: 88, final_grade: 'B+' },
    },
  },
  {
    course: {
      id: 102,
      name: 'Calculus II',
      course_code: 'MATH201',
      is_favorite: true,
      term: { id: 1, name: 'Fall 2026' },
    },
    assignments: [],
    modules: [],
    enrollment: {
      id: 2,
      course_id: 102,
      type: 'StudentEnrollment',
      grades: { current_score: 94, current_grade: 'A', final_score: 94, final_grade: 'A' },
    },
  },
];

describe('Login component workflows', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('switches between Saved Profiles and New Connection tabs and honors staySignedIn toggle', async () => {
    const user = userEvent.setup();
    saveStudent({
      name: 'Maya',
      domain: 'mcpsmd.instructure.com',
      apiKey: '1234~maya_tok',
      useProxy: true,
      batchSize: 2,
    });

    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} onDebug={vi.fn()} loading={false} error={null} />);

    expect(screen.getByText('Maya')).toBeInTheDocument();

    const staySignedInCheckbox = screen.getByLabelText(/Auto-login next visit/i);
    await user.click(staySignedInCheckbox);

    await user.click(screen.getByText('Maya'));
    expect(onLogin).toHaveBeenCalledWith(
      'mcpsmd.instructure.com',
      '1234~maya_tok',
      false,
      true,
      2,
      expect.any(String),
      true
    );

    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByPlaceholderText('Paste Canvas access token...')).toBeInTheDocument();
  });

  it('renders UNLOCK mode with Other Accounts button and inline account removal confirmation', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'canvas_credentials_v1',
      JSON.stringify({
        domain: 'mcpsmd.instructure.com',
        useProxy: true,
        batchSize: 2,
        security: { cipherText: 'abc', salt: 'def', iv: 'ghi' },
      })
    );

    render(<Login onLogin={vi.fn()} onDebug={vi.fn()} loading={false} error={null} />);

    expect(await screen.findByText('Unlock & Login')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Other Accounts/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Remove Account/i }));
    expect(screen.getByRole('button', { name: 'Confirm Remove' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm Remove' }));

    expect(localStorage.getItem('canvas_credentials_v1')).toBeNull();
    expect(screen.getByRole('button', { name: /Connect to Canvas/i })).toBeInTheDocument();
  });
});

describe('StudentSwitcher workflows', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('supports inline renaming, switching, inline row deletion confirmation, and credential editing', async () => {
    const user = userEvent.setup();
    const s1 = saveStudent({ name: 'Alice', domain: 'school.instructure.com', apiKey: '1000~a' });
    const s2 = saveStudent({ name: 'Bob', domain: 'school.instructure.com', apiKey: '2000~b' });

    const onSwitchStudent = vi.fn();
    const onRenameStudent = vi.fn();

    render(
      <StudentSwitcher
        currentStudentId={s1.id}
        currentStudentName="Alice"
        currentDomain="school.instructure.com"
        onSwitchStudent={onSwitchStudent}
        onRenameStudent={onRenameStudent}
      />
    );

    // Inline rename
    await user.click(screen.getByTitle('Rename student'));
    const renameInput = screen.getByPlaceholderText('Student name');
    await user.clear(renameInput);
    await user.type(renameInput, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onRenameStudent).toHaveBeenCalledWith('Alicia');

    // Open dropdown, trigger inline delete confirmation on inactive student Bob
    await user.click(screen.getByTitle(/Current Student:/i));
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await user.click(screen.getByTitle('Edit token & settings for Bob'));
    expect(screen.getByText('Edit Student Credentials')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByTitle(/Current Student:/i));
    await user.click(screen.getByTitle('Remove student profile'));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(s2.id).toBeTruthy();
  });
});

describe('GradeThresholdModal single-line three-thumb slider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders 3 sliders on one track, adjusts via keyboard with clamping, resets defaults, and saves per student', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <GradeThresholdModal
        isOpen={true}
        onClose={onClose}
        config={{ greenMin: 90, yellowMin: 80, orangeMin: 70, enableBlending: true }}
        onSave={onSave}
        studentId="stu_1"
      />
    );

    expect(screen.getByTestId('single-line-three-slider')).toBeInTheDocument();
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(3);

    const [orangeSlider, yellowSlider, greenSlider] = sliders;
    fireEvent.keyDown(greenSlider, { key: 'ArrowRight' });
    expect(greenSlider).toHaveAttribute('aria-valuenow', '91');

    fireEvent.keyDown(orangeSlider, { key: 'ArrowLeft' });
    expect(orangeSlider).toHaveAttribute('aria-valuenow', '69');
    expect(yellowSlider).toHaveAttribute('aria-valuenow', '80');

    await user.click(screen.getByRole('button', { name: /Apply & Save/i }));
    expect(onSave).toHaveBeenCalledWith({
      greenMin: 91,
      yellowMin: 80,
      orangeMin: 69,
      enableBlending: true,
    });
    expect(getSavedGradeConfig('stu_1').greenMin).toBe(91);
    expect(onClose).toHaveBeenCalled();

    // Verify reset defaults button on custom config
    rerender(
      <GradeThresholdModal
        isOpen={true}
        onClose={vi.fn()}
        config={{ greenMin: 95, yellowMin: 85, orangeMin: 75, enableBlending: false }}
        onSave={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /Defaults/i }));
    expect(screen.getAllByRole('slider')[2]).toHaveAttribute('aria-valuenow', String(DEFAULT_GRADE_CONFIG.greenMin));
  });
});

describe('Dashboard & App isolation, Demo mode & switch failure modal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders Demo Dashboard without remote /saves requests, isolates courses via Only/All/None, and passes gradeConfig to course Grade badge', async () => {
    const user = userEvent.setup();
    const listSavesSpy = vi.spyOn(canvasService, 'listSaveStates');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(
      <Dashboard
        data={sampleCourses}
        apiKey=""
        canvasUrl="DEMO"
        useProxy={false}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="demo_student"
      />
    );

    expect(screen.getByRole('heading', { name: 'All Courses' })).toBeInTheDocument();
    expect(listSavesSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Only isolates single course and shows Grade badge using student's gradeConfig
    const onlyButtons = screen.getAllByRole('button', { name: 'Only' });
    await user.click(onlyButtons[0]);
    const gradeBadge = screen.getByTitle(/Course grade standing/i);
    expect(gradeBadge).toHaveTextContent('B+');

    // None hides all multi-class courses; All restores all
    const noneBtn = screen.getByTitle('Hide all classes in multi-class view');
    await user.click(noneBtn);
    expect(screen.getByText(/No courses currently selected in Multi-Class view/i)).toBeInTheDocument();

    const allBtn = screen.getByTitle('Show all classes in multi-class view');
    await user.click(allBtn);
    expect(allBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows blocking dialog on failed student switch while preserving previous student profile', async () => {
    const user = userEvent.setup();
    const alice = saveStudent({ name: 'Alice', domain: 'DEMO', apiKey: 'DEMO' });
    const bob = saveStudent({ name: 'Bob', domain: 'bad.instructure.com', apiKey: '9999~expired' });
    // Keep Alice active first
    localStorage.setItem('canvas_active_student_id_v2', alice.id);

    vi.spyOn(canvasService, 'fetchMockData').mockResolvedValue(sampleCourses);
    vi.spyOn(canvasService, 'fetchCanvasData').mockRejectedValue(new Error('401 Unauthorized'));

    render(<App />);

    // Sign in as Alice via Saved tab
    await user.click(screen.getByText('Alice'));
    expect(await screen.findByRole('heading', { name: 'All Courses' })).toBeInTheDocument();

    // Switch to Bob -> fails -> blocking modal appears and Alice stays active
    await user.click(screen.getAllByTitle(/Current Student:/i)[0]);
    await user.click(screen.getByText('Bob'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Could Not Switch to Bob');
    expect(dialog).toHaveTextContent('401 Unauthorized');
    expect(localStorage.getItem('canvas_active_student_id_v2')).toBe(alice.id);

    await user.click(screen.getByRole('button', { name: /Keep Previous Student/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('canvas_active_student_id_v2')).toBe(alice.id);
  });
});

describe('Canvas Announcements collapsible widget & Dismiss workflows', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const sampleAnnouncements: CanvasAnnouncement[] = [
    {
      id: 5001,
      title: 'Project Milestone Check-In',
      message: '<p>Office hours extended Thursday.</p>',
      posted_at: new Date().toISOString(),
      context_code: 'course_101',
      course_id: 101,
      read_state: 'unread',
      author: { display_name: 'Prof. Alan Turing' },
    },
    {
      id: 5002,
      title: 'Calculus Formula Sheet',
      message: '<p>Check Unit 3 Modules.</p>',
      posted_at: new Date(Date.now() - 3600_000).toISOString(),
      context_code: 'course_102',
      course_id: 102,
      read_state: 'read',
      author: { display_name: 'Dr. Katherine Johnson' },
    },
  ];

  const sampleTodos: CanvasTodoItem[] = [
    {
      type: 'submitting',
      course_id: 101,
      context_name: 'AP Biology',
      ignore: 'https://school.instructure.com/api/v1/users/self/todo/1',
      assignment: sampleCourses[0].assignments[0],
    },
  ];

  it('renders collapsible Canvas Announcements widget directly above Canvas Priority To-Do in Board view with Unread/All toggle', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    const { rerender } = render(
      <AssignmentsBoard
        assignments={sampleCourses[0].assignments}
        getCourseName={(id) => (id === 101 ? 'AP Biology' : 'Calculus II')}
        todoItems={sampleTodos}
        announcements={sampleAnnouncements}
        onDismissAnnouncement={onDismiss}
        courses={sampleCourses}
      />
    );

    const annHeading = screen.getByRole('heading', { name: 'Canvas Announcements' });
    const todoHeading = screen.getByRole('heading', { name: 'Canvas Priority To-Do' });
    expect(
      annHeading.compareDocumentPosition(todoHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // Defaults to Unread only: unread 5001 visible, read 5002 hidden
    expect(screen.getByText('Project Milestone Check-In')).toBeInTheDocument();
    expect(screen.queryByText('Calculus Formula Sheet')).not.toBeInTheDocument();

    const unreadBtn = screen.getByRole('button', { name: 'Unread (1)' });
    const allBtn = screen.getByRole('button', { name: 'All (2)' });
    expect(unreadBtn).toHaveAttribute('aria-pressed', 'true');
    expect(allBtn).toHaveAttribute('aria-pressed', 'false');

    // Toggle to All (2) reveals already-read announcements
    await user.click(allBtn);
    expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Calculus Formula Sheet')).toBeInTheDocument();

    // Toggle back to Unread (1) hides already-read announcements
    await user.click(unreadBtn);
    expect(screen.queryByText('Calculus Formula Sheet')).not.toBeInTheDocument();

    // Collapse & re-expand
    const collapseBtn = screen.getAllByRole('button', { name: /Collapse/i })[0];
    await user.click(collapseBtn);
    expect(screen.queryByText('Project Milestone Check-In')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Show All/i }));
    expect(screen.getByText('Project Milestone Check-In')).toBeInTheDocument();

    // Dismiss button triggers callback
    await user.click(screen.getByRole('button', { name: /Dismiss Project Milestone Check-In/i }));
    expect(onDismiss).toHaveBeenCalledWith(sampleAnnouncements[0]);

    // When only unread announcements exist (no read ones), All toggle is not rendered
    rerender(
      <AssignmentsBoard
        assignments={sampleCourses[0].assignments}
        getCourseName={(id) => (id === 101 ? 'AP Biology' : 'Calculus II')}
        todoItems={sampleTodos}
        announcements={[sampleAnnouncements[0]]}
        onDismissAnnouncement={onDismiss}
        courses={sampleCourses}
      />
    );
    expect(screen.queryByRole('button', { name: /^All \(/ })).not.toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  it('renders Canvas Announcements widget above Canvas Priority To-Do in List view', () => {
    render(
      <AssignmentsTable
        assignments={sampleCourses[0].assignments}
        showIds={false}
        showCourseColumn={true}
        getCourseName={(id) => (id === 101 ? 'AP Biology' : 'Calculus II')}
        archivedAssignmentIds={new Set()}
        onToggleArchived={vi.fn()}
        sortConfig={null}
        onSortChange={vi.fn()}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        filterModes={{}}
        onFilterModeChange={vi.fn()}
        todoItems={sampleTodos}
        announcements={sampleAnnouncements}
        onDismissAnnouncement={vi.fn()}
        courses={sampleCourses}
      />
    );

    const annHeading = screen.getByRole('heading', { name: 'Canvas Announcements' });
    const todoHeading = screen.getByRole('heading', { name: 'Canvas Priority To-Do' });
    expect(
      annHeading.compareDocumentPosition(todoHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('hides dismissed announcement in Demo Dashboard and persists per student without network fetches', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { unmount } = render(
      <Dashboard
        data={sampleCourses}
        apiKey="DEMO"
        canvasUrl="DEMO"
        useProxy={false}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="demo_student_a"
      />
    );

    // Navigate to Assignments tab
    await user.click(screen.getByRole('button', { name: /Assignments/i }));
    expect(await screen.findByText('Project Milestone Check-In & Lab Hours Extended')).toBeInTheDocument();
    // Stale (>6 wks) announcement is hidden by default and excluded from the counter
    expect(screen.queryByText('Welcome Week Syllabus & Lab Safety Archive')).not.toBeInTheDocument();
    expect(screen.getByText('2 unread')).toBeInTheDocument();

    // Toggling Filter -> Show Obsolete (>6 wks) reveals the stale announcement and updates counter
    await user.click(screen.getByTitle('Filter assignments by completion or archive status'));
    await user.click(screen.getByRole('button', { name: /Show Obsolete/i }));
    expect(await screen.findByText('Welcome Week Syllabus & Lab Safety Archive')).toBeInTheDocument();
    expect(screen.getByText('3 unread')).toBeInTheDocument();

    // Toggle Show Obsolete back off before dismissal check
    await user.click(screen.getByRole('button', { name: /Show Obsolete/i }));
    expect(screen.queryByText('Welcome Week Syllabus & Lab Safety Archive')).not.toBeInTheDocument();
    expect(screen.getByText('2 unread')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /Dismiss Project Milestone Check-In & Lab Hours Extended/i })
    );

    await waitFor(() => {
      expect(screen.queryByText('Project Milestone Check-In & Lab Hours Extended')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Updated Formula Sheet Posted for Series & Integrals')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Re-mounting same student keeps it hidden; switching to student B shows it again
    unmount();
    render(
      <Dashboard
        data={sampleCourses}
        apiKey="DEMO"
        canvasUrl="DEMO"
        useProxy={false}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="demo_student_b"
      />
    );

    await user.click(screen.getByRole('button', { name: /Assignments/i }));
    expect(await screen.findByText('Project Milestone Check-In & Lab Hours Extended')).toBeInTheDocument();
  });
});

describe('Overview summaries, Calendar tab, positive filters & persistence workflows', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const pastIso = new Date(Date.now() - 2 * 86400_000).toISOString();
  const futureIso = new Date(Date.now() + 2 * 86400_000).toISOString();

  const rawEvents: CanvasCalendarEvent[] = [
    {
      id: 8001,
      title: 'Upcoming Review Seminar',
      start_at: futureIso,
      end_at: futureIso,
      context_code: 'course_101',
      location_name: 'Room 101',
      workflow_state: 'active',
    },
    {
      id: 8002,
      title: 'Yesterday Study Group',
      start_at: pastIso,
      end_at: pastIso,
      context_code: 'course_101',
      location_name: 'Library',
      html_url: 'https://school.instructure.com/calendar?event_id=8002',
      workflow_state: 'active',
    },
  ];

  const overviewAnnouncements: CanvasAnnouncement[] = [
    {
      id: 6001,
      title: 'Overview Headline One',
      message: '<p>Check rubric updates before Friday.</p>',
      posted_at: new Date().toISOString(),
      context_code: 'course_101',
      course_id: 101,
      html_url: 'https://school.instructure.com/courses/101/discussion_topics/6001',
      read_state: 'unread',
    },
    {
      id: 6002,
      title: 'Overview Already Read Notice',
      message: '<p>Posted yesterday for Calculus.</p>',
      posted_at: new Date(Date.now() - 3600_000).toISOString(),
      context_code: 'course_102',
      course_id: 102,
      html_url: 'https://school.instructure.com/courses/102/discussion_topics/6002',
      read_state: 'read',
    },
  ];

  it('renders collapsible Announcements & Calendar Summaries on Overview (without full wall grid), links to Canvas, and honors showPastEvents', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    const { rerender } = render(
      <Overview
        course={sampleCourses[0]}
        allCoursesData={sampleCourses}
        onNavigate={onNavigate}
        showCalendarEvents={true}
        showPastEvents={false}
        calendarEvents={rawEvents}
        announcements={overviewAnnouncements}
        getCourseName={(id) => (id === 101 ? 'AP Biology' : 'Calculus II')}
        canvasUrl="school.instructure.com"
      />
    );

    // 1. Overview shows compact Announcements Summary (unread + total since read items exist)
    expect(screen.getByTestId('overview-announcements-summary')).toBeInTheDocument();
    expect(screen.getByText('1 unread / 2 total')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Overview Headline One/i })).toHaveAttribute(
      'href',
      'https://school.instructure.com/courses/101/discussion_topics/6001'
    );
    await user.click(screen.getByRole('button', { name: /View All Announcements/i }));
    expect(onNavigate).toHaveBeenCalledWith('assignments');

    // 2. Overview shows compact Calendar Summary (NOT the full Agenda/Week/Month wall calendar)
    expect(screen.getByTestId('overview-calendar-summary')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Calendar view mode/i })).not.toBeInTheDocument();

    // showPastEvents defaults false -> past event hidden, upcoming event linked to Canvas
    const upcomingLink = screen.getByRole('link', { name: /Upcoming Review Seminar/i });
    expect(upcomingLink).toHaveAttribute(
      'href',
      'https://school.instructure.com/calendar?event_id=8001&include_contexts=course_101'
    );
    expect(screen.queryByText('Yesterday Study Group')).not.toBeInTheDocument();
    expect(screen.getByText(/\+1/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Open Calendar/i }));
    expect(onNavigate).toHaveBeenCalledWith('calendar');

    // Enable showPastEvents -> past event appears alongside Canvas link
    rerender(
      <Overview
        course={sampleCourses[0]}
        allCoursesData={sampleCourses}
        onNavigate={onNavigate}
        showCalendarEvents={true}
        showPastEvents={true}
        calendarEvents={rawEvents}
        announcements={overviewAnnouncements}
        canvasUrl="school.instructure.com"
      />
    );

    expect(screen.getByRole('link', { name: /Yesterday Study Group/i })).toHaveAttribute(
      'href',
      'https://school.instructure.com/calendar?event_id=8002'
    );
    expect(screen.getAllByRole('link', { name: /^Canvas$/i })).toHaveLength(2);

    // Collapsing both summaries works cleanly
    await user.click(screen.getByRole('button', { name: /Collapse announcements summary/i }));
    expect(screen.queryByText('Overview Headline One')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Collapse calendar summary/i }));
    expect(screen.queryByText('Upcoming Review Seminar')).not.toBeInTheDocument();
  });

  it('defaults Show Past Events and Show Past Terms to Hidden (false), toggles them in Filter menu, and persists filter state across reloads', async () => {
    const user = userEvent.setup();
    const pastTermCourses: CourseData[] = [
      ...sampleCourses,
      {
        course: {
          id: 105,
          name: 'World History: Modern Era',
          course_code: 'HIST210',
          is_favorite: true,
          term: { id: 2, name: 'Spring 2025', end_at: '2025-06-15T23:59:59Z' },
        },
        assignments: [],
        modules: [],
        enrollment: {
          id: 5,
          course_id: 105,
          type: 'StudentEnrollment',
          grades: { current_score: 95, current_grade: 'A', final_score: 95, final_grade: 'A' },
        },
      },
    ];

    const { unmount } = render(
      <Dashboard
        data={pastTermCourses}
        apiKey="DEMO"
        canvasUrl="DEMO"
        useProxy={false}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="demo_events_student"
      />
    );

    // By default: past-term course (Spring 2025) & past calendar event (9005) are HIDDEN
    expect(screen.queryByText(/World History: Modern Era/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Past Lab Orientation & Safety Briefing')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CS Colloquium: Modern Distributed Systems/i })).toBeInTheDocument();

    // Open Filter popover -> positive booleans Show Past Terms & Show Past Events both start Hidden -> toggle to Shown
    await user.click(screen.getByTitle(/Filter assignments/i));
    await user.click(screen.getByRole('button', { name: /Show Past Terms/i }));
    await user.click(screen.getByRole('button', { name: /Show Past Events/i }));

    expect((await screen.findAllByText(/World History: Modern Era/i)).length).toBeGreaterThanOrEqual(1);
    const pastEventLink = await screen.findByRole('link', {
      name: /Past Lab Orientation & Safety Briefing/i,
    });
    expect(pastEventLink).toHaveAttribute('href', 'https://canvas.instructure.com/calendar?event_id=9005');

    // Navigate to dedicated Calendar tab -> verify past event appears there too
    await user.click(screen.getByRole('button', { name: /^Calendar$/i }));
    expect(screen.getByTestId('calendar-events-panel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Past Lab Orientation & Safety Briefing/i })).toBeInTheDocument();

    // Verify persistence across unmount / reload!
    unmount();
    render(
      <Dashboard
        data={pastTermCourses}
        apiKey="DEMO"
        canvasUrl="DEMO"
        useProxy={false}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="demo_events_student"
      />
    );

    // Restores active Calendar tab + both Show Past Terms & Show Past Events filters
    expect(await screen.findByTestId('calendar-events-panel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Past Lab Orientation & Safety Briefing/i })).toBeInTheDocument();
    expect(screen.getAllByText(/World History: Modern Era/i).length).toBeGreaterThanOrEqual(1);
  });

  it('persists filter settings to Canvas saves folder when live credentials are active and restores them on reload', async () => {
    const user = userEvent.setup();
    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue(rawEvents);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);
    const saveSpy = vi.spyOn(canvasService, 'saveFileToCanvas').mockResolvedValue(true);

    render(
      <Dashboard
        data={sampleCourses}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="live_student_1"
      />
    );

    // Wait for initial restore to finish
    await user.click(await screen.findByTitle(/Filter assignments/i));
    await user.click(screen.getByRole('button', { name: /Show Past Events/i }));

    // Debounced remote autosave pushes to Canvas 'saves' folder within ~1.5s (not 10 minutes!)
    await waitFor(
      () => {
        expect(saveSpy).toHaveBeenCalled();
      },
      { timeout: 4000 }
    );
    const savedPayload = JSON.parse(saveSpy.mock.calls[0][3]);
    expect(savedPayload.viewPreferences.showPastEvents).toBe(true);
    expect(saveSpy.mock.calls[0][5]).toBe(canvasService.SAVES_FOLDER);
  });

  it('supports Agenda (with 4-digit year), Week, and Month wall calendar with full event details panel in CalendarEventsPanel & AssignmentsTable', async () => {
    const user = userEvent.setup();
    const todayNoon = new Date();
    todayNoon.setHours(12, 0, 0, 0);
    const nextWeekNoon = new Date(todayNoon);
    nextWeekNoon.setDate(todayNoon.getDate() + 7);
    const otherMonthDay = new Date(todayNoon.getFullYear(), todayNoon.getMonth(), todayNoon.getDate() === 1 ? 2 : 1, 15, 30, 0, 0);

    const todayIso = todayNoon.toISOString();
    const nextWeekIso = nextWeekNoon.toISOString();
    const otherDayIso = otherMonthDay.toISOString();
    const targetYear = String(todayNoon.getFullYear());

    const convert = (id: number, title: string, iso: string, loc: string, desc: string) => ({
      id,
      name: title,
      description: desc,
      due_at: iso,
      start_at: iso,
      end_at: iso,
      points_possible: 0,
      course_id: 101,
      html_url: `https://school.instructure.com/calendar?event_id=${Math.abs(id)}`,
      submission_types: ['calendar_event'],
      is_calendar_event: true,
      location_name: loc,
    });

    const panelEvents = [
      convert(-8101, 'Today Lab Briefing', todayIso, 'Room 101', 'Bring goggles'),
      convert(-8102, 'Next Week Seminar', nextWeekIso, 'Hall B', 'Guest speaker'),
      convert(-8103, 'Month Kickoff Meetup', otherDayIso, 'Student Union', 'Welcome coffee'),
    ];

    render(
      <CalendarEventsPanel
        events={panelEvents}
        canvasUrl="school.instructure.com"
        showPastEvents={false}
      />
    );

    // 1. Agenda view defaults to expanded and displays full 4-digit year
    const agendaBtn = screen.getByRole('button', { name: /^Agenda$/i });
    const weekBtn = screen.getByRole('button', { name: /^Week$/i });
    const monthBtn = screen.getByRole('button', { name: /^Month$/i });
    expect(agendaBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(new RegExp(targetYear)).length).toBeGreaterThanOrEqual(2);

    // 2. Collapsing hides event cards; expanding restores them
    const collapseBtn = screen.getByRole('button', { name: /Collapse calendar events/i });
    await user.click(collapseBtn);
    expect(screen.queryByText('Today Lab Briefing')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Expand calendar events/i }));
    expect(screen.getByRole('link', { name: /Today Lab Briefing/i })).toBeInTheDocument();

    // 3. Week view & Previous/Today/Next navigation
    await user.click(weekBtn);
    expect(weekBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /Today Lab Briefing/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next week/i }));
    expect(screen.getByRole('link', { name: /Next Week Seminar/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Today$/i }));
    expect(screen.getByRole('link', { name: /Today Lab Briefing/i })).toBeInTheDocument();

    // 4. Month view renders full event text AND interactive selected-day details panel
    await user.click(monthBtn);
    expect(monthBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Previous month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next month/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Today Lab Briefing/i })).toBeInTheDocument();

    const selectedDayPanel = screen.getByTestId('calendar-month-selected-day');
    expect(selectedDayPanel).toHaveTextContent('Today Lab Briefing');
    expect(selectedDayPanel).toHaveTextContent('Room 101');
    expect(selectedDayPanel).toHaveTextContent('Bring goggles');
    expect(selectedDayPanel).toHaveTextContent(targetYear);

    // Clicking another event day in Month view updates the Selected Day Details panel
    const otherDayKey = `${otherMonthDay.getFullYear()}-${String(otherMonthDay.getMonth() + 1).padStart(2, '0')}-${String(otherMonthDay.getDate()).padStart(2, '0')}`;
    await user.click(screen.getByTestId(`calendar-month-day-${otherDayKey}`));
    expect(screen.getByTestId('calendar-month-selected-day')).toHaveTextContent('Month Kickoff Meetup');
    expect(screen.getByTestId('calendar-month-selected-day')).toHaveTextContent('Student Union');

    // 5. Verify Assignments List view also displays 4-digit year on calendar events
    render(
      <AssignmentsTable
        assignments={[panelEvents[0]]}
        showIds={false}
        showCourseColumn={false}
        getCourseName={() => 'AP Biology'}
        archivedAssignmentIds={new Set()}
        onToggleArchived={vi.fn()}
        sortConfig={null}
        onSortChange={vi.fn()}
        columnFilters={{}}
        onFilterChange={vi.fn()}
        filterModes={{}}
        onFilterModeChange={vi.fn()}
        canvasUrl="school.instructure.com"
      />
    );
    expect(screen.getAllByText(new RegExp(targetYear)).length).toBeGreaterThanOrEqual(2);
  });
});
