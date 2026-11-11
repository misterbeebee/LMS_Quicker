

export enum ViewMode {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  DEBUG = 'DEBUG',
}

export enum ExportFormat {
  JSON = 'JSON',
  CSV = 'CSV',
  XML = 'XML',
}

export const ALL_COURSES_ID = -1;

export type SortKey = 'id' | 'name' | 'due_at' | 'status' | 'score' | 'points' | 'locked' | 'submitted' | 'type' | 'course' | 'hidden';
export type FilterMode = 'include' | 'exclude';

export interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export interface UserSettings {
  timestamp: string;
  viewPreferences: {
    showHiddenCourses: boolean;
    
    // New Show Preferences (Replacing 'hide' logic)
    showSubmitted: boolean; // Renamed from showCompleted
    showObsolete: boolean;
    showPastTerms: boolean;
    
    showScores: boolean; // New: Show/Hide grades globally

    showIds: boolean;
    showCalendarEvents?: boolean; // Experimental: Merge future calendar events into Assignments & Overview
    hidePastEvents?: boolean; // Toggle to hide past calendar events
    // Renamed from showManuallyHidden
    showArchived: boolean;
    // Renamed from hiddenAssignmentIds
    archivedAssignmentIds: number[];
    // New: Manually marked as submitted
    markedAsSubmittedIds?: number[];
    
    // Legacy support types (optional)
    showCompleted?: boolean;
    showManuallyHidden?: boolean;
    hiddenAssignmentIds?: number[];
    hideSubmittedGraded?: boolean;
    hideObsolete?: boolean;
    hidePreviousQuarters?: boolean;

    activeTab: string;
    isSidebarCollapsed: boolean;
    assignmentsViewMode?: 'list' | 'board';
  };
  context: {
    selectedCourseId: number | null;
    visibleCourseIds?: number[];
  };
  tableState: {
    sortConfig: SortConfig | null;
    columnFilters: Record<string, string[]>; // Stored as arrays for JSON serialization
    filterModes?: Record<string, FilterMode>;
  };
  courseCustomizations?: Record<number, { abbreviation?: string; emoji?: string }>;
  courseOrder?: number[];
  gradeScaleConfig?: {
    greenMin: number;
    yellowMin: number;
    orangeMin: number;
    enableBlending: boolean;
  };
}

// Canvas API Types (Simplified)
export interface CanvasTerm {
  id: number;
  name: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  sis_course_id?: string | null;
  start_at?: string;
  end_at?: string;
  is_favorite?: boolean;
  term?: CanvasTerm;
  nickname?: string;
  original_name?: string;
}

export interface CanvasSubmissionComment {
  id: number;
  author_name: string;
  comment: string;
  created_at: string;
  author_id?: number;
}

export interface CanvasSubmission {
  submitted_at: string | null;
  grade: string | null;
  score: number | null;
  graded_at?: string | null;
  submission_comments?: CanvasSubmissionComment[];
  user_id?: number;
}

export interface CanvasCalendarEvent {
  id: number;
  title: string;
  start_at: string | null;
  end_at: string | null;
  description?: string;
  context_code?: string;
  effective_context_code?: string;
  all_day?: boolean;
  all_day_date?: string;
  html_url?: string;
  location_name?: string;
  location_address?: string;
  workflow_state?: string;
  context_name?: string;
  context_type?: string;
  context_id?: number;
  type?: string;
  assignment?: any;
}

export interface CanvasRubricRating {
  id?: string;
  points: number;
  description?: string;
}

export interface CanvasRubricCriterion {
  id: string;
  points: number;
  description: string;
  long_description?: string;
  ratings?: CanvasRubricRating[];
}

export interface CanvasScoreStatistics {
  min?: number;
  max?: number;
  mean?: number;
}

export interface CanvasAssignmentDetail extends CanvasAssignment {
  unlock_at?: string | null;
  lock_at?: string | null;
  grading_type?: string;
  allowed_extensions?: string[];
  rubric?: CanvasRubricCriterion[];
  rubric_settings?: {
    points_possible?: number;
    title?: string;
  };
  score_statistics?: CanvasScoreStatistics;
  lock_explanation?: string;
  has_submitted_submissions?: boolean;
  omit_from_final_grade?: boolean;
  allowed_attempts?: number;
  peer_reviews?: boolean;
}

export interface CanvasAssignment {
  id: number;
  description: string;
  due_at: string | null;
  points_possible: number;
  name: string;
  course_id: number;
  html_url: string;
  submission?: CanvasSubmission;
  locked_for_user?: boolean;
  submission_types: string[]; // Added for "on_paper" detection
  manual_marked_submitted?: boolean; // App-specific override
  is_calendar_event?: boolean; // Experimental: calendar event merged into assignments
  location_name?: string;
  // Optional pre-fetched / detailed fields
  unlock_at?: string | null;
  lock_at?: string | null;
  grading_type?: string;
  allowed_extensions?: string[];
  rubric?: CanvasRubricCriterion[];
  rubric_settings?: {
    points_possible?: number;
    title?: string;
  };
  score_statistics?: CanvasScoreStatistics;
  lock_explanation?: string;
}

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: string;
  module_id: number;
  html_url?: string;
  content_id?: number;
  content_details?: {
    due_at?: string | null;
    lock_at?: string | null;
    unlock_at?: string | null;
  };
}

export interface CanvasModule {
  id: number;
  name: string;
  course_id: number;
  items: CanvasModuleItem[];
  unlock_at?: string | null;
  position?: number;
  state?: string;
  completed_at?: string | null;
}

export interface CanvasEnrollment {
  id: number;
  course_id: number;
  grades: {
    current_score: number | null;
    current_grade: string | null;
    final_score: number | null;
    final_grade: string | null;
  };
  type: string;
}

export interface CanvasTodoItem {
  type: string;
  assignment?: CanvasAssignment;
  quiz?: any;
  ignore?: string; // URL to ignore/dismiss
  ignore_permanently?: string;
  html_url: string;
  context_name?: string;
  course_id?: number;
  context_id: number; // usually course_id
}

// Aggregated Data Structure for the App
export interface CourseData {
  course: CanvasCourse;
  assignments: CanvasAssignment[];
  modules: CanvasModule[];
  enrollment?: CanvasEnrollment; // Grades live here typically
}

export interface StudentProfile {
  id: string;
  name: string;
  domain: string;
  apiKey: string;
  useProxy?: boolean;
  batchSize?: number;
  color?: string; // 'blue' | 'emerald' | 'purple' | 'amber' | 'rose'
  createdAt?: string;
}

export interface AppState {
  view: ViewMode;
  apiKey: string;
  canvasUrl: string;
  data: CourseData[];
  loading: boolean;
  error: string | null;
  useProxy: boolean;
  todoItems?: CanvasTodoItem[];
  currentStudentId?: string;
  studentProfiles?: StudentProfile[];
}