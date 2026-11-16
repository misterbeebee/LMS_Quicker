import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../../components/Dashboard';
import * as canvasService from '../../services/canvas';
import { removeStudent, saveStudent } from '../../services/students';
import { CourseData } from '../../types';
import { getEffectiveCourseGrade } from '../../utils/gradeInspector';
import {
  getSavedStudentVueGrades,
  matchSynergyCourseToCanvas,
  parseSynergyGradebook,
  saveStudentVueGrades,
  SYNERGY_NO_MATCH_KEY,
  updateStudentVueCourseMapping,
} from '../../services/studentvueGrades';

const sampleRawSynergyPayload = {
  Gradebook: {
    '@Type': 'Traditional',
    ReportingPeriod: { '@Index': '1', '@GradePeriod': 'MP2', '@GU': 'GP-2' },
    ReportingPeriods: {
      ReportPeriod: [
        { '@Index': '0', '@GradePeriod': 'MP1', '@GU': 'GP-1' },
        { '@Index': '1', '@GradePeriod': 'MP2', '@GU': 'GP-2' },
      ],
    },
    Courses: {
      Course: [
        {
          '@Title': 'Honors Chemistry (SCI2001)',
          '@CourseID': 'SCI2001',
          '@Period': '1',
          '@Room': '214B',
          '@Staff': 'Curie, Marie',
          Marks: {
            Mark: {
              '@MarkName': 'MP2',
              '@CalculatedScoreString': 'A',
              '@CalculatedScoreRaw': '94.6',
              GradeCalculationSummary: {
                AssignmentGradeCalc: [
                  {
                    '@Type': 'All Tasks / Assessments',
                    '@Weight': '90%',
                    '@Points': '180',
                    '@PointsPossible': '190',
                    '@CalculatedMark': '94.7%',
                  },
                  {
                    '@Type': 'Practice / Preparation',
                    '@Weight': '10%',
                    '@Points': '47',
                    '@PointsPossible': '50',
                    '@CalculatedMark': '94.0%',
                  },
                ],
              },
              Assignments: {
                Assignment: [
                  {
                    '@GradebookID': 'SG-1',
                    '@Measure': 'Stoichiometry Quiz',
                    '@Type': 'All Tasks / Assessments',
                    '@Date': '11/10/2026',
                    '@DueDate': '11/10/2026',
                    '@Score': '48 / 50',
                    '@Points': '48 / 50',
                    '@Notes': 'Great work',
                  },
                  {
                    '@GradebookID': 'SG-2',
                    '@Measure': 'Mole Lab',
                    '@Type': 'Practice / Preparation',
                    '@Date': '11/05/2026',
                    '@Score': '20 / 20',
                    '@Points': '20 / 20',
                  },
                ],
              },
            },
          },
        },
        {
          '@Title': 'US History',
          '@CourseID': 'SOC3001',
          '@Period': '2',
          '@Staff': 'Lincoln, Abe',
          Marks: {
            Mark: {
              '@MarkName': 'MP2',
              '@CalculatedScoreString': 'N/A',
              '@CalculatedScoreRaw': '',
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
            },
          },
        },
      ],
    },
  },
};

const chemCanvasCourse: CourseData = {
  course: {
    id: 501,
    name: 'Honors Chemistry A',
    course_code: 'SCI2001-01',
    is_favorite: true,
    term: { id: 1, name: 'Fall 2026' },
  },
  assignments: [
    {
      id: 5001,
      name: 'Canvas Unweighted Quiz',
      description: '',
      due_at: new Date(Date.now() - 86400_000).toISOString(),
      points_possible: 100,
      course_id: 501,
      html_url: 'https://school.instructure.com/courses/501/assignments/5001',
      submission_types: ['online_quiz'],
      submission: {
        submitted_at: new Date(Date.now() - 86400_000).toISOString(),
        grade: '80',
        score: 80,
      },
    },
  ],
  modules: [],
  enrollment: {
    id: 951,
    course_id: 501,
    type: 'ObserverEnrollment',
    enrollment_state: 'active',
    grades: {
      current_score: null,
      current_grade: null,
      final_score: null,
      final_grade: null,
    },
  },
};

