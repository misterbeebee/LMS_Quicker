

import React from 'react';
import { Download, StickyNote, Save, Loader2, FolderOpen, LayoutList, Kanban, Megaphone, Zap, Calendar, RefreshCw } from 'lucide-react';
import { CourseData, ExportFormat, StudentProfile } from '../../types';
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

  // Experimental: Calendar events
  showCalendarEvents?: boolean;
  onToggleShowCalendarEvents?: (val: boolean) => void;
  calendarEventsCount?: number;
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
  onToggleNotes,
  onSaveSettings,
  isSaving,
  onOpenLoadModal,
  onDebugAutosave,
  currentStudentId,
  currentStudentName,
  currentDomain,
  onSwitchStudent
}) => {
  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shrink-0 gap-4">
      <div className="flex items-center gap-3.5 min-w-0">
        <h1 className="text-lg font-semibold text-slate-800 truncate flex items-center gap-2" title={selectedCourseName}>
          {selectedCourseName}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1">
            <button 
                onClick={() => onTabChange('overview')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'overview' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                title="Switch to Overview"
            >Overview</button>
            <button 
                onClick={() => onTabChange('assignments')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'assignments' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                title="Switch to Assignments view"
            >Assignments</button>
            <button 
                onClick={() => onTabChange('modules')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${activeTab === 'modules' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                title="Switch to Modules view"
            >Modules</button>
             <button 
                onClick={() => onTabChange('canvas_todo')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition flex items-center gap-1.5 ${activeTab === 'canvas_todo' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                title="Switch to Canvas To Do list"
            ><Megaphone className="w-3.5 h-3.5" /> Canvas ToDo</button>
        </div>

        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
            {/* Contextual Controls for Assignments Tab */}
            {activeTab === 'assignments' && (
                <div className="flex bg-slate-100 rounded-lg p-0.5 mr-2">
                     <button
                        onClick={() => onAssignmentsViewModeChange('list')}
                        className={`p-1.5 rounded transition ${assignmentsViewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        title="List View"
                     >
                        <LayoutList className="w-4 h-4" />
                     </button>
                     <button
                        onClick={() => onAssignmentsViewModeChange('board')}
                        className={`p-1.5 rounded transition ${assignmentsViewMode === 'board' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                        title="Board View"
                     >
                        <Kanban className="w-4 h-4" />
                     </button>
                </div>
            )}

            {/* Grouped In-Place Toggle Controls */}
            <div className="hidden lg:flex items-center gap-2">
                {/* Display Group */}
                <div className="flex items-center gap-1 bg-slate-100/90 rounded-lg p-1 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1.5 select-none">Display:</span>
                    
                    <button
                        type="button"
                        onClick={() => onToggleShowScores(!showScores)}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition cursor-pointer select-none ${
                            showScores 
                                ? 'bg-blue-600 text-white shadow-xs font-semibold' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title="Toggle visibility of grades and scores"
                    >
                        Scores
                    </button>

                    {onToggleShowClassAverages && (
                        <button
                            type="button"
                            onClick={() => onToggleShowClassAverages(!showClassAverages)}
                            className={`text-xs px-2 py-1 rounded-md font-medium transition cursor-pointer select-none ${
                                showClassAverages 
                                    ? 'bg-blue-600 text-white shadow-xs font-semibold' 
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                            title="Show class average score on assignments"
                        >
                            Class Avg
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => onToggleShowIds(!showIds)}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition cursor-pointer select-none ${
                            showIds 
                                ? 'bg-blue-600 text-white shadow-xs font-semibold' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title="Show item IDs badges"
                    >
                        IDs
                    </button>
                </div>

                {/* Filter Group */}
                <div className="flex items-center gap-1 bg-slate-100/90 rounded-lg p-1 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1.5 select-none">Filter:</span>

                    <button
                        type="button"
                        onClick={() => onToggleShowSubmitted(!showSubmitted)}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition cursor-pointer select-none ${
                            showSubmitted 
                                ? 'bg-blue-600 text-white shadow-xs font-semibold' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title="Toggle visibility of submitted assignments"
                    >
                        Submitted
                    </button>

                    {onToggleShowCalendarEvents && (
                        <div className="inline-flex items-center">
                            <button
                                type="button"
                                onClick={() => onToggleShowCalendarEvents(!showCalendarEvents)}
                                className={`text-xs px-2 py-1 rounded-l-md font-medium transition cursor-pointer select-none inline-flex items-center gap-1 ${
                                    showCalendarEvents 
                                        ? 'bg-purple-600 text-white shadow-xs font-semibold' 
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                                title={`Merge calendar events into assignments (${calendarEventsCount} loaded)`}
                            >
                                <Calendar className="w-3 h-3" />
                                <span>Events</span>
                                {calendarEventsCount > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${showCalendarEvents ? 'bg-purple-700 text-purple-100' : 'bg-purple-100 text-purple-700'}`}>
                                        {calendarEventsCount}
                                    </span>
                                )}
                            </button>
                            {showCalendarEvents && onRefreshCalendarEvents && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onRefreshCalendarEvents();
                                    }}
                                    className="p-1.5 bg-purple-600 hover:bg-purple-700 text-purple-100 border-l border-purple-500 rounded-r-md transition cursor-pointer"
                                    title="Refresh calendar events"
                                >
                                    {loadingCalendarEvents ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-3 h-3" />
                                    )}
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => onToggleShowArchived(!showArchived)}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition cursor-pointer select-none ${
                            showArchived 
                                ? 'bg-indigo-600 text-white shadow-xs font-semibold' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title="Toggle visibility of archived assignments"
                    >
                        Archived
                    </button>

                    <button
                        type="button"
                        onClick={() => onToggleShowObsolete(!showObsolete)}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition cursor-pointer select-none ${
                            showObsolete 
                                ? 'bg-blue-600 text-white shadow-xs font-semibold' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title="Toggle visibility of obsolete assignments (>6 weeks overdue)"
                    >
                        Obsolete
                    </button>

                    <button
                        type="button"
                        onClick={() => onToggleShowPastTerms(!showPastTerms)}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition cursor-pointer select-none ${
                            showPastTerms 
                                ? 'bg-blue-600 text-white shadow-xs font-semibold' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title="Toggle visibility of items from previous terms"
                    >
                        Past Terms
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button 
                    onClick={onSaveSettings}
                    disabled={isSaving}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded transition relative"
                    title="Save Current View Settings"
                >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Save className="w-4 h-4" />}
                </button>
                
                <button 
                    onClick={onDebugAutosave}
                    className="p-2 text-slate-400 hover:text-amber-600 hover:bg-white hover:shadow-sm rounded transition"
                    title="Trigger Autosave (Debug)"
                >
                    <Zap className="w-4 h-4" />
                </button>

                <button 
                    onClick={onOpenLoadModal}
                    className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-sm rounded transition"
                    title="Load Saved State"
                >
                    <FolderOpen className="w-4 h-4" />
                </button>
            </div>

            <button 
                onClick={onToggleNotes}
                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                title="My Notes (Saved in Canvas)"
            >
                <StickyNote className="w-5 h-5" />
            </button>

            <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition" title="Download course data">
                    <Download className="w-4 h-4" />
                    Export
                </button>
                <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-xl border border-slate-100 hidden group-hover:block z-50">
                    <button onClick={() => downloadData(data, ExportFormat.JSON)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" title="Download as JSON">Export JSON</button>
                    <button onClick={() => downloadData(data, ExportFormat.CSV)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" title="Download as CSV">Export CSV</button>
                    <button onClick={() => downloadData(data, ExportFormat.XML)} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" title="Download as XML">Export XML</button>
                </div>
            </div>
        </div>
      </div>
    </header>
  );
};