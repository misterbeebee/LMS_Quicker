import React from 'react';
import { 
  X, 
  Eye, 
  Filter, 
  Settings, 
  Save, 
  FolderOpen, 
  StickyNote, 
  Calendar, 
  RefreshCw, 
  Download, 
  Zap, 
  Loader2, 
  Check, 
  Sliders,
  LogOut
} from 'lucide-react';
import { CourseData, ExportFormat, CanvasCalendarEvent } from '../../types';
import { downloadData } from '../../services/exporter';

interface MobileControlsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Display Options
  showScores: boolean;
  onToggleShowScores: (val: boolean) => void;
  showClassAverages?: boolean;
  onToggleShowClassAverages?: (val: boolean) => void;
  showIds: boolean;
  onToggleShowIds: (val: boolean) => void;
  showCalendarEvents?: boolean;
  onToggleShowCalendarEvents?: (val: boolean) => void;
  calendarEventsCount?: number;
  showPastEvents?: boolean;
  onToggleShowPastEvents?: (val: boolean) => void;
  loadingCalendarEvents?: boolean;
  onRefreshCalendarEvents?: () => void;

  // Filter Options
  showSubmitted: boolean;
  onToggleShowSubmitted: (val: boolean) => void;
  showArchived: boolean;
  onToggleShowArchived: (val: boolean) => void;
  showObsolete: boolean;
  onToggleShowObsolete: (val: boolean) => void;
  showPastTerms: boolean;
  onToggleShowPastTerms: (val: boolean) => void;
  onResetFilters?: () => void;

  // Grade & Workspace Actions
  onOpenGradeSettings?: () => void;
  onSaveSettings: () => void;
  isSaving: boolean;
  onOpenLoadModal: () => void;
  onToggleNotes: () => void;
  onDebugAutosave: () => void;
  data: CourseData[];
  onLogout?: () => void;
}

export const MobileControlsDrawer: React.FC<MobileControlsDrawerProps> = ({
  isOpen,
  onClose,
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
  showSubmitted,
  onToggleShowSubmitted,
  showArchived,
  onToggleShowArchived,
  showObsolete,
  onToggleShowObsolete,
  showPastTerms,
  onToggleShowPastTerms,
  onResetFilters,
  onOpenGradeSettings,
  onSaveSettings,
  isSaving,
  onOpenLoadModal,
  onToggleNotes,
  onDebugAutosave,
  data,
  onLogout
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden flex justify-end animate-fadeIn">
      {/* Backdrop */}
      <div 
        onClick={onClose} 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" 
        aria-hidden="true" 
      />

      {/* Drawer Content */}
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col z-10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">View Controls & Settings</h2>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            title="Close controls panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable controls list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          {/* Display Options Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>Display Options</span>
            </div>

            <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-2 space-y-1">
              <button
                type="button"
                onClick={() => onToggleShowScores(!showScores)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
              >
                <span>Scores & Points</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showScores ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {showScores ? 'ON' : 'OFF'}
                </span>
              </button>

              {onToggleShowClassAverages && (
                <button
                  type="button"
                  onClick={() => onToggleShowClassAverages(!showClassAverages)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
                >
                  <span>Class Averages</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showClassAverages ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {showClassAverages ? 'ON' : 'OFF'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onToggleShowIds(!showIds)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
              >
                <span>Canvas Item IDs (#)</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showIds ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {showIds ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Calendar Events Toggle */}
              {onToggleShowCalendarEvents && (
                <div className="pt-2 mt-1 border-t border-slate-200/60 space-y-1">
                  {onToggleShowCalendarEvents && (
                    <button
                      type="button"
                      onClick={() => onToggleShowCalendarEvents(!showCalendarEvents)}
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <span>Calendar Events</span>
                        {calendarEventsCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 bg-purple-100 text-purple-700 rounded-full">
                            {calendarEventsCount}
                          </span>
                        )}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showCalendarEvents ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {showCalendarEvents ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Filter Options Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Filter className="w-3.5 h-3.5 text-blue-600" />
                <span>Filters</span>
              </div>
              {onResetFilters && (showSubmitted || showArchived || showObsolete || showPastTerms || showPastEvents) && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                  title="Reset all filters back to default (Hidden)"
                >
                  Reset Defaults
                </button>
              )}
            </div>

            <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-2 space-y-1">
              <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Assignments &amp; Terms
              </div>

              <button
                type="button"
                onClick={() => onToggleShowSubmitted(!showSubmitted)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
              >
                <span>Show Submitted</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showSubmitted ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {showSubmitted ? 'Shown' : 'Hidden'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleShowArchived(!showArchived)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
              >
                <span>Show Archived</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showArchived ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {showArchived ? 'Shown' : 'Hidden'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleShowObsolete(!showObsolete)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
              >
                <span>Show Obsolete (&gt;6 wks)</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showObsolete ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {showObsolete ? 'Shown' : 'Hidden'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onToggleShowPastTerms(!showPastTerms)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
              >
                <span>Show Past Terms</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showPastTerms ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {showPastTerms ? 'Shown' : 'Hidden'}
                </span>
              </button>

              {onToggleShowPastEvents && (
                <div
                  data-testid="mobile-filter-calendar-section"
                  className="pt-2 mt-1 border-t border-slate-200/60 space-y-1"
                >
                  <div className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-purple-600" />
                    <span>Calendar</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleShowPastEvents(!showPastEvents)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition"
                  >
                    <span>Show Past Events</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${showPastEvents ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {showPastEvents ? 'Shown' : 'Hidden'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Settings & Tools Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              <Settings className="w-3.5 h-3.5 text-blue-600" />
              <span>Settings & Tools</span>
            </div>

            <div className="bg-slate-50/80 rounded-xl border border-slate-200/80 p-2 space-y-1.5">
              {onOpenGradeSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGradeSettings();
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition text-left"
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span>Configure Grade Thresholds</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onToggleNotes();
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition text-left"
              >
                <StickyNote className="w-4 h-4 text-amber-500" />
                <span>My Notes (Saved to Canvas)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSaveSettings();
                }}
                disabled={isSaving}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition text-left disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : <Save className="w-4 h-4 text-blue-600" />}
                  <span>Save Workspace State</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLoadModal();
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-700 transition text-left"
              >
                <FolderOpen className="w-4 h-4 text-slate-600" />
                <span>Load Saved Workspace</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDebugAutosave();
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white text-xs font-medium text-slate-600 transition text-left"
              >
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Trigger Autosave Sync</span>
              </button>
            </div>
          </div>

          {/* Export Formats */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Export Course Data</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  downloadData(data, ExportFormat.JSON);
                  onClose();
                }}
                className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 text-center transition"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadData(data, ExportFormat.CSV);
                  onClose();
                }}
                className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 text-center transition"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadData(data, ExportFormat.XML);
                  onClose();
                }}
                className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 text-center transition"
              >
                XML
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          {onLogout ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          ) : <div />}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
