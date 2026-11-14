import React, { useEffect, useState, useRef } from 'react';
import { 
  Play, 
  Square, 
  SkipForward, 
  X, 
  HelpCircle, 
  MousePointer, 
  Compass, 
  SlidersHorizontal, 
  Layout, 
  CheckCircle2, 
  RotateCcw,
  BookOpen
} from 'lucide-react';

export type TutorialId = 'major_views' | 'filters_and_controls';

export interface TutorialStep {
  title: string;
  description: string;
  targetSelector: string; // CSS selector to point to / highlight
  actionHint?: string;    // E.g. "Clicking Assignments Tab..."
  onBeforeStep?: () => void; // Trigger UI action (e.g., change tab or toggle menu)
  scrollIntoView?: boolean;
  pulseClick?: boolean;   // Visually trigger a mouse click effect on target
}

export interface TutorialDefinition {
  id: TutorialId;
  title: string;
  shortDesc: string;
  iconName: 'layout' | 'sliders';
  steps: TutorialStep[];
}

interface InteractiveTutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Controls passed down from Dashboard to execute actual actions
  activeTab: 'overview' | 'assignments' | 'calendar' | 'modules';
  onTabChange: (tab: 'overview' | 'assignments' | 'calendar' | 'modules') => void;
  assignmentsViewMode: 'list' | 'board';
  onAssignmentsViewModeChange: (mode: 'list' | 'board') => void;
  onOpenGradeSettings: () => void;
  onOpenCustomization?: () => void;
  onOpenNotes: () => void;
  initialTutorialId?: TutorialId;
}

