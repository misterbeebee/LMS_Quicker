# UI Space Optimization & Zoom-for-Details Plan

Refine the Canvas LMS dashboard UI to maximize information density, streamline workflow space, replace the narrow card flip with a centered "zoom for details" modal dialog, minimize button visual noise, soften color saturation, and make secondary analytical panels collapsible.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during clarification:
> - **Zoom Presentation**: Centered modal dialog with full content display (replaces the cramped 3D flip card).
> - **Minimalist Detail Trigger**: Subtle icon button revealed on hover with an expand/maximize icon (`Maximize2` / `Eye`) rather than a heavy persistent text badge.
> - **Additional Space-Saving**: Tighter table padding and compact overview stats bar with inline badges.

- **Confirmed Decision 1**: Assignments board will keep cards clean and compact; clicking the card or hover expand icon opens a spacious centered modal dialog.
- **Confirmed Decision 2**: Table view will support both inline expansion and quick zoom modal, with tightened row padding (`py-2.5` instead of `py-4`) for high information density.
- **Confirmed Decision 3**: "60H" bucket renamed to "2 days" (`Up Next (2 days)`), points display simplified to clean `N / N` without redundant `pts` suffix, and green score/status badges softened to desaturated sage tones.
- **Confirmed Decision 4**: Gemini Academic Analyst made fully collapsible with a clean, 1-line header bar when collapsed.
- **Confirmed Decision 5**: Overview cards (Current Grade, Assignments, Modules) compressed from `p-6` cards into a sleek, unified horizontal stats bar.

---

## 1. Overview & Core Concept

- **What It Does**: Optimizes vertical and horizontal screen real estate across the Canvas LMS dashboard. Reduces visual clutter by turning heavy "Details" buttons into elegant micro-controls, softening neon green badges into calm, accessible tones, making the AI analysis section collapsible, and giving detailed assignment prompts a spacious, dedicated modal window.
- **Target Audience**: Students and educators who want a dense, distraction-free cockpit view of their academic deadlines, grades, and course modules.
- **Key Value**: Eliminates claustrophobic scrolling inside small card boundaries, improves scannability across columns and tables, and frees up 200px+ of vertical space on load.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Viewing Urgent Deadlines**:
   - The user opens the dashboard and immediately sees the compact overview stats bar (Grade, Pending Assignments, Modules) occupying under 70px of height instead of bulky cards.
   - The Gemini Academic Analyst sits neatly collapsed as a thin pill/bar that expands on demand.
   - Column 2 clearly reads **"Up Next (2 days)"** rather than "60H".
2. **Zooming Assignment Details**:
   - On the board, cards are sleek with subtle hover borders. A discreet icon button (`Maximize2`) appears in the top-right / action row on hover.
   - Clicking the card or the expand icon smoothly opens a centered backdrop modal dialog (`max-w-3xl`) with complete assignment instructions, grading rubrics, submission feedback, score statistics, and direct "Open in Canvas" actions without cramped scrolling.
   - Pressing `Esc`, clicking the backdrop, or clicking the close button dismisses the modal instantly.
3. **Table View Navigation**:
   - Table rows feature tightened padding (`py-2 px-3`) allowing 2× more assignments to fit above the fold.
   - Score badges render clean numbers (`95 / 100`) without redundant `pts` text.
   - Completed and high-scoring badges use a soft, desaturated sage-green background (`#e2efe6` / `bg-emerald-50 text-emerald-800 border-emerald-200/50`) instead of bright saturated neon.

### Visual Identity & Theme Tokens

- **Muted Green Tones**:
  - Score badge (90-100%): Soft sage `#d8ede1` to `#cde6d7` with charcoal text (`#1e293b`), avoiding eye-straining neon greens.
  - Completed status: `bg-emerald-50/80 text-emerald-800 border border-emerald-200/60`.
- **Card Score Format**:
  - `95 / 100` (graded) or `100 pts` (ungraded base points), eliminating `95 / 100 pts`.
- **Typography & Spatial Math**:
  - Column header: `Up Next (2 days)` with clean 12px uppercase tracking.
  - Card padding: `p-3.5` (down from `p-4` with redundant inner wrappers).

