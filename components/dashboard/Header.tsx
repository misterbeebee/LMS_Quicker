

import React, { useState, useRef, useEffect } from 'react';
import { Download, StickyNote, Save, Loader2, FolderOpen, LayoutList, Kanban, Megaphone, Zap, Calendar, RefreshCw, ChevronDown, SlidersHorizontal, Settings, ExternalLink, Menu, Sliders, LogOut } from 'lucide-react';
import { CourseData, ExportFormat, StudentProfile, CanvasCalendarEvent } from '../../types';
import { downloadData } from '../../services/exporter';
import { StudentSwitcher } from './StudentSwitcher';

interface HeaderProps {
  selectedCourseName: string;
  activeTab: 'overview' | 'assignments' | 'calendar' | 'modules';
  onTabChange: (tab: 'overview' | 'assignments' | 'calendar' | 'modules') => void;
  // Assignment View Mode
  assignmentsViewMode: 'list' | 'board';
  onAssignmentsViewModeChange: (mode: 'list' | 'board') => void;
  
  // Show Preferences (Renamed from Hide)
  showSubmitted: boolean;
  onToggleShowSubmitted: (val: boolean) => void;
  showObsolete: boolean;
  onToggleShowObsolete: (val: boolean) => void;
  showPastTerms: boolean;
  onToggleShowPastTerms: (val: boolean) => void;
  
  showScores: boolean;
  onToggleShowScores: (val: boolean) => void;

  showClassAverages?: boolean;
  onToggleShowClassAverages?: (val: boolean) => void;

  showIds: boolean;
  onToggleShowIds: (val: boolean) => void;

  // Calendar events
  showCalendarEvents?: boolean;
  onToggleShowCalendarEvents?: (val: boolean) => void;
  calendarEventsCount?: number;
  calendarEvents?: CanvasCalendarEvent[];
  showPastEvents?: boolean;
  onToggleShowPastEvents?: (val: boolean) => void;
  loadingCalendarEvents?: boolean;
  onRefreshCalendarEvents?: () => void;
  
  // Renamed from showManuallyHidden
  showArchived: boolean;
  onToggleShowArchived: (val: boolean) => void;
  onResetFilters?: () => void;
  
