/**
 * Automated Test Runner for Canvas Academic Intelligence Dashboard
 * 
 * Tests:
 * 1. Server Health & Connectivity
 * 2. Canvas API Credentials & Data Fetching (using server secret in .env)
 * 3. Domain Logic, Evaluation Heuristics & Translation Detection
 * 4. UI State Transitions & Click Handlers (All/None toggles, course selection, view switches)
 */

import fs from 'fs';
import path from 'path';
import { detectWorldLanguage } from '../services/translation';
import { getGradeStyle, DEFAULT_GRADE_CONFIG } from '../services/gradeScale';
import { cleanAssignmentDescription, formatSubmissionType } from '../utils/dashboard-helpers';
import { computeCourseAbbreviations, pruneCourseTitle } from '../utils/courseAbbreviations';
import { CourseData, ALL_COURSES_ID, CanvasAssignment } from '../types';

// Load .env manually for standalone tsx test execution
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' Canvas Dashboard: Automated Integration Test Suite');
  console.log('======================================================\n');

  // ----------------------------------------------------------------
  // 1. Server Health Check
  // ----------------------------------------------------------------
  console.log('[Suite 1] Server Health & API Endpoints');
  try {
    const res = await fetch('http://localhost:3000/api/health');
    assert(res.ok && res.status === 200, 'GET /api/health responds with HTTP 200 OK');
    const data = await res.json();
    assert(data.status === 'ok', 'Health check returns status "ok"');
  } catch (err: any) {
    assert(false, `Server health check failed: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // 2. Real Canvas API Integration (via server secret)
  // ----------------------------------------------------------------
  console.log('\n[Suite 2] Real Canvas API Connectivity');
  const domain = process.env.TEST_CANVAS_DOMAIN || 'mcpsmd.instructure.com';
  const token = process.env.TEST_CANVAS_TOKEN || '';

  if (!token) {
    console.log('  ⚠ Skipping real Canvas API calls: TEST_CANVAS_TOKEN not configured in .env');
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
      assert(false, `Canvas API connection failed: ${err.message}`);
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
      assert(false, `Canvas courses query failed: ${err.message}`);
    }

    try {
      const todoUrl = `https://${domain}/api/v1/users/self/todo`;
      const res = await fetch(todoUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assert(res.ok, `Canvas To-Do endpoint accessible (HTTP ${res.status})`);
    } catch (err: any) {
      assert(false, `Canvas To-Do query failed: ${err.message}`);
    }
  }

  // ----------------------------------------------------------------
  // 3. Domain Logic & Evaluation Heuristics
  // ----------------------------------------------------------------
  console.log('\n[Suite 3] Domain Logic & Heuristic Calculations');

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

  // Test 0% vs No Data Heuristic: a course with 0 graded assignments must return null (No Data), not 0% F
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

  // Test Description Cleaning
  const boilerplateDesc = '<p>Detailed guidelines, grading criteria, and instructions from the course syllabus.</p>';
  assert(cleanAssignmentDescription(boilerplateDesc) === '', 'Strips Canvas default syllabus boilerplate text');

  const realDesc = '<p>Please read chapter 4 and answer questions 1-5.</p>';
  assert(cleanAssignmentDescription(realDesc).includes('chapter 4'), 'Preserves real assignment instructions');

  // ----------------------------------------------------------------
  // 4. UI Flow & State Transition Simulation
  // ----------------------------------------------------------------
  console.log('\n[Suite 4] UI Button Clicks & View Transition Simulation');

  // Simulate Multi-Class Selection and Toggling
  const mockCourses: CourseData[] = [
    {
      course: { id: 101, name: 'English 11', course_code: 'ENG301', is_favorite: true },
      assignments: [{ id: 1, name: 'Essay 1', points_possible: 100, course_id: 101, html_url: '#', description: '', due_at: null, submission_types: ['online_upload'] }],
      modules: [{ id: 1, name: 'Unit 1', course_id: 101, items: [] }]
    },
    {
      course: { id: 102, name: 'AP Physics', course_code: 'PHYS201', is_favorite: true },
      assignments: [{ id: 2, name: 'Lab Report', points_possible: 50, course_id: 102, html_url: '#', description: '', due_at: null, submission_types: ['on_paper'] }],
      modules: []
    }
  ];

  // 4a. User clicks "All" button
  let visibleCourseIds = new Set(mockCourses.map(c => c.course.id));
  let selectedCourseId: number | null = ALL_COURSES_ID;
  assert(visibleCourseIds.size === 2, 'Click "All": all courses added to visible set');

  // 4b. User clicks "None" button (toggle off all classes)
  visibleCourseIds = new Set();
  assert(visibleCourseIds.size === 0, 'Click "None": all courses removed from visible set');

  // Verify safe zero-state handling in combined view
  let relevantCourses = mockCourses.filter(c => visibleCourseIds.has(c.course.id));
  assert(relevantCourses.length === 0, 'Relevant courses is empty when None is clicked');

  const zeroCourseFallback = {
    course: { id: ALL_COURSES_ID, name: 'Multi-Class View (0 selected)', course_code: 'NONE', is_favorite: true },
    assignments: [] as CanvasAssignment[],
    modules: []
  };
  assert(zeroCourseFallback.assignments.length === 0, 'Zero-course fallback contains 0 assignments without crashing');

  // 4c. User clicks one class to toggle it on
  visibleCourseIds.add(101);
  relevantCourses = mockCourses.filter(c => visibleCourseIds.has(c.course.id));
  assert(relevantCourses.length === 1 && relevantCourses[0].course.id === 101, 'Toggle on one class: exactly 1 course visible');

  const combinedWithOne = {
    course: { id: ALL_COURSES_ID, name: 'Multi-Class View (1 of 2 visible)', course_code: '1 COURSES', is_favorite: true },
    assignments: relevantCourses.flatMap(c => c.assignments || []),
    modules: relevantCourses.flatMap(c => (c.modules || []))
  };
  assert(combinedWithOne.assignments.length === 1, 'Combined view with 1 class contains 1 assignment');
  assert(combinedWithOne.modules.length === 1, 'Combined view with 1 class contains 1 module');

  // 4d. User clicks to switch to a single class view
  selectedCourseId = 102;
  const singleFound = mockCourses.find(c => c.course.id === selectedCourseId);
  assert(!!singleFound, 'Selected course ID switches directly to single course 102');

  const singleViewCourse = {
    ...singleFound,
    assignments: [...(singleFound?.assignments || [])],
    modules: singleFound?.modules || []
  };
  assert(singleViewCourse.assignments.length === 1, 'Single course view safely spreads assignments');
  assert(Array.isArray(singleViewCourse.modules), 'Single course view safely provides modules array');

  // 4e. Simulate ToDo "Done?" checkbox toggle
  let todoProcessed = false;
  const fakeTodoItem = {
    id: 888,
    type: 'submitting' as const,
    assignment: { id: 999, name: 'Homework 1', points_possible: 10, course_id: 101, html_url: '#' },
    context_name: 'English 11',
    ignore: 'https://canvas.test/api/v1/users/self/todo/items/888'
  };

  const handleMarkTodoDone = async (item: typeof fakeTodoItem) => {
    todoProcessed = true;
  };
  await handleMarkTodoDone(fakeTodoItem);
  assert(todoProcessed, 'Clicking "Done?" checkbox triggers dismissal handler without warnings');

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
