import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarEventsPanel } from '../../components/dashboard/CalendarEventsPanel';
import { CanvasToDo } from '../../components/dashboard/CanvasToDo';
import { AssignmentsTable } from '../../components/dashboard/AssignmentsTable';
import { Dashboard } from '../../components/Dashboard';
import * as canvasService from '../../services/canvas';
import { CanvasAssignment, CanvasTodoItem, CourseData } from '../../types';

const makeCalAssignment = (
  id: number,
  name: string,
  localDate: Date,
  loc: string,
  desc: string
): CanvasAssignment => {
  const iso = localDate.toISOString();
  return {
    id,
    name,
    description: desc,
    due_at: iso,
    start_at: iso,
    end_at: new Date(localDate.getTime() + 3600_000).toISOString(),
    points_possible: 0,
    course_id: 101,
    html_url: `https://school.instructure.com/calendar?event_id=${Math.abs(id)}`,
    submission_types: ['calendar_event'],
    is_calendar_event: true,
    location_name: loc,
    locked_for_user: false,
  };
};

describe('Calendar Month View, Multi-Event Overflow & Navigation Edge Cases', () => {
  it('renders readable multi-line titles in Month cells, handles >3 events (+N more) overflow, shows full details in Selected Day panel, and navigates months', async () => {
    const user = userEvent.setup();
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    // Pick a busy day in the current month with 4 overlapping events, plus an event next month
    const busyDayNum = 15;
    const mk = (hour: number) => new Date(y, m, busyDayNum, hour, 30, 0, 0);
    const nextMonthDate = new Date(y, m + 1, 10, 14, 0, 0, 0);

    const events: CanvasAssignment[] = [
      makeCalAssignment(-9101, 'Morning Lab Check-In', mk(9), 'Room 101', '<p>Review titration steps.</p>'),
      makeCalAssignment(-9102, 'Midday Advisor Session', mk(12), 'Counseling Office', '<p>Course planning.</p>'),
      makeCalAssignment(-9103, 'Afternoon Physics Colloquium', mk(15), 'Auditorium A', '<p>Special guest speaker.</p>'),
      makeCalAssignment(-9104, 'Evening Study Workshop', mk(18), 'Library Commons', '<p>Practice midterm problems.</p>'),
      makeCalAssignment(-9105, 'Next Month Final Review', nextMonthDate, 'Main Hall', '<p>Cumulative review.</p>'),
    ];

    render(
      <CalendarEventsPanel
        events={events}
        canvasUrl="school.instructure.com"
        showPastEvents={true}
        viewMode="month"
      />
    );

    const busyKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(busyDayNum).padStart(2, '0')}`;
    const busyCell = screen.getByTestId(`calendar-month-day-${busyKey}`);

    // Month cell shows stacked time + full titles for first 3 events (never empty dots) + "+1 more" button
    expect(within(busyCell).getByText('Morning Lab Check-In')).toBeInTheDocument();
    expect(within(busyCell).getByText('Midday Advisor Session')).toBeInTheDocument();
    expect(within(busyCell).getByText('Afternoon Physics Colloquium')).toBeInTheDocument();
    const overflowBtn = within(busyCell).getByRole('button', { name: /\+1 more/i });
    expect(overflowBtn).toBeInTheDocument();

    // Clicking "+1 more" selects the day and renders ALL 4 events (including #4!) with location, description, year, and Canvas link in Selected Day panel
    await user.click(overflowBtn);
    const detailsPanel = screen.getByTestId('calendar-month-selected-day');
    expect(detailsPanel).toHaveTextContent('Morning Lab Check-In');
    expect(detailsPanel).toHaveTextContent('Evening Study Workshop');
    expect(detailsPanel).toHaveTextContent('Library Commons');
    expect(detailsPanel).toHaveTextContent('Practice midterm problems.');
    expect(detailsPanel).toHaveTextContent(String(y));

    const canvasLinks = within(detailsPanel).getAllByRole('link', { name: /Open in Canvas/i });
    expect(canvasLinks).toHaveLength(4);
    expect(canvasLinks[3]).toHaveAttribute(
      'href',
      'https://school.instructure.com/calendar?event_id=9104'
    );

    // Navigating to Next month switches header and shows next month's event
    await user.click(screen.getByRole('button', { name: /Next month/i }));
    expect(screen.getByRole('link', { name: /Next Month Final Review/i })).toBeInTheDocument();
    expect(screen.getByTestId('calendar-month-selected-day')).toHaveTextContent('Next Month Final Review');
    expect(screen.getByTestId('calendar-month-selected-day')).toHaveTextContent('Main Hall');
  });
});

describe('AssignmentsTable Archive/Obsolete/PastEvents & CanvasToDo Workflows', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const now = Date.now();
  const tableAssignments: CanvasAssignment[] = [
    {
      id: 201,
      name: 'Archived Essay',
      description: '',
      due_at: new Date(now + 2 * 86400_000).toISOString(),
      points_possible: 50,
      course_id: 101,
      html_url: 'https://school.instructure.com/courses/101/assignments/201',
      submission_types: ['online_upload'],
    },
    {
      id: 202,
      name: 'Ancient Overdue Drill',
      description: '',
      due_at: new Date(now - 55 * 86400_000).toISOString(),
      points_possible: 20,
      course_id: 101,
      html_url: 'https://school.instructure.com/courses/101/assignments/202',
      submission_types: ['online_upload'],
    },
    {
      id: -203,
      name: 'Past Seminar Session',
      description: '',
      due_at: new Date(now - 2 * 86400_000).toISOString(),
      start_at: new Date(now - 2 * 86400_000).toISOString(),
      end_at: new Date(now - 2 * 86400_000 + 3600_000).toISOString(),
      points_possible: 0,
      course_id: 101,
      html_url: 'https://school.instructure.com/calendar?event_id=203',
      submission_types: ['calendar_event'],
      is_calendar_event: true,
    },
  ];

  it('AssignmentsTable enforces showArchived, showObsolete, and showPastEvents cleanly', () => {
    const baseProps = {
      assignments: tableAssignments,
      showIds: false,
      showCourseColumn: true,
      getCourseName: () => 'AP Biology',
      archivedAssignmentIds: new Set([201]),
      onToggleArchived: vi.fn(),
      sortConfig: null,
      onSortChange: vi.fn(),
      columnFilters: {},
      onFilterChange: vi.fn(),
      filterModes: {},
      onFilterModeChange: vi.fn(),
      canvasUrl: 'school.instructure.com',
    };

    const { rerender } = render(
      <AssignmentsTable
        {...baseProps}
        showArchived={false}
        showObsolete={false}
        showPastEvents={false}
      />
    );

    expect(screen.queryByText('Archived Essay')).not.toBeInTheDocument();
    expect(screen.queryByText('Ancient Overdue Drill')).not.toBeInTheDocument();
    expect(screen.queryByText('Past Seminar Session')).not.toBeInTheDocument();

    rerender(
      <AssignmentsTable
        {...baseProps}
        showArchived={true}
        showObsolete={true}
        showPastEvents={true}
      />
    );

    expect(screen.getAllByText('Archived Essay').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Ancient Overdue Drill').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Past Seminar Session').length).toBeGreaterThanOrEqual(1);
  });

  it('CanvasToDo opens Zoom modal and Dashboard shows non-blocking notice banner when Canvas API refuses To-Do dismissal', async () => {
    const user = userEvent.setup();
    const todoCourse: CourseData[] = [
      {
        course: {
          id: 101,
          name: 'AP Biology',
          course_code: 'BIO101',
          is_favorite: true,
          term: { id: 1, name: 'Fall 2026' },
        },
        assignments: [tableAssignments[0]],
        modules: [],
      },
    ];

    const todoItem: CanvasTodoItem = {
      type: 'submitting',
      course_id: 101,
      context_name: 'AP Biology',
      ignore: 'https://school.instructure.com/api/v1/users/self/todo/999',
      html_url: 'https://school.instructure.com/courses/101/assignments/201',
      assignment: tableAssignments[0],
    };

    // Standalone CanvasToDo zoom interaction
    const onMarkDone = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <CanvasToDo
        items={[todoItem]}
        onMarkDone={onMarkDone}
        courses={todoCourse}
        canvasUrl="school.instructure.com"
      />
    );

    await user.click(screen.getByRole('button', { name: /Zoom/i }));
    expect(await screen.findByText(/Open in Canvas/i)).toBeInTheDocument();
    unmount();

    // Dashboard non-blocking notice when dismissTodoItem fails (returns false)
    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([todoItem]);
    vi.spyOn(canvasService, 'dismissTodoItem').mockResolvedValue(false);

    render(
      <Dashboard
        data={todoCourse}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="todo_notice_student"
      />
    );

    await user.click(await screen.findByRole('button', { name: /^Assignments$/i }));
    await screen.findByRole('heading', { name: 'Canvas Priority To-Do' });
    const showAllBtn = screen.queryByRole('button', { name: /^Show All$/i });
    if (showAllBtn) {
      await user.click(showAllBtn);
    }
    const todoLabel = await screen.findByTitle('Mark as done and dismiss from Canvas To-Do');
    const doneCheckbox = within(todoLabel).getByRole('checkbox');
    await user.click(doneCheckbox);

    await waitFor(() => {
      expect(screen.getByText(/Could not dismiss this To-Do item via Canvas API\./i)).toBeInTheDocument();
    });
  });
});
