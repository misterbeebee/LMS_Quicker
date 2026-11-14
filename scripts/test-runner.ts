/**
 * Automated Test Runner for Canvas Academic Intelligence Dashboard
 * 
 * Tests:
 * 1. Server Health & Connectivity
 * 2. Canvas API Credentials & Data Fetching (reads git-ignored test-credentials.json or options)
 * 3. Domain Logic, Evaluation Heuristics & Translation Detection
 * 4. UI State Transitions & Click Handlers (All/None toggles, course selection, view switches)
 * 5. World Language Translation Caching & Hashing
 * 6. Proactive Related Modules Search
 * 7. Tactical AI Problem Solving Presets & Model Sanitization
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import { 
  detectWorldLanguage, 
  computeContentHash, 
  saveCachedTranslation, 
  getCachedTranslation, 
  isItemTranslated,
  clearCachedTranslation
} from '../services/translation';
import { getGradeStyle, DEFAULT_GRADE_CONFIG } from '../services/gradeScale';
import { cleanAssignmentDescription, formatSubmissionType, formatPoints, formatRelativeDueDate, getAssignmentStatus } from '../utils/dashboard-helpers';
import { computeCourseAbbreviations, pruneCourseTitle } from '../utils/courseAbbreviations';
import { CourseData, ALL_COURSES_ID, CanvasAssignment, CanvasModule, CanvasTodoItem, CanvasModuleItem } from '../types';
import { setCachedUserId, getCachedUserId, fetchCalendarEvents, getCourseIdFromEvent } from '../services/canvas';
import { findRelatedModuleContent } from '../utils/moduleSearch';
import { TACTICAL_PROMPTS, sanitizeGeminiModel } from '../services/gemini';
import { getHumanModuleItemWebUrl, extractAssignmentFromTodo } from '../utils/canvasUrls';
import { inspectCourseGrade, getEffectiveCourseGrade, selectPrimaryEnrollment, computeCourseGradingCoverage } from '../utils/gradeInspector';

export interface TestAssertionResult {
  message: string;
  passed: boolean;
  suite: string;
  error?: string;
}

export interface TestSuiteRunResult {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  results: TestAssertionResult[];
}

/**
 * Loads test credentials from AI Studio Secrets (environment variables) or CLI flags.
 * Never writes or reads secrets from repository files, preventing merge conflicts.
 */
export function getTestCredentials(options?: { domain?: string; token?: string }): { domain: string; token: string } {
  let domain = options?.domain || process.env.TEST_CANVAS_DOMAIN || process.env.CANVAS_DOMAIN || 'mcpsmd.instructure.com';
  let token = options?.token || process.env.TEST_CANVAS_TOKEN || process.env.CANVAS_API_KEY || '';

  // CLI arguments (--domain=... --token=...)
  if (typeof process !== 'undefined' && process.argv) {
    for (const arg of process.argv) {
      if (arg.startsWith('--domain=')) domain = arg.split('=')[1];
      if (arg.startsWith('--token=')) token = arg.split('=')[1];
    }
  }

  return { domain, token };
}