const artCanvasCourse: CourseData = {
  course: {
    id: 502,
    name: 'Studio Art 1',
    course_code: 'ART101',
    is_favorite: true,
    term: { id: 1, name: 'Fall 2026' },
  },
  assignments: [
    {
      id: 5002,
      name: 'Sketchbook Check',
      description: '',
      due_at: new Date(Date.now() - 86400_000).toISOString(),
      points_possible: 20,
      course_id: 502,
      html_url: 'https://school.instructure.com/courses/502/assignments/5002',
      submission_types: ['online_upload'],
      submission: {
        submitted_at: new Date(Date.now() - 86400_000).toISOString(),
        grade: '17',
        score: 17,
      },
    },
  ],
  modules: [],
  enrollment: {
    id: 952,
    course_id: 502,
    type: 'ObserverEnrollment',
    enrollment_state: 'active',
    grades: {
      current_score: null,
      current_grade: null,
      final_score: null,
      final_grade: null,
    },
  },
};

describe('StudentVUE Official Grades Service & UI Integration', () => {
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

  it('parses Badgerfish Synergy gradebook, single objects vs arrays, N/A scores, categories, and assignments', () => {
    const snap = parseSynergyGradebook(sampleRawSynergyPayload, {
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
      studentName: 'Doe, Sam',
      permId: '222002',
    });

    expect(snap.reportingPeriodName).toBe('MP2');
    expect(snap.reportingPeriods).toHaveLength(2);
    expect(snap.courses).toHaveLength(3);

    const chem = snap.courses[0];
    expect(chem.courseId).toBe('SCI2001');
    expect(chem.scorePercent).toBe(94.6);
    expect(chem.letterGrade).toBe('A');
    expect(chem.categories).toHaveLength(2);
    expect(chem.categories[0].weightPercent).toBe(90);
    expect(chem.assignments).toHaveLength(2);
    expect(chem.assignments[0].title).toBe('Stoichiometry Quiz');
    expect(chem.assignments[0].scorePercent).toBe(96);
    expect(chem.assignments[0].notes).toBe('Great work');

    const hist = snap.courses[1];
    expect(hist.scorePercent).toBeNull();
    expect(hist.letterGrade).toBeUndefined();
  });

  it('overrides Canvas estimated grade with official Synergy total in getEffectiveCourseGrade, falling back when N/A or unmatched', () => {
    const snap = parseSynergyGradebook(sampleRawSynergyPayload, {
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
    });

    const match = matchSynergyCourseToCanvas(chemCanvasCourse, snap);
    expect(match).not.toBeNull();
    expect(match!.course.courseId).toBe('SCI2001');

    const officialEffective = getEffectiveCourseGrade(chemCanvasCourse, {
      synergyCourse: match!.course,
      reportingPeriodName: snap.reportingPeriodName,
    });
    expect(officialEffective?.isOfficial).toBe(true);
    expect(officialEffective?.isEstimated).toBe(false);
    expect(officialEffective?.source).toBe('studentvue_official');
    expect(officialEffective?.score).toBe(94.6);
    expect(officialEffective?.letter).toBe('A');

    // N/A Synergy course falls back to Canvas score
    const naEffective = getEffectiveCourseGrade(chemCanvasCourse, {
      synergyCourse: snap.courses[1],
      reportingPeriodName: snap.reportingPeriodName,
    });
    expect(naEffective?.isOfficial).toBeUndefined();
    expect(naEffective?.isEstimated).toBe(true);
    expect(naEffective?.score).toBe(80);

    // Unmatched Art course stays Canvas Est (85%)
    expect(matchSynergyCourseToCanvas(artCanvasCourse, snap)).toBeNull();
  });

  it('supports manual course mapping overrides and removes Synergy grade snapshot when deleting student profile', () => {
    const profile = saveStudent({
      name: 'Sam Doe',
      domain: 'mcpsmd.instructure.com',
      apiKey: 'tok-123',
      color: 'blue',
    });

    const snap = parseSynergyGradebook(sampleRawSynergyPayload, {
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
    });
    saveStudentVueGrades(profile.id, snap);
    expect(getSavedStudentVueGrades(profile.id)?.courses).toHaveLength(3);

    // Map Art course manually to Calculus, then exclude it
    const updated = updateStudentVueCourseMapping(profile.id, 502, snap.courses[2].key);
    expect(matchSynergyCourseToCanvas(artCanvasCourse, updated)?.isManual).toBe(true);
    expect(matchSynergyCourseToCanvas(artCanvasCourse, updated)?.course.title).toContain('AP Calculus AB');

    const excluded = updateStudentVueCourseMapping(profile.id, 502, SYNERGY_NO_MATCH_KEY);
    expect(matchSynergyCourseToCanvas(artCanvasCourse, excluded)).toBeNull();

    // Deleting student removes persisted grades snapshot
    removeStudent(profile.id);
    expect(getSavedStudentVueGrades(profile.id)).toBeNull();
  });

  it('surfaces Official Synergy course totals on Sidebar and Overview, and drills down into dedicated category/assignment view', async () => {
    const user = userEvent.setup();
    const snap = parseSynergyGradebook(sampleRawSynergyPayload, {
      districtDomain: 'md-mcps-psv.edupoint.com',
      isParent: true,
    });
    saveStudentVueGrades('stu-sync-1', snap);

    render(
      <Dashboard
        data={[chemCanvasCourse, artCanvasCourse]}
        apiKey="tok"
        canvasUrl="mcpsmd.instructure.com"
        useProxy={true}
        currentStudentId="stu-sync-1"
        currentStudentName="Sam Doe"
        onLogout={vi.fn()}
        onDebug={vi.fn()}
      />
    );

    // Sidebar badge for Chemistry shows 94.6% Official, while Art shows 85% Est
    const sidebarChemBadge = await screen.findByTestId('sidebar-inspect-grade-501');
    expect(within(sidebarChemBadge).getByText('Official')).toBeInTheDocument();
    expect(within(sidebarChemBadge).getByText('(94.6%)')).toBeInTheDocument();

    const sidebarArtBadge = screen.getByTestId('sidebar-inspect-grade-502');
    expect(within(sidebarArtBadge).getByText('Est')).toBeInTheDocument();
    expect(within(sidebarArtBadge).getByText('85%')).toBeInTheDocument();

    // Overview grid card grade button for Chemistry shows Official and opens Synergy drill-down directly
    const overviewChemGradeBtn = screen.getByTestId('overview-grade-drill-501');
    expect(within(overviewChemGradeBtn).getByText('Official')).toBeInTheDocument();
    expect(within(overviewChemGradeBtn).getByText('94.6%')).toBeInTheDocument();

    await user.click(overviewChemGradeBtn);

    const modal = await screen.findByTestId('course-grade-inspector-modal');
    expect(modal).toBeInTheDocument();

    // Opens directly to Official Gradebook (Synergy) detail panel
    const synergyPanel = within(modal).getByTestId('synergy-detail-panel');
    expect(within(synergyPanel).getByText('94.6%')).toBeInTheDocument();
    expect(within(synergyPanel).getAllByText('All Tasks / Assessments').length).toBeGreaterThanOrEqual(2);
    expect(within(synergyPanel).getByText('90%')).toBeInTheDocument();
    expect(within(synergyPanel).getByText('Stoichiometry Quiz')).toBeInTheDocument();
    expect(within(synergyPanel).getByText('48 / 50')).toBeInTheDocument();
    expect(within(synergyPanel).getByText('Great work')).toBeInTheDocument();
    expect(within(synergyPanel).getByText('Mole Lab')).toBeInTheDocument();

    // Manual course mapper lets user switch mapped Synergy course and persists immediately
    const mapperSelect = within(synergyPanel).getByTestId('synergy-course-mapper-select');
    await user.selectOptions(mapperSelect, snap.courses[2].key);

    await waitFor(() => {
      expect(within(synergyPanel).getByText('86.4%')).toBeInTheDocument();
      expect(within(synergyPanel).getAllByText('AP Calculus AB (MAT4010)').length).toBeGreaterThanOrEqual(1);
    });
  });
});
