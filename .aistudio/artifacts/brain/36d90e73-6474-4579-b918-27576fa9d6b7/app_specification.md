# Canvas Academic Intelligence Dashboard: Live Feature Specification (v1.2)

A comprehensive reference specification documenting all currently implemented features, domain data models, user interface workflows, evaluation heuristics, and persistence architectures in the Multi-Course Canvas LMS Dashboard.

---

## 1. System Vision & Architecture

The **Canvas Academic Intelligence Dashboard** is a high-density, student- and observer-centric web application designed to overcome the navigational fragmentation of standard Canvas LMS. It aggregates assignments, modules, calendar events, teacher feedback, and course evaluations across multiple concurrent courses into a unified workspace.

### Core Architectural Tenets
1. **Zero-Backend Dependency for User Data**: All private data stays between the user's browser, the Canvas LMS API, and the user's personal Canvas cloud storage files (`/saves`).
2. **Multi-Student Observer Model**: Seamless switching between multiple student profiles (e.g., siblings or mentored students) without re-authenticating, preserving distinct preferences and local customizations per student.
3. **High-Density Academic Cockpit**: Eliminated decorative whitespace and generic "AI slop" pills in favor of crisp typography, segmented functional buttons, and deep information density.
4. **Resilient Cross-Machine State Synchronization with 10-Minute Throttling**: Dual-tier persistence combining Canvas Cloud User Files API (for automated cross-device sync) and local JSON import/export (for offline backup and manual transfer), strictly throttled to at most once per 10 minutes to protect Canvas cloud file storage and API limits.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       User Interface Layer                                  │
│  ┌───────────────┐ ┌──────────────────────────────────────────────────────┐ │
│  │    Sidebar    │ │  Header (Student Switcher, Name Chip, Grouped Popovers)│ │
│  │- Multi-Class  │ ├──────────────────────────────────────────────────────┤ │
│  │- Drag Reorder │ │  Active View:                                        │ │
│  │- Emojis/Abbr  │ │  [Overview] [Assignments Board/Table] [Modules] [Todo]│ │
│  │- All / None   │ │  [Guided Walkthroughs: Direct Major Views & Settings]  │ │
│  └───────┬───────┘ └──────────────────────────┬───────────────────────────┘ │
└──────────┼────────────────────────────────────┼─────────────────────────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    State & Business Logic Engine                            │
│  - UserSettings (Preferences, Filters, Sort, View Modes)                    │
│  - Student Identity & Name Manager (Canvas API Auto-Detect + Manual Edit)   │
│  - Course Customizations Engine (Smart Emojis, 4-Letter Academic Codes)     │
│  - GradeScaleConfig (Smooth Blending & Distorted Grade Boundaries)          │
│  - Score Entity Semantics (Score vs Graded Date Swap, No Item Letter Grade) │
│  - World Language Translation Engine (Detection & MyMemory API / GTranslate)│
│  - Teacher Feedback Acknowledgment Tracker (Single & Batch with Banner)     │
│  - Chronological Module Date Sorter with Today Bookmark Anchor              │
│  - Error Boundary Protection for Robust View Switching                      │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌──────────────────────────────┐ ┌───────────────────────────────────────────┐
│     Canvas REST API Proxy    │ │  Persistence & Cross-Device Sync          │
│  - /api/canvas (CORS bypass) │ │  - Canvas Cloud User Files (/saves/*.json)│
│  - Courses & Enrollments     │ │  - Throttled Remote Push (10 min throttle)│
│  - Assignments & Submissions │ │  - Smart Boot Hydration & Version Stamping│
│  - Modules & Module Items    │ │  - Manual JSON Export / Import Fallback   │
│  - Calendar Events & Todos   │ │  - LocalStorage Caching per Student ID    │
│  - User Profile & Self Name  │ │                                           │
└──────────────────────────────┘ └───────────────────────────────────────────┘
```

---

## 2. Student Identity & Authentication

### 2.1 Student Profile & Name Detection
- **Automatic Name Detection**: On login, the dashboard queries Canvas LMS endpoints (`/api/v1/users/self/profile` or `/api/v1/users/self`) to fetch the student's real name.
- **Manual Name Setting at Setup**: The initial login screen includes an optional **"Student Name"** input (`e.g. Alex`). If provided, this name takes precedence.
- **In-App Name Editing**: A clickable student chip with a `User` icon and `Edit2` icon in the dashboard header allows inline renaming at any time without logging out.
- **Logged-Out Persistent Display**: When logged out and presented with the `UNLOCK` screen, the application displays:
  - An avatar circle with the student's initial.
  - A friendly personalized greeting: `Welcome back, [Student Name]!`.
  - The associated Canvas domain, ensuring clear multi-account recognition before unlocking.

### 2.2 Observer & Multi-Student Switcher
- **Observer Architecture**: Parents and academic counselors can configure multiple student profiles with custom Canvas domains, access tokens, proxy preferences, and identifying color codes (Blue, Emerald, Purple, Amber, Rose).
- **One-Click Hot Switching**: Instant switching in the top-left corner of the sidebar or header without page reloads.
- **Data Isolation**: Custom emojis, course ordering, archived assignment IDs, marked-as-submitted overrides, and acknowledged teacher comments are keyed by `studentId` to prevent cross-profile contamination.

### 2.3 Direct API & Server Proxy Modes
- **CORS Mitigation Proxy**: Built-in Express reverse proxy (`/api/canvas`) that forwards authorization headers and query parameters, allowing seamless connections to Canvas instances that enforce restrictive CORS origins.
- **Direct Client Mode**: Option for institutions that provide permissive CORS or local Canvas installations.

---

## 3. Sidebar & Course Management

### 3.1 Course Selection Modes
- **Multi-Class Combined View (`ALL_COURSES_ID = -1`)**: Merges assignments, events, and metrics across all selected courses into a single timeline or Kanban board.
- **Single-Course Focused View**: Filters all views down to a single selected course for deep study.

### 3.2 Dynamic Visibility Controls ("All" & "None")
- **Instant Mode Switching**: Clicking **All** or **None** immediately transitions the active view to the Multi-Class Combined View (`ALL_COURSES_ID`) so visibility changes are reflected immediately on-screen.
- **Live Counter**: Displays current visible count against total active courses (e.g., `Visible: 5/7`).
- **Zero-State Notification**: If all courses are toggled off in the multi-class view, a friendly contextual warning banner is displayed with a quick-restore button ("Show All Classes").
- **Hidden Courses Toggle**: Option to reveal or hide non-favorited courses from the active semester list.

### 3.3 Course Customization & Thematic Emojis
- **Smart Heuristic Matcher**: Automatically analyzes course titles and suggests relevant academic thematic emojis and standardized 4-letter course codes (e.g., `♾️` / `CALC`, `🧬` / `BIOL`, `💻` / `CSCI`).
- **Curated Categorized Picker**: 50+ emojis organized into STEM & Math, Humanities & Languages, Arts & Music, Sports & Health, and General.
- **Drag-and-Drop Reordering**: Custom ordering of courses in the sidebar with live drag handles and persistent index saving.

---

## 4. Header & Global Controls

### 4.1 Responsive Grouped Popovers
To eliminate horizontal layout breakage and visual clutter, controls are bundled into clean segmented popover menus:
1. **Display Popover (Consolidated)**:
   - **Scores & Points**: Globally show or hide all numerical scores and points badges.
   - **Class Averages**: Toggle display of class average benchmarks where Canvas reports score statistics.
   - **Canvas IDs (#)**: Display internal Canvas assignment and course numeric IDs for debugging.
   - **Calendar Events Overlay**: Toggle inclusion of schoolwide and course calendar events directly into assignment boards and overview.
   - **Hide Past Events**: Automatically filter out past calendar events while retaining upcoming items.
   - **Live Event Refresh**: Button with spinner to re-query calendar events without a full page reload.
2. **Filter Popover**:
   - **Show Submitted**: Toggle display of completed and graded assignments.
   - **Show Archived**: Reveal items manually tucked away by the student.
   - **Show Obsolete**: Toggle assignments past their lock or expiration date.
   - **Show Past Terms**: Toggle courses and assignments from prior academic quarters.
3. **Unobtrusive Autosave Toast (Corner-Packed)**:
   - Discreet floating badge packed in the bottom-right corner (`bottom-3 right-3`).
   - Clean, lightweight styling with subtle borders and auto-dismissal after 2.2 seconds.

---

## 5. Calendar Events: Locations & Semantics

### 5.1 Where Calendar Events Are Displayed
Calendar events (school assemblies, exams, seminars, extracurricular meetings, and course lectures fetched from `/api/v1/calendar_events`) appear in three deliberate places:
1. **Overview Page (Upcoming Events Panel)**:
   - A dedicated **"Upcoming Calendar Events"** card section displayed beneath the course standings grid.
   - Displays event title, course context badge, calendar date/time, and physical or virtual location tag.
2. **Assignments Board (Kanban Timeline)**:
   - When the Display popover's **"Calendar Events Overlay"** is active, calendar events are scheduled alongside assignments in the active timeline lanes (**Today**, **Up Next 2 Days**, **This Week**, **Later**).
   - Styled with a distinctive **Purple left border**, **Calendar icon**, and purple badge (`Event`) to clearly differentiate them from graded homework.
3. **Assignments Table (List View)**:
   - Rendered as chronological rows identified by a purple **"Event"** badge and MapPin location tag.

### 5.2 Clarified Item Filter ("Assignments Only" vs "Include Calendar Events")
- **Definition of Non-Assignment Items**: Non-assignment items are Canvas Calendar Events (which do not require student submissions or earn points).
- **Intelligent Self-Hiding**: If a student's enrolled courses contain zero calendar events, the item toggle is hidden completely to prevent confusion.
- **Clear User Labeling**: When calendar events are present, the board features a segmented filter clearly titled:
  - `Assignments Only (N)`
  - `Include Calendar Events (M)`

---

## 6. Primary Application Views

### 6.1 Overview View
- **Curated Academic Snapshot**: Replaces redundant tables with a focused high-level command center.
- **Course Academic Standing Grid**: Displays current course percentage, letter grade, and pending assignment count.
- **Handling Courses with Zero Graded Items ("No Grade Data")**:
  - If a course has 0 graded assignments (e.g., new semester or instructor has not entered grades), the dashboard displays **"No Grade Data"** instead of an inaccurate `0% F`.
- **Reserved Slot for "Est" Marker & Vertical Grade Alignment**:
  - A fixed-width container (`w-7 flex justify-center`) is reserved for the `Est` badge, ensuring that whether a course has an official score or an estimated score, all grade percentages (`tabular-nums w-12 text-right`) and letter badges (`w-7 text-center`) fall in a crisp, uniform vertical line.
- **Heuristic for "Est" (Estimated Course Grade)**:
  - **Definition**: Canvas does not always publish an official overall course grade (instructors frequently disable course-level grade reporting). When no official grade is present, the dashboard computes an unweighted heuristic average of all graded assignments:
    $$\text{Estimated Score} = \frac{\sum \text{Earned Points}}{\sum \text{Points Possible}} \times 100\%$$
  - Clearly articulated in tooltips and documentation: *"Estimated Course Grade: Canvas does not provide an official course grade for this class, so this is calculated as a heuristic unweighted average of your graded assignments."*

### 6.2 Assignments Board (Kanban View)
- **Status Lanes**:
  1. **Overdue**: Past due date without a confirmed submission (excluding calendar events).
  2. **Today**: Deadlines occurring today.
  3. **Tomorrow & Next 2 Days**: Imminent deliverables.
  4. **This Week**: Deadlines within the current calendar week.
  5. **Later & Undated**: Deadlines in subsequent weeks or without dates.
  6. **Completed & Graded**: Finished work with feedback and scores.
- **Bonded Card Edge Architecture**:
  - **Flat Vertical Accent Stripe**: Replaced standard rounded left borders (`border-l-4`) with an interior flat vertical accent stripe (`w-1`). This eliminates the curved "C-shape" tips that wrapped inward around rounded card corners, providing a straight, unbent scanning guide down the page.
  - **Desaturated Accent Tones**: Replaced hyper-saturated neon border lines with refined, desaturated hues (`bg-rose-400/90` for overdue, `bg-amber-400/80` for imminent, `bg-violet-400/80` for calendar events, `bg-sky-400/80` for to-do items, and `bg-slate-300` for neutral) that guide the eye without visually screaming.
  - **Natural-Case Course Titles**: Removed all-caps transformation (`uppercase tracking-wider`) from assignment and To-Do card banners in favor of clean natural-casing (`font-semibold text-slate-800 text-xs`) for effortless readability.
  - **Top Edge Banner**: Course title with custom emoji, event badge, translation button, lock status, and Canvas ID are bonded directly to the top card boundary (`px-3 py-1.5 bg-slate-50/90 border-b border-slate-100`).
  - **Top-Right Score Entity**: Displays points possible, earned score, or graded date flush in the top right.
  - **Bottom Edge Banner**: Due date text, feedback acknowledgment button, and submission checkbox are bonded directly to the bottom boundary (`px-3 py-1.5 border-t border-slate-100`).
- **Elimination of Clock Icons & Relative Due Dates**:
  - Imminent deadlines use intuitive relative labels (**"Today, [time]"**, **"Tomorrow, [time]"**, **"Yesterday, [time]"**) rather than requiring students to mentally calculate calendar numbers.
  - **Sleep-Safe Date Refresh**: Powered by the `useNow` hook that listens to document `visibilitychange` (waking the laptop from sleep) and window `focus`, ensuring dates never freeze or lag even if a machine sleeps for days.
- **Unboxed "Submitted?" Checkbox**:
  - Eliminated distracting yellow and grey pill boxes around "Submitted?". Replaced with a clean, unboxed text label and checkbox with smooth emerald highlight when checked.
- **Grammatical Points Formatting**:
  - Automatically handles singular vs. plural grammar via `formatPoints`: correctly displays **"1 pt"** (never "1 pts") and **"X pts"**.
- **Score Entity Semantics**:
  - **No Individual Item Letter Grades**: Letter grades are reserved for overall course standings and suppressed on individual assignment items to reduce visual noise.
  - **Score vs. Graded Date Swap**:
    - When `showScores` is enabled: The top-right entity displays the score (e.g., `8 / 10`). The graded date is omitted from the card to prevent clutter.
    - When `showScores` is disabled: The graded date automatically swaps into the exact same top-right entity slot (e.g., `Graded Oct 14`).
  - **Zero Points Placement**: `0 pts` belongs exclusively to the score entity (`0 pts` badge), never formatted alongside date stamps.
- **Persistent Feedback Review Banner**:
  - Displayed prominently by default whenever unacknowledged teacher comments exist across active courses, allowing one-click filtering or acknowledgment.

### 6.3 Canvas To-Do: Unified Edge-Bonded Card Architecture & "Done?" Checkbox
- **Unified Edge-Bonded Card Architecture**: Canvas To-Do cards (both in the dedicated To-Do view and the priority side drawer) strictly mirror the exact layout, edge-bonding, flat desaturated stripe, and visual aesthetics of the main assignment cards:
  - **Student Friendly Course Names**: Automatically resolves custom abbreviations (e.g. `PHYS`, `ENG`) and thematic emojis rather than raw Canvas context strings.
  - **Top Edge Banner**: Natural-cased course title and emoji flush left, quiz/submitting tag, points possible badge (formatted as `1 pt` or `X pts`), and external Canvas deep-link button flush right (`px-3 py-1.5 bg-slate-50/90 border-b border-slate-100`).
  - **Middle Card Body**: Full assignment title with hover state, clean instruction preview stripped of boilerplate, and submission type indicator.
  - **Bottom Edge Banner**: Relative due date with `Calendar` icon flush left, paired with the interactive **"Done?"** checkbox and loading spinner flush right (`px-3 py-1.5 bg-slate-50/50 border-t border-slate-100`).
- **Interactive "Done?" Checkbox**: Replaced ambiguous text buttons with an explicit **"Done?"** checkbox.
- **One-Click Dismissal**: Checking the box immediately applies a strike-through visual state and invokes Canvas's dismiss API endpoint (`DELETE /api/v1/users/self/todo/items/:id`), removing the item from the user's active LMS queue.

### 6.4 World Language Assignment & Module Translation
- **Automatic Language Detection**:
  - Scans course names for world languages commonly taught in schools in both English and native course language spellings (Spanish, French, German, Chinese, Japanese, Italian, Latin, Russian, Arabic, Portuguese, Korean, Hebrew, Greek).
  - Detects language classes across assignments, To-Do items, zoom details, and module lists.
- **3-State Dynamic Translation Button**:
  - **State 1 (Default / Un-translated)**: Subtle indigo badge (`bg-indigo-50 text-indigo-700`) displaying `[ES ➔ EN] Translate`.
  - **State 2 (Translating in Progress)**: Amber pulsing badge with animated spinner (`<Loader2 className="animate-spin" /> Translating...`).
  - **State 3 (Ready / Cached)**: Distinctive bright emerald badge (`bg-emerald-600 text-white font-bold`) displaying `[ES ➔ EN] Translated ✓`.
- **Persistent Dual-Layer Caching & Content Hashing**:
  - Translations are stored in an in-memory map and persisted across browser sessions in `localStorage` keyed by `canvas_translation_v2_${itemId}`.
  - Deterministic djb2 content hashing (`computeContentHash(title, description)`) detects LMS content modifications and invalidates stale cached translations automatically.
  - Subsequent clicks open translated text instantaneously (0ms latency) without re-querying external APIs.
- **Parallel Network Execution**:
  - Title and instruction text are fetched concurrently via `Promise.all` rather than sequentially, cutting network round trips and latency in half.
  - Graceful fallback with rate-limit warnings and 1-click external Google Translate integration.
- **Canvas Module Translation Support**:
  - Translation buttons are integrated directly into Canvas Module headers (`module-${id}`) and individual module items (`item-${id}` for assignments, pages, quizzes, files, discussions).
  - Language students can translate unit names and lesson titles directly from the Modules tab.
- **Zoom for Details Integration**:
  - Dedicated translation trigger in the Zoom Modal header with side-by-side English translation display and single-click copy to clipboard.
  - Replaced decorative sparkle icons with semantic language glyphs for a clean, non-AI-slop visual hierarchy.

### 6.5 Assignment Detail & Feedback Modal (Zoom Modal)
- **Automatic Smart Tab Selection**: Opens directly to feedback if comments or submissions exist.
- **Rubric Breakdown**: Full criterion points, descriptions, and ratings.
- **Clean Due Date Header**: Clean formatted date strings without redundant clock icons.
- **Proactive Related Modules & Resources Search (New)**:
  - Added dedicated **"Related Resources"** tab in the Zoom Modal.
  - Automatically correlates the active assignment with all modules in the course by direct assignment ID references, unit/chapter numerical matching (e.g. `Unit 3`, `Ch 4`, `Week 2`), and multi-term keyword heuristics.
  - Displays matching lecture slides, syllabus sheets, study guides, and review quizzes with categorized badges (`Direct Module Link`, `Matches Unit 3`, `Keyword Match`).
  - Provides direct in-app links and one-click external deep links (`html_url`) to jump directly to Canvas module items.
  - Built-in live search bar allows searching across all files and items in the course on demand.

### 6.6 Assignments Table (List View) & Error Boundary
- **Resolution of "Illegal constructor"**:
  - Root cause was unimported `Lock` in `utils/dashboard-helpers.ts`, which caused `getAssignmentStatus(assignment)` for locked-until assignments to fall back to the native Web Locks API (`window.Lock`), throwing `TypeError: Illegal constructor` when rendered as a JSX component `<status.icon />`.
  - Added Lucide icon `Lock` to `utils/dashboard-helpers.ts` and automated regression tests verifying element constructibility.
- **Self-Healing View Transitions**:
  - `ErrorBoundary` instances are now independently keyed by view mode and course (`key="board-..."` and `key="table-..."`) and implement `componentDidUpdate` to auto-clear error state when switching views, preventing caught errors from persisting when toggling between card and list views.
- **Sort and Filter Safeguards**: Protected against null submission scores and non-Set filter structures when toggling between Card and List views.

### 6.7 Tactical AI Academic Advisor & Problem-Solving Presets
- **Inline Compact State**: When collapsed, the AI Analyzer button renders in a neat, compact badge (`w-fit inline-flex max-w-full rounded-xl`) displaying the active preset mode, "Analyze" action with Star icon, and an expand toggle.
- **5 Tactical Problem-Solving Presets**:
  1. **Link Modules & Study Guides to Upcoming Work & Exams**: Searches course modules to locate exact lecture slides, reading pages, study guides, and review materials matching upcoming assignments, quizzes, and exams.
  2. **High-Impact Grade Rescue & Point Triage**: Analyzes point weights and current course grades to prioritize unsubmitted assignments with the highest mathematical impact on final letter grades.
  3. **Teacher Feedback Action Items & Revision Plan**: Synthesizes teacher comments and submission remarks across recent assignments into actionable revision steps and resubmission opportunities.
  4. **7-Day Tactical Study & Work Schedule**: Builds a day-by-day study roadmap grouping upcoming deadlines and allocating estimated time blocks for assignments and exam preparation.
  5. **Executive Workload & Deadline Briefing**: Summarizes the 3 most critical upcoming deadlines, flags urgent missing work from the past 2 weeks, and alerts on low-grade courses.
- **Deep Context Injection & Clickable Links**:
  - The Gemini engine receives all visible assignments, current course grades, teacher submission feedback comments, and course module structures with items (types, titles, and Canvas URLs).
  - Presets format recommended resources as direct, clickable HTML links (`<a href="URL" target="_blank" rel="noopener noreferrer">...</a>`) allowing students to jump straight into matching Canvas module slides and study guides.
- **Interactive UI & Customization**:
  - Quick-action preset chips with distinctive icons (`BookOpen`, `TrendingUp`, `MessageSquare`, `CalendarDays`, `Sparkles`).
  - Active preset banner with "Reset to preset" action.
  - Expandable drawer for custom prompt directives and model selection (Gemini 3.8 Flash, Gemini Flash Latest, Gemini 3.1 Flash Lite, Gemini 3.1 Pro).
  - Formatted report view with left accent bar, active mode badge, and 1-click clipboard copy with visual confirmation.

---

## 7. Grade Threshold & Evaluation Engine

### 7.1 Horizontal 3-in-1 Boundary Configurator
- **Single-Line Layout**: All three threshold cutoffs are displayed side-by-side in one horizontal row:
  - **Green Tier (A/Excellent)**: Default $\ge 90\%$ (Emerald green).
  - **Yellow Tier (B/Proficient)**: Default $80\% - 89\%$ (Gold/Amber).
  - **Orange Tier (C/Approaching)**: Default $70\% - 79\%$ (Vivid tangerine).
  - **Red Tier (D-F/Concern)**: Default $< 70\%$ (Crimson red).
- **Discrete Color Preview When Blending is Off**: When smooth gradient blending is disabled, the preview swatches render bold, high-contrast discrete colors rather than uncolored white boxes.
- **Widened Color Value Gaps**: Calibrated RGB color targets maintain strong perceptual separation between tiers without muddy intermediate transitions.

---

## 8. Cross-Device Synchronization & Persistence

### 8.1 Architecture Overview
| Tier | Storage Location | Lifetime | Synced Items |
|---|---|---|---|
| **Tier 1: Canvas Cloud Files** | `/saves/auto_save_*.json` in user's Canvas file area | Permanent / Cloud | All settings, course order, emojis, grade scale, filters |
| **Tier 2: Local Storage** | Browser `localStorage` keyed by `studentId` | Device-local | Cached snapshot for instant zero-latency startup |
| **Tier 3: Manual JSON Backup** | `.json` file download/upload | Portable | Offline cold backups, device-to-device transfers |

### 8.2 10-Minute Remote Push Throttling
- **Throttling Constant**: `REMOTE_AUTOSAVE_THROTTLE_MS = 600000` (10 minutes).
- **Local Immediacy**: Every UI change is immediately committed to browser `localStorage`.
- **Cloud Throttling**: The dashboard enforces a strict 10-minute cooldown on remote file creation in Canvas to prevent API flooding or storage bloat.
- **Unload Safety**: Any unpushed pending changes in memory are committed if the window unloads or upon explicit user save.

---

## 9. Automated Testing, Verification Suite & Crash Prevention

### 9.1 Multi-Tier Test Suite (`npm test` & In-App Diagnostics)
A comprehensive automated integration test suite is implemented in `scripts/test-runner.ts` covering 7 distinct suites (65 tests):
1. **Server Health & Connectivity**: Validates that the Express proxy server is running and responds with HTTP 200 on `/api/health`.
2. **Real Canvas API Verification via AI Studio Secrets**:
   - Uses test credentials configured securely in **AI Studio Secrets** (`Settings > Secrets`) as server environment variables (`TEST_CANVAS_TOKEN`, `TEST_CANVAS_DOMAIN`).
   - Zero secret files exist in the repository or filesystem, completely eliminating merge conflict prompts.
   - Client bundle isolation: Vite strictly ignores non-`VITE_` server environment variables during production builds (`dist/assets/index-*.js`), ensuring secrets can never leak or ship to client browsers.
   - Verifies real Canvas user authentication (`/api/v1/users/self`), validating student identity and student ID.
   - Queries real enrolled courses and To-Do lists over Canvas LMS REST endpoints.
3. **Domain Logic & Heuristic Calculations**:
   - World language detection regexes for English and native names (e.g., Spanish, French).
   - Grade tier color generation with discrete borders and high-contrast gaps.
   - Heuristic 0% vs. No Data classification for zero-graded courses.
   - Canvas default syllabus boilerplate removal and real content preservation.
   - Singular "1 pt" vs plural "X pts" grammar formatting.
   - Relative due date formatting ("Today, ...", "Tomorrow, ...").
   - Web Locks API constructor collision regression testing (`window.Lock` vs Lucide `Lock`).
4. **UI State Transition & Click Simulation**:
   - Simulates clicking "All" courses in the sidebar.
   - Simulates clicking "None" (toggling off all courses) and verifies safe fallback rendering without exceptions.
   - Simulates toggling on a single course from empty selection.
   - Simulates switching from multi-class view directly to single course view.
   - Simulates clicking the To-Do "Done?" checkbox and triggering dismissal handlers.
5. **World Language Translation Caching & Hashing**:
   - Validates language course detection badges (`ES ➔ EN`, `FR ➔ EN`).
   - Verifies deterministic djb2 content hashing on assignment titles and instructions.
   - Validates memory and localStorage caching, invalidating stale translations when instructions update.
6. **Proactive Related Modules Search**:
   - Tests tokenizer extraction of Unit, Chapter, and keyword patterns.
   - Verifies scoring heuristics matching assignment titles against course module slide decks, reading pages, and review packets.
7. **Tactical AI Problem-Solving Presets & Model Sanitization**:
   - Verifies all 5 tactical presets (`modules-exams`, `grade-impact`, `teacher-feedback`, `study-plan-7day`, `workload-overview`).
   - Verifies model sanitization defaulting legacy IDs to `gemini-3.8-flash`.

### 9.2 Running Tests Without AI Chat (In-App Diagnostics)
- **Zero AI Chat Dependency**: Users can run the automated test suite directly in the browser without asking the AI assistant.
- **In-App Runner in API Debugger**:
  - Accessible via the **"Debug"** button in the sidebar (or login screen).
  - Contains a dedicated **"Run Automated Test Suite (65 Tests)"** button.
  - Calls `POST /api/tests/run` on the local Express server and renders a color-coded test dashboard grouped by suite, showing passes (`✓`), failures (`✗`), and assertion descriptions.
- **Terminal Execution**: Can also be executed anytime via `npm test` from the terminal.

### 9.3 Robust Crash Guards & Error Boundaries
- **Defensive Array Spreading**: All `course.assignments` and `course.modules` references are guarded with `(c.assignments || [])` and `(c.modules || [])` to prevent `TypeError: undefined is not iterable` during rapid course filtering.
- **View-Level Error Isolation**: `<ErrorBoundary>` components wrap `<Overview>`, `<AssignmentsBoard>`, `<AssignmentsTable>`, and `<CanvasToDo>`, ensuring that any transient data error displays an in-place recovery action rather than crashing the entire dashboard.

---

*Specification Edition: 1.3 — Canvas Academic Intelligence Dashboard*

