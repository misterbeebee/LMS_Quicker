import { CourseData, CanvasAssignment } from "../types";
import { logger } from "./logger";
import { isAssignmentSubmitted } from "../utils/dashboard-helpers";

export interface TacticalPromptOption {
  id: string;
  title: string;
  shortLabel: string;
  badge: string;
  description: string;
  prompt: string;
}

export const TACTICAL_PROMPTS: TacticalPromptOption[] = [
  {
    id: 'modules-exams',
    title: 'Link Modules & Study Guides to Upcoming Work & Exams',
    shortLabel: 'Modules & Exam Prep',
    badge: 'Study Material Links',
    description: 'Finds exact lecture slides, study guides, readings, and review pages in course modules that match upcoming assignments and exams.',
    prompt: `TACTICAL FOCUS: Link Course Modules & Study Guides to Upcoming Assessments & Deadlines
* For every upcoming assignment, quiz, or exam in the next 14 days, search through the course modules below and identify the exact lecture slides, study guides, reading pages, and review files that correspond to it.
* Group each upcoming assessment with its matching module resources.
* Provide direct, clickable HTML links formatted as: <a href="CANVAS_URL" target="_blank" rel="noopener noreferrer" class="text-indigo-600 font-semibold underline hover:text-indigo-800">Resource Title</a>.
* If an upcoming exam or test is detected, highlight the key prerequisite modules, review items, and recommended order of study.`
  },
  {
    id: 'grade-impact',
    title: 'High-Impact Grade Rescue & Point Triage',
    shortLabel: 'High-Impact Grade Rescue',
    badge: 'Point Weight Triage',
    description: 'Identifies high-weight unsubmitted or low-scoring assignments with the biggest mathematical impact on course grades.',
    prompt: `TACTICAL FOCUS: High-Impact Grade Rescue & Point Triage
* Analyze assignment point values and current course letter grades to identify items that have the biggest mathematical impact on the student's grade.
* Prioritize unsubmitted or missing assignments from the last 14 days that carry significant point weight.
* Provide a clear, prioritized triage list ordered by potential grade recovery value, indicating which assignment to complete first for maximum grade improvement.`
  },
  {
    id: 'teacher-feedback',
    title: 'Teacher Feedback Action Items & Revision Plan',
    shortLabel: 'Teacher Feedback Action Plan',
    badge: 'Revisions & Remarks',
    description: 'Synthesizes teacher comments into concrete revision steps, resubmission opportunities, and study corrections.',
    prompt: `TACTICAL FOCUS: Teacher Feedback Action Items & Revision Plan
* Review all teacher submission comments, feedback, and notes provided across recent assignments.
* Synthesize the teacher's remarks into specific, actionable revision steps and study corrections.
* Highlight any unacknowledged teacher suggestions, rubric deductions that can be corrected, or opportunities for resubmission/extra credit.`
  },
  {
    id: 'study-plan-7day',
    title: '7-Day Tactical Study & Work Schedule',
    shortLabel: '7-Day Study Plan',
    badge: 'Pacing & Time Blocks',
    description: 'Builds a balanced daily study schedule pacing out upcoming deadlines, module readings, and exam prep.',
    prompt: `TACTICAL FOCUS: 7-Day Tactical Study & Work Schedule
* Construct a realistic, balanced day-by-day study and completion plan for the next 7 days.
* Group tasks logically, allocating estimated time blocks for high-point assignments and exam prep.
* Factor in reviewing module lecture notes and study guides before the day an assignment or quiz is due.`
  },
  {
    id: 'workload-overview',
    title: 'Executive Workload & Deadline Briefing',
    shortLabel: 'Workload Overview',
    badge: 'General Briefing',
    description: 'Identifies the top 3 critical deadlines, missing work warnings, and low-grade course alerts.',
    prompt: `TACTICAL FOCUS: Executive Workload & Deadline Briefing
* Identify the 3 most critical upcoming deadlines.
* Call attention to urgent missing submissions from the last 2 weeks.
* Warn about any courses with low grades or high workload spikes.
* Provide 2-3 immediate next steps for today.`
  }
];

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
      courseCodeMap.set(c.course.id, c.course.course_code || c.course.name);
      courseNameMap.set(c.course.id, c.course.name);
  });

  // Prepare Assignment List with links and teacher comments
  const assignmentList = assignments.map(a => {
      const code = courseCodeMap.get(a.course_id) || 'Unknown';
      const due = a.due_at ? new Date(a.due_at).toLocaleDateString() : 'No Date';
      const points = a.points_possible !== null && a.points_possible !== undefined ? a.points_possible : 0;
      const score = a.submission?.score !== null && a.submission?.score !== undefined ? a.submission.score : 'Ungraded';
      const isSubmitted = isAssignmentSubmitted(a) ? 'Yes' : 'No';
      const isEvent = a.is_calendar_event ? ' [Calendar Event]' : '';
      const comments = (a.submission?.submission_comments && a.submission.submission_comments.length > 0)
        ? ` | Feedback Comments: ${a.submission.submission_comments.map(c => `"${c.comment.replace(/\n+/g, ' ').slice(0, 150)}" (by ${c.author_name})`).join('; ')}`
        : '';
      const urlStr = a.html_url ? ` | Canvas Link: ${a.html_url}` : '';
      return `- [${code}] "${a.name}"${isEvent} | Due: ${due} | Points: ${points} | Score: ${score} | Submitted: ${isSubmitted}${urlStr}${comments}`;
  }).join('\n');

  // Prepare Course Context (Grades) for the relevant courses
  const relevantCourseIds = new Set(assignments.map(a => a.course_id));
  const courseContext = allCourses
      .filter(c => relevantCourseIds.has(c.course.id))
      .map(c => `- ${courseCodeMap.get(c.course.id) || c.course.course_code}: Current Grade ${c.enrollment?.grades.current_grade || 'N/A'} (${c.enrollment?.grades.current_score || 0}%)`)
      .join('\n');

  // Prepare Course Modules Context (Titles and resources for tactical linking)
  const modulesContext = allCourses
      .filter(c => relevantCourseIds.has(c.course.id) && c.modules && c.modules.length > 0)
      .map(c => {
          const code = courseCodeMap.get(c.course.id) || c.course.course_code || c.course.name;
          const moduleSummaries = c.modules
              .slice(0, 15)
              .map(m => {
                  const itemTitles = (m.items || [])
                      .slice(0, 12)
                      .map(item => `    * [${item.type}] "${item.title}"${item.html_url ? ` (Link: ${item.html_url})` : ''}`)
                      .join('\n');
                  return `  - Module: "${m.name}"\n${itemTitles || '    (No items listed)'}`;
              })
              .join('\n');
          return `### Course Modules for [${code}]:\n${moduleSummaries}`;
      })
      .join('\n\n');

  const defaultInstructions = `
    TACTICAL GOALS:
    * Identify the 3 most critical upcoming deadlines.
    * Call attention to missing submissions from the past 2 weeks.
    * Warn about any courses with low grades or high workload.
    * Link relevant module items where applicable.
  `;

  const instructionsToUse = customInstructions && customInstructions.trim().length > 0 
    ? `USER TACTICAL INSTRUCTIONS & PRESET FOCUS:\n${customInstructions}` 
    : defaultInstructions;

  const prompt = `
    Analyze the following student data from Canvas LMS. These are the assignments, current grades, and course modules currently visible in the student's dashboard view.
    
    Current Date: ${dateString}
    
    Course Context (Current Grades):
    ${courseContext || 'No specific course grade context available.'}

    **Ignore "N/A" grades.**

    Assignments Data (Visible View):
    ${assignmentList || 'No assignments currently visible in view.'}

    Course Modules & Available Study Resources:
    ${modulesContext || 'No module content available for these courses.'}

    ${instructionsToUse}

    Be concise. Do not be wordy. Just the facts. Avoid opinion adjectives. Keep the tone calm, structured, and straightforward.

    On-paper assignments are not tracked well in Canvas. Ignore assignments that have Submission type "On Paper" or "None" and have due date >1 week ago.

    IMPORTANT DATA INTERPRETATION RULES:
    - Ignore assignments with no Due Date.
    - **Smart Filtering:** Be smart about assignments from the past. If an assignment is overdue by more than 2 weeks, has 0 points (or very low points), or has no submission type, and is currently ungraded, it is likely "abandoned" by the teacher or optional. Do NOT flag these as critical missing items unless they have a high point value. You may mention them as "Likely Abandoned" or "housekeeping items".
    - Focus primarily on future due dates, high-value assignments, and recent missing work (in the past 2 weeks).
    - If the list is empty, congratulate the student on being up to date.

    FORMATTING & LINKING RULES:
    - Format the response in clean semantic HTML using tags like <h3>, <h4>, <ul>, <li>, <p>, <strong>, <em>, <span>, <a>. 
    - When referencing or recommending course modules, lecture slides, study guides, or assignments with a provided URL, format them as clean HTML links:
      <a href="URL" target="_blank" rel="noopener noreferrer" class="text-indigo-600 font-semibold underline hover:text-indigo-800">Resource Name</a>.
    - If recommending module resources, clearly state which module and which item the student should review.
    - Do not use markdown backticks or \`\`\`html blocks.
    - Return ONLY the clean HTML string.
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