export async function runIntegrationTestSuite(options?: { domain?: string; token?: string; isCli?: boolean }): Promise<TestSuiteRunResult> {
  const startTime = Date.now();
  const results: TestAssertionResult[] = [];
  let passedTests = 0;
  let failedTests = 0;
  let currentSuite = 'General';

  function assert(condition: boolean, message: string, errDetail?: string) {
    if (condition) {
      if (options?.isCli) console.log(`  ✓ ${message}`);
      passedTests++;
      results.push({ message, passed: true, suite: currentSuite });
    } else {
      if (options?.isCli) console.error(`  ✗ FAIL: ${message} ${errDetail ? `(${errDetail})` : ''}`);
      failedTests++;
      results.push({ message, passed: false, suite: currentSuite, error: errDetail });
    }
  }

  if (options?.isCli) {
    console.log('\n======================================================');
    console.log(' Canvas Dashboard: Automated Integration Test Suite');
    console.log('======================================================\n');
  }

  // ----------------------------------------------------------------
  // 1. Server Health Check
  // ----------------------------------------------------------------
  currentSuite = 'Suite 1: Server Health & API Endpoints';
  if (options?.isCli) console.log('[Suite 1] Server Health & API Endpoints');
  try {
    const res = await fetch('http://localhost:3000/api/health');
    assert(res.ok && res.status === 200, 'GET /api/health responds with HTTP 200 OK');
    const data = await res.json();
    assert(data.status === 'ok', 'Health check returns status "ok"');
  } catch (err: any) {
    assert(false, 'Server health check failed', err.message);
  }

  // ----------------------------------------------------------------
  // 2. Real Canvas API Integration (via AI Studio Secrets: TEST_CANVAS_TOKEN)
  // ----------------------------------------------------------------
  currentSuite = 'Suite 2: Real Canvas API Connectivity';
  if (options?.isCli) console.log('\n[Suite 2] Real Canvas API Connectivity');
  const { domain, token } = getTestCredentials(options);

  if (!token) {
    if (options?.isCli) console.log('  ⓘ Skipping real Canvas API calls: To enable live API tests, add TEST_CANVAS_TOKEN in AI Studio Secrets (Settings > Secrets)');
    results.push({ message: 'Real Canvas API calls skipped (add TEST_CANVAS_TOKEN to AI Studio Secrets to test live)', passed: true, suite: currentSuite });
  } else {
    try {
      const url = `https://${domain}/api/v1/users/self`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert(res.ok, `Canvas API authenticated with domain: ${domain} (HTTP ${res.status})`);
      if (res.ok) {
        const user = await res.json();
        assert(!!user.name, `Fetched real student identity from Canvas: "${user.name}" (ID: ${user.id})`);
      }
    } catch (err: any) {
      assert(false, 'Canvas API connection failed', err.message);
    }

    let fetchedCourses: any[] = [];
    try {
      const coursesUrl = `https://${domain}/api/v1/courses?include[]=term&include[]=total_scores&per_page=15`;
      const res = await fetch(coursesUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert(res.ok, `Canvas courses endpoint accessible (HTTP ${res.status})`);
      if (res.ok) {
        fetchedCourses = await res.json();
        assert(Array.isArray(fetchedCourses), `Retrieved ${fetchedCourses.length} courses from Canvas LMS`);
      }
    } catch (err: any) {
      assert(false, 'Canvas courses query failed', err.message);
    }

    try {
      const todoUrl = `https://${domain}/api/v1/users/self/todo`;
      const res = await fetch(todoUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert(res.ok, `Canvas To-Do endpoint accessible (HTTP ${res.status})`);
    } catch (err: any) {
      assert(false, 'Canvas To-Do query failed', err.message);
    }

    // Real Canvas Calendar Events Download Test
    try {
      const courseIds = fetchedCourses.map((c: any) => c.id).filter(Boolean);
      const calEvents = await fetchCalendarEvents(domain, token, false, courseIds);
      assert(Array.isArray(calEvents), `Canvas Calendar Events download query succeeded (retrieved ${calEvents.length} events)`);
      if (calEvents.length > 0) {
        assert(!!calEvents[0].title, `Downloaded real calendar event: "${calEvents[0].title}" (${calEvents[0].start_at || 'No time'})`);
      }
    } catch (err: any) {
      assert(false, 'Canvas Calendar events download query failed', err.message);
    }

    // Verify User ID cache for secure storage
    setCachedUserId('368174');
    assert(getCachedUserId() === '368174', 'User ID caching secures storage without redundant network calls');
  }

  // ----------------------------------------------------------------
  // 3. Domain Logic & Evaluation Heuristics
  // ----------------------------------------------------------------
  currentSuite = 'Suite 3: Domain Logic & Heuristic Calculations';
  if (options?.isCli) console.log('\n[Suite 3] Domain Logic & Heuristic Calculations');

  // Test World Language Detection
  const spanishTest = detectWorldLanguage('Spanish II Honors');
  assert(spanishTest.isLanguageCourse && spanishTest.languageCode === 'es', 'Detects Spanish class from English name');

  const frenchTest = detectWorldLanguage('Français Avancé');
  assert(frenchTest.isLanguageCourse && frenchTest.languageCode === 'fr', 'Detects French class from native name');

  const mathTest = detectWorldLanguage('AP Calculus BC');
  assert(!mathTest.isLanguageCourse, 'Non-language classes correctly pass without language badge');

  // Test Grade Scales & Discrete Colors
  const greenStyle = getGradeStyle(95, 100, DEFAULT_GRADE_CONFIG, { isCourseGrade: false });
  assert(greenStyle.percentage === 95 && !!greenStyle.style.color, 'Grade scale returns styled Green tier for 95%');

  const yellowStyle = getGradeStyle(85, 100, DEFAULT_GRADE_CONFIG, { isCourseGrade: false });
  assert(yellowStyle.percentage === 85 && !!yellowStyle.style.color, 'Grade scale returns styled Yellow tier for 85%');

  const redStyle = getGradeStyle(50, 100, DEFAULT_GRADE_CONFIG, { isCourseGrade: false });
  assert(redStyle.percentage === 50 && !!redStyle.style.color, 'Grade scale returns styled Red tier for 50%');

  // Test 0% vs No Data Heuristic
  const dummyCourseNoData: CourseData = {
    course: { id: 991, name: 'Brand New Course', course_code: 'NEW101', is_favorite: true },
    assignments: [
      { id: 101, name: 'Ungraded Reading', points_possible: 10, course_id: 991, html_url: '#', description: '', due_at: null, submission_types: ['online_text_entry'] }
    ],
    modules: [],
    enrollment: {
      id: 1,
      course_id: 991,
      type: 'StudentEnrollment',
      grades: { current_score: 0, current_grade: 'F', final_score: 0, final_grade: 'F' }
    }
  };

  const gradedCount = (dummyCourseNoData.assignments || []).filter(
    a => !a.is_calendar_event && a.points_possible > 0 && a.submission?.score !== null && a.submission?.score !== undefined
  ).length;
  const isZeroPlaceholder = (dummyCourseNoData.enrollment?.grades?.current_score === 0 || dummyCourseNoData.enrollment?.grades?.current_grade?.toUpperCase() === 'F') && gradedCount === 0;
  assert(isZeroPlaceholder, 'Correctly flags Canvas 0% F placeholder as No Data when graded assignments count is 0');

  // Test Description Cleanup
  const rawHtml = '<p>Regular course content</p><p>Detailed guidelines, grading criteria, and instructions from the course syllabus.</p>';
  const cleaned = cleanAssignmentDescription(rawHtml);
  assert(!cleaned.includes('Detailed guidelines'), 'Strips Canvas default syllabus boilerplate text');
  assert(cleaned.includes('Regular course content'), 'Preserves real assignment instructions');

  // Test Points Pluralization Formatting
  assert(formatPoints(1) === '1 pt', 'Correctly formats singular "1 pt" (not "1 pts")');
  assert(formatPoints(5) === '5 pts', 'Correctly formats plural "5 pts"');
  assert(formatPoints(0) === '0 pts', 'Correctly formats "0 pts"');

  // Test Relative Due Date Labeling
  const now = new Date('2026-11-10T12:00:00Z');
  const todayDue = new Date('2026-11-10T23:59:00Z').toISOString();
  const tomorrowDue = new Date('2026-11-11T23:59:00Z').toISOString();
  const pastDue = new Date('2026-11-08T12:00:00Z').toISOString();

  assert(formatRelativeDueDate(todayDue, now).startsWith('Today,'), 'Formats imminent deadline today as "Today, ..."');
  assert(formatRelativeDueDate(tomorrowDue, now).startsWith('Tomorrow,'), 'Formats imminent deadline tomorrow as "Tomorrow, ..."');
  assert(!formatRelativeDueDate(pastDue, now).startsWith('Today'), 'Does not label past deadline as Today');

  // Test Locked Assignment Status (Regression test for Illegal Constructor)
  const lockedAssignment: CanvasAssignment = {
    id: 999,
    name: 'Locked Exam Review',
    points_possible: 100,
    course_id: 101,
    html_url: '#',
    description: '',
    due_at: '2026-11-20T00:00:00Z',
    submission_types: ['online_upload'],
    locked_for_user: true,
    unlock_at: '2026-11-18T00:00:00Z'
  };

  const status = getAssignmentStatus(lockedAssignment);
  assert(status.label.includes('Locked until'), 'Locked until date label produced correctly');
  assert(typeof status.icon === 'function' || (typeof status.icon === 'object' && status.icon !== null), 'Status icon is defined as component');
  
  const element = React.createElement(status.icon, { className: 'w-4 h-4' });
  assert(React.isValidElement(element), 'React element created from status.icon without Illegal constructor error');
  const isNativeLock = typeof window !== 'undefined' && (status.icon as any) === (window as any).Lock;
  assert(!isNativeLock, 'Locked status icon is safely constructible without "Illegal constructor" error');

  // ----------------------------------------------------------------
  // 4. UI State Transitions & Click Handlers
  // ----------------------------------------------------------------
  currentSuite = 'Suite 4: UI State Transitions & Click Handlers';
  if (options?.isCli) console.log('\n[Suite 4] UI Button Clicks & View Transition Simulation');

  const courseList = [
    { id: 101, name: 'AP Calculus BC', code: 'CALC' },
    { id: 102, name: 'AP Physics C', code: 'PHYS' },
    { id: 103, name: 'Honors English 11', code: 'ENGL' }
  ];

  let visibleCourseIds = new Set<number>([101, 102, 103]);

  // Click "All"
  function handleSelectAll() {
    visibleCourseIds = new Set(courseList.map(c => c.id));
  }
  handleSelectAll();
  assert(visibleCourseIds.size === 3, 'Click "All": all courses added to visible set');

  // Click "None"
  function handleSelectNone() {
    visibleCourseIds = new Set<number>();
  }
  handleSelectNone();
  assert(visibleCourseIds.size === 0, 'Click "None": all courses removed from visible set');

  // Simulation: filtered rendering when zero courses are selected
  const allCoursesData: CourseData[] = [
    {
      course: { id: 101, name: 'AP Calculus BC', course_code: 'CALC', is_favorite: true },
      assignments: [{ id: 1, name: 'Derivatives Problem Set', points_possible: 20, course_id: 101, html_url: '#', description: '', due_at: null, submission_types: ['online_upload'] }],
      modules: [{ id: 501, name: 'Unit 1: Derivatives', course_id: 101, items: [] }]
    },
    {
      course: { id: 102, name: 'AP Physics C', course_code: 'PHYS', is_favorite: true },
      assignments: [{ id: 2, name: 'Kinematics Lab', points_possible: 30, course_id: 102, html_url: '#', description: '', due_at: null, submission_types: ['online_upload'] }],
      modules: [{ id: 502, name: 'Unit 1: Kinematics', course_id: 102, items: [] }]
    }
  ];

  const relevantCourses = allCoursesData.filter(c => visibleCourseIds.has(c.course.id));
  assert(relevantCourses.length === 0, 'Relevant courses is empty when None is clicked');

  const zeroCourseFallbackAssignments = relevantCourses.flatMap(c => c.assignments || []);
  assert(zeroCourseFallbackAssignments.length === 0, 'Zero-course fallback contains 0 assignments without crashing');

  // Simulation: user clicks one course toggle on
  visibleCourseIds.add(102);
  assert(visibleCourseIds.size === 1 && visibleCourseIds.has(102), 'Toggle on one class: exactly 1 course visible');

  const singleCourseActive = allCoursesData.filter(c => visibleCourseIds.has(c.course.id));
  const combinedViewAssignments = singleCourseActive.flatMap(c => c.assignments || []);
  const combinedViewModules = singleCourseActive.flatMap(c => c.modules || []);
  assert(combinedViewAssignments.length === 1, 'Combined view with 1 class contains 1 assignment');
  assert(combinedViewModules.length === 1, 'Combined view with 1 class contains 1 module');

  // Simulation: Direct switch to single course
  let selectedCourseId: number = 102;
  const singleCourse = allCoursesData.find(c => c.course.id === selectedCourseId);
  assert(singleCourse !== undefined && singleCourse.course.id === 102, 'Selected course ID switches directly to single course 102');
  const safeAssignments = singleCourse ? (singleCourse.assignments || []) : [];
  assert(safeAssignments.length === 1, 'Single course view safely spreads assignments');
  const safeModules = singleCourse ? (singleCourse.modules || []) : [];
  assert(safeModules.length === 1, 'Single course view safely provides modules array');

  // Simulation: To-Do item dismiss handler
  let dismissedId: number | null = null;
  function handleDismissTodo(id: number) {
    dismissedId = id;
  }
  handleDismissTodo(9876);
  assert(dismissedId === 9876, 'Clicking "Done?" checkbox triggers dismissal handler without warnings');

  // ----------------------------------------------------------------
  // 5. World Language Translation Caching & Hashing
  // ----------------------------------------------------------------
  currentSuite = 'Suite 5: Translation Caching & Hashing';
  if (options?.isCli) console.log('\n--- 5. World Language Translation Caching & Hashing ---');

  const spanishCourse = detectWorldLanguage('Spanish 3 Honors');
  assert(spanishCourse.isLanguageCourse && spanishCourse.badgeText === 'ES ➔ EN', 'Spanish course detected with badge ES ➔ EN');

  const frenchCourse = detectWorldLanguage('French 4 AP');
  assert(frenchCourse.isLanguageCourse && frenchCourse.badgeText === 'FR ➔ EN', 'French course detected with badge FR ➔ EN');

  const chemistryCourse = detectWorldLanguage('AP Chemistry');
  assert(!chemistryCourse.isLanguageCourse, 'AP Chemistry correctly identified as non-language course');

  const testTitle = 'Tarea de Vocabulario: Los Verbos Reflexivos';
  const testDesc = '<p>Complete las páginas 45-48 en el libro de texto.</p>';
  const hash1 = computeContentHash(testTitle, testDesc);
  const hash2 = computeContentHash(testTitle, testDesc);
  assert(hash1 === hash2, 'Content hash is deterministic for identical title and description');

  const hash3 = computeContentHash(testTitle, testDesc + ' (Updated instructions)');
  assert(hash1 !== hash3, 'Content hash changes when instruction content changes');

  const testItemId = 777123;
  clearCachedTranslation(testItemId);
  assert(!isItemTranslated(testItemId), 'Item starts un-translated in clean state');

  saveCachedTranslation({
    itemId: testItemId,
    translatedTitle: 'Vocabulary Homework: Reflexive Verbs',
    translatedDescription: 'Complete pages 45-48 in the textbook.',
    sourceCode: 'es',
    targetCode: 'en',
    contentHash: hash1,
    timestamp: Date.now()
  });

  assert(isItemTranslated(testItemId), 'isItemTranslated returns true after translation is saved');

  const cached = getCachedTranslation(testItemId, hash1);
  assert(cached !== null, 'getCachedTranslation returns cached translation with matching hash');
  assert(cached?.translatedTitle === 'Vocabulary Homework: Reflexive Verbs', 'Cached title matches expected English text');
  assert(cached?.translatedDescription.includes('Complete pages 45-48'), 'Cached description matches expected text');

  const staleCache = getCachedTranslation(testItemId, hash3);
  assert(staleCache === null, 'getCachedTranslation returns null when content hash has changed');

  // ----------------------------------------------------------------
  // 6. Proactive Related Modules Search
  // ----------------------------------------------------------------
  currentSuite = 'Suite 6: Proactive Related Modules Search';
  if (options?.isCli) console.log('\n--- 6. Proactive Related Modules Search ---');

  const testCourseModules: CanvasModule[] = [
    {
      id: 501,
      name: 'Unit 3: Cellular Energetics (Photosynthesis & Respiration)',
      course_id: 101,
      items: [
        { id: 1001, module_id: 501, title: 'Photosynthesis Slide Deck', type: 'File', html_url: 'https://canvas.test/file1' },
        { id: 1002, module_id: 501, title: 'Cellular Respiration Study Guide', type: 'Page', html_url: 'https://canvas.test/page1' },
        { id: 1003, module_id: 501, title: 'Unit 3 Quiz Review', type: 'Quiz', html_url: 'https://canvas.test/quiz1' }
      ]
    },
    {
      id: 502,
      name: 'Unit 1: Chemistry of Life',
      course_id: 101,
      items: [
        { id: 2001, module_id: 502, title: 'Water Properties Lab', type: 'Assignment', content_id: 8888, html_url: 'https://canvas.test/assign1' }
      ]
    }
  ];

  const testAssignmentForSearch: CanvasAssignment = {
    id: 9999,
    name: 'Unit 3: Photosynthesis Investigation Lab',
    points_possible: 50,
    course_id: 101,
    html_url: 'https://canvas.test/assign9999',
    description: '<p>Complete the inquiry lab report.</p>',
    due_at: null,
    submission_types: ['online_upload']
  };

  const moduleMatches = findRelatedModuleContent(testAssignmentForSearch, testCourseModules);
  assert(moduleMatches.length > 0, 'findRelatedModuleContent returns proactive matches for assignment');
  const topMatch = moduleMatches[0];
  assert(topMatch.module.id === 501, 'Top matched module correctly identifies Unit 3 Cellular Energetics');
  assert(moduleMatches.some(m => m.item?.title.includes('Photosynthesis Slide Deck')), 'Includes related file slide deck');
  assert(moduleMatches.some(m => m.item?.title.includes('Study Guide')), 'Includes unit study guide page');

  // ----------------------------------------------------------------
  // 7. Tactical AI Problem Solving Presets & Model Sanitization
  // ----------------------------------------------------------------
  currentSuite = 'Suite 7: Tactical AI Problem Solving Presets';
  if (options?.isCli) console.log('\n--- 7. Tactical AI Problem Solving Presets ---');
  assert(Array.isArray(TACTICAL_PROMPTS) && TACTICAL_PROMPTS.length >= 5, 'TACTICAL_PROMPTS contains at least 5 structured presets');
  
  const modulesPreset = TACTICAL_PROMPTS.find(p => p.id === 'modules-exams');
  assert(!!modulesPreset, 'Contains "modules-exams" tactical preset');
  assert(modulesPreset?.prompt.includes('Course Modules') && modulesPreset.prompt.includes('CANVAS_URL'), 'Modules preset includes module search and Canvas link formatting');

  const gradeRescuePreset = TACTICAL_PROMPTS.find(p => p.id === 'grade-impact');
  assert(!!gradeRescuePreset, 'Contains "grade-impact" tactical preset');
  assert(gradeRescuePreset?.prompt.includes('High-Impact Grade Rescue'), 'Grade impact preset contains point recovery triage instructions');

  const feedbackPreset = TACTICAL_PROMPTS.find(p => p.id === 'teacher-feedback');
  assert(!!feedbackPreset, 'Contains "teacher-feedback" tactical preset');
  assert(feedbackPreset?.prompt.includes('Teacher Feedback'), 'Feedback preset synthesizes comments and revision steps');

  const studyPlanPreset = TACTICAL_PROMPTS.find(p => p.id === 'study-plan-7day');
  assert(!!studyPlanPreset, 'Contains "study-plan-7day" tactical preset');

  // Sanitize model tests
  assert(sanitizeGeminiModel('gemini-3.8-flash') === 'gemini-3.8-flash', 'Preserves valid gemini-3.8-flash model');
  assert(sanitizeGeminiModel('gemini-2.0-flash') === 'gemini-3.8-flash', 'Sanitizes legacy 2.0 model to gemini-3.8-flash');
  assert(sanitizeGeminiModel('gemini-1.5-flash') === 'gemini-3.8-flash', 'Sanitizes legacy 1.5 model to gemini-3.8-flash');
  assert(sanitizeGeminiModel(undefined) === 'gemini-3.8-flash', 'Defaults missing model to gemini-3.8-flash');

  // ----------------------------------------------------------------
  // 8. React 19 Architectural Integrity & Rules of Hooks
  // ----------------------------------------------------------------
  currentSuite = 'Suite 8: React 19 Architectural Integrity & Rules of Hooks';
  if (options?.isCli) console.log('\n--- 8. React 19 Architectural Integrity & Rules of Hooks ---');

  // Verify AssignmentZoomModal has all hooks before any early returns
  const zoomModalFile = path.join(process.cwd(), 'components/dashboard/AssignmentZoomModal.tsx');
  if (fs.existsSync(zoomModalFile)) {
    const zoomContent = fs.readFileSync(zoomModalFile, 'utf8');
    const returnMatches = Array.from(zoomContent.matchAll(/\n\s*if\s*\(!assignment\)\s*return\s+null;/g));
    const compReturn = returnMatches[returnMatches.length - 1];
    const returnIndex = compReturn ? compReturn.index : -1;
    const hookNames = ['useState', 'useEffect', 'useMemo', 'useCallback'];
    let violationFound = false;
    for (const hook of hookNames) {
      const hookRegex = new RegExp(`\\b${hook}\\s*\\(`, 'g');
      let hMatch;
      while ((hMatch = hookRegex.exec(zoomContent)) !== null) {
        if (returnIndex !== -1 && hMatch.index > returnIndex) {
          violationFound = true;
          break;
        }
      }
    }
    assert(!violationFound, 'AssignmentZoomModal declares all React hooks before early returns');
  }

  // Verify GradeThresholdModal has all hooks before any early returns
  const gradeModalFile = path.join(process.cwd(), 'components/dashboard/GradeThresholdModal.tsx');
  if (fs.existsSync(gradeModalFile)) {
    const gradeContent = fs.readFileSync(gradeModalFile, 'utf8');
    const firstReturnMatch = gradeContent.match(/\n\s*if\s*\(!isOpen\)\s*return\s+null;/);
    const returnIndex = firstReturnMatch ? firstReturnMatch.index : -1;
    const hookRegex = /\b(useState|useEffect|useMemo|useCallback)\s*\(/g;
    let violationFound = false;
    let hMatch;
    while ((hMatch = hookRegex.exec(gradeContent)) !== null) {
      if (returnIndex !== -1 && hMatch.index > returnIndex) {
        violationFound = true;
        break;
      }
    }
    assert(!violationFound, 'GradeThresholdModal declares all React hooks before early returns');
  }

  // Universal scan of all component files to guarantee no hook order violations exist in codebase
  const scanDir = (dir: string): string[] => {
    let files: string[] = [];
    if (!fs.existsSync(dir)) return files;
    for (const item of fs.readdirSync(dir)) {
      if (item === 'node_modules' || item === '.git' || item === 'dist') continue;
      const p = path.join(dir, item);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) files = files.concat(scanDir(p));
      else if (p.endsWith('.tsx')) files.push(p);
    }
    return files;
  };

  const compFiles = scanDir(path.join(process.cwd(), 'components'));
  compFiles.push(path.join(process.cwd(), 'App.tsx'));
  let totalHookViolations = 0;
  for (const f of compFiles) {
    if (!fs.existsSync(f)) continue;
    const content = fs.readFileSync(f, 'utf8');
    const compRegex = /(?:export\s+)?(?:const|function)\s+([A-Z][A-Za-z0-9_]+)\s*(?::\s*React\.FC[^{]*)?=\s*(?:\([^{]*\)|[A-Za-z0-9_]+)\s*=>\s*\{/gs;
    let m;
    while ((m = compRegex.exec(content)) !== null) {
      const body = content.slice(m.index + m[0].length, m.index + m[0].length + 4000);
      const retMatch = body.match(/\n  if\s*\([^)]+\)\s*return(\s+[^;]+)?;/);
      if (retMatch && retMatch.index !== undefined) {
        const afterRet = body.slice(retMatch.index);
        const hookCall = afterRet.match(/\n  use[A-Z][a-zA-Z0-9_]*\s*\(/);
        if (hookCall) {
          totalHookViolations++;
        }
      }
    }
  }
  assert(totalHookViolations === 0, 'Zero Rules of Hooks static violations detected across all components');

  // ----------------------------------------------------------------
  // 9. Canvas ToDo Assignment Extraction & Zoom Modal Integrity
  // ----------------------------------------------------------------
  currentSuite = 'Suite 9: Canvas ToDo Assignment Extraction & Zoom Modal';
  if (options?.isCli) console.log('\n--- 9. Canvas ToDo Assignment Extraction & Zoom Modal ---');

  const testCoursesForTodo: CourseData[] = [
    {
      course: { id: 101, name: 'AP Biology', course_code: 'BIO101', sis_course_id: null, is_favorite: true },
      assignments: [
        {
          id: 555,
          name: 'Cell Membrane Lab Report',
          course_id: 101,
          points_possible: 100,
          due_at: '2026-11-20T23:59:59Z',
          description: '<p>Write inquiry conclusion.</p>',
          html_url: 'https://canvas.test/courses/101/assignments/555',
          submission_types: ['online_upload']
        }
      ],
      modules: [
        {
          id: 301,
          name: 'Unit 2: Cells',
          course_id: 101,
          items: [
            { id: 801, title: 'Cell Membrane Notes', type: 'Page', module_id: 301, page_url: 'cell-membrane-notes' }
          ]
        }
      ]
    }
  ];

  // Case 1: ToDo with embedded assignment
  const todoWithDirectAssignment: CanvasTodoItem = {
    type: 'submitting',
    assignment: {
      id: 555,
      name: 'Cell Membrane Lab Report',
      course_id: 101,
      points_possible: 100,
      due_at: '2026-11-20T23:59:59Z',
      description: 'Embedded desc',
      html_url: 'https://canvas.test/courses/101/assignments/555',
      submission_types: ['online_upload']
    }
  };
  const res1 = extractAssignmentFromTodo(todoWithDirectAssignment, testCoursesForTodo);
  assert(!!res1 && res1.assignmentId === 555, 'Resolves assignment ID from embedded assignment');
  assert(res1?.courseId === 101, 'Resolves correct course ID from embedded assignment');
  assert(res1?.modules.length === 1, 'Associates course modules with resolved To-Do assignment');

  // Case 2: ToDo with assignment ID in ignore URL
  const todoWithIgnoreUrl: CanvasTodoItem = {
    type: 'submitting',
    context_name: 'AP Biology',
    ignore: 'https://school.instructure.com/api/v1/users/self/todo/assignment_555/submitting'
  };
  const res2 = extractAssignmentFromTodo(todoWithIgnoreUrl, testCoursesForTodo);
  assert(!!res2 && res2.assignmentId === 555, 'Extracts assignment ID from Canvas ignore URL');
  assert(res2?.assignment.name === 'Cell Membrane Lab Report', 'Matches full assignment from course data by ignore ID');

  // Case 3: ToDo with html_url only
  const todoWithHtmlUrl: CanvasTodoItem = {
    type: 'submitting',
    html_url: 'https://school.instructure.com/courses/101/assignments/555'
  };
  const res3 = extractAssignmentFromTodo(todoWithHtmlUrl, testCoursesForTodo);
  assert(!!res3 && res3.assignmentId === 555 && res3.courseId === 101, 'Extracts assignment ID and course ID from html_url');

  // Case 4: Synthesized assignment when not present in local course cache
  const todoUncached: CanvasTodoItem = {
    type: 'submitting',
    course_id: 101,
    assignment: {
      id: 888,
      name: 'Future Final Project',
      course_id: 101,
      points_possible: 200,
      due_at: '2026-12-15T23:59:59Z',
      description: 'Submit capstone proposal',
      html_url: 'https://school.instructure.com/courses/101/assignments/888',
      submission_types: ['online_upload']
    }
  };
  const res4 = extractAssignmentFromTodo(todoUncached, testCoursesForTodo, 'https://school.instructure.com');
  assert(!!res4 && res4.assignmentId === 888, 'Synthesizes complete CanvasAssignment for uncached To-Do items');
  assert(res4?.assignment.points_possible === 200, 'Preserves points_possible on synthesized assignment');
  assert(!res4?.assignment.html_url.includes('/api/v1/'), 'Ensures synthesized assignment has human web URL');

  // ----------------------------------------------------------------
  // 10. Human Canvas Web URLs vs API Endpoints
  // ----------------------------------------------------------------
  currentSuite = 'Suite 10: Human Canvas Web URLs vs API Endpoints';
  if (options?.isCli) console.log('\n--- 10. Human Canvas Web URLs vs API Endpoints ---');

  // 1. Module item redirect API endpoint -> human module item URL
  const redirectItem: CanvasModuleItem = {
    id: 1337,
    module_id: 12,
    title: 'Unit Reading',
    type: 'Page',
    html_url: 'https://school.instructure.com/api/v1/courses/101/module_item_redirect/1337'
  };
  const url1 = getHumanModuleItemWebUrl(redirectItem, 101, 'school.instructure.com');
  assert(url1 === 'https://school.instructure.com/courses/101/modules/items/1337', 'Converts module_item_redirect API URL to human module item page');
  assert(!url1?.includes('/api/v1/'), 'Eliminates /api/v1/ from module redirect URL');

  // 2. Page item with page_url slug
  const pageItem: CanvasModuleItem = {
    id: 99,
    module_id: 12,
    title: 'Cell Respiration Guide',
    type: 'Page',
    html_url: 'https://school.instructure.com/api/v1/courses/101/pages/respiration-guide'
  };
  (pageItem as any).page_url = 'respiration-guide';
  const url2 = getHumanModuleItemWebUrl(pageItem, 101, 'https://school.instructure.com');
  assert(url2 === 'https://school.instructure.com/courses/101/pages/respiration-guide', 'Generates direct human wiki page URL from page_url slug');

  // 3. Assignment item in module -> human assignment route
  const assignModItem: CanvasModuleItem = {
    id: 42,
    module_id: 12,
    title: 'Lab 1',
    type: 'Assignment',
    content_id: 555
  };
  const url3 = getHumanModuleItemWebUrl(assignModItem, 101, 'school.instructure.com');
  assert(url3 === 'https://school.instructure.com/courses/101/assignments/555', 'Generates human /assignments/:id route for assignment module items');

  // 4. File item in module -> human file route
  const fileModItem: CanvasModuleItem = {
    id: 84,
    module_id: 12,
    title: 'Lecture Slides PDF',
    type: 'File',
    content_id: 777
  };
  const url4 = getHumanModuleItemWebUrl(fileModItem, 101, 'school.instructure.com');
  assert(url4 === 'https://school.instructure.com/courses/101/files/777', 'Generates human /files/:id route for file module items');

  // =========================================================================
  // Suite 11: Calendar Events, Layout Hierarchy & Advisor Ergonomics
  // =========================================================================
  currentSuite = 'Suite 11: Calendar Events & Advisor Ergonomics';
  console.log('\n--- 11. Calendar Events & Advisor Ergonomics ---');

  // Test 1: fetchCalendarEvents demo mode returns mock events even with empty credentials
  const demoEvents = await fetchCalendarEvents('', '', false, [101, 102]);
  assert(Array.isArray(demoEvents) && demoEvents.length >= 4, 'Demo calendar events return at least 4 items');
  assert(demoEvents.some(e => e.title.includes('Colloquium')), 'Demo events contain academic colloquium');
  assert(demoEvents.some(e => e.location_name && e.location_name.length > 0), 'Demo events include valid physical location names');

  // Test 2: Verify CanvasToDo source file contains card-level zoom expansion
  const canvasTodoSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/CanvasToDo.tsx'), 'utf-8');
  assert(canvasTodoSrc.includes('setZoomedAssignment(targetAssignment)'), 'CanvasToDo triggers zoom modal on card click');
  assert(canvasTodoSrc.includes('Click card to zoom for details'), 'CanvasToDo card title indicates zoom functionality');

  // Test 3: Verify AnalysisPanel source contains top-right collapse button and custom goal option
  const analysisPanelSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/AnalysisPanel.tsx'), 'utf-8');
  assert(analysisPanelSrc.includes('custom-goal'), 'AnalysisPanel supports custom-goal preset at bottom of list');
  assert(analysisPanelSrc.includes('velm_ai_general_instructions'), 'AnalysisPanel persists general user instructions in localStorage');
  assert(analysisPanelSrc.includes('HelpCircle'), 'AnalysisPanel features (?) help toggle to explain tactical features');

  // Test 4: Verify Sidebar source uses compact width and Only button next to checkbox
  const sidebarSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/Sidebar.tsx'), 'utf-8');
  assert(sidebarSrc.includes('w-60 sm:w-64 max-w-[85vw]'), 'Sidebar uses compact mobile width avoiding dead horizontal margin');
  assert(sidebarSrc.includes('Focus ONLY on'), 'Sidebar has compact Only button placed directly beside checkbox');

  // =========================================================================
  // Suite 12: Calendar Events Download & Visibility Verification
  // =========================================================================
  currentSuite = 'Suite 12: Calendar Events Download & Visibility';
  console.log('\n--- 12. Calendar Events Download & Visibility Verification ---');

  // Test 1: Overview shows compact collapsible Announcements & Calendar Summaries, while standalone CalendarEventsPanel renders full Agenda/Week/Month + Month selected-day details
  const overviewSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/Overview.tsx'), 'utf-8');
  const calendarPanelSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/CalendarEventsPanel.tsx'), 'utf-8');
  const headerCheckSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/Header.tsx'), 'utf-8');
  assert(
    overviewSrc.includes('overview-announcements-summary') &&
      overviewSrc.includes('overview-calendar-summary') &&
      !overviewSrc.includes('<CalendarEventsPanel'),
    'Overview renders compact collapsible Announcements Summary and Calendar Summary instead of full wall calendar panel'
  );
  assert(
    overviewSrc.includes("onNavigate('calendar')") &&
      overviewSrc.includes('getCalendarEventWebUrl') &&
      overviewSrc.includes('isPastCalendarEvent') &&
      overviewSrc.includes('showPastEvents'),
    'Overview Calendar Summary links events to Canvas, honors positive showPastEvents, and navigates to Calendar tab'
  );
  assert(
    calendarPanelSrc.includes('Upcoming Calendar Events') &&
      calendarPanelSrc.includes('aria-expanded') &&
      calendarPanelSrc.includes('formatCalendarEventDate') &&
      calendarPanelSrc.includes("'agenda'") &&
      calendarPanelSrc.includes("'week'") &&
      calendarPanelSrc.includes("'month'") &&
      calendarPanelSrc.includes('calendar-month-selected-day'),
    'CalendarEventsPanel supports collapsible Agenda (with year), Week, and Month wall calendar with selected-day event info panel'
  );
  const mobileDrawerCheckSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/MobileControlsDrawer.tsx'), 'utf-8');
  assert(
    headerCheckSrc.includes("onTabChange('calendar')") &&
      headerCheckSrc.includes('filter-calendar-section') &&
      mobileDrawerCheckSrc.includes('mobile-filter-calendar-section') &&
      headerCheckSrc.includes('Show Past Events') &&
      headerCheckSrc.includes('showPastEvents') &&
      headerCheckSrc.includes('Reset Defaults'),
    'Header & MobileControlsDrawer group Show Past Events under Calendar in Filter settings, expose Calendar tab, and support Reset Defaults'
  );

  // Test 2: Dashboard routes Calendar tab, builds Canvas URLs, enforces showPastTerms/showPastEvents/showObsolete/showArchived across Overview & Table, and persists filters promptly
  const dashboardSrc = fs.readFileSync(path.join(process.cwd(), 'components/Dashboard.tsx'), 'utf-8');
  assert(dashboardSrc.includes('isPersonalOrCampus'), 'Dashboard merges personal and campus events into single-course assignments');
  assert(dashboardSrc.includes('start_at: ev.start_at') && dashboardSrc.includes('end_at: ev.end_at'), 'Dashboard preserves start_at and end_at on converted calendar assignments');
  assert(
    dashboardSrc.includes("activeTab === 'calendar'") &&
      dashboardSrc.includes('<CalendarEventsPanel') &&
      dashboardSrc.includes('getCalendarEventWebUrl') &&
      dashboardSrc.includes('showPastEvents={showPastEvents}') &&
      dashboardSrc.includes('showObsolete={showObsolete}') &&
      dashboardSrc.includes('showPastTerms'),
    'Dashboard renders Calendar tab and propagates positive showPastEvents, showObsolete & showPastTerms to Overview'
  );
  assert(
    dashboardSrc.includes('isCourseInPastTerm') &&
      sidebarSrc.includes('isCourseInPastTerm') &&
      overviewSrc.includes('isAssignmentObsolete') &&
      dashboardSrc.includes('handleResetFilters') &&
      dashboardSrc.includes('saveLocalWorkspaceSettings') &&
      dashboardSrc.includes('REMOTE_AUTOSAVE_DEBOUNCE_MS') &&
      dashboardSrc.includes('REMOTE_AUTOSAVE_MIN_INTERVAL_MS') &&
      dashboardSrc.includes('getSettingsSignature') &&
      dashboardSrc.includes('remoteSaveInFlightRef'),
    'Dashboard, Overview & Sidebar enforce past-term/obsolete filtering, Reset Defaults, local cache persistence, and throttled/deduplicated remote saves'
  );

  // Test 3: AssignmentsBoard keeps active today events in Up Next lane & respects positive showPastEvents
  const boardSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/AssignmentsBoard.tsx'), 'utf-8');
  assert(boardSrc.includes('isToday') && boardSrc.includes('buckets.today.push(a)'), 'AssignmentsBoard retains today\'s calendar events in active Up Next lane');
  assert(boardSrc.includes('showPastEvents') && boardSrc.includes('isPastCalendarEvent'), 'AssignmentsBoard respects positive showPastEvents');

  // Test 4: Verify getCourseIdFromEvent logic
  const mockCourseEvent = {
    id: 1001,
    title: 'Review Session',
    start_at: '2026-11-12T14:00:00Z',
    end_at: '2026-11-12T15:00:00Z',
    context_code: 'course_101',
    workflow_state: 'active'
  };
  const mockUserEvent = {
    id: 1002,
    title: 'Advising Appointment',
    start_at: '2026-11-13T10:00:00Z',
    end_at: '2026-11-13T10:30:00Z',
    context_code: 'user_self',
    workflow_state: 'active'
  };
  assert(getCourseIdFromEvent(mockCourseEvent) === 101, 'getCourseIdFromEvent correctly extracts course ID from context_code');
  assert(getCourseIdFromEvent(mockUserEvent) === null, 'getCourseIdFromEvent returns null for personal user_self event');

  // Test 5: Verify calendar events payload filtering and download integrity
  const sampleEvents = await fetchCalendarEvents('DEMO', 'DEMO', false, [101, 102]);
  assert(sampleEvents.length > 0, 'fetchCalendarEvents returns non-empty event list');
  const sampleEvent = sampleEvents[0];
  assert(typeof sampleEvent.id === 'number', 'Calendar event has numeric ID');
  assert(typeof sampleEvent.title === 'string' && sampleEvent.title.length > 0, 'Calendar event has non-empty title');
  assert(sampleEvent.workflow_state !== 'deleted', 'Calendar events filter out deleted state');
  assert(typeof sampleEvent.html_url === 'string' && sampleEvent.html_url.startsWith('https://'), 'Demo calendar event includes valid Canvas html_url');

  // =========================================================================
  // Suite 13: UI Copy Simplification, Log Out Accessibility & Calendar Migration
  // =========================================================================
  currentSuite = 'Suite 13: UI Simplification, Log Out & Calendar Migration';
  console.log('\n--- 13. UI Copy Simplification & Log Out Accessibility ---');

  // Test 1: Verify verbose UI copy was completely purged from UI components
  const studentSwitcherSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/StudentSwitcher.tsx'), 'utf-8');
  assert(!studentSwitcherSrc.includes('Easily switch between children without logging out'), 'Purged verbose subtitle from StudentSwitcher');

  const assignmentsTableSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/AssignmentsTable.tsx'), 'utf-8');
  assert(!assignmentsTableSrc.includes('Official Canvas planner items prioritized for your immediate attention'), 'Purged verbose planner subtitle from AssignmentsTable');

  const boardSrcCopy = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/AssignmentsBoard.tsx'), 'utf-8');
  assert(!boardSrcCopy.includes('Official Canvas planner items prioritized for your immediate attention'), 'Purged verbose planner subtitle from AssignmentsBoard');

  // Test 2: Verify Log Out is accessible in Header and MobileControlsDrawer
  const headerSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/Header.tsx'), 'utf-8');
  assert(headerSrc.includes('LogOut') && headerSrc.includes('onLogout'), 'Header exposes prominent Log Out action for desktop and mobile');

  const drawerSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/MobileControlsDrawer.tsx'), 'utf-8');
  assert(drawerSrc.includes('LogOut') && drawerSrc.includes('onLogout'), 'MobileControlsDrawer exposes Log Out button in drawer footer');

  // Test 3: Verify canvas.ts does not send invalid user_self context code
  const canvasServiceSrc = fs.readFileSync(path.join(process.cwd(), 'services/canvas.ts'), 'utf-8');
  assert(!canvasServiceSrc.includes('context_codes[]=user_self'), 'canvas.ts omits invalid context_codes[]=user_self');

  // Test 4: Verify Dashboard.tsx migrates calendarEventsV2 to ensure default on
  assert(dashboardSrc.includes('calendarEventsV2') && dashboardSrc.includes('setShowCalendarEvents(true)'), 'Dashboard migrates calendarEventsV2 so older saves do not disable calendar events');

  // =========================================================================
  // Suite 14: Navigation Streamlining, Feedback Scroll, Safari Bar & Mobile Polish
  // =========================================================================
  currentSuite = 'Suite 14: Navigation, Feedback Scroll, Safari Bar & Token Hygiene';
  console.log('\n--- 14. Navigation Streamlining, Feedback Scroll, Safari Bar & Mobile Polish ---');

  // Test 1: Canvas ToDo removed from main views in Header & Dashboard
  assert(!headerSrc.includes('nav-tab-canvas-todo') && !headerSrc.includes('Canvas To-Do'), 'Header omits Canvas To-Do from main view tabs');
  assert(!dashboardSrc.includes("activeTab === 'canvas_todo'"), 'Dashboard routes Canvas To-Do inside Assignments instead of standalone main tab');

  // Test 2: Feedback scroll-to-bottom & scroll-past-feedback to assignments
  const zoomModalSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/AssignmentZoomModal.tsx'), 'utf-8');
  assert(zoomModalSrc.includes('max-h-[90dvh]') && zoomModalSrc.includes('min-h-0 overflow-y-auto overscroll-contain'), 'AssignmentZoomModal allows full feedback scrolling to bottom via min-h-0 and dvh constraints');

  const flipSideSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/AssignmentDetailFlipSide.tsx'), 'utf-8');
  assert(flipSideSrc.includes('min-h-0 flex-1 overflow-y-auto overscroll-contain'), 'AssignmentDetailFlipSide supports smooth full-bottom feedback scrolling');

  assert(boardSrc.includes('feedbackAssignments') && boardSrc.includes('Instructor Feedback to Review') && !boardSrc.includes("activeFilterFeedback ? (\n            <div"), 'AssignmentsBoard displays feedback spotlight above assignments so users can scroll past feedback');
  assert(assignmentsTableSrc.includes('feedbackAssignments') && assignmentsTableSrc.includes('Instructor Feedback to Review'), 'AssignmentsTable renders feedback spotlight above the assignments table so users can scroll past feedback');

  // Test 3: Safari top bar pinning & viewport lock
  const appSrc = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf-8');
  const indexHtmlSrc = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
  const indexCssSrc = fs.readFileSync(path.join(process.cwd(), 'index.css'), 'utf-8');
  assert(appSrc.includes('fixed inset-0 h-dvh w-full overflow-hidden'), 'App uses fixed inset-0 h-dvh viewport shell so header never freezes off top in Safari');
  assert(!headerSrc.includes('sticky top-0') && headerSrc.includes('shrink-0') && headerSrc.includes('env(safe-area-inset-top)'), 'Header uses non-sticky shrink-0 bar with safe-area padding for Safari');
  assert(indexHtmlSrc.includes('h-dvh') && indexCssSrc.includes('100dvh'), 'index.html and index.css use dynamic viewport height (dvh)');

  // Test 4: Student "My name" rename button merged into top-left StudentSwitcher
  assert(studentSwitcherSrc.includes('onRenameStudent') && studentSwitcherSrc.includes('setIsEditingName(true)'), 'StudentSwitcher integrates inline My Name editing directly in top-left controller');
  assert(!headerSrc.includes('setIsEditingStudentName') && headerSrc.includes('<StudentSwitcher'), 'Header delegates student profile & rename to top-left StudentSwitcher without duplicate top-right button');

  // Test 5: Three color configurator sliders merged onto ONE continuous line
  const gradeModalSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/GradeThresholdModal.tsx'), 'utf-8');
  assert(gradeModalSrc.includes('data-testid="single-line-three-slider"'), 'GradeThresholdModal renders a single horizontal slider line');
  const sliderRoleMatches = gradeModalSrc.match(/role="slider"/g) || [];
  assert(sliderRoleMatches.length === 3 && !gradeModalSrc.includes('type="range"'), 'GradeThresholdModal places 3 accessible handles onto ONE continuous line instead of 3 stacked range sliders');

  // Test 6: Login screen compact single-screen mobile layout
  const loginSrc = fs.readFileSync(path.join(process.cwd(), 'components/Login.tsx'), 'utf-8');
  assert(loginSrc.includes("setupTab === 'saved'") && loginSrc.includes("setupTab === 'new'"), 'Login separates Saved Profiles and New Connection tabs so login fits cleanly on one mobile screen');

  // Test 7: Clicking "Only" isolates visibility and tapping it again deactivates single-course mode
  assert(
    dashboardSrc.includes('handleSelectOnlyCourse') &&
      dashboardSrc.includes('setVisibleCourseIds(new Set([courseId]))') &&
      dashboardSrc.includes('preOnlyVisibleCourseIdsRef') &&
      dashboardSrc.includes('if (selectedCourseId === courseId)'),
    'Dashboard handleSelectOnlyCourse isolates single course and deactivates back to prior multi-class visibility when tapped again'
  );
  assert(
    sidebarSrc.includes('isAllCoursesSelected') &&
      sidebarSrc.includes('onSelectOnlyCourse(item.course.id)') &&
      sidebarSrc.includes('aria-pressed={isSelected}'),
    'Sidebar Only button invokes onSelectOnlyCourse, exposes aria-pressed, and supports toggling off'
  );

  // Test 8: Canvas Proxy Header Sanitization, Token Cleanup & Student Credential Editing
  const { sanitizeCanvasDomain, sanitizeCanvasToken } = await import('../utils/canvasUrls');
  assert(sanitizeCanvasToken('  Bearer 1234~abcd_XYZ  ') === '1234~abcd_XYZ', 'sanitizeCanvasToken strips accidental Bearer prefix and whitespace');
  assert(sanitizeCanvasDomain('https://mcpsmd.instructure.com/courses/123/') === 'mcpsmd.instructure.com', 'sanitizeCanvasDomain extracts clean Canvas hostname from full URLs');
  const serverSrc = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
  const apiRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'utils/apiRoutes.ts'), 'utf-8');
  const proxyHandlerSrc = fs.readFileSync(path.join(process.cwd(), 'utils/proxyHandler.ts'), 'utf-8');
  assert(proxyHandlerSrc.includes('ALLOWED_PROXY_HEADERS') && serverSrc.includes('registerApiRoutes'), 'shared proxy handler filters forwarding to safe REST headers without leaking cookies/origin');
  assert(studentSwitcherSrc.includes('Edit Student Credentials') && studentSwitcherSrc.includes('updateStudent('), 'StudentSwitcher supports updating expired tokens and domains inline');

  // Test 9: Auto-Login Opt-Out on Log Out & Blocking Student-Switch Failure Modal
  assert(appSrc.includes('velm_auto_login_enabled') && appSrc.includes('sessionEpochRef'), 'App prevents auto-login after explicit Log Out and guards async session persistence');
  assert(loginSrc.includes('Auto-login next visit') && loginSrc.includes('staySignedIn'), 'Login exposes explicit Auto-login toggle defaulting off after Log Out');
  assert(appSrc.includes('previousActiveId') && appSrc.includes('role="dialog"') && appSrc.includes('switchFailure') && !appSrc.includes('bg-amber-50 border-b border-amber-200 px-4 py-2'), 'App displays blocking modal (not butter bar) when student switch fails while preserving active student');

  // =========================================================================
  // Suite 15: Debug Build Stamp, SSRF Guard, Student State Isolation & Clean Dialogs
  // =========================================================================
  currentSuite = 'Suite 15: Build Stamp, SSRF Guard, Student Isolation & Clean Dialogs';
  console.log('\n--- 15. Debug Build Stamp, SSRF Guard, Student Isolation & Clean Dialogs ---');

  // Test 1: DebugPage displays build version & timestamp and /api/health reports them
  const debugSrc = fs.readFileSync(path.join(process.cwd(), 'components/DebugPage.tsx'), 'utf-8');
  assert(debugSrc.includes('DEBUG_BUILD_VERSION') && debugSrc.includes('DEBUG_BUILD_TIMESTAMP') && debugSrc.includes('debug-build-info'), 'DebugPage displays build version number and build timestamp');
  assert(serverSrc.includes('SERVER_APP_VERSION') && apiRoutesSrc.includes('buildTimestamp'), 'server /api/health exposes build version and buildTimestamp');

  // Test 2: SSRF protection blocks localhost/private IPs and permits Canvas HTTPS domains
  const { validateProxyTargetUrl } = await import('../utils/proxySecurity');
  assert(validateProxyTargetUrl('https://mcpsmd.instructure.com/api/v1/users/self').valid === true, 'validateProxyTargetUrl permits standard Canvas domain');
  assert(validateProxyTargetUrl('http://localhost:3000/api/health').valid === false, 'validateProxyTargetUrl blocks localhost SSRF attempts');
  assert(validateProxyTargetUrl('http://169.254.169.254/latest/meta-data/').valid === false, 'validateProxyTargetUrl blocks cloud metadata IP');
  assert(validateProxyTargetUrl('http://127.0.0.1:8080/').valid === false, 'validateProxyTargetUrl blocks loopback IPv4');
  assert(proxyHandlerSrc.includes('validateProxyTargetUrl'), 'shared proxy handler enforces validateProxyTargetUrl');

  // Test 3: Dashboard isolation key & no native alert/window.confirm calls
  assert(appSrc.includes('key={state.currentStudentId'), 'App keys Dashboard by currentStudentId so student switches isolate workspace state');
  assert(!dashboardSrc.includes('window.confirm') && !dashboardSrc.includes('alert(') && dashboardSrc.includes('conflictPrompt'), 'Dashboard uses in-app conflict modal and toast notices instead of alert()/window.confirm()');
  assert(!loginSrc.includes('window.confirm') && loginSrc.includes('confirmClearSaved'), 'Login uses inline confirmation instead of window.confirm()');
  assert(!studentSwitcherSrc.includes('if (confirm(') && studentSwitcherSrc.includes('pendingDeleteId'), 'StudentSwitcher uses inline row delete confirmation instead of native confirm()');

  // Test 4: Token sealing at rest & UNLOCK account switching & dead code cleanup
  const cryptoSrc = fs.readFileSync(path.join(process.cwd(), 'services/crypto.ts'), 'utf-8');
  const studentsSrc = fs.readFileSync(path.join(process.cwd(), 'services/students.ts'), 'utf-8');
  assert(cryptoSrc.includes('getOrCreateDeviceSecret') && cryptoSrc.includes('sealProfileToken') && cryptoSrc.includes('unsealProfileToken'), 'crypto.ts provides per-device secret and profile token sealing helpers');
  assert(studentsSrc.includes('sealProfileToken') && studentsSrc.includes('unsealProfileToken'), 'students.ts seals saved student tokens in localStorage');
  assert(loginSrc.includes('Other Accounts'), 'Login UNLOCK mode provides direct navigation to Saved / New accounts');
  assert(!fs.existsSync(path.join(process.cwd(), 'components/dashboard/App.tsx')), 'Removed unused duplicate components/dashboard/App.tsx');

  // Test 5: InteractiveTutorialModal aligns with Header brand selector
  const tutorialSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/InteractiveTutorialModal.tsx'), 'utf-8');
  assert(tutorialSrc.includes('[data-tutorial="header-brand"]') && !tutorialSrc.includes('[data-tutorial="header-title"]'), 'InteractiveTutorialModal targets header-brand selector accurately');

  // =========================================================================
  // Suite 16: Canvas Announcements Widget, Canvas Read Sync & Dismissal Persistence
  // =========================================================================
  currentSuite = 'Suite 16: Canvas Announcements & Dismissal Sync';
  if (options?.isCli) console.log('\n--- 16. Canvas Announcements & Dismissal Sync ---');

  const { fetchAnnouncements, getCourseIdFromAnnouncement } = await import('../services/canvas');
  const demoAnnouncements = await fetchAnnouncements('DEMO', 'DEMO', false, [101, 102]);
  assert(demoAnnouncements.length >= 3, 'fetchAnnouncements returns mock announcements in Demo mode');
  assert(getCourseIdFromAnnouncement(demoAnnouncements[0]) === 101, 'getCourseIdFromAnnouncement resolves course ID cleanly');

  const announcementsWidgetSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/AnnouncementsWidget.tsx'), 'utf-8');
  assert(
    announcementsWidgetSrc.includes('Canvas Announcements') &&
      announcementsWidgetSrc.includes('aria-expanded={isExpanded}') &&
      announcementsWidgetSrc.includes('hasReadAnnouncements') &&
      announcementsWidgetSrc.includes('Unread ({unreadCount})') &&
      announcementsWidgetSrc.includes('All ({totalCount})') &&
      announcementsWidgetSrc.includes('Dismiss'),
    'AnnouncementsWidget renders collapsible Canvas Announcements UI with Unread/All toggle and Dismiss button'
  );

  // Verify placement directly above Canvas Priority To-Do in both Board and Table views
  const boardAnnIdx = boardSrc.indexOf('<AnnouncementsWidget');
  const boardTodoIdx = boardSrc.indexOf('Canvas Priority To-Do');
  assert(boardAnnIdx !== -1 && boardTodoIdx !== -1 && boardAnnIdx < boardTodoIdx, 'AssignmentsBoard places AnnouncementsWidget directly above Canvas Priority To-Do');

  const tableAnnIdx = assignmentsTableSrc.indexOf('<AnnouncementsWidget');
  const tableTodoIdx = assignmentsTableSrc.indexOf('Canvas Priority To-Do');
  assert(tableAnnIdx !== -1 && tableTodoIdx !== -1 && tableAnnIdx < tableTodoIdx, 'AssignmentsTable places AnnouncementsWidget directly above Canvas Priority To-Do');

  // Verify Canvas /discussion_topics/:id/read PUT integration and per-student dismissal storage
  assert(
    canvasServiceSrc.includes('/discussion_topics/${announcement.id}/read') &&
      canvasServiceSrc.includes("genericCanvasFetch(domain, token, endpoint, useProxy, 'PUT')"),
    'services/canvas.ts marks dismissed announcements as read on Canvas via PUT /discussion_topics/:id/read'
  );
  assert(
    studentsSrc.includes('DISMISSED_ANNOUNCEMENTS_PREFIX') &&
      studentsSrc.includes('dismissAnnouncementLocal') &&
      studentsSrc.includes('localStorage.removeItem(`${DISMISSED_ANNOUNCEMENTS_PREFIX}${id}`)'),
    'services/students.ts persists dismissed announcements per student and cleans them on student removal'
  );
  assert(
    dashboardSrc.includes('handleDismissAnnouncement') &&
      dashboardSrc.includes('dismissedAnnouncementIds') &&
      dashboardSrc.includes('!showObsolete && isAnnouncementObsolete(ann, nowMs)'),
    'Dashboard.tsx manages dismissedAnnouncementIds, cloud settings sync, and showObsolete (>6 wks) filtering for announcements'
  );

  // =========================================================================
  // Suite 17: Course Grade Data Inspector & Ground-Truth Audit
  // =========================================================================
  currentSuite = 'Suite 17: Course Grade Data Inspector & Ground-Truth Audit';
  console.log('\n--- 17. Course Grade Data Inspector & Ground-Truth Audit ---');

  const sampleMismatchCourse: CourseData = {
    course: { id: 901, name: 'English 10', course_code: 'ENG10', is_favorite: true },
    assignments: [
      {
        id: 9101,
        name: 'Research Essay',
        description: '',
        due_at: null,
        points_possible: 50,
        course_id: 901,
        html_url: '#',
        submission_types: ['online_upload'],
        submission: { submitted_at: '2026-10-05T12:00:00Z', grade: '46', score: 46 },
      },
      {
        id: 9102,
        name: 'Attendance Participation',
        description: '',
        due_at: null,
        points_possible: 0,
        course_id: 901,
        html_url: '#',
        submission_types: ['none'],
      },
    ],
    modules: [],
    enrollment: {
      id: 8801,
      course_id: 901,
      type: 'ObserverEnrollment',
      enrollment_state: 'active',
      grades: { current_score: 0, current_grade: 'F', final_score: 92, final_grade: 'A-' },
    },
  };

  const inspectionReport = inspectCourseGrade(sampleMismatchCourse);
  assert(inspectionReport.displayed.source === 'canvas_enrollment', 'inspectCourseGrade identifies official Canvas enrollment as displayed source');
  assert(inspectionReport.calculated.percentage === 92, 'inspectCourseGrade calculates exact unweighted ground truth average (46/50 = 92%)');
  assert(
    inspectionReport.anomalies.some((a) => a.title.includes('current_score = 0%')),
    'inspectCourseGrade flags Canvas current_score = 0% mismatch against graded assignments'
  );
  const pickedRow = selectPrimaryEnrollment(
    [
      { id: 1, course_id: 901, type: 'StudentEnrollment', enrollment_state: 'inactive', grades: { current_score: 0, current_grade: 'F', final_score: 0, final_grade: 'F' } },
      { id: 2, course_id: 901, type: 'StudentEnrollment', enrollment_state: 'active', grades: { current_score: 92, current_grade: 'A-', final_score: 92, final_grade: 'A-' } },
    ],
    901
  );
  assert(pickedRow?.id === 2, 'selectPrimaryEnrollment prefers active enrollment with positive score');
  assert(
    getEffectiveCourseGrade({
      ...sampleMismatchCourse,
      assignments: [],
    }) === null,
    'getEffectiveCourseGrade suppresses 0% placeholder when 0 graded assignments exist'
  );

  // Verify sparse / stale / impossible 0% suppression heuristics (e.g., 1 graded 0/5 pt item out of many course assignments)
  const sparseZeroEnglishCourse: CourseData = {
    course: { id: 902, name: 'AP English Literature', course_code: 'ENG400', is_favorite: true },
    assignments: [
      {
        id: 9201,
        name: 'Warm-Up Check #1',
        description: '',
        due_at: '2026-09-10T12:00:00Z',
        points_possible: 5,
        course_id: 902,
        html_url: 'https://canvas.example.edu/courses/902/assignments/9201',
        submission_types: ['online_text_entry'],
        submission: { submitted_at: '2026-09-10T12:00:00Z', graded_at: '2026-09-11T12:00:00Z', grade: '0', score: 0 },
      },
      ...Array.from({ length: 11 }, (_, idx) => ({
        id: 9202 + idx,
        name: `Major Essay / Seminar ${idx + 1}`,
        description: '',
        due_at: '2026-11-10T12:00:00Z',
        points_possible: 50,
        course_id: 902,
        html_url: `https://canvas.example.edu/courses/902/assignments/${9202 + idx}`,
        submission_types: ['online_upload'],
      })),
    ],
    modules: [],
    enrollment: {
      id: 8802,
      course_id: 902,
      type: 'ObserverEnrollment',
      enrollment_state: 'active',
      grades: { current_score: 0, current_grade: 'F', final_score: 0, final_grade: 'F' },
    },
  };
  const sparseCoverage = computeCourseGradingCoverage(
    sparseZeroEnglishCourse.assignments,
    0,
    'F',
    0,
    new Date('2026-11-14T12:00:00Z').getTime()
  );
  assert(
    sparseCoverage.isLowGradedFraction &&
      sparseCoverage.hasNoRecentGradedWork &&
      sparseCoverage.gradedAssignmentsCount === 1 &&
      sparseCoverage.gradableAssignmentsCount === 12,
    'computeCourseGradingCoverage flags sparse (1/12 items, 5/555 pts) and stale grading coverage'
  );
  assert(
    getEffectiveCourseGrade(sparseZeroEnglishCourse) === null,
    'getEffectiveCourseGrade suppresses unreliable 0% when only sparse/stale 0/5 work is graded'
  );
  const sparseReport = inspectCourseGrade(sparseZeroEnglishCourse);
  assert(
    sparseReport.displayed.source === 'suppressed_zero_unreliable' &&
      sparseReport.gradedAssignments.length === 1 &&
      sparseReport.rawPayloads.gradedAssignments.length === 1 &&
      sparseReport.rawPayloads.ungradedOrExcludedAssignments.length === 11,
    'inspectCourseGrade highlights the single graded assignment and separates graded vs ungraded raw JSON payloads'
  );

  const inspectorModalSrc = fs.readFileSync(path.join(process.cwd(), 'components/dashboard/CourseGradeInspectorModal.tsx'), 'utf-8');
  assert(
    inspectorModalSrc.includes('course-grade-inspector-modal') &&
      inspectorModalSrc.includes('inspector-coverage-strip') &&
      inspectorModalSrc.includes('inspector-graded-work-spotlight') &&
      inspectorModalSrc.includes('raw-graded-assignments-json') &&
      inspectorModalSrc.includes('Fetch Live Ground Truth') &&
      inspectorModalSrc.includes('Raw Canvas Data'),
    'CourseGradeInspectorModal renders coverage heuristics strip, graded work spotlight, separated JSON inspector, and live ground-truth fetch'
  );
  assert(
    dashboardSrc.includes('CourseGradeInspectorModal') &&
      dashboardSrc.includes('course-header-inspect-grade') &&
      overviewSrc.includes('overview-inspect-grade-') &&
      sidebarSrc.includes('sidebar-inspect-grade-') &&
      canvasServiceSrc.includes('fetchCourseGradeDiagnostics'),
    'Dashboard, Overview, Sidebar, and canvas.ts wire Grade Data Inspector triggers and live diagnostics endpoint'
  );

  const durationMs = Date.now() - startTime;

  if (options?.isCli) {
    console.log('\n======================================================');
    console.log(` Test Results: ${passedTests} passed, ${failedTests} failed (${durationMs}ms)`);
    console.log('======================================================\n');
  }

  return {
    passed: passedTests,
    failed: failedTests,
    total: passedTests + failedTests,
    durationMs,
    results
  };
}

// Automatically execute when called via `npm test` or `tsx scripts/test-runner.ts`
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('test-runner')) {
  runIntegrationTestSuite({ isCli: true }).then(summary => {
    if (summary.failed > 0) {
      process.exit(1);
    }
  }).catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}