---

## 3. Key Product Decisions & Trade-Offs

- **Centered Modal vs. In-Grid Flip**:
  - *Chosen Approach*: Centered backdrop modal dialog for assignment details.
  - *Why*: In a 4-column responsive Kanban board, flipping a 250px column card leaves inadequate horizontal space for long assignment prompts, complex multi-column rubric grids, and professor feedback. A centered modal (`max-w-3xl`) displays full content with optimal line length without disrupting sibling board columns.
- **Collapsible AI Panel vs. Permanent Embed**:
  - *Chosen Approach*: Default collapsed state with a clean 1-line header bar and "Expand / Generate Report" quick trigger.
  - *Why*: Saves ~180px of prime viewport real estate above the fold so users immediately see their upcoming deadlines upon logging in.
- **Desaturated Palette vs. Vivid Gamut**:
  - *Chosen Approach*: WCAG AA compliant muted sage greens (`#2d6a4f` text on `#e9f5ed` background).
  - *Why*: Reduces cognitive fatigue during prolonged study sessions and complies with anti-slop visual restraint.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Dashboard                                 │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Compact Overview Stats Bar (Grade · Pending · Modules)           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Collapsible Gemini Analyst Bar [ Chevron Toggle / Status ]       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────┐   ┌────────────────────────────┐  │
│  │       AssignmentsBoard          │   │      AssignmentsTable      │  │
│  │  - Up Next (2 days) header      │   │  - Compact row py-2.5      │  │
│  │  - Minimal hover Maximize icon  │   │  - N / N clean score       │  │
│  │  - Desaturated green scores     │   │  - Desaturated green       │  │
│  │  - Simplified "N / N" badge     │   │  - Quick Zoom modal trigger│  │
│  └────────────────┬────────────────┘   └─────────────┬──────────────┘  │
│                   │                                  │                 │
│                   └────────────────┬─────────────────┘                 │
│                                    ▼                                   │
│                  ┌───────────────────────────────────┐                 │
│                  │   AssignmentZoomModal (Dialog)    │                 │
│                  │  - Centered backdrop overlay      │                 │
│                  │  - Full formatted instructions    │                 │
│                  │  - Multi-tier Rubric & Feedback   │                 │
│                  │  - Direct Canvas deep link        │                 │
│                  └───────────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Modifications Planned

1. **`components/dashboard/Overview.tsx`**:
   - Refactor from bulky 3-column cards (`p-6`) into a sleek horizontal metric bar (`p-3.5 px-4`, single-row layout with divider lines and prominent compact badges).
2. **`components/dashboard/AnalysisPanel.tsx`**:
   - Add `isCollapsed` state with persistent local toggle.
   - Render a slim header with toggle chevron when collapsed, expanding smoothly with report contents.
3. **`components/dashboard/AssignmentsBoard.tsx`**:
   - Replace the 3D flip card container with a standard compact card layout.
   - Add hover-revealed minimalist icon button (`Maximize2` / `Eye`) in the header/action area.
   - Update bucket title from `Up Next (60h)` to `Up Next (2 days)`.
   - Update score format from `${score} / ${points} pts` to `${score} / ${points}`.
   - Render `AssignmentZoomModal` when an assignment is selected for details.
4. **`components/dashboard/AssignmentsTable.tsx`**:
   - Tighten table padding (`p-2.5` instead of `p-4`), refine typography, and support opening the zoom modal.
   - Format score as `${score} / ${points}`.
5. **`utils/dashboard-helpers.ts`**:
   - Adjust `cGreen` in `getScoreStyle` to desaturated sage green (`{ r: 205, g: 235, b: 218 }`).
   - Adjust `getAssignmentStatus` to use soft desaturated classes (`bg-emerald-50 text-emerald-800 border border-emerald-200/60`).
6. **`components/dashboard/AssignmentZoomModal.tsx`**:
   - Implement clean accessible modal with backdrop blur, keyboard `Esc` listener, tabbed instructions/rubric/feedback, and responsive sizing.