export const InteractiveTutorialModal: React.FC<InteractiveTutorialModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  assignmentsViewMode,
  onAssignmentsViewModeChange,
  onOpenGradeSettings,
  onOpenCustomization,
  onOpenNotes,
  initialTutorialId = 'major_views'
}) => {
  const [selectedTutorial, setSelectedTutorial] = useState<TutorialId>(initialTutorialId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Directly start playing the chosen tour when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTutorial(initialTutorialId);
      setIsPlaying(true);
      setCurrentStepIndex(0);
      setIsPaused(false);
    } else {
      setIsPlaying(false);
      setCurrentStepIndex(0);
      setIsPaused(false);
    }
  }, [isOpen, initialTutorialId]);

  // Virtual cursor state
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 100, y: 100 });
  const [cursorClicking, setCursorClicking] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const stepTimerRef = useRef<any>(null);
  const moveTimerRef = useRef<any>(null);

  // Define the tutorial tracks
  const tutorials: TutorialDefinition[] = [
    {
      id: 'major_views',
      title: 'Navigation & Views',
      shortDesc: 'Overview, assignments, and modules.',
      iconName: 'layout',
      steps: [
        {
          title: 'Course Header',
          description: 'Shows active course or all enrolled classes.',
          targetSelector: '[data-tutorial="header-brand"]'
        },
        {
          title: 'Overview',
          description: 'Summary of grades, pending assignments, and quick course links.',
          targetSelector: '[data-tutorial="nav-tab-overview"]',
          onBeforeStep: () => onTabChange('overview')
        },
        {
          title: 'Assignments',
          description: 'Your coursework list and due dates. Switch between Board and List layout.',
          targetSelector: '[data-tutorial="nav-tab-assignments"]',
          onBeforeStep: () => onTabChange('assignments'),
          pulseClick: true
        },
        {
          title: 'Board / List Layout',
          description: 'View assignments grouped by due date or as a sortable table.',
          targetSelector: '[data-tutorial="view-mode-toggle"]',
          onBeforeStep: () => {
            onTabChange('assignments');
            onAssignmentsViewModeChange('board');
          },
          pulseClick: true
        },
        {
          title: 'Calendar',
          description: 'View upcoming Canvas calendar events in Agenda, Week, and Month views.',
          targetSelector: '[data-tutorial="nav-tab-calendar"]',
          onBeforeStep: () => onTabChange('calendar'),
          pulseClick: true
        },
        {
          title: 'Modules',
          description: 'Course content units and syllabus files organized by class.',
          targetSelector: '[data-tutorial="nav-tab-modules"]',
          onBeforeStep: () => onTabChange('modules'),
          pulseClick: true
        },
        {
          title: 'Class Sidebar',
          description: 'Drag to reorder classes, toggle visibility, and set course emojis.',
          targetSelector: '[data-tutorial="sidebar-container"]'
        }
      ]
    },
    {
      id: 'filters_and_controls',
      title: 'Display & Filter Controls',
      shortDesc: 'Display options, completed item filters, and grade colors.',
      iconName: 'sliders',
      steps: [
        {
          title: 'Display Menu',
          description: 'Show or hide scores, points possible, class averages, and item IDs.',
          targetSelector: '[data-tutorial="btn-display-popover"]',
          pulseClick: true
        },
        {
          title: 'Filter Menu',
          description: 'Show or hide submitted assignments, archived items, past terms, and past events.',
          targetSelector: '[data-tutorial="btn-filter-popover"]',
          pulseClick: true
        },
        {
          title: 'Calendar Events',
          description: 'Toggle Canvas calendar events overlay across assignments and Overview.',
          targetSelector: '[data-tutorial="btn-display-popover"]'
        },
        {
          title: 'Grade Thresholds',
          description: 'Adjust the 4 grade color boundaries with three sliders on one line.',
          targetSelector: '[data-tutorial="btn-grade-settings"]',
          onBeforeStep: () => onOpenGradeSettings(),
          pulseClick: true
        },
        {
          title: 'Notes & Backup',
          description: 'Write notes and manage settings saved to your Canvas account.',
          targetSelector: '[data-tutorial="btn-notes-toggle"]'
        }
      ]
    }
  ];

  const currentTutorial = tutorials.find(t => t.id === selectedTutorial) || tutorials[0];
  const currentStep = currentTutorial.steps[currentStepIndex];

  // Move the virtual cursor to target element
  const moveCursorToTarget = (selector: string, shouldPulse: boolean = false) => {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        // Position cursor slightly inside or centered on the target element
        const targetX = rect.left + Math.min(rect.width / 2, 40);
        const targetY = rect.top + Math.min(rect.height / 2, 20);

        setCursorPos({ x: targetX, y: targetY });

        if (shouldPulse) {
          setTimeout(() => {
            setCursorClicking(true);
            setTimeout(() => setCursorClicking(false), 300);
          }, 600);
        }
      } else {
        setTargetRect(null);
      }
    } catch (e) {
      // Element selector might not be in DOM yet
    }
  };

  // Step advancement: waits for user to click "Next Step" (no auto-advancement)
  useEffect(() => {
    if (!isPlaying || isPaused) return;

    const step = currentTutorial.steps[currentStepIndex];
    if (!step) {
      setIsPlaying(false);
      setCurrentStepIndex(0);
      return;
    }

    // Run action before step if provided
    if (step.onBeforeStep) {
      step.onBeforeStep();
    }

    // Animate cursor to target after brief delay to allow render
    moveTimerRef.current = setTimeout(() => {
      moveCursorToTarget(step.targetSelector, step.pulseClick);
    }, 200);

    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    };
  }, [isPlaying, isPaused, currentStepIndex, selectedTutorial]);

  const handleStartTutorial = (tutorialId: TutorialId) => {
    setSelectedTutorial(tutorialId);
    setCurrentStepIndex(0);
    setIsPaused(false);
    setIsPlaying(true);
  };

  const handleStopTutorial = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
    setTargetRect(null);
  };

  const handleNextStep = () => {
    if (currentStepIndex < currentTutorial.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      handleStopTutorial();
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 1. SELECTION / OVERVIEW MODAL (When not in full playback mode) */}
      {!isPlaying && (
        <div 
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={onClose}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-xl overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100/90 text-blue-700">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Interactive App Tutorials</h3>
                  <p className="text-xs text-slate-500">Self-guided interactive tours that showcase major views, filters, and hidden panels</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tutorial Selection List */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 font-medium">
                Choose a tour below. The tutorial will move a virtual pointer across the screen, highlight interactive sections, and navigate between views automatically.
              </p>

              <div className="space-y-3">
                {tutorials.map((tour) => {
                  const isSelected = selectedTutorial === tour.id;
                  return (
                    <div 
                      key={tour.id}
                      onClick={() => setSelectedTutorial(tour.id)}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-start justify-between gap-4 ${
                        isSelected 
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs' 
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className={`p-2.5 rounded-xl shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {tour.iconName === 'layout' ? <Layout className="w-5 h-5" /> : <SlidersHorizontal className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-sm">{tour.title}</h4>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                              {tour.steps.length} Steps
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {tour.shortDesc}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartTutorial(tour.id);
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play Tour</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <MousePointer className="w-3.5 h-3.5 text-blue-600" />
                <span>You can pause or exit the tour at any time.</span>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ACTIVE TUTORIAL TAKEOVER HUD (When isPlaying is true) */}
      {isPlaying && (
        <div className="fixed inset-0 z-50 pointer-events-none select-none">
          {/* Target Highlight Box */}
          {targetRect && (
            <div 
              className="absolute border-2 border-blue-500 bg-blue-500/10 rounded-xl transition-all duration-500 ring-4 ring-blue-400/30 shadow-lg pointer-events-none"
              style={{
                top: `${targetRect.top - 4}px`,
                left: `${targetRect.left - 4}px`,
                width: `${targetRect.width + 8}px`,
                height: `${targetRect.height + 8}px`
              }}
            />
          )}

          {/* Virtual Floating Mouse Cursor (clean without action tooltip) */}
          <div 
            className="absolute transition-all duration-500 ease-out z-50 pointer-events-none flex items-center"
            style={{
              top: `${cursorPos.y}px`,
              left: `${cursorPos.x}px`,
              transform: `translate(-4px, -4px) scale(${cursorClicking ? 0.85 : 1})`
            }}
          >
            <div className="relative">
              <MousePointer className="w-7 h-7 text-blue-500 fill-blue-500 drop-shadow-md stroke-white stroke-2" />
              {cursorClicking && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-400 animate-ping opacity-75" />
              )}
            </div>
          </div>

          {/* Floating Tutorial Explainer Banner / HUD (follows target element with viewport boundary clamping) */}
          {(() => {
            // Calculate dynamic positioning following targetRect or fallback to bottom
            let paneStyle: React.CSSProperties = {
              bottom: '1.5rem',
              left: '50%',
              transform: 'translateX(-50%)',
              position: 'fixed'
            };

            if (targetRect && typeof window !== 'undefined') {
              const windowWidth = window.innerWidth;
              const windowHeight = window.innerHeight;
              const paneWidth = Math.min(520, windowWidth - 32);

              // Center horizontally over target element, clamped within screen margins
              const targetCenterX = targetRect.left + targetRect.width / 2;
              const leftPos = Math.max(16, Math.min(targetCenterX - paneWidth / 2, windowWidth - paneWidth - 16));

              // Determine if we should show below or above target
              const spaceBelow = windowHeight - targetRect.bottom;
              const spaceAbove = targetRect.top;

              if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
                // Place below target
                const topPos = Math.min(targetRect.bottom + 16, windowHeight - 220);
                paneStyle = {
                  top: `${Math.max(16, topPos)}px`,
                  left: `${leftPos}px`,
                  width: `${paneWidth}px`,
                  position: 'fixed'
                };
              } else {
                // Place above target
                const bottomPos = windowHeight - targetRect.top + 16;
                paneStyle = {
                  bottom: `${Math.max(16, Math.min(bottomPos, windowHeight - 220))}px`,
                  left: `${leftPos}px`,
                  width: `${paneWidth}px`,
                  position: 'fixed'
                };
              }
            }

            return (
              <div 
                className="z-50 pointer-events-auto transition-all duration-300"
                style={paneStyle}
              >
                <div className="bg-slate-800/95 backdrop-blur-md text-slate-100 rounded-xl shadow-xl border border-slate-700/80 p-4 text-left animate-fadeIn">
                  {/* Header bar of the HUD */}
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-300">
                        Step {currentStepIndex + 1} of {currentTutorial.steps.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleStopTutorial}
                        className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

              {/* Step Title & Description */}
              <div className="mb-4">
                <h4 className="font-bold text-base text-white flex items-center gap-2">
                  <span>{currentStep?.title}</span>
                </h4>
                <p className="text-xs md:text-sm text-slate-300 mt-1 leading-relaxed">
                  {currentStep?.description}
                </p>
              </div>

              {/* Progress Bar & Navigation Controls */}
              <div className="flex items-center justify-between gap-4 pt-1">
                {/* Step Dots */}
                <div className="flex items-center gap-1.5">
                  {currentTutorial.steps.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentStepIndex(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === currentStepIndex 
                          ? 'w-6 bg-blue-500' 
                          : idx < currentStepIndex ? 'w-2 bg-blue-800' : 'w-2 bg-slate-700'
                      }`}
                      title={`Go to step ${idx + 1}`}
                    />
                  ))}
                </div>

                {/* Step Advance Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    disabled={currentStepIndex === 0}
                    className="px-3 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>{currentStepIndex === currentTutorial.steps.length - 1 ? 'Finish Tour' : 'Next Step'}</span>
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  )}
    </>
  );
};
