import { CourseData, CanvasAssignment } from "../types";
import { logger } from "./logger";
import { isAssignmentSubmitted } from "../utils/dashboard-helpers";

export const sanitizeGeminiModel = (modelId?: string): string => {
  if (!modelId || typeof modelId !== 'string') return 'gemini-3.8-flash';
  const clean = modelId.trim();
  if (
    clean.includes('2.5') || 
    clean.includes('2.0') || 
    clean.includes('1.5') || 
    clean === 'gemini-pro'
  ) {
    return 'gemini-3.8-flash';
  }
  return clean;
};

export const analyzeWorkload = async (
  assignments: CanvasAssignment[], 
  allCourses: CourseData[], 
  customInstructions?: string,
  modelId: string = 'gemini-3.8-flash'
): Promise<string> => {
  const targetModel = sanitizeGeminiModel(modelId);

  const now = new Date();
  const dateString = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Create a course map for quick lookup
  const courseCodeMap = new Map<number, string>();
  const courseNameMap = new Map<number, string>();
  allCourses.forEach(c => {
      courseCodeMap.set(c.course.id, c.course.course_code);
      courseNameMap.set(c.course.id, c.course.name);
  });

  // Prepare Assignment List
  const assignmentList = assignments.map(a => {
      const code = courseCodeMap.get(a.course_id) || 'Unknown';
      const due = a.due_at ? new Date(a.due_at).toLocaleDateString() : 'No Date';
      const points = a.points_possible !== null && a.points_possible !== undefined ? a.points_possible : 0;
      const score = a.submission?.score !== null && a.submission?.score !== undefined ? a.submission.score : 'Ungraded';
      const isSubmitted = isAssignmentSubmitted(a) ? 'Yes' : 'No';
      const isEvent = a.is_calendar_event ? ' [Event]' : '';
      return `- [${code}] "${a.name}"${isEvent} | Due: ${due} | Points: ${points} | Score: ${score} | Submitted: ${isSubmitted}`;
  }).join('\n');

  // Prepare Course Context (Grades) for the relevant courses
  const relevantCourseIds = new Set(assignments.map(a => a.course_id));
  const courseContext = allCourses
      .filter(c => relevantCourseIds.has(c.course.id))
      .map(c => `- ${c.course.course_code}: Current Grade ${c.enrollment?.grades.current_grade || 'N/A'} (${c.enrollment?.grades.current_score || 0}%)`)
      .join('\n');

  const defaultInstructions = `
    Please provide:
    * Identify the 3 most critical upcoming deadlines.
    * Call attention to missing submissions.
    * Warnings for any courses with low grades, or high workload.
  `;

  const instructionsToUse = customInstructions && customInstructions.trim().length > 0 
    ? `USER CUSTOM INSTRUCTIONS (PRIORITIZE THESE): ${customInstructions}` 
    : defaultInstructions;

  const prompt = `
    Analyze the following student data from Canvas LMS. These are the assignments currently visible in the student's dashboard view.
    
    Current Date: ${dateString}
    
    Course Context (Current Grades):
    ${courseContext}

    **Ignore "N/A" grades.**

    Assignments Data (Visible View):
    ${assignmentList}

    ${instructionsToUse}

    Be concise. Do not be wordy. Just the facts. Avoid opinion adjectives. Keep the tone calm and straightforward.

    On-paper assignments are not tracked well in Canvas. Ignore assignments that have Submission type "On Paper" or "None" and have due date >1week ago.

    Use the short custom course name (not the official ID) in the dashboard cards
    
    IMPORTANT DATA INTERPRETATION RULES:
    - Ignore assignments with no Due Date.
    - **Smart Filtering:** Be smart about assignments from the past. If an assignment is overdue by more than 2 weeks, has 0 points (or very low points), or has no submission type, and is currently ungraded, it is likely "abandoned" by the teacher or optional. Do NOT flag these as critical missing items unless they have a high point value. You may mention them as "Likely Abandoned" or "housekeeping items".
    - Focus primarily on future due dates, high-value assignments, and recent missing work (in the past 2 weeks).
    - If the list is empty, congratulate the student on being up to date.

    FORMATTING RULES:
    - Format the response in clean HTML using simple tags like <h3>, <ul>, <li>, <p>, <strong>. 
    - Do not use markdown ticks or \`\`\`html blocks.
    - Return ONLY the HTML.
  `;

  logger.info(`[Gemini Analyst] Requesting analysis using model ${targetModel}...`);

  try {
    const response = await fetch('/api/gemini/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        model: targetModel,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
      const msg = errJson.error || `HTTP ${response.status}: ${response.statusText}`;
      logger.error('[Gemini Analyst] Server returned error:', msg);
      return `<div class="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">
        <p class="font-semibold mb-1">Failed to generate Gemini analysis:</p>
        <p>${msg}</p>
      </div>`;
    }

    const data = await response.json();
    logger.info(`[Gemini Analyst] Successfully generated report using ${data.modelUsed || targetModel}`);
    return data.analysis || "No analysis generated.";
  } catch (fetchErr: any) {
    logger.error("[Gemini Analyst] Network error calling /api/gemini/analyze:", fetchErr);
    return `<div class="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">
      <p class="font-semibold mb-1">Network error contacting Gemini service:</p>
      <p>${fetchErr.message || 'Could not connect to server'}</p>
    </div>`;
  }
};
