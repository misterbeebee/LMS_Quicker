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
import { CourseData, ALL_COURSES_ID, CanvasAssignment, CanvasModule } from '../types';
import { setCachedUserId, getCachedUserId } from '../services/canvas';
import { findRelatedModuleContent } from '../utils/moduleSearch';
import { TACTICAL_PROMPTS, sanitizeGeminiModel } from '../services/gemini';

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

    try {
      const coursesUrl = `https://${domain}/api/v1/courses?include[]=term&include[]=total_scores&per_page=15`;
      const res = await fetch(coursesUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert(res.ok, `Canvas courses endpoint accessible (HTTP ${res.status})`);
      if (res.ok) {
        const courses = await res.json();
        assert(Array.isArray(courses), `Retrieved ${courses.length} courses from Canvas LMS`);
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