  data: CourseData[];
  onToggleNotes: () => void;
  onSaveSettings: () => void;
  isSaving: boolean;
  onOpenLoadModal: () => void;
  onDebugAutosave: () => void;
  onOpenGradeSettings?: () => void;
  currentStudentId?: string;
  currentStudentName?: string;
  currentDomain?: string;
  canvasToken?: string;
  useProxy?: boolean;
  onSwitchStudent?: (student: StudentProfile) => void;
  onRenameStudent?: (newName: string) => void;
  onOpenMobileMenu?: () => void;
  onOpenMobileSettings?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedCourseName,
  activeTab,
  onTabChange,
  assignmentsViewMode,
  onAssignmentsViewModeChange,
  showSubmitted,
  onToggleShowSubmitted,
  showObsolete,
  onToggleShowObsolete,
  showPastTerms,
  onToggleShowPastTerms,
  showScores,
  onToggleShowScores,
  showClassAverages = false,
  onToggleShowClassAverages,
  showIds,
  onToggleShowIds,
  showCalendarEvents = true,
  onToggleShowCalendarEvents,
  calendarEventsCount = 0,
  showPastEvents = false,
  onToggleShowPastEvents,
  loadingCalendarEvents = false,
  onRefreshCalendarEvents,
  showArchived,
  onToggleShowArchived,
  onResetFilters,
  data,
  calendarEvents = [],
  onToggleNotes,
  onSaveSettings,
  isSaving,
  onOpenLoadModal,
  onDebugAutosave,
  onOpenGradeSettings,
  currentStudentId,
  currentStudentName,
  currentDomain,
  canvasToken,
  useProxy = true,
  onSwitchStudent,
  onRenameStudent,
  onOpenMobileMenu,
  onOpenMobileSettings,
  onLogout
}) => {
  const [isDisplayMenuOpen, setIsDisplayMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const displayMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (displayMenuRef.current && !displayMenuRef.current.contains(e.target as Node)) {
        setIsDisplayMenuOpen(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute active count for badges in the popover trigger buttons
  const activeDisplayCount = (showScores ? 1 : 0) + (showClassAverages ? 1 : 0) + (showIds ? 1 : 0) + (showCalendarEvents ? 1 : 0);
  const activeFilterCount = (showSubmitted ? 1 : 0) + (showArchived ? 1 : 0) + (showObsolete ? 1 : 0) + (showPastTerms ? 1 : 0) + (showPastEvents ? 1 : 0);
  const totalActiveControls = activeDisplayCount + activeFilterCount;

  return (
    <header
      data-testid="dashboard-header"
      className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] shrink-0 relative z-30 shadow-2xs flex flex-wrap md:flex-nowrap items-center justify-between gap-x-2 gap-y-2 md:gap-4"
    >
      {/* Row 1 Left (Desktop & Mobile): Mobile Hamburger + App Tile + Single Student Info Widget */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink md:shrink-0 order-1" data-tutorial="header-brand">
        {/* Mobile Sidebar Hamburger Toggle */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-1.5 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition shrink-0"
          title="Open courses menu"
          aria-label="Open course menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-2xs shrink-0">
            V
          </div>
          <span className="hidden sm:inline font-bold text-sm sm:text-base tracking-tight text-slate-900">
            Velm
          </span>
        </div>

        {/* Single Always-Visible Student Info / Switcher Widget (not hidden in Sidebar) */}
        {onSwitchStudent && (
          <div data-testid="header-student-switcher" className="min-w-0">
            <StudentSwitcher
              currentStudentId={currentStudentId}
              currentStudentName={currentStudentName}
              currentDomain={currentDomain}
              canvasToken={canvasToken}
              useProxy={useProxy}
              onSwitchStudent={onSwitchStudent}
              onRenameStudent={onRenameStudent}
            />
          </div>
        )}
      </div>

      {/* Dedicated Menu Bar Row on Mobile (order-3 w-full); Centered Nav Tabs on Desktop (md:order-2) */}
      <div
        className="order-3 md:order-2 w-full md:w-auto md:flex-1 flex items-center justify-between sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full pt-1.5 md:pt-0 border-t border-slate-100 md:border-t-0 custom-scrollbar"
        data-tutorial="nav-tabs-group"
      >
        <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0 overflow-x-auto">
          <button 
            data-tutorial="nav-tab-overview"
            onClick={() => onTabChange('overview')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-md transition cursor-pointer shrink-0 ${activeTab === 'overview' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            title="Switch to Overview"
          >
            Overview
          </button>
          <button 
            data-tutorial="nav-tab-assignments"
            onClick={() => onTabChange('assignments')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-md transition cursor-pointer shrink-0 ${activeTab === 'assignments' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            title="Switch to Assignments view"
          >
            Assignments
          </button>
          <button 
            data-tutorial="nav-tab-calendar"
            onClick={() => onTabChange('calendar')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-md transition cursor-pointer shrink-0 ${activeTab === 'calendar' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            title="Switch to Calendar view"
          >
            Calendar
          </button>
          <button 
            data-tutorial="nav-tab-modules"
            onClick={() => onTabChange('modules')}
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold rounded-md transition cursor-pointer shrink-0 ${activeTab === 'modules' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            title="Switch to Modules view"
          >
            Modules
          </button>
        </div>

        {/* Assignments Board vs List Mode Switcher */}
        {activeTab === 'assignments' && (
          <div className="flex bg-slate-100 rounded-lg p-0.5 shrink-0" data-tutorial="view-mode-toggle">
            <button
              onClick={() => onAssignmentsViewModeChange('list')}
              className={`p-1 sm:p-1.5 rounded transition cursor-pointer ${assignmentsViewMode === 'list' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="List View"
            >
              <LayoutList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              onClick={() => onAssignmentsViewModeChange('board')}
              className={`p-1 sm:p-1.5 rounded transition cursor-pointer ${assignmentsViewMode === 'board' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="Board View"
            >
              <Kanban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Row 1 Right: Global Controls (order-2 md:order-3) */}
      <div className="order-2 md:order-3 flex items-center gap-1.5 sm:gap-2 shrink-0">

        {/* Mobile-only All-Settings Drawer Button */}
        <div className="flex md:hidden items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenMobileSettings}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition"
            title="Open view filters and options"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            {totalActiveControls > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-600 text-white rounded-full">
                {totalActiveControls}
              </span>
            )}
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Desktop-only Control Panels and Action Buttons */}
        <div className="hidden md:flex items-center gap-2">
          {/* Compact Popover: Display Options */}
          <div className="relative shrink-0" ref={displayMenuRef} data-tutorial="btn-display-popover">
          <button
            type="button"
            onClick={() => setIsDisplayMenuOpen(!isDisplayMenuOpen)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium inline-flex items-center gap-1.5 transition cursor-pointer select-none ${
              isDisplayMenuOpen 
                ? 'bg-slate-100 border-slate-300 text-slate-900' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Customize displayed fields (Scores, Class Avg, IDs, Calendar Events)"
          >
            <span>Display</span>
            {activeDisplayCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full">
                {activeDisplayCount}
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isDisplayMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-fadeIn space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Display Options
              </div>
              
              <button
                type="button"
                onClick={() => onToggleShowScores(!showScores)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-slate-700 font-medium">Scores & Points</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showScores ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {showScores ? 'ON' : 'OFF'}
                </span>
              </button>

              {onToggleShowClassAverages && (
                <button
                  type="button"
                  onClick={() => onToggleShowClassAverages(!showClassAverages)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  <span className="text-slate-700 font-medium">Class Averages</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showClassAverages ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {showClassAverages ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onToggleShowIds(!showIds)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-slate-700 font-medium">Canvas IDs (#)</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showIds ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {showIds ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Integrated Calendar Events Section in Display */}
              <div className="pt-1.5 mt-1 border-t border-slate-100">
                <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Calendar Events</span>
                  {onRefreshCalendarEvents && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRefreshCalendarEvents();
                      }}
                      className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                      title="Refresh calendar events from Canvas"
                      disabled={loadingCalendarEvents}
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingCalendarEvents ? 'animate-spin text-blue-600' : ''}`} />
                    </button>
                  )}
                </div>

                {onToggleShowCalendarEvents && (
                  <button
                    type="button"
                    onClick={() => onToggleShowCalendarEvents(!showCalendarEvents)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span className="text-slate-700 font-medium flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      <span>Events Overlay</span>
                      {calendarEventsCount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-200/80 rounded-full">
                          {calendarEventsCount}
                        </span>
                      )}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showCalendarEvents ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {showCalendarEvents ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Compact Popover: Filter Options */}
        <div className="relative shrink-0" ref={filterMenuRef} data-tutorial="btn-filter-popover">
          <button
            type="button"
            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium inline-flex items-center gap-1.5 transition cursor-pointer select-none ${
              isFilterMenuOpen 
                ? 'bg-slate-100 border-slate-300 text-slate-900' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Filter assignments by completion or archive status"
          >
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isFilterMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-fadeIn space-y-1">
              <div className="px-2 py-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Assignments &amp; Terms
                </span>
                {onResetFilters && activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    title="Reset all filters back to default (Hidden)"
                  >
                    Reset Defaults
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onToggleShowSubmitted(!showSubmitted)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-slate-700 font-medium">Show Submitted</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showSubmitted ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {showSubmitted ? 'Shown' : 'Hidden'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleShowArchived(!showArchived)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-slate-700 font-medium">Show Archived</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showArchived ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {showArchived ? 'Shown' : 'Hidden'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleShowObsolete(!showObsolete)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-slate-700 font-medium">Show Obsolete (&gt;6 wks)</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showObsolete ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {showObsolete ? 'Shown' : 'Hidden'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleShowPastTerms(!showPastTerms)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                <span className="text-slate-700 font-medium">Show Past Terms</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showPastTerms ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {showPastTerms ? 'Shown' : 'Hidden'}
                </span>
              </button>

              {onToggleShowPastEvents && (
                <div
                  data-testid="filter-calendar-section"
                  className="pt-1.5 mt-1 border-t border-slate-100 space-y-1"
                >
                  <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-purple-600" />
                      <span>Calendar</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleShowPastEvents(!showPastEvents)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span className="text-slate-700 font-medium">Show Past Events</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${showPastEvents ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {showPastEvents ? 'Shown' : 'Hidden'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Global Grade Settings & Thresholds */}
        {onOpenGradeSettings && (
          <button 
            data-tutorial="btn-grade-settings"
            onClick={onOpenGradeSettings}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition shrink-0 cursor-pointer"
            title="Configure Grade Threshold Colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {/* Save / Load / Sync Action Group */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
          <button 
            onClick={onSaveSettings}
            disabled={isSaving}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-xs rounded transition relative cursor-pointer"
            title="Save Current View Settings"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Save className="w-4 h-4" />}
          </button>
          
          <button 
            onClick={onDebugAutosave}
            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-white hover:shadow-xs rounded transition cursor-pointer"
            title="Trigger Autosave (Debug)"
          >
            <Zap className="w-4 h-4" />
          </button>

          <button 
            onClick={onOpenLoadModal}
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-xs rounded transition cursor-pointer"
            title="Load Saved State"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        </div>

        {/* Notes Button */}
        <button 
          data-tutorial="btn-notes-toggle"
          onClick={onToggleNotes}
          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition shrink-0 cursor-pointer"
          title="My Notes (Saved in Canvas)"
        >
          <StickyNote className="w-4 h-4" />
        </button>

        {/* Export Dropdown */}
        <div className="relative group shrink-0">
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900 transition cursor-pointer" title="Download course data">
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
          <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-lg shadow-xl border border-slate-100 hidden group-hover:block z-50">
            <button onClick={() => downloadData(data, ExportFormat.JSON)} className="block w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50" title="Download as JSON">Export JSON</button>
            <button onClick={() => downloadData(data, ExportFormat.CSV)} className="block w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50" title="Download as CSV">Export CSV</button>
            <button onClick={() => downloadData(data, ExportFormat.XML)} className="block w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50" title="Download as XML">Export XML</button>
          </div>
        </div>

        {/* Desktop Log Out Button */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition cursor-pointer shrink-0"
            title="Log Out of Velm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out</span>
          </button>
        )}
        </div>
      </div>
    </header>
  );
};