import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../../components/Dashboard';
import { MobileControlsDrawer } from '../../components/dashboard/MobileControlsDrawer';
import { SaveLoadModal } from '../../components/dashboard/SaveLoadModal';
import * as canvasService from '../../services/canvas';
import { CourseData, CanvasCalendarEvent, CanvasAnnouncement, UserSettings } from '../../types';

const nowMs = Date.now();
const daysAgoIso = (days: number) => new Date(nowMs - days * 86400_000).toISOString();
const daysAheadIso = (days: number) => new Date(nowMs + days * 86400_000).toISOString();

const makeFilterCourses = (opts?: { activeFavorites?: boolean; pastOnlyFavorite?: boolean }): CourseData[] => {
  const activeFav = opts?.activeFavorites ?? true;
  const pastFav = opts?.pastOnlyFavorite ?? true;

  return [
    {
      course: {
        id: 101,
        name: 'AP Biology - Pd 2',
        course_code: 'BIO101',
        is_favorite: activeFav,
        term: { id: 1, name: 'Fall 2026', end_at: daysAheadIso(60) },
      },
      assignments: [
        {
          id: 11,
          name: 'Active Upcoming Lab',
          description: '<p>Active lab</p>',
          due_at: daysAheadIso(2),
          points_possible: 50,
          course_id: 101,
          html_url: 'https://school.instructure.com/courses/101/assignments/11',
          locked_for_user: false,
          submission_types: ['online_upload'],
        },
        {
          id: 12,
          name: 'Submitted Essay Assignment',
          description: '<p>Already graded</p>',
          due_at: daysAgoIso(3),
          points_possible: 100,
          course_id: 101,
          html_url: 'https://school.instructure.com/courses/101/assignments/12',
          locked_for_user: false,
          submission_types: ['online_upload'],
          submission: {
            user_id: 1,
            submitted_at: daysAgoIso(3),
            graded_at: daysAgoIso(2),
            grade: '95',
            score: 95,
            submission_comments: [],
          } as any,
        },
        {
          id: 13,
          name: 'Obsolete Six-Week-Old Task',
          description: '<p>Very old unsubmitted task</p>',
          due_at: daysAgoIso(50),
          points_possible: 10,
          course_id: 101,
          html_url: 'https://school.instructure.com/courses/101/assignments/13',
          locked_for_user: false,
          submission_types: ['online_upload'],
        },
      ],
      modules: [],
      enrollment: {
        id: 1,
        course_id: 101,
        type: 'StudentEnrollment',
        grades: { current_score: 91, current_grade: 'A-', final_score: 91, final_grade: 'A-' },
      },
    },
    {
      course: {
        id: 105,
        name: 'World History: Modern Era',
        course_code: 'HIST210',
        is_favorite: pastFav,
        term: { id: 2, name: 'Spring 2025', end_at: '2025-06-15T23:59:59Z' },
      },
      assignments: [
        {
          id: 51,
          name: 'Past Term Final Capstone',
          description: '',
          due_at: '2025-06-10T12:00:00Z',
          points_possible: 100,
          course_id: 105,
          html_url: 'https://school.instructure.com/courses/105/assignments/51',
          locked_for_user: false,
          submission_types: ['online_upload'],
        },
      ],
      modules: [],
      enrollment: {
        id: 5,
        course_id: 105,
        type: 'StudentEnrollment',
        grades: { current_score: 96, current_grade: 'A', final_score: 96, final_grade: 'A' },
      },
    },
  ];
};

const sampleLiveEvents: CanvasCalendarEvent[] = [
  {
    id: 7001,
    title: 'Active Bio Study Hall',
    start_at: daysAheadIso(1),
    end_at: daysAheadIso(1),
    context_code: 'course_101',
    location_name: 'Room 204',
    workflow_state: 'active',
  },
  {
    id: 7002,
    title: 'Past Course Briefing',
    start_at: daysAgoIso(3),
    end_at: daysAgoIso(3),
    context_code: 'course_101',
    location_name: 'Room 101',
    workflow_state: 'active',
  },
  {
    id: 7003,
    title: 'HIST210 Archive Review',
    start_at: daysAheadIso(2),
    end_at: daysAheadIso(2),
    context_code: 'course_105',
    location_name: 'History Annex',
    workflow_state: 'active',
  },
];

