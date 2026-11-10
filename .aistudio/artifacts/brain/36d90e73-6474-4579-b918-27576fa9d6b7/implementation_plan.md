# Canvas Academic Intelligence Dashboard: Sidebar All/None Fix, Cross-Device Sync & Full Feature Specification

Fixes the sidebar course selection controls, implements robust cross-device synchronization for thematic emojis and course customizations via Canvas remote cloud storage plus manual JSON backup, and creates the first comprehensive specification artifact of all existing application features.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed with the user in Phase 1:
> - **Sidebar All / None Action**: Clicking "All" or "None" in the sidebar will immediately switch the view to "All Courses" (multi-course view) so filter changes are immediately apparent.
> - **Cross-Device Sync Architecture**: Course customizations (emojis, abbreviations, course order, and custom grade scales) will be bundled directly into the Canvas remote save schema (`auto_save_*.json` and named saves) for automatic zero-friction sync, complemented by a manual JSON Export/Import option in the settings panel.
> - **Full Specification Artifact**: We will generate the first edition of `app_specification.md` in the artifacts directory detailing all existing features, data models, workflows, and controls before expanding into future modules.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Restores full operational reliability to the **All** and **None** course filter buttons in the sidebar, instantly updating the multi-course view.
  - Ensures thematic emojis, custom 4-letter abbreviations, custom drag-and-drop course ordering, and customized grade threshold scales seamlessly transfer between different computers and mobile browsers through the student's Canvas remote files repository (`/saves` folder) and optional JSON backup/restore.
  - Delivers a comprehensive standalone artifact (`app_specification.md`) capturing the complete feature set, domain architecture, and design rules established across all iterations.
- **Target Audience**: Students, parents, and academic observers managing multiple courses or multi-child student profiles who need consistent personalizations across all their devices.

---

## 2. User Experience & Visual Design

- **Sidebar Course Controls**:
  - When clicking **All**, all active courses are toggled visible, and `selectedCourseId` immediately shifts to `ALL_COURSES_ID` (Combined View).
  - When clicking **None**, all courses are deselected, and `selectedCourseId` shifts to `ALL_COURSES_ID` showing a clean zero-state prompt.
  - The `visibleCount` counter (`X of Y visible`) updates reactively with no lag.
- **Cross-Device Customizations Sync**:
  - On launch or student switch, if a remote Canvas save exists, the dashboard automatically imports emojis, abbreviations, course order, and custom grade boundaries without overwriting fresher local edits.
  - In the settings/save dialog, users can click **Export Settings JSON** to download their preferences file or **Import Settings JSON** to instantly restore customizations onto an offline device or another browser.
- **Visual Discipline & Polish**:
  - Strict compliance with `frontend-design`: No unboxed pills for static metadata; segmented buttons with clean active states; smooth and distorted gradient blending for score and grade displays; WCAG AA contrast.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Immediate Multi-Course View on All/None**
  - *Chosen Approach*: `setSelectedCourseId(ALL_COURSES_ID)` when clicking All or None.
  - *Why*: In single-course view, changing multi-course visibility checkboxes has no visual effect until the user switches to All Courses, creating the impression that the buttons "stopped working". Switching to All Courses immediately reveals the result of the action.
- **Decision 2: Remote Canvas File Store as the Cloud Backbone**
  - *Chosen Approach*: Embed `courseCustomizations`, `courseOrder`, and `gradeScaleConfig` directly into `UserSettings`.
  - *Why*: The app already possesses Canvas user files API integration for saving workspace snapshots (`/saves/auto_save_*.json`). By piggybacking on this existing cloud file mechanism, users get authentic cross-device sync without requiring a separate 3rd-party database.
- **Decision 3: Dedicated Offline JSON Backup**
  - *Chosen Approach*: Add explicit JSON file export and import in the Save/Load modal.
  - *Why*: Provides redundancy in case Canvas API permissions restrict file uploads or when users want to share configurations across different Canvas domains or testing environments.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                       Sidebar UI                            │
│  [All] / [None] Button Click                                │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
    setVisibleCourseIds(all/none)   setSelectedCourseId(ALL)
               │                              │
               └──────────────┬───────────────┘
                              ▼
           Re-render Dashboard (Multi-Class View)

┌─────────────────────────────────────────────────────────────┐
│                 Cross-Device Sync Lifecycle                 │
│                                                             │
│   Canvas Remote Files (/saves/*.json)                       │
│              ▲                              │               │
│   compileSettings()                  applySettings()        │
│   (emojis, order, gradescale)        (hydrates state & LS)  │
│              │                              │               │
│   Dashboard State ◄─────────────────────────┘               │
│              │                                              │
│              ▼                                              │
│   Manual JSON Export / Import (Fallback Backup)             │
└─────────────────────────────────────────────────────────────┘
```

### Data Model Enhancements in `types.ts`

```ts
export interface UserSettings {
  timestamp: string;
  viewPreferences: { ... };
  context: {
    selectedCourseId: number | null;
    visibleCourseIds?: number[];
  };
  tableState: { ... };
  // New cross-device synchronization fields:
  courseCustomizations?: Record<number, { abbreviation?: string; emoji?: string }>;
  courseOrder?: number[];
  gradeScaleConfig?: GradeScaleConfig;
}
```

### Implementation Steps

1. **`types.ts`**:
   - Add `courseCustomizations`, `courseOrder`, and `gradeScaleConfig` to `UserSettings`.
2. **`services/courseCustomization.ts`**:
   - Add bulk export/import helper functions (`setCourseCustomizationsBulk`, `exportCustomizationsAsJson`, `importCustomizationsFromJson`) to sync with `localStorage` and keep in-memory components updated.
3. **`components/Dashboard.tsx`**:
   - Fix `handleSelectAllCourses` and `handleSelectNoneCourses` to switch `selectedCourseId` to `ALL_COURSES_ID`.
   - Update `compileSettings()` to include `courseCustomizations`, `courseOrder`, and `gradeScaleConfig`.
   - Update `applySettings()` to extract and apply `courseCustomizations`, `courseOrder`, and `gradeScaleConfig`, triggering state and view refreshes.
   - Wire manual JSON backup and restore controls in the SaveLoad/Settings modal.
4. **Specification Artifact (`app_specification.md`)**:
   - Write comprehensive full specification artifact into `/.aistudio/artifacts/brain/36d90e73-6474-4579-b918-27576fa9d6b7/app_specification.md` documenting all features:
     - Multi-Student Observer Switcher & Canvas API Proxy Architecture
     - Visual Dashboards: Overview, Assignments Board (Kanban), Assignments Table (Matrix)
     - Modules Explorer with chronological alignment, today bookmarking, and collapse controls
     - Grade & Evaluation Engine: Smooth color blending, distorted grade boundaries, unranked vs. zero-score handling, and threshold configurator
     - Feedback & Submission Inspection: Single-item acknowledgment, batch acknowledgment with confirmation, rubric score breakdowns
     - Intelligent Course Customizer: Thematic emoji matcher, 4-letter academic code generator, and drag-and-drop course reordering
     - Remote Canvas Cloud Storage & State Autosave Engine
     - Interactive Self-Guided UI & Control Tutorials
5. **Validation**:
   - Co-execute `compile_applet` and `lint_applet` to confirm error-free build.
   - Dev server verification.
