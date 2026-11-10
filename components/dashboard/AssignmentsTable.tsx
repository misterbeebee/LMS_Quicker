

import React, { useMemo, useState } from 'react';
import { CanvasAssignment, CanvasTodoItem, SortKey, SortConfig, FilterMode } from '../../types';
import { CheckCircle, XCircle, Lock, Unlock, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, ExternalLink, Archive, ArchiveRestore, ToggleLeft, ToggleRight, CheckSquare, Calendar, MapPin, ChevronDown, ChevronRight, Maximize2, MessageSquare, FileText, HelpCircle, Check, Settings, Languages, Clock, CheckCircle2, Megaphone } from 'lucide-react';
import { stripHtml, formatSubmissionType, getAssignmentStatus, getFilterValue, getRowMeta, isAssignmentSubmitted, isFillerDescription, cleanAssignmentDescription, hasUnacknowledgedFeedback, getUnacknowledgedFeedbackCount, isAssignmentPastDue, isAssignmentLocked, isPresumedCompleted, isClassworkOnPaper, getAssignmentLockInfo, getAssignmentFeedbackComments } from '../../utils/dashboard-helpers';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import { AssignmentDetailFlipSide } from './AssignmentDetailFlipSide';
import { AssignmentZoomModal } from './AssignmentZoomModal';
import { TranslationModal } from './TranslationModal';
import { detectWorldLanguage, WorldLanguageMatch } from '../../services/translation';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, getGradeStyle } from '../../services/gradeScale';

interface AssignmentsTableProps {
  assignments: CanvasAssignment[];
  showIds: boolean;
  showCourseColumn: boolean;
  getCourseName: (id: number) => string;
  archivedAssignmentIds: Set<number>;
  onToggleArchived: (id: number) => void;
  onToggleMarkedSubmitted?: (id: number) => void;
  sortConfig: SortConfig | null;
  onSortChange: (config: SortConfig | null) => void;
  columnFilters: Record<string, Set<string>>;
  onFilterChange: (filters: Record<string, Set<string>>) => void;
  filterModes: Record<string, FilterMode>;
  onFilterModeChange: (modes: Record<string, FilterMode>) => void;
  showScores?: boolean;
  showArchived?: boolean;
  showSubmitted?: boolean;
  showObsolete?: boolean;
  canvasUrl?: string;
  apiKey?: string;
  useProxy?: boolean;
  acknowledgedFeedbackIds?: Set<string | number>;
  onToggleAcknowledgeComment?: (commentId: string | number) => void;
  onAcknowledgeAllComments?: (commentIds: (string | number)[]) => void;
  filterFeedbackOnly?: boolean;
  onToggleFilterFeedback?: (val: boolean) => void;
  showClassAverages?: boolean;
  gradeConfig?: GradeScaleConfig;
  onOpenGradeSettings?: () => void;
  todoItems?: CanvasTodoItem[];
  onMarkTodoDone?: (item: CanvasTodoItem) => void;
}

