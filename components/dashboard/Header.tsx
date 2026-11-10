

import React, { useState, useRef, useEffect } from 'react';
import { Download, StickyNote, Save, Loader2, FolderOpen, LayoutList, Kanban, Megaphone, Zap, Calendar, RefreshCw, ChevronDown, SlidersHorizontal, Settings, ExternalLink } from 'lucide-react';
import { CourseData, ExportFormat, StudentProfile, CanvasCalendarEvent } from '../../types';
import { downloadData } from '../../services/exporter';
import { StudentSwitcher } from './StudentSwitcher';

interface HeaderProps {
  selectedCourseName: string;
  activeTab: 'overview' | 'assignments' | 'modules' | 'canvas_todo';
  onTabChange: (tab: 'overview' | 'assignments' | 'modules' | 'canvas_todo') => void;
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
  hidePastEvents?: boolean;
  onToggleHidePastEvents?: (val: boolean) => void;
  loadingCalendarEvents?: boolean;
  onRefreshCalendarEvents?: () => void;
  
  // Renamed from showManuallyHidden
  showArchived: boolean;
  onToggleShowArchived: (val: boolean) => void;
  
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
  onSwitchStudent?: (student: StudentProfile) => void;
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
  showCalendarEvents = false,
  onToggleShowCalendarEvents,
  calendarEventsCount = 0,
  hidePastEvents = false,
  onToggleHidePastEvents,
  loadingCalendarEvents = false,
  onRefreshCalendarEvents,
  showArchived,
  onToggleShowArchived,
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
  onSwitchStudent
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
  const activeFilterCount = (showSubmitted ? 1 : 0) + (showArchived ? 1 : 0) + (showObsolete ? 1 : 0) + (showPastTerms ? 1 : 0);

  return (
    <header className="bg-white border-b border-slate-200 min-h-16 flex flex-wrap items-center justify-between px-6 py-2 shrink-0 gap-3">
      {/* Course Title and Student Info */}
      <div className="flex items-center gap-3.5 min-w-0" data-tutorial="header-title">
        <h1 className="text-lg font-semibold text-slate-800 truncate flex items-center gap-2 max-w-xs md:max-w-md lg:max-w-lg" title={selectedCourseName}>
          {selectedCourseName}
        </h1>
      </div>

      {/* Primary & Contextual Controls */}
      <div className="flex items-center flex-wrap gap-2.5">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 shrink-0" data-tutorial="nav-tabs-group">
          <button 
            data-tutorial="nav-tab-overview"
            onClick={() => onTabChange('overview')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${activeTab === 'overview' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            title="Switch to Overview"
          >
            Overview
          </button>
          <button 
            data-tutorial="nav-tab-assignments"
            onClick={() => onTabChange('assignments')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${activeTab === 'assignments' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
            title="Switch to Assignments view"
          >
            Assignments
          </button>
          <button 
            data-tutorial="nav-tab-modules"
            onClick={() => onTabChange('modules')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${activeTab === 'modules' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
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
              className={`p-1.5 rounded transition cursor-pointer ${assignmentsViewMode === 'list' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="List View"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => onAssignmentsViewModeChange('board')}
              className={`p-1.5 rounded transition cursor-pointer ${assignmentsViewMode === 'board' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="Board View"
            >
              <Kanban className="w-4 h-4" />
            </button>
          </div>
        )}

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

                {showCalendarEvents && onToggleHidePastEvents && (
                  <button
                    type="button"
                    onClick={() => onToggleHidePastEvents(!hidePastEvents)}
                    className="w-full flex items-center justify-between px-2.5 py-1 text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer pl-6"
                  >
                    <span className="text-slate-600 text-[11px]">Hide Past Events</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hidePastEvents ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {hidePastEvents ? 'ON' : 'OFF'}
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
            <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-fadeIn space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Filter Assignments
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
      </div>
    </header>
  );
};