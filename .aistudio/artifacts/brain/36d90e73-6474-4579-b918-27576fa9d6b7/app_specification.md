# Canvas Academic Intelligence Dashboard: Live Feature Specification (v1.1)

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
│  │    Sidebar    │ │  Header (Student Switcher, View Tabs, Grouped Popovers)│ │
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
│  - Course Customizations Engine (Smart Emojis, 4-Letter Academic Codes)     │
│  - GradeScaleConfig (Smooth Blending & Distorted Grade Boundaries)          │
│  - Score Entity Semantics (Score vs Graded Date Swap, No Item Letter Grade) │
│  - World Language Translation Engine (Detection & MyMemory API / GTranslate)│
│  - Teacher Feedback Acknowledgment Tracker (Single & Batch with Confirm)    │
│  - Chronological Module Date Sorter with Today Bookmark Anchor              │
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
└──────────────────────────────┘ └───────────────────────────────────────────┘
```

---

## 2. Multi-Student Observer & Authentication

### 2.1 Profile Switcher
- **Observer Architecture**: Parents and academic counselors can configure multiple student profiles with custom Canvas domains, access tokens, proxy preferences, and identifying color codes (Blue, Emerald, Purple, Amber, Rose).
- **One-Click Hot Switching**: Instant switching in the top-left corner of the sidebar or header without page reloads.
- **Data Isolation**: Custom emojis, course ordering, archived assignment IDs, marked-as-submitted overrides, and acknowledged teacher comments are keyed by `studentId` to prevent cross-profile contamination.

### 2.2 Direct API & Server Proxy Modes
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

## 5. Primary Application Views

### 5.1 Overview View
- **Curated Academic Snapshot**: Replaces redundant tables with a focused high-level command center.
- **Course Academic Standing Grid**: Displays current course percentage, letter grade, and pending assignment count.
- **Reserved Slot for "Est" Marker & Vertical Grade Alignment**:
  - A fixed-width container (`w-7 flex justify-center`) is reserved for the `Est` badge, ensuring that whether a course has an official score or an estimated score, all grade percentages (`tabular-nums w-12 text-right`) and letter badges (`w-7 text-center`) fall in a crisp, uniform vertical line.
- **Heuristic for "Est" (Estimated Course Grade)**:
  - **Definition**: Canvas does not always publish an official overall course grade (instructors frequently disable course-level grade reporting). When no official grade is present, the dashboard computes an unweighted heuristic average of all graded assignments:
    $$\text{Estimated Score} = \frac{\sum \text{Earned Points}}{\sum \text{Points Possible}} \times 100\%$$
  - Clearly articulated in tooltips and documentation: *"Estimated Course Grade: Canvas does not provide an official course grade for this class, so this is calculated as a heuristic unweighted average of your graded assignments."*
- **Upcoming Calendar Events Section**:
  - Dedicated panel presenting scheduled live events with titles, descriptions, formatted date/time, and location pins.
- **Calm, Neutral Guided Walkthroughs Banner**:
  - Styled with subtle slate borders, clean `Compass` icon (no artificial AI sparkle icons), and direct one-click launchers that immediately start the virtual pointer tour without redundant preflight modals.

### 5.2 Assignments Board (Kanban View)
- **Status Lanes**:
  1. **Overdue**: Past due date without a confirmed submission (excluding calendar events).
  2. **Today**: Deadlines occurring today.
  3. **Tomorrow & Next 2 Days**: Imminent deliverables.
  4. **This Week**: Deadlines within the current calendar week.
  5. **Later & Undated**: Deadlines in subsequent weeks or without dates.
  6. **Completed & Graded**: Finished work with feedback and scores.
- **Segmented Item Type Switcher**:
  - `[All Items (N)] [Assignments (N)] [Events (N)]` segmented tab bar for instant schedule filtering.
- **Score Entity Semantics**:
  - **No Individual Item Letter Grades**: Letter grades are reserved for overall course standings and suppressed on individual assignment items to reduce visual noise.
  - **Score vs. Graded Date Swap**:
    - When `showScores` is enabled: The top-right entity displays the score (e.g., `8 / 10`). The graded date is omitted from the card to prevent clutter.
    - When `showScores` is disabled: The graded date automatically swaps into the exact same top-right entity slot (e.g., `Graded Oct 14`).
  - **Zero Points Placement**: `0 pts` belongs exclusively to the score entity (`0 pts` badge), never formatted alongside date stamps.

### 5.3 World Language Assignment Translation
- **Automatic Language Detection**:
  - Scans course names for world languages commonly taught in schools in both English and native course language spellings:
    - Spanish (*Español*)
    - French (*Français*)
    - German (*Deutsch*)
    - Chinese/Mandarin (*中文 / 汉语*)
    - Japanese (*日本語*)
    - Italian (*Italiano*)
    - Latin (*Lingua Latina*)
    - Russian (*Русский*)
    - Arabic (*العربية*)
    - Portuguese (*Português*)
    - Korean (*한국어*)
    - Hebrew (*עברית*)
    - Greek (*Ελληνικά*)
- **Translation Button**:
  - Displayed on assignment cards (`[ES ➔ EN] Translate`) and table rows.
- **Translation Modal**:
  - Dual-panel display comparing original assignment text and English translation.
  - Automated translation using free MyMemory public translation API.
  - One-click copy for English text.
  - Direct deep link to Google Translate with pre-populated source language and text.

### 5.4 Assignment Detail & Feedback Modal (Zoom Modal)
- **Automatic Smart Tab Selection**: Opens directly to feedback if comments or submissions exist.
- **Rubric Breakdown**: Full criterion points, descriptions, and ratings.
- **Translation Integration**: Translate button for language assignments directly within the detail header.
- **Feedback Acknowledgment System**: Single comment acknowledgment and batch "Acknowledge All" with confirmation.

### 5.5 Assignments Table (Matrix View)
- Sortable columns for Course, Title, Due Date, Score/Points, Status, Type, and Actions.
- Responsive column filters and batch export (JSON, CSV, XML).
- Unified score entity semantics matching board view.

### 5.6 Modules Explorer & Canvas To-Do
- Chronological module ordering with automatic "Today" anchor.
- Official Canvas To-Do stream with one-click task dismissal.

---

## 6. Grade Threshold & Evaluation Engine

### 6.1 Configurable Boundaries
- **Green Tier (A/Excellent)**: Default $\ge 90\%$
- **Yellow Tier (B/Proficient)**: Default $80\% - 89\%$
- **Orange Tier (C/Approaching)**: Default $70\% - 79\%$
- **Red Tier (D-F/Concern)**: Default $< 70\%$

### 6.2 Blended Color Interpolation
- **Smooth Grade Blending**: Raw scores smoothly transition along an RGB gradient (e.g., 89% displays as warm lime-green, avoiding harsh visual cutoffs).
- **Distorted Course Grade Boundaries**: For overall course averages, an S-curve gradient highlights opportunity and danger zones while preserving clear visual separation around letter grade cutoffs.

---

## 7. Cross-Device Synchronization & Persistence

### 7.1 Architecture Overview
| Tier | Storage Location | Lifetime | Synced Items |
|---|---|---|---|
| **Tier 1: Canvas Cloud Files** | `/saves/auto_save_*.json` in user's Canvas file area | Permanent / Cloud | All settings, course order, emojis, grade scale, filters |
| **Tier 2: Local Storage** | Browser `localStorage` keyed by `studentId` | Device-local | Cached snapshot for instant zero-latency startup |
| **Tier 3: Manual JSON Backup** | `.json` file download/upload | Portable | Offline cold backups, device-to-device transfers |

### 7.2 10-Minute Remote Push Throttling
- **Throttling Constant**: `REMOTE_AUTOSAVE_THROTTLE_MS = 600000` (10 minutes).
- **Local Immediacy**: Every UI change is immediately committed to browser `localStorage`.
- **Cloud Throttling**: The dashboard enforces a strict 10-minute cooldown on remote file creation in Canvas to prevent API flooding or storage bloat.
- **Unload Safety**: Any unpushed pending changes in memory are committed if the window unloads or upon explicit user save.

---

## 8. Interactive Guided Tours

### 8.1 Built-in Guided Tours
1. **Major UI Views Tour**: Step-by-step guided walkthrough across Overview, Assignments Board, Assignments Table, Modules Explorer, and To-Do list.
2. **Filters & Settings Tour**: Focused tour highlighting the consolidated Display popover, assignment filters, grade threshold configurator, and customization palette.

### 8.2 Execution Engine
- **Direct Playback**: Clicking either tour launcher immediately begins playback (`isPlaying: true`), bypassing redundant preflight confirmation dialogs.
- **Virtual Animated Mouse Cursor**: Simulated pointer glides smoothly between target selectors (`data-tutorial="..."`) with pulse animations.
- **Takeover HUD**: Floating bottom console with step progress, Pause/Resume, and Exit controls.

---

*Specification Edition: 1.1 — Canvas Academic Intelligence Dashboard*