export const AssignmentsTable: React.FC<AssignmentsTableProps> = ({
  assignments,
  showIds,
  showCourseColumn,
  getCourseName,
  archivedAssignmentIds,
  onToggleArchived,
  onToggleMarkedSubmitted,
  sortConfig,
  onSortChange,
  columnFilters,
  onFilterChange,
  filterModes,
  onFilterModeChange,
  showScores = true,
  showArchived = false,
  showSubmitted = false,
  showObsolete = false,
  canvasUrl = '',
  apiKey = '',
  useProxy = false,
  acknowledgedFeedbackIds,
  onToggleAcknowledgeComment,
  onAcknowledgeAllComments,
  filterFeedbackOnly = false,
  onToggleFilterFeedback,
  showClassAverages = false,
  gradeConfig = DEFAULT_GRADE_CONFIG,
  onOpenGradeSettings,
  todoItems = [],
  onMarkTodoDone
}) => {
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [workflowSection, setWorkflowSection] = useState<'upcoming' | 'completed'>('upcoming');
  const [isTodoExpanded, setIsTodoExpanded] = useState(false);
  const [processingTodoKey, setProcessingTodoKey] = useState<string | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<number>>(new Set());
  const [zoomedAssignment, setZoomedAssignment] = useState<CanvasAssignment | null>(null);
  const [confirmingTableAckAll, setConfirmingTableAckAll] = useState(false);
  const [localFilterFeedback, setLocalFilterFeedback] = useState(false);
  const [translatingItem, setTranslatingItem] = useState<{
    assignmentTitle: string;
    assignmentDescription?: string;
    courseName: string;
    languageMatch: WorldLanguageMatch;
  } | null>(null);
  
  const activeFilterFeedback = onToggleFilterFeedback ? filterFeedbackOnly : localFilterFeedback;
  const toggleFeedbackFilter = onToggleFilterFeedback ? () => onToggleFilterFeedback(!filterFeedbackOnly) : () => setLocalFilterFeedback(!localFilterFeedback);

  const upcomingTableCount = useMemo(() => {
    return assignments.filter(a => !isAssignmentSubmitted(a)).length;
  }, [assignments]);

  const completedTableCount = useMemo(() => {
    return assignments.filter(a => isAssignmentSubmitted(a)).length;
  }, [assignments]);

  const unackTotalCount = useMemo(() => {
    return getUnacknowledgedFeedbackCount(assignments, acknowledgedFeedbackIds || new Set());
  }, [assignments, acknowledgedFeedbackIds]);

  const toggleRowExpand = (id: number) => {
    setExpandedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 1. Filtered Assignments (Workflow Section & Column Filters)
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
        // Feedback filter: if active, show only items with unacknowledged feedback
        if (activeFilterFeedback && !hasUnacknowledgedFeedback(a, acknowledgedFeedbackIds || new Set())) {
          return false;
        }

        const isSubmitted = isAssignmentSubmitted(a);

        // Workflow section separation (Upcoming vs Completed)
        if (!activeFilterFeedback) {
          if (workflowSection === 'upcoming' && isSubmitted) return false;
          if (workflowSection === 'completed' && !isSubmitted) return false;
        }

        // 1. Archived filter: hide unless showArchived is true
        const isArchived = archivedAssignmentIds.has(a.id);
        if (isArchived && !showArchived) return false;

        // 2. Obsolete filter: hide items >6 weeks overdue without submission unless showObsolete is true
        if (!showObsolete && a.due_at && !isSubmitted && !a.is_calendar_event) {
          const diffDays = (Date.now() - new Date(a.due_at).getTime()) / (1000 * 3600 * 24);
          if (diffDays > 42) return false;
        }

        return Object.entries(columnFilters).every(([key, selectedValues]) => {
            const filters = selectedValues as Set<string>;
            if (!filters || filters.size === 0) return true;
            
            const val = getFilterValue(a, key);
            const mode = filterModes[key] || 'include';
            
            return mode === 'include' ? filters.has(val) : !filters.has(val);
        });
    });
  }, [assignments, workflowSection, columnFilters, filterModes, archivedAssignmentIds, showArchived, showObsolete, activeFilterFeedback, acknowledgedFeedbackIds]);

  // 2. Sorted Assignments
  const sortedAssignments = useMemo(() => {
    if (!sortConfig) return filteredAssignments;

    return [...filteredAssignments].sort((a, b) => {
      const { key, direction } = sortConfig;
      const moveDown = 1;
      const moveUp = -1;
      const getValue = (item: typeof a, k: SortKey) => {
        switch (k) {
          case 'due_at': return item.due_at;
          case 'score': return item.submission?.score;
          default: return 'defined';
        }
      };

      const valA = getValue(a, key);
      const valB = getValue(b, key);
      const aIsNull = valA === null || valA === undefined;
      const bIsNull = valB === null || valB === undefined;

      if (aIsNull && bIsNull) return 0;
      if (aIsNull) return moveDown;
      if (bIsNull) return moveUp;

      const multiplier = direction === 'asc' ? 1 : -1;

      switch (key) {
        case 'id': return (a.id - b.id) * multiplier;
        case 'name': return (a.name || '').localeCompare(b.name || '') * multiplier;
        case 'course': {
             const nameA = getCourseName(a.course_id);
             const nameB = getCourseName(b.course_id);
             return nameA.localeCompare(nameB) * multiplier;
        }
        case 'due_at': {
          const dateA = new Date(a.due_at!).getTime();
          const dateB = new Date(b.due_at!).getTime();
          return (dateA - dateB) * multiplier;
        }
        case 'status': {
          const statusA = getAssignmentStatus(a).label;
          const statusB = getAssignmentStatus(b).label;
          return statusA.localeCompare(statusB) * multiplier;
        }
        case 'score': return (Number(a.submission!.score) - Number(b.submission!.score)) * multiplier;
        case 'points': return (a.points_possible - b.points_possible) * multiplier;
        case 'locked': {
          const lockedA = !!a.locked_for_user;
          const lockedB = !!b.locked_for_user;
          return (lockedA === lockedB ? 0 : lockedA ? 1 : -1) * multiplier;
        }
        case 'submitted': {
          const subA = isAssignmentSubmitted(a);
          const subB = isAssignmentSubmitted(b);
          return (subA === subB ? 0 : subA ? -1 : 1) * multiplier; 
        }
        case 'type': {
          const typeA = formatSubmissionType(a.submission_types);
          const typeB = formatSubmissionType(b.submission_types);
          return typeA.localeCompare(typeB) * multiplier;
        }
        case 'hidden': { // Kept 'hidden' as key for sorting, but logically it's archived
          const hiddenA = archivedAssignmentIds.has(a.id);
          const hiddenB = archivedAssignmentIds.has(b.id);
          return (hiddenA === hiddenB ? 0 : hiddenA ? 1 : -1) * multiplier;
        }
        default: return 0;
      }
    });
  }, [filteredAssignments, sortConfig, getCourseName, archivedAssignmentIds]);

  const requestSort = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
        onSortChange({ key, direction: 'asc' });
    } else if (sortConfig.direction === 'asc') {
        onSortChange({ key, direction: 'desc' });
    } else {
        onSortChange(null);
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-2 inline-block" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 ml-2 inline-block" />
      : <ArrowDown className="w-3.5 h-3.5 text-blue-600 ml-2 inline-block" />;
  };

  const toggleColumnFilter = (key: string, value: string | Set<string>) => {
    const newFilters = { ...columnFilters };
    
    // If value is a Set, it's a bulk replacement (e.g. Select All)
    if (value instanceof Set) {
        if (value.size === 0) delete newFilters[key];
        else newFilters[key] = value;
    } else {
        if (!newFilters[key]) newFilters[key] = new Set();
        const set = new Set(newFilters[key]);
        if (set.has(value)) set.delete(value);
        else set.add(value);

        if (set.size === 0) delete newFilters[key];
        else newFilters[key] = set;
    }
    
    onFilterChange(newFilters);
  };

  const getUniqueValuesForColumn = (key: string) => {
      const values = new Set<string>();
      // Use 'assignments' (base) to show all possible options in filter
      assignments.forEach(a => values.add(getFilterValue(a, key)));
      return Array.from(values).sort();
  };

  const handleSelectAll = (key: string) => {
      const allValues = getUniqueValuesForColumn(key);
      toggleColumnFilter(key, new Set(allValues));
  };

  const handleToggleMode = (key: string) => {
      const currentMode = filterModes[key] || 'include';
      const newMode = currentMode === 'include' ? 'exclude' : 'include';
      
      // Logic: Flip selection if something is selected
      const currentSet = columnFilters[key] || new Set();
      let newSet = currentSet;

      if (currentSet.size > 0) {
          const allValues = getUniqueValuesForColumn(key);
          newSet = new Set(allValues.filter(v => !currentSet.has(v)));
      }
      
      onFilterModeChange({ ...filterModes, [key]: newMode });
      toggleColumnFilter(key, newSet);
  };

  const renderHeader = (label: string, key: SortKey, className: string = "") => {
    const uniqueValues = activeFilterColumn === key ? getUniqueValuesForColumn(key) : [];
    const activeSet = columnFilters[key] || new Set();
    const isFilterActive = activeSet.size > 0;
    const mode = filterModes[key] || 'include';

    return (
        <th className={`py-2.5 px-3 font-semibold text-slate-600 text-xs select-none ${className}`}>
            <div className="flex items-center justify-between gap-2 group/header">
                <div 
                  className="flex items-center cursor-pointer hover:text-blue-600 transition flex-1"
                  onClick={() => requestSort(key)}
                  title={`Click to sort by ${label}`}
                >
                    {label} {getSortIcon(key)}
                </div>
                {key !== 'hidden' && (
                <div className="relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setActiveFilterColumn(activeFilterColumn === key ? null : key); }}
                      className={`p-1 rounded transition ${isFilterActive ? 'bg-blue-100 text-blue-600' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                      title="Filter"
                    >
                        <Filter className="w-3.5 h-3.5" />
                    </button>
                    
                    {activeFilterColumn === key && (
                        <div 
                          className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col"
                          onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Filter by {label}</span>
                                <button onClick={() => setActiveFilterColumn(null)} className="hover:bg-slate-200 rounded p-0.5 transition" title="Close filter menu"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                            </div>
                            
                            {/* Tools Row */}
                            <div className="px-2 py-2 border-b border-slate-100 bg-white flex items-center justify-between gap-2">
                                <button 
                                    onClick={() => handleSelectAll(key)}
                                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition"
                                    title="Select all values"
                                >
                                    <CheckSquare className="w-3 h-3" /> All
                                </button>
                                <button 
                                    onClick={() => handleToggleMode(key)}
                                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium border rounded transition ${mode === 'include' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}
                                    title={mode === 'include' ? 'Currently showing checked items' : 'Currently hiding checked items'}
                                >
                                    {mode === 'include' ? <ToggleLeft className="w-3 h-3" /> : <ToggleRight className="w-3 h-3" />}
                                    {mode === 'include' ? 'Include' : 'Exclude'}
                                </button>
                            </div>

                            <div className="max-h-56 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                                {uniqueValues.length === 0 && <div className="text-xs text-slate-400 italic p-2 text-center">No values available</div>}
                                {uniqueValues.map(val => (
                                    <label key={val} className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 p-2 rounded transition select-none" title={`Filter by ${val || 'Empty'}`}>
                                        <input 
                                          type="checkbox" 
                                          checked={activeSet.has(val)}
                                          onChange={() => toggleColumnFilter(key, val)}
                                          className={`mt-0.5 rounded border-slate-300 focus:ring-offset-0 ${mode === 'include' ? 'text-blue-600 focus:ring-blue-500' : 'text-red-500 focus:ring-red-500'}`}
                                        />
                                        <span className="break-words text-xs leading-relaxed font-medium">{val || <span className="italic text-slate-400">(Empty)</span>}</span>
                                    </label>
                                ))}
                            </div>
                            {isFilterActive && (
                              <div className="p-2 border-t border-slate-100 bg-slate-50">
                                  <button 
                                      onClick={() => {
                                          const nf = {...columnFilters};
                                          delete nf[key];
                                          onFilterChange(nf);
                                      }}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-bold w-full text-center py-1 hover:bg-blue-50 rounded transition"
                                      title="Remove this filter"
                                  >
                                      Clear Filter
                                  </button>
                              </div>
                            )}
                        </div>
                    )}
                </div>
                )}
            </div>
        </th>
    )
  };

  return (
    <div className="space-y-4">
      {/* Primary Workflow Sub-Tab & Feedback Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-200">
        {/* Primary Workflow Selector: Upcoming vs Completed */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 shadow-2xs">
          <button
            type="button"
            onClick={() => setWorkflowSection('upcoming')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-2 ${
              workflowSection === 'upcoming'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Upcoming & Active</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              workflowSection === 'upcoming' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {upcomingTableCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setWorkflowSection('completed')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-2 ${
              workflowSection === 'completed'
                ? 'bg-white text-emerald-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Completed & Graded</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              workflowSection === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {completedTableCount}
            </span>
          </button>
        </div>

        {/* Feedback to Review Filter */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFeedbackFilter}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition cursor-pointer ${
              activeFilterFeedback 
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Filter table to only show assignments with unacknowledged instructor feedback"
          >
            <MessageSquare className={`w-3.5 h-3.5 ${activeFilterFeedback ? 'text-white' : 'text-blue-600'}`} />
            <span>Feedback to Review</span>
            {unackTotalCount > 0 && (
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                activeFilterFeedback ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
              }`}>
                {unackTotalCount}
              </span>
            )}
          </button>
          {activeFilterFeedback && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2.5 py-1 rounded-lg">
                Showing assignments with feedback ({sortedAssignments.length})
              </span>
              {onAcknowledgeAllComments && sortedAssignments.length > 0 && (
                confirmingTableAckAll ? (
                  <div className="flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded-lg border border-amber-300 shadow-2xs animate-fadeIn">
                    <span className="text-xs font-semibold text-amber-900">Acknowledge all?</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allCommentIds: (string | number)[] = [];
                        sortedAssignments.forEach(a => {
                          getAssignmentFeedbackComments(a).forEach(c => {
                            if (!acknowledgedFeedbackIds?.has(c.id) && !acknowledgedFeedbackIds?.has(String(c.id))) {
                              allCommentIds.push(c.id);
                            }
                          });
                        });
                        onAcknowledgeAllComments(allCommentIds);
                        setConfirmingTableAckAll(false);
                      }}
                      className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingTableAckAll(false)}
                      className="px-1.5 py-0.5 text-xs font-medium rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingTableAckAll(true)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-100/60 shadow-2xs transition cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    Acknowledge All
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Integrated Canvas Priority To-Do Section (when in Upcoming view) */}
      {workflowSection === 'upcoming' && todoItems && todoItems.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-slate-50/60 border border-blue-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs">
                <Megaphone className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800">Canvas Priority To-Do</h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full border border-blue-200/60">
                    {todoItems.length} {todoItems.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">Official Canvas planner items prioritized for your immediate attention</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsTodoExpanded(!isTodoExpanded)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-white/80 transition cursor-pointer"
            >
              <span>{isTodoExpanded ? 'Collapse' : 'Show All'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isTodoExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {isTodoExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-fadeIn">
              {todoItems.map((item, idx) => {
                const uniqueKey = item.ignore || item.html_url || String(idx);
                const title = item.assignment?.name || item.quiz?.title || 'Canvas ToDo';
                const courseName = item.context_name ? pruneCourseTitle(item.context_name) : 'Course';
                const dueAt = item.assignment?.due_at || null;
                const points = item.assignment?.points_possible;
                const isProcessing = processingTodoKey === uniqueKey;

                return (
                  <div
                    key={uniqueKey}
                    className="p-3 rounded-xl border border-blue-200/70 bg-white shadow-2xs hover:shadow-xs transition flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.2 rounded truncate max-w-[140px]">
                          {courseName}
                        </span>
                        {points !== undefined && (
                          <span className="text-[10px] font-semibold text-slate-500">
                            {points} pts
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug" title={title}>
                        {title}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {dueAt ? new Date(dueAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No Due Date'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {item.html_url && (
                          <a
                            href={item.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition"
                            title="Open in Canvas"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {onMarkTodoDone && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                setProcessingTodoKey(uniqueKey);
                                await onMarkTodoDone(item);
                              } finally {
                                setProcessingTodoKey(null);
                              }
                            }}
                            disabled={isProcessing}
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition cursor-pointer flex items-center gap-1 ${
                              isProcessing
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title="Mark as done in Canvas"
                          >
                            <Check className="w-3 h-3" />
                            <span>{isProcessing ? 'Saving...' : 'Done'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
        {/* Backdrop for active filter */}
        {activeFilterColumn && (
           <div className="fixed inset-0 z-40 cursor-default" onClick={() => setActiveFilterColumn(null)} />
        )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="py-2.5 px-3 w-16 text-center text-xs font-semibold text-slate-400" title="Details"></th>
              {showIds && renderHeader("ID", "id", "w-16")}
              {renderHeader("Archive", "hidden", "w-20")}
              {showCourseColumn && renderHeader("Course", "course", "w-32")}
              {renderHeader("Assignment Name", "name")}
              {renderHeader("Type", "type", "w-32")}
              {renderHeader("Due Date", "due_at", "w-48")}
              {renderHeader("Status", "status", "w-36")}
              {renderHeader("Score", "score", "w-24")}
              {renderHeader("Points", "points", "w-24")}
              {renderHeader("Submitted", "submitted", "w-24")}
              {renderHeader("Locked", "locked", "w-24")}
            </tr>
          </thead>
          <tbody>
            {sortedAssignments.length === 0 ? (
               <tr>
                 <td colSpan={11 + (showIds ? 1 : 0) + (showCourseColumn ? 1 : 0)} className="py-8 px-4 text-center text-slate-400 italic">
                   No assignments found matching filters.
                 </td>
               </tr>
            ) : (
            sortedAssignments.map((assignment) => {
              const status = getAssignmentStatus(assignment);
              const rowMeta = getRowMeta(assignment);
              const score = assignment.submission?.score;
              const courseName = getCourseName(assignment.course_id);
              const rawDesc = stripHtml(assignment.description);
              const cleanDesc = isFillerDescription(rawDesc) ? "" : rawDesc;
              const isArchived = archivedAssignmentIds.has(assignment.id);
              const isExpanded = expandedRowIds.has(assignment.id);
              const isPastDue = isAssignmentPastDue(assignment);
              const lockInfo = getAssignmentLockInfo(assignment);
              const isLocked = lockInfo.isLocked;
              const isClasswork = isClassworkOnPaper(assignment);
              const presumed = isPresumedCompleted(assignment);
              const totalCols = 11 + (showIds ? 1 : 0) + (showCourseColumn ? 1 : 0);
              
              const isSubmitted = isAssignmentSubmitted(assignment);
              const isRealSubmitted = isSubmitted && !assignment.manual_marked_submitted;
              const hasUnack = hasUnacknowledgedFeedback(assignment, acknowledgedFeedbackIds || new Set());
              
              const types = assignment.submission_types || [];
              const isPassive = types.includes('on_paper') || types.includes('none') || types.includes('external_tool') || types.includes('not_graded');
              const showMaybeSubmitted = isPastDue && isPassive;

              return (
                <React.Fragment key={assignment.id}>
                  <tr 
                      onClick={() => toggleRowExpand(assignment.id)}
                      className={`border-b border-slate-100 transition cursor-pointer hover:bg-blue-50/40 ${isArchived ? 'bg-slate-50 opacity-60 grayscale' : isExpanded ? 'bg-blue-50/25' : rowMeta.style}`}
                      title={isArchived ? "Archived by user" : (isExpanded ? "Click to collapse details" : "Click to view full assignment details")}
                  >
                    <td className="py-2.5 px-3 w-16 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setZoomedAssignment(assignment)}
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          title="Zoom for full details"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleRowExpand(assignment.id)}
                          className={`p-1 rounded transition cursor-pointer ${
                            isExpanded ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                          }`}
                          title={isExpanded ? "Collapse inline details" : "Expand inline details"}
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    {showIds && (
                      <td className="py-2.5 px-3 text-xs font-mono text-slate-400">
                          {assignment.is_calendar_event ? `Event #${Math.abs(assignment.id)}` : assignment.id}
                      </td>
                    )}
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                       <button
                          onClick={() => onToggleArchived(assignment.id)}
                          className={`p-1 rounded transition cursor-pointer ${isArchived ? 'text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                          title={isArchived ? "Unarchive" : "Archive"}
                       >
                         {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                       </button>
                    </td>
                    {showCourseColumn && (
                      <td className="py-2.5 px-3 text-xs font-semibold text-slate-600">
                          {courseName}
                      </td>
                    )}
                    <td className="py-2.5 px-3" title={cleanDesc}>
                      <div className="font-medium text-slate-800 min-w-[20em] flex items-center flex-wrap gap-1.5 text-xs">
                        {assignment.is_calendar_event && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded shrink-0">
                             <Calendar className="w-3 h-3 text-purple-600" /> Event
                          </span>
                        )}
                        {assignment.html_url ? (
                          <a 
                            href={assignment.html_url} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-blue-600 hover:underline flex items-center gap-1.5 group w-fit"
                            title="Open directly in Canvas"
                          >
                            {assignment.name}
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ) : <span>{assignment.name}</span>}
                        {(() => {
                          const langMatch = detectWorldLanguage(courseName);
                          if (langMatch.isLanguageCourse && !assignment.is_calendar_event) {
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTranslatingItem({
                                    assignmentTitle: assignment.name,
                                    assignmentDescription: assignment.description,
                                    courseName,
                                    languageMatch: langMatch
                                  });
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 transition cursor-pointer shrink-0 shadow-2xs"
                                title={`Translate ${langMatch.languageName} assignment to English`}
                              >
                                <Languages className="w-3 h-3 text-indigo-600" />
                                <span>{langMatch.badgeText}</span>
                              </button>
                            );
                          }
                          return null;
                        })()}
                        {lockInfo.isLockedUntil ? (
                          <span 
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded-full shrink-0"
                            title={lockInfo.lockExplanation || `This assignment is locked until ${lockInfo.badgeText}`}
                          >
                            <Lock className="w-3 h-3 text-amber-600" /> {lockInfo.badgeText}
                          </span>
                        ) : (isLocked && isPastDue) ? (
                          <span 
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.2 rounded-full shrink-0"
                            title={assignment.lock_explanation || "Locked in Canvas"}
                          >
                            <Lock className="w-3 h-3 text-slate-500" /> Locked
                          </span>
                        ) : null}
                        {hasUnack && (
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onAcknowledgeAllComments) {
                                const commentIds = getAssignmentFeedbackComments(assignment).map(c => c.id);
                                onAcknowledgeAllComments(commentIds);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-emerald-50 hover:text-emerald-800 border border-blue-200/80 hover:border-emerald-300 px-2 py-0.5 rounded-full shrink-0 transition cursor-pointer group/ack"
                            title="New feedback available — click to acknowledge"
                          >
                            <MessageSquare className="w-3 h-3 text-blue-600 group-hover/ack:hidden" />
                            <Check className="w-3 h-3 text-emerald-600 hidden group-hover/ack:inline" />
                            <span className="group-hover/ack:hidden">New Feedback</span>
                            <span className="hidden group-hover/ack:inline">Acknowledge</span>
                          </button>
                        )}
                      </div>
                      {assignment.location_name && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{assignment.location_name}</span>
                          </div>
                      )}
                      {assignment.description && !assignment.location_name && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">
                              {cleanDesc}
                          </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">
                      {formatSubmissionType(assignment.submission_types)}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">
                      {assignment.due_at ? (
                          <div className="flex flex-col">
                              <span className="font-medium">{new Date(assignment.due_at).toLocaleDateString()}</span>
                              {!isPastDue && (
                                <span className="text-[10px] text-slate-400">{new Date(assignment.due_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              )}
                          </div>
                      ) : <span className="text-slate-400 italic">No Due Date</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.color}`}>
                          <status.icon className="w-3 h-3" />
                          {status.label}
                          </span>
                          
                          {!assignment.is_calendar_event && onToggleMarkedSubmitted && !isRealSubmitted && (
                             <label 
                                  className={`inline-flex items-center gap-1 cursor-pointer select-none px-2 py-0.5 rounded-md border text-[10px] font-medium transition ${
                                    assignment.manual_marked_submitted
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300'
                                      : (isClasswork || isPassive || showMaybeSubmitted)
                                        ? 'bg-amber-50 text-amber-900 border-amber-200/90 hover:border-amber-300 hover:bg-amber-100/60'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-slate-100/70'
                                  }`}
                                  onClick={(e) => e.stopPropagation()}
                                  title={
                                    isClasswork
                                      ? (assignment.manual_marked_submitted ? "Classwork completed on paper (marked submitted)" : "Classwork completed on paper — click to mark submitted")
                                      : (isPassive || showMaybeSubmitted)
                                        ? (assignment.manual_marked_submitted ? "Paper/external work (marked submitted)" : "Paper/external submission — click to mark submitted")
                                        : (assignment.manual_marked_submitted ? "Marked submitted" : "Click to mark as submitted")
                                  }
                             >
                                 <span>{assignment.manual_marked_submitted ? 'Submitted' : 'Submitted?'}</span>
                                 <input
                                      type="checkbox"
                                      checked={!!assignment.manual_marked_submitted}
                                      onChange={() => onToggleMarkedSubmitted(assignment.id)}
                                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer ml-0.5"
                                 />
                             </label>
                          )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-slate-700">
                      {assignment.is_calendar_event ? '-' : (
                        <div>
                          {score !== null && score !== undefined && showScores ? (
                            (() => {
                              const style = getGradeStyle(score, assignment.points_possible, gradeConfig, { isCourseGrade: false });
                              return (
                                <div className="group/score relative inline-flex items-center gap-1">
                                  <span 
                                    className="px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 text-[11px]"
                                    style={style.style}
                                  >
                                    <span>{score} / {assignment.points_possible}</span>
                                  </span>
                                  {onOpenGradeSettings && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onOpenGradeSettings();
                                      }}
                                      className="p-0.5 text-slate-400 hover:text-slate-700 bg-white/80 rounded-full border border-slate-200/80 shadow-2xs opacity-0 group-hover/score:opacity-100 transition-opacity cursor-pointer"
                                      title="Configure grade threshold colors"
                                    >
                                      <Settings className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })()
                          ) : (score !== null || assignment.submission?.graded_at) && !showScores ? (
                            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              {assignment.submission?.graded_at 
                                ? `Graded ${new Date(assignment.submission.graded_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}` 
                                : 'Graded'}
                            </span>
                          ) : (
                            <span>-</span>
                          )}
                          {showClassAverages && assignment.score_statistics?.mean !== undefined && assignment.score_statistics.mean !== null && (
                            <div className="text-[10px] text-slate-500 font-normal">
                              Avg: {Math.round(assignment.score_statistics.mean * 10) / 10}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600">
                      {assignment.is_calendar_event ? '-' : assignment.points_possible}
                    </td>
                    <td className="py-2.5 px-3">
                      {assignment.is_calendar_event ? (
                          <span className="text-slate-300 font-bold">—</span>
                      ) : isSubmitted ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                      ) : (
                          <XCircle className="w-4 h-4 text-slate-200" />
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                       {assignment.is_calendar_event ? (
                          <span className="text-slate-300 font-bold">—</span>
                       ) : lockInfo.isLockedUntil ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded" title={lockInfo.lockExplanation || `Locked until ${lockInfo.badgeText}`}>
                            <Lock className="w-3.5 h-3.5 text-amber-600" /> {lockInfo.badgeText}
                          </span>
                       ) : isLocked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded" title={assignment.lock_explanation || "Locked in Canvas"}>
                            <Lock className="w-3.5 h-3.5 text-slate-500" /> Locked
                          </span>
                       ) : (
                          <Unlock className="w-3.5 h-3.5 text-slate-200" />
                       )}
                    </td>
                  </tr>

                  {/* EXPANDABLE DETAIL DRAWER / SUB-ROW */}
                  {isExpanded && (
                    <tr key={`${assignment.id}-detail`} className="bg-slate-50/70 border-b border-slate-200">
                      <td colSpan={totalCols} className="p-4 md:p-6 bg-slate-50/40">
                        <div className="max-w-4xl mx-auto shadow-sm rounded-lg overflow-hidden animate-fadeIn">
                          <AssignmentDetailFlipSide
                            assignment={assignment}
                            courseName={courseName}
                            canvasUrl={canvasUrl}
                            apiKey={apiKey}
                            useProxy={useProxy}
                            onFlipBack={() => toggleRowExpand(assignment.id)}
                            variant="table"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            }))}
          </tbody>
        </table>
      </div>
      </div>

      <AssignmentZoomModal 
        assignment={zoomedAssignment}
        courseName={zoomedAssignment ? getCourseName(zoomedAssignment.course_id) : ''}
        canvasUrl={canvasUrl}
        apiKey={apiKey}
        useProxy={useProxy}
        onClose={() => setZoomedAssignment(null)}
        acknowledgedFeedbackIds={acknowledgedFeedbackIds}
        onToggleAcknowledgeComment={onToggleAcknowledgeComment}
        onAcknowledgeAllComments={onAcknowledgeAllComments}
        gradeConfig={gradeConfig}
        onOpenGradeSettings={onOpenGradeSettings}
      />

      {/* World Language Translation Modal */}
      {translatingItem && (
        <TranslationModal
          isOpen={true}
          onClose={() => setTranslatingItem(null)}
          assignmentTitle={translatingItem.assignmentTitle}
          assignmentDescription={translatingItem.assignmentDescription}
          courseName={translatingItem.courseName}
          languageMatch={translatingItem.languageMatch}
        />
      )}
    </div>
  );
};