const sampleLiveAnnouncements: CanvasAnnouncement[] = [
  {
    id: 8001,
    title: 'Current Bio Announcement',
    message: '<p>Active week announcement</p>',
    posted_at: daysAgoIso(1),
    context_code: 'course_101',
    course_id: 101,
    read_state: 'unread',
    html_url: 'https://school.instructure.com/courses/101/discussion_topics/8001',
  },
  {
    id: 8002,
    title: 'Obsolete Orientation Announcement',
    message: '<p>Posted 50 days ago</p>',
    posted_at: daysAgoIso(50),
    context_code: 'course_101',
    course_id: 101,
    read_state: 'unread',
    html_url: 'https://school.instructure.com/courses/101/discussion_topics/8002',
  },
  {
    id: 8003,
    title: 'Past Term History Notice',
    message: '<p>Spring 2025 notice</p>',
    posted_at: daysAgoIso(2),
    context_code: 'course_105',
    course_id: 105,
    read_state: 'unread',
    html_url: 'https://school.instructure.com/courses/105/discussion_topics/8003',
  },
];

describe('Server /saves Persistence, Legacy Migration & Conflict Resolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists ALL filter & calendar view settings to Canvas saves and restores them cleanly after localStorage wipe', async () => {
    const user = userEvent.setup();
    const serverFiles: { file: any; content: string }[] = [];

    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue(sampleLiveEvents);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue(sampleLiveAnnouncements);
    vi.spyOn(canvasService, 'listSaveStates').mockImplementation(async (_d, _t, _p, folder) => {
      if (folder !== canvasService.SAVES_FOLDER) return [];
      return serverFiles.map((entry) => entry.file);
    });
    const saveSpy = vi.spyOn(canvasService, 'saveFileToCanvas').mockImplementation(
      async (_d, _t, filename, content) => {
        const ts = new Date().toISOString();
        serverFiles.unshift({
          file: {
            id: serverFiles.length + 1,
            filename,
            display_name: filename,
            url: `https://school.instructure.com/files/${serverFiles.length + 1}`,
            updated_at: ts,
            created_at: ts,
            size: content.length,
          },
          content,
        });
        return true;
      }
    );
    vi.spyOn(canvasService, 'downloadRawFile').mockImplementation(async (url) => {
      const match = serverFiles.find((entry) => entry.file.url === url);
      return match ? match.content : '';
    });

    const courses = makeFilterCourses();
    const { unmount } = render(
      <Dashboard
        data={courses}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="persist_student"
      />
    );

    // 1. Wait for initial hydration to complete; confirm all optional filters default to Hidden & 0 saves yet
    await user.click(await screen.findByTitle(/Filter assignments/i));
    expect(saveSpy).not.toHaveBeenCalled();
    for (const label of [
      /Show Submitted/i,
      /Show Archived/i,
      /Show Obsolete/i,
      /Show Past Terms/i,
      /Show Past Events/i,
    ]) {
      expect(screen.getByRole('button', { name: label })).toHaveTextContent('Hidden');
    }
    const calendarFilterSection = screen.getByTestId('filter-calendar-section');
    expect(within(calendarFilterSection).getByText(/^Calendar$/i)).toBeInTheDocument();
    expect(within(calendarFilterSection).getByRole('button', { name: /Show Past Events/i })).toBeInTheDocument();

    // Toggle all 5 positive filters ON
    await user.click(screen.getByRole('button', { name: /Show Submitted/i }));
    await user.click(screen.getByRole('button', { name: /Show Archived/i }));
    await user.click(screen.getByRole('button', { name: /Show Obsolete/i }));
    await user.click(screen.getByRole('button', { name: /Show Past Terms/i }));
    await user.click(screen.getByRole('button', { name: /Show Past Events/i }));

    // Toggle Display -> Class Averages ON as well
    await user.click(screen.getByTitle(/Customize displayed fields/i));
    await user.click(screen.getByRole('button', { name: /Class Averages/i }));

    // Switch to Calendar tab and switch viewMode -> Month
    await user.click(screen.getByRole('button', { name: /^Calendar$/i }));
    await user.click(screen.getByRole('button', { name: /^Month$/i }));

    // All 8 rapid interactions must coalesce into a SINGLE Canvas upload
    await waitFor(
      () => {
        expect(serverFiles.length).toBe(1);
        expect(saveSpy).toHaveBeenCalledTimes(1);
        const latest = JSON.parse(serverFiles[0].content) as UserSettings;
        expect(latest.viewPreferences.showSubmitted).toBe(true);
        expect(latest.viewPreferences.showArchived).toBe(true);
        expect(latest.viewPreferences.showObsolete).toBe(true);
        expect(latest.viewPreferences.showPastTerms).toBe(true);
        expect(latest.viewPreferences.showPastEvents).toBe(true);
        expect(latest.viewPreferences.showClassAverages).toBe(true);
        expect(latest.viewPreferences.calendarViewMode).toBe('month');
        expect(latest.viewPreferences.activeTab).toBe('calendar');
      },
      { timeout: 6000 }
    );

    // 2. Simulate brand-new browser/device session (unmount & clear ALL localStorage)
    unmount();
    localStorage.clear();

    render(
      <Dashboard
        data={courses}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="persist_student"
      />
    );

    // 3. Restores directly from Canvas server /saves into Month Calendar view with Past Events & Past Terms active
    await waitFor(() => {
      expect(screen.getByTestId('calendar-events-panel')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Month$/i })).toHaveAttribute('aria-pressed', 'true');
    });

    await user.click(screen.getByTitle(/Filter assignments/i));
    for (const label of [
      /Show Submitted/i,
      /Show Archived/i,
      /Show Obsolete/i,
      /Show Past Terms/i,
      /Show Past Events/i,
    ]) {
      expect(screen.getByRole('button', { name: label })).toHaveTextContent('Shown');
    }

    await user.click(screen.getByTitle(/Customize displayed fields/i));
    expect(screen.getByRole('button', { name: /Class Averages/i })).toHaveTextContent('ON');
  });

  it('migrates legacy hidePastEvents=false from Canvas saves into positive showPastEvents=true', async () => {
    const legacySave = {
      timestamp: '2026-11-10T10:00:00.000Z',
      viewPreferences: {
        showHiddenCourses: false,
        showSubmitted: false,
        showObsolete: false,
        showPastTerms: false,
        showScores: true,
        showIds: false,
        hidePastEvents: false,
        activeTab: 'calendar',
        assignmentsViewMode: 'list',
        isSidebarCollapsed: false,
      },
      context: { selectedCourseId: -1, visibleCourseIds: [101] },
      tableState: { sortConfig: null, columnFilters: {}, filterModes: {} },
    };

    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue(sampleLiveEvents);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);
    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([
      {
        id: 99,
        filename: 'legacy.json',
        url: 'https://school.instructure.com/files/99',
        updated_at: '2026-11-10T10:00:00.000Z',
        created_at: '2026-11-10T10:00:00.000Z',
        size: 300,
      },
    ]);
    vi.spyOn(canvasService, 'downloadRawFile').mockResolvedValue(JSON.stringify(legacySave));

    render(
      <Dashboard
        data={makeFilterCourses()}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="legacy_student"
      />
    );

    expect(await screen.findByTestId('calendar-events-panel')).toBeInTheDocument();
    // Legacy hidePastEvents: false => showPastEvents: true => past event is visible
    expect(screen.getByRole('link', { name: /Past Course Briefing/i })).toBeInTheDocument();
  });

  it('prompts Newer Cloud Save Found on remote conflict and respects Discard vs Overwrite', async () => {
    const user = userEvent.setup();
    const initialTime = '2026-11-10T10:00:00.000Z';
    const newerServerTime = new Date(Date.now() + 300_000).toISOString();
    let listCallCount = 0;

    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);
    vi.spyOn(canvasService, 'listSaveStates').mockImplementation(async (_d, _t, _p, folder) => {
      if (folder !== canvasService.SAVES_FOLDER) return [];
      listCallCount += 1;
      if (listCallCount === 1) {
        return [
          {
            id: 1,
            filename: 'initial.json',
            url: 'https://school.instructure.com/files/1',
            updated_at: initialTime,
            created_at: initialTime,
            size: 200,
          },
        ];
      }
      return [
        {
          id: 2,
          filename: 'other_device.json',
          url: 'https://school.instructure.com/files/2',
          updated_at: newerServerTime,
          created_at: newerServerTime,
          size: 200,
        },
      ];
    });
    vi.spyOn(canvasService, 'downloadRawFile').mockResolvedValue(
      JSON.stringify({
        timestamp: initialTime,
        viewPreferences: {
          showHiddenCourses: false,
          showSubmitted: false,
          showObsolete: false,
          showPastTerms: false,
          showScores: true,
          showIds: false,
          activeTab: 'overview',
          assignmentsViewMode: 'list',
          isSidebarCollapsed: false,
        },
        context: { selectedCourseId: -1, visibleCourseIds: [101] },
        tableState: { sortConfig: null, columnFilters: {}, filterModes: {} },
      })
    );
    const saveSpy = vi.spyOn(canvasService, 'saveFileToCanvas').mockResolvedValue(true);

    render(
      <Dashboard
        data={makeFilterCourses()}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="conflict_student"
      />
    );

    // Trigger manual save via header Save button -> SaveDialog -> Confirm -> conflict modal
    const saveBtn = await screen.findByTitle('Save Current View Settings');
    await user.click(saveBtn);
    await user.click(screen.getByTitle('Confirm save'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Newer Cloud Save Found');

    // Discard cancels without uploading
    await user.click(screen.getByRole('button', { name: /Discard Save/i }));
    expect(saveSpy).not.toHaveBeenCalled();

    // Retry & Overwrite Cloud Save pushes to Canvas
    await user.click(saveBtn);
    await user.click(screen.getByTitle('Confirm save'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Newer Cloud Save Found');
    await user.click(screen.getByRole('button', { name: /Overwrite Cloud Save/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });
  });

  it('SaveLoadModal lists files, loads selected cloud save, and imports JSON while rejecting invalid JSON', async () => {
    const user = userEvent.setup();
    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([
      {
        id: 10,
        filename: 'my_setup.json',
        display_name: 'My Study Setup',
        url: 'https://school.instructure.com/files/10',
        updated_at: '2026-11-12T10:00:00Z',
        size: 1024,
      },
    ]);

    const onLoadFile = vi.fn();
    const onImportSettings = vi.fn();
    const onClose = vi.fn();

    const { container } = render(
      <SaveLoadModal
        isOpen={true}
        onClose={onClose}
        onLoadFile={onLoadFile}
        domain="school.instructure.com"
        token="tok"
        useProxy={true}
        onExportSettings={vi.fn()}
        onImportSettings={onImportSettings}
      />
    );

    expect(await screen.findByText('My Study Setup')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Load$/i }));
    expect(onLoadFile).toHaveBeenCalledWith(
      'https://school.instructure.com/files/10',
      expect.any(Number)
    );
    expect(onClose).toHaveBeenCalled();

    // Test malformed JSON import feedback
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(['{invalid json'], 'bad.json', { type: 'application/json' });
    await user.upload(fileInput, badFile);
    expect(await screen.findByText(/Failed to parse file/i)).toBeInTheDocument();

    // Test valid JSON import feedback
    const goodSettings = { viewPreferences: { showPastEvents: true } };
    const goodFile = new File([JSON.stringify(goodSettings)], 'good.json', { type: 'application/json' });
    await user.upload(fileInput, goodFile);
    expect(await screen.findByText(/Settings imported successfully/i)).toBeInTheDocument();
    expect(onImportSettings).toHaveBeenCalledWith(goodSettings);
  });

  it('prevents rapid sequential server saves via 60s cooldown, skips unedited baseline writes, and deduplicates reverts', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);
      vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue(sampleLiveEvents);
      vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);
      vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([]);
      const saveSpy = vi.spyOn(canvasService, 'saveFileToCanvas').mockResolvedValue(true);

      render(
        <Dashboard
          data={makeFilterCourses()}
          apiKey="1234~live_token"
          canvasUrl="school.instructure.com"
          useProxy={true}
          onLogout={vi.fn()}
          onDebug={vi.fn()}
          currentStudentId="throttle_student"
        />
      );

      // Flush initial async smartLoad promises
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByTitle(/Filter assignments/i)).toBeInTheDocument();

      // Waiting 10s with no user edits sends 0 server saves (does not upload unchanged defaults)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(saveSpy).toHaveBeenCalledTimes(0);

      // User toggles Show Past Events -> immediate localStorage save, remote debounces 2.5s
      fireEvent.click(screen.getByTitle(/Filter assignments/i));
      fireEvent.click(screen.getByRole('button', { name: /Show Past Events/i }));

      const cachedImmediate = JSON.parse(localStorage.getItem('velm_workspace_settings_v1_throttle_student') || '{}');
      expect(cachedImmediate.viewPreferences?.showPastEvents).toBe(true);

      // Before 2.5s debounce finishes -> still 0 calls
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(saveSpy).toHaveBeenCalledTimes(0);

      // After 2.5s idle + internal 400ms listing settle -> exactly 1 server save
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200);
      });
      expect(saveSpy).toHaveBeenCalledTimes(1);

      // 5s later, user toggles another filter -> must NOT issue a rapid sequential save inside 60s cooldown!
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      fireEvent.click(screen.getByRole('button', { name: /Show Submitted/i }));

      const cachedSecond = JSON.parse(localStorage.getItem('velm_workspace_settings_v1_throttle_student') || '{}');
      expect(cachedSecond.viewPreferences?.showSubmitted).toBe(true);

      // Even 25 seconds later (30s total since first save), count stays strictly 1
      await act(async () => {
        await vi.advanceTimersByTimeAsync(25_000);
      });
      expect(saveSpy).toHaveBeenCalledTimes(1);

      // Once 60s cooldown completes, the buffered change flushes in one clean save (count -> 2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(36_000);
      });
      expect(saveSpy).toHaveBeenCalledTimes(2);
      const secondPayload = JSON.parse(saveSpy.mock.calls[1][3]) as UserSettings;
      expect(secondPayload.viewPreferences.showSubmitted).toBe(true);

      // No-op revert deduplication: toggle Show Obsolete ON then immediately back OFF -> 0 extra saves ever
      fireEvent.click(screen.getByRole('button', { name: /Show Obsolete/i }));
      fireEvent.click(screen.getByRole('button', { name: /Show Obsolete/i }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(65_000);
      });
      expect(saveSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Active Course, Term, Obsolete, Archived & Mobile Filters Enforcement', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prevents past-only favorites from hiding active-term classes and blocks past-term calendar leaks when None is clicked', async () => {
    const user = userEvent.setup();
    // Edge case: active course 101 is NOT favorite, ONLY past-term course 105 has is_favorite: true
    const courses = makeFilterCourses({ activeFavorites: false, pastOnlyFavorite: true });

    render(
      <Dashboard
        data={courses}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="term_edge_student"
      />
    );

    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);

    // Active course 101 MUST still be visible in Overview & Sidebar
    expect((await screen.findAllByText(/AP Biology/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/No courses currently selected/i)).not.toBeInTheDocument();
    // Past-term course 105 is hidden by default
    expect(screen.queryByText(/World History: Modern Era/i)).not.toBeInTheDocument();

    // Clicking "None" in Sidebar sets 0 selected courses and suppresses Overview calendar events
    await user.click(screen.getByTitle('Hide all classes in multi-class view'));
    expect(screen.getByText(/No courses currently selected in Multi-Class view/i)).toBeInTheDocument();
    expect(screen.queryByText('Upcoming Calendar Events (1)')).not.toBeInTheDocument();
  });

  it('filters Obsolete (>6 wks) and Submitted assignments in Board view and resets if active past-term course is hidden', async () => {
    const user = userEvent.setup();
    const courses = makeFilterCourses();

    render(
      <Dashboard
        data={courses}
        apiKey="DEMO"
        canvasUrl="DEMO"
        useProxy={false}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="board_filter_student"
      />
    );

    // Turn Show Past Terms ON -> focus ONLY on past-term HIST210 -> then turn Show Past Terms OFF -> auto-resets out
    await user.click(screen.getByTitle(/Filter assignments/i));
    await user.click(screen.getByRole('button', { name: /Show Past Terms/i }));
    await user.click(await screen.findByTitle(/Focus ONLY on World History: Modern Era/i));
    expect(screen.getByRole('heading', { name: /World History: Modern Era/i })).toBeInTheDocument();

    // Toggling Show Past Terms back OFF resets selectedCourseId away from hidden HIST210
    await user.click(screen.getByTitle(/Filter assignments/i));
    await user.click(screen.getByRole('button', { name: /Show Past Terms/i }));
    expect(screen.queryByRole('heading', { name: /World History: Modern Era/i })).not.toBeInTheDocument();

    // Switch to Assignments -> Board View and test Show Obsolete + Show Submitted
    await user.click(screen.getByRole('button', { name: /^Assignments$/i }));
    await user.click(screen.getByTitle('Board View'));

    // Active upcoming lab visible; >6 week obsolete & submitted tasks hidden by default
    expect(screen.getByText('Active Upcoming Lab')).toBeInTheDocument();
    expect(screen.queryByText('Obsolete Six-Week-Old Task')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completed & Graded/i })).toHaveTextContent('0');

    // Toggle Show Obsolete -> 50-day overdue task appears
    await user.click(screen.getByTitle(/Filter assignments/i));
    await user.click(screen.getByRole('button', { name: /Show Obsolete/i }));
    expect(screen.getByText('Obsolete Six-Week-Old Task')).toBeInTheDocument();

    // Toggle Show Submitted -> Completed & Graded count becomes 1
    await user.click(screen.getByRole('button', { name: /Show Submitted/i }));
    expect(screen.getByRole('button', { name: /Completed & Graded/i })).toHaveTextContent('1');
  });

  it('MobileControlsDrawer exposes positive filter toggles, Display toggles, and Log Out', async () => {
    const user = userEvent.setup();
    const onToggleShowPastEvents = vi.fn();
    const onToggleShowPastTerms = vi.fn();
    const onToggleShowClassAverages = vi.fn();
    const onLogout = vi.fn();

    render(
      <MobileControlsDrawer
        isOpen={true}
        onClose={vi.fn()}
        showScores={true}
        onToggleShowScores={vi.fn()}
        showClassAverages={false}
        onToggleShowClassAverages={onToggleShowClassAverages}
        showIds={false}
        onToggleShowIds={vi.fn()}
        showCalendarEvents={true}
        onToggleShowCalendarEvents={vi.fn()}
        showPastEvents={false}
        onToggleShowPastEvents={onToggleShowPastEvents}
        showSubmitted={false}
        onToggleShowSubmitted={vi.fn()}
        showArchived={false}
        onToggleShowArchived={vi.fn()}
        showObsolete={false}
        onToggleShowObsolete={vi.fn()}
        showPastTerms={false}
        onToggleShowPastTerms={onToggleShowPastTerms}
        onSaveSettings={vi.fn()}
        isSaving={false}
        onOpenLoadModal={vi.fn()}
        onToggleNotes={vi.fn()}
        onDebugAutosave={vi.fn()}
        data={makeFilterCourses()}
        onLogout={onLogout}
      />
    );

    const mobileCalSection = screen.getByTestId('mobile-filter-calendar-section');
    expect(within(mobileCalSection).getByText(/^Calendar$/i)).toBeInTheDocument();
    const pastEventsBtn = within(mobileCalSection).getByRole('button', { name: /Show Past Events/i });
    expect(pastEventsBtn).toHaveTextContent('Hidden');
    await user.click(pastEventsBtn);
    expect(onToggleShowPastEvents).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: /Show Past Terms/i }));
    expect(onToggleShowPastTerms).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: /Class Averages/i }));
    expect(onToggleShowClassAverages).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: /Log Out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  it('enforces default false filters across Overview pending counts, Course Header, List View counts, and Reset Defaults', async () => {
    const user = userEvent.setup();
    vi.spyOn(canvasService, 'listSaveStates').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchTodoItems').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchCalendarEvents').mockResolvedValue([]);
    vi.spyOn(canvasService, 'fetchAnnouncements').mockResolvedValue([]);

    const courses = makeFilterCourses();

    render(
      <Dashboard
        data={courses}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="default_counts_student"
      />
    );

    // Wait for initial Overview render: only 1 active non-obsolete, non-submitted assignment (id 11) should be counted
    expect(await screen.findByText(/Aggregated workspace \(1 assignments/i)).toBeInTheDocument();
    expect(screen.getByText('1 pending task')).toBeInTheDocument();

    // Switch to Assignments (List view default) -> Upcoming & Active badge shows (1), excluding obsolete & submitted
    await user.click(screen.getByRole('button', { name: /^Assignments$/i }));
    expect(screen.getByRole('button', { name: /Upcoming & Active/i })).toHaveTextContent('1');
    expect(screen.queryByText('Obsolete Six-Week-Old Task')).not.toBeInTheDocument();

    // Enable Show Obsolete & Show Submitted & Show Past Terms -> counts update dynamically
    await user.click(screen.getByTitle(/Filter assignments/i));
    await user.click(screen.getByRole('button', { name: /Show Obsolete/i }));
    await user.click(screen.getByRole('button', { name: /Show Submitted/i }));
    await user.click(screen.getByRole('button', { name: /Show Past Terms/i }));
    expect(screen.getByRole('button', { name: /Upcoming & Active/i })).toHaveTextContent('3');
    expect(screen.getByText(/Aggregated workspace \(4 assignments/i)).toBeInTheDocument();

    // Reset Defaults returns all optional filters back to Hidden (false)
    await user.click(screen.getByRole('button', { name: /Reset Defaults/i }));
    for (const label of [
      /Show Submitted/i,
      /Show Archived/i,
      /Show Obsolete/i,
      /Show Past Terms/i,
      /Show Past Events/i,
    ]) {
      expect(screen.getByRole('button', { name: label })).toHaveTextContent('Hidden');
    }
    expect(screen.getByRole('button', { name: /Upcoming & Active/i })).toHaveTextContent('1');
    expect(screen.getByText(/Aggregated workspace \(1 assignments/i)).toBeInTheDocument();
  });

  it('toggles single-course mode on and off when clicking the Sidebar "Only" button repeatedly and preserves prior multi-class subset', async () => {
    const user = userEvent.setup();
    const courseA: CourseData = {
      course: { id: 201, name: 'AP Biology', course_code: 'BIO101', is_favorite: true },
      assignments: [],
      modules: [],
    };
    const courseB: CourseData = {
      course: { id: 202, name: 'Calculus AB', course_code: 'MATH201', is_favorite: true },
      assignments: [],
      modules: [],
    };
    const courseC: CourseData = {
      course: { id: 203, name: 'English Literature', course_code: 'ENG301', is_favorite: true },
      assignments: [],
      modules: [],
    };

    render(
      <Dashboard
        data={[courseA, courseB, courseC]}
        apiKey="1234~live_token"
        canvasUrl="school.instructure.com"
        useProxy={true}
        onLogout={vi.fn()}
        onDebug={vi.fn()}
        currentStudentId="only_toggle_student"
      />
    );

    // Wait for initial Multi-Class 3/3 visible view
    expect(await screen.findByRole('heading', { name: /All Courses/i })).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();

    // Uncheck Course C in Sidebar so subset is 2/3 (A + B)
    const hideCheckboxes = screen.getAllByTitle('Click to hide from multi-class view');
    await user.click(hideCheckboxes[2]);
    expect(screen.getByText('2/3')).toBeInTheDocument();

    // 1. Click "Only" on AP Biology -> enters single-course mode (1/3)
    const bioOnlyBtn = screen.getByTitle('Focus ONLY on AP Biology');
    expect(bioOnlyBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(bioOnlyBtn);

    expect(await screen.findByRole('heading', { name: /AP Biology/i })).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
    const exitBioBtn = screen.getByTitle('Exit ONLY focus on AP Biology');
    expect(exitBioBtn).toHaveAttribute('aria-pressed', 'true');

    // 2. Click "Only" on Calculus AB directly while A was isolated -> switches single-course focus to B
    await user.click(screen.getByTitle('Focus ONLY on Calculus AB'));
    expect(await screen.findByRole('heading', { name: /Calculus AB/i })).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();

    // 3. Tap "Only" on Calculus AB again -> deactivates single-course mode and restores pre-Only subset (2/3: A + B)
    const exitCalcBtn = screen.getByTitle('Exit ONLY focus on Calculus AB');
    expect(exitCalcBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(exitCalcBtn);

    expect(await screen.findByRole('heading', { name: /Multi-Class View \(2 of 3 visible\)/i })).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByTitle('Focus ONLY on Calculus AB')).toHaveAttribute('aria-pressed', 'false');

    // 4. Restore All (3/3), toggle "Only" on English Literature, then tap "Only" again -> returns to "All Courses"
    await user.click(screen.getByTitle('Show all classes in multi-class view'));
    expect(await screen.findByRole('heading', { name: /All Courses/i })).toBeInTheDocument();
    await user.click(screen.getByTitle('Focus ONLY on English Literature'));
    expect(await screen.findByRole('heading', { name: /English Literature/i })).toBeInTheDocument();
    await user.click(screen.getByTitle('Exit ONLY focus on English Literature'));
    expect(await screen.findByRole('heading', { name: /All Courses/i })).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });
});
