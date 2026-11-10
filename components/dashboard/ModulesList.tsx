import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CanvasModule, CourseData, CanvasAssignment } from '../../types';
import { 
  List, 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Download, 
  BookOpen, 
  ExternalLink, 
  FileQuestion,
  Layers,
  Calendar,
  ArrowUpDown,
  Bookmark
} from 'lucide-react';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import { CourseCustomization } from '../../services/courseCustomization';

interface ModulesListProps {
  modules: CanvasModule[];
  expandedModules: Set<number>;
  toggleModule: (id: number) => void;
  showCourseCode: boolean;
  getCourseName: (id: number) => string;
  showIds?: boolean;
  courses?: CourseData[];
  courseOrder?: number[];
  customizations?: Record<number, CourseCustomization>;
  onExpandAllModules?: (expand: boolean) => void;
}

interface ModuleDateInfo {
  timestamp: number | null;
  label: string | null;
  source: 'unlock' | 'due' | 'name' | 'none';
}

/**
 * Resolves a meaningful date for a Canvas module:
 * 1. Native unlock_at timestamp
 * 2. Earliest due date of assignments within the module
 * 3. Date pattern mentioned in module title (e.g. "Week 4 (10/14 - 10/18)", "Unit 2: Nov 4")
 */
export function resolveModuleDate(
  module: CanvasModule,
  courseAssignments?: CanvasAssignment[]
): ModuleDateInfo {
  // 1. Native unlock_at date
  if (module.unlock_at) {
    const t = new Date(module.unlock_at).getTime();
    if (!isNaN(t)) {
      return {
        timestamp: t,
        label: `Unlocks ${new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        source: 'unlock'
      };
    }
  }

  // 2. Earliest assignment due date from items
  if (courseAssignments && courseAssignments.length > 0 && module.items) {
    const dueDates: number[] = [];
    module.items.forEach(item => {
      if (item.content_details?.due_at) {
        const t = new Date(item.content_details.due_at).getTime();
        if (!isNaN(t)) dueDates.push(t);
      }
      const matched = courseAssignments.find(a => 
        (item.content_id && a.id === item.content_id) || 
        (a.name && item.title && a.name.trim().toLowerCase() === item.title.trim().toLowerCase())
      );
      if (matched?.due_at) {
        const t = new Date(matched.due_at).getTime();
        if (!isNaN(t)) dueDates.push(t);
      }
    });

    if (dueDates.length > 0) {
      dueDates.sort((a, b) => a - b);
      const earliest = dueDates[0];
      return {
        timestamp: earliest,
        label: `Due ${new Date(earliest).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        source: 'due'
      };
    }
  }

  // 3. Name-based date pattern (e.g. "Week 4 (10/14 - 10/18)", "Nov 4 - Nov 8: Unit 3", "Oct 21", "11/12")
  const name = module.name;
  const monthDayMatch = name.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})\b/i);
  if (monthDayMatch) {
    const monthStr = monthDayMatch[1];
    const day = parseInt(monthDayMatch[2], 10);
    const now = new Date();
    const currentYear = now.getFullYear();
    const parsed = new Date(`${monthStr} ${day}, ${currentYear}`);
    if (!isNaN(parsed.getTime())) {
      return {
        timestamp: parsed.getTime(),
        label: `${monthDayMatch[1].slice(0, 3)} ${day}`,
        source: 'name'
      };
    }
  }

  const slashDateMatch = name.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b/);
  if (slashDateMatch) {
    const month = parseInt(slashDateMatch[1], 10) - 1;
    const day = parseInt(slashDateMatch[2], 10);
    const now = new Date();
    const parsed = new Date(now.getFullYear(), month, day);
    if (!isNaN(parsed.getTime())) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        timestamp: parsed.getTime(),
        label: `${monthNames[month]} ${day}`,
        source: 'name'
      };
    }
  }

  return {
    timestamp: null,
    label: null,
    source: 'none'
  };
}

export const ModulesList: React.FC<ModulesListProps> = ({
  modules,
  expandedModules,
  toggleModule,
  showCourseCode,
  getCourseName,
  showIds = false,
  courses = [],
  courseOrder = [],
  customizations = {},
  onExpandAllModules
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [collapsedCourseIds, setCollapsedCourseIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'course' | 'date'>('course');
  const todayBookmarkRef = useRef<HTMLDivElement | null>(null);

  const toggleItem = (id: number) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedItems(next);
  };

  const toggleCourseBlock = (courseId: number) => {
    setCollapsedCourseIds(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  // Pre-index assignments per course for date resolution
  const courseAssignmentsMap = useMemo(() => {
    const map = new Map<number, CanvasAssignment[]>();
    courses.forEach(c => {
      map.set(c.course.id, c.assignments || []);
    });
    return map;
  }, [courses]);

  // Group modules by course_id following user's drag-and-drop courseOrder
  const groupedModules = useMemo(() => {
    const groups = new Map<number, CanvasModule[]>();

    modules.forEach(m => {
      const cId = m.course_id || 0;
      if (!groups.has(cId)) {
        groups.set(cId, []);
      }
      groups.get(cId)!.push(m);
    });

    const sortedCourseIds = Array.from(groups.keys()).sort((a, b) => {
      const indexA = courseOrder.indexOf(a);
      const indexB = courseOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return sortedCourseIds.map(courseId => {
      const courseModules = groups.get(courseId) || [];
      const courseObj = courses.find(c => c.course.id === courseId);
      const custom = customizations[courseId] || {};
      const emoji = custom.emoji || '';
      const abbr = custom.abbreviation || (courseObj ? pruneCourseTitle(courseObj.course.name).slice(0, 4).toUpperCase() : '');
      const rawName = courseObj?.course.name || getCourseName(courseId);
      const cleanName = rawName === 'Personal / Calendar' ? (courseObj?.course.name || 'Course Modules') : rawName;
      const cAssignments = courseAssignmentsMap.get(courseId) || [];

      return {
        courseId,
        courseName: cleanName,
        courseCode: courseObj?.course.course_code || '',
        emoji,
        abbr,
        modules: courseModules.filter(m => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            m.name.toLowerCase().includes(q) ||
            m.items.some(it => it.title.toLowerCase().includes(q))
          );
        }).map(m => ({
          ...m,
          dateInfo: resolveModuleDate(m, cAssignments)
        }))
      };
    });
  }, [modules, courses, courseOrder, customizations, getCourseName, searchQuery, courseAssignmentsMap]);

  // Flattened modules sorted by date (for "Sort by Date" view)
  const dateSortedModules = useMemo(() => {
    const allList: {
      module: CanvasModule & { dateInfo: ModuleDateInfo };
      courseId: number;
      courseName: string;
      emoji: string;
      abbr: string;
    }[] = [];

    groupedModules.forEach(group => {
      group.modules.forEach(m => {
        allList.push({
          module: m,
          courseId: group.courseId,
          courseName: group.courseName,
          emoji: group.emoji,
          abbr: group.abbr
        });
      });
    });

    // Sort by timestamp increasing (earliest date first, upcoming, then undated at the end)
    return allList.sort((a, b) => {
      const tA = a.module.dateInfo.timestamp;
      const tB = b.module.dateInfo.timestamp;
      if (tA !== null && tB !== null) return tA - tB;
      if (tA !== null) return -1;
      if (tB !== null) return 1;
      return 0;
    });
  }, [groupedModules]);

  // Find index for the "Today" bookmark in increasing date view
  const todayBookmarkIndex = useMemo(() => {
    if (sortMode !== 'date' || dateSortedModules.length === 0) return -1;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayTs = now.getTime();

    // Find the first module scheduled on or after today
    const firstUpcoming = dateSortedModules.findIndex(
      item => item.module.dateInfo.timestamp !== null && item.module.dateInfo.timestamp >= todayTs
    );
    if (firstUpcoming !== -1) return firstUpcoming;

    // If all dated items are in past, place after the last dated item
    const lastDatedIdx = dateSortedModules.reduce(
      (acc, item, i) => (item.module.dateInfo.timestamp !== null ? i : acc),
      -1
    );
    return lastDatedIdx !== -1 ? lastDatedIdx + 1 : 0;
  }, [dateSortedModules, sortMode]);

  const scrollToToday = () => {
    if (todayBookmarkRef.current) {
      todayBookmarkRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Auto-scroll to today bookmark whenever switching to date view
  useEffect(() => {
    if (sortMode === 'date') {
      const timer = setTimeout(() => {
        scrollToToday();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [sortMode]);

  const totalVisibleModules = groupedModules.reduce((acc, curr) => acc + curr.modules.length, 0);

  const handleExpandAllClasses = () => {
    setCollapsedCourseIds(new Set());
  };

  const handleCollapseAllClasses = () => {
    setCollapsedCourseIds(new Set(groupedModules.map(g => g.courseId)));
  };

  const handleExpandAllModules = () => {
    if (onExpandAllModules) {
      onExpandAllModules(true);
    } else {
      modules.forEach(m => {
        if (!expandedModules.has(m.id)) {
          toggleModule(m.id);
        }
      });
    }
  };

  const handleCollapseAllModules = () => {
    if (onExpandAllModules) {
      onExpandAllModules(false);
    } else {
      modules.forEach(m => {
        if (expandedModules.has(m.id)) {
          toggleModule(m.id);
        }
      });
    }
  };

  const renderModuleCard = (
    module: CanvasModule & { dateInfo?: ModuleDateInfo },
    context?: { courseName: string; emoji: string; abbr: string; showCourseBadge: boolean }
  ) => {
    const isModuleExpanded = expandedModules.has(module.id);
    const dateInfo = module.dateInfo || resolveModuleDate(module, courseAssignmentsMap.get(module.course_id));

    return (
      <div 
        key={module.id} 
        className="bg-white rounded-xl shadow-2xs border border-slate-200 overflow-hidden"
      >
        {/* Module Header */}
        <div 
          className="p-3.5 bg-white border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition gap-2"
          onClick={() => toggleModule(module.id)}
          title="Click to expand/collapse module"
        >
          <div className="flex items-center gap-2.5 flex-wrap min-w-0 flex-1">
            <List className="w-4 h-4 text-slate-400 shrink-0" />
            
            {/* Show course badge ONLY in date view or when explicitly requested */}
            {context?.showCourseBadge && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200/90 px-2 py-0.5 rounded-md shrink-0">
                {context.emoji && <span>{context.emoji}</span>}
                <span>{context.abbr || context.courseName}</span>
              </span>
            )}

            <h4 className="font-semibold text-slate-800 text-sm truncate" title={module.name}>
              {module.name}
            </h4>

            {/* Meaningful date badge if detected */}
            {dateInfo.label && (
              <span 
                className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${
                  dateInfo.source === 'due' 
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/70' 
                    : dateInfo.source === 'unlock'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200/70'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
                title={`Module timing: ${dateInfo.label}`}
              >
                <Calendar className="w-3 h-3 shrink-0" />
                {dateInfo.label}
              </span>
            )}

            {showIds && (
              <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded select-all shrink-0">
                #{module.id}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-[11px] text-slate-400">
              {module.items?.length || 0} items
            </span>
            {isModuleExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* Module Sub-items */}
        {isModuleExpanded && (
          <div className="divide-y divide-slate-100">
            {module.items.map(item => {
              if (item.type === 'SubHeader') {
                return (
                  <div key={item.id} className="p-2.5 pl-8 bg-slate-50/60 text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    {item.title}
                  </div>
                );
              }

              const isPage = (item.type === 'Page' || item.type === 'WikiPage');
              const isOpen = expandedItems.has(item.id);

              return (
                <div key={item.id} className="group border-b border-slate-50 last:border-0">
                  <div 
                    className={`p-3 pl-8 flex items-center gap-3 transition ${isPage ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50'}`}
                    onClick={isPage ? () => toggleItem(item.id) : undefined}
                  >
                    {item.type === 'Quiz' || item.type === 'online_quiz' ? <FileQuestion className="w-4 h-4 text-purple-400 shrink-0" /> :
                     item.type === 'Assignment' ? <FileText className="w-4 h-4 text-blue-400 shrink-0" /> : 
                     item.type === 'File' ? <Download className="w-4 h-4 text-slate-400 shrink-0" /> :
                     <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />}
                    
                    {/* Item Title / Link */}
                    <div className="flex-1 min-w-0">
                      {item.html_url && !isPage ? (
                        <a 
                          href={item.html_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-xs sm:text-sm text-slate-700 hover:text-blue-600 hover:underline flex items-center gap-1.5 w-fit"
                          title="Open item in Canvas"
                        >
                          <span className="truncate">{item.title}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-medium text-slate-700 truncate">{item.title}</span>
                          {isPage && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                              {isOpen ? 'Click to collapse' : 'Click to preview'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {showIds && (
                      <span className="text-[10px] font-mono text-slate-300 hover:text-slate-500 select-all shrink-0">
                        #{item.id}
                      </span>
                    )}

                    {isPage && (
                      <div className="text-slate-400">
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </div>
                    )}
                  </div>

                  {/* Inline Page / Wiki Content Expansion */}
                  {isPage && isOpen && (
                    <div className="p-4 pl-12 bg-slate-50/70 border-t border-slate-100 text-xs text-slate-600 space-y-2 animate-fadeIn">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pb-2 border-b border-slate-200/60">
                        <span>Canvas Page Item #{item.id}</span>
                        {item.html_url && (
                          <a 
                            href={item.html_url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            Open full page in Canvas <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-slate-600 italic">
                        Click &quot;Open full page in Canvas&quot; to view rich media, interactive embeds, and discussions for this page.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-start gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-0.5">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Course Modules</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalVisibleModules} modules {groupedModules.length > 1 ? `across ${groupedModules.length} classes` : ''}
            </p>
          </div>
        </div>

        {/* Global Controls: Sort Mode, Search & Concise Expand/Collapse */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle: Group by Course vs Sort by Date */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 text-xs font-medium">
            <button
              type="button"
              onClick={() => setSortMode('course')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                sortMode === 'course'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Group modules into course sections following sidebar order"
            >
              Group by Course
            </button>
            <button
              type="button"
              onClick={() => setSortMode('date')}
              className={`px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${
                sortMode === 'date'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Sort all modules chronologically (earliest to latest)"
            >
              <Calendar className="w-3.5 h-3.5" />
              Sort by Date
            </button>
          </div>

          {sortMode === 'date' && (
            <button
              type="button"
              onClick={scrollToToday}
              className="px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Scroll to Today bookmark in timeline"
            >
              <Bookmark className="w-3.5 h-3.5 text-blue-600" />
              <span>Jump to Today</span>
            </button>
          )}

          <input
            type="text"
            placeholder="Search modules or items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
          />

          {sortMode === 'course' && groupedModules.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-100/90 px-2 py-1 rounded-lg text-xs text-slate-600">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">Classes:</span>
              <button
                type="button"
                onClick={handleExpandAllClasses}
                className="px-1.5 py-0.5 rounded font-medium hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer"
                title="Expand all course blocks"
              >
                Expand
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={handleCollapseAllClasses}
                className="px-1.5 py-0.5 rounded font-medium hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer"
                title="Collapse all course blocks"
              >
                Collapse
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 bg-slate-100/90 px-2 py-1 rounded-lg text-xs text-slate-600">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">Modules:</span>
            <button
              type="button"
              onClick={handleExpandAllModules}
              className="px-1.5 py-0.5 rounded font-medium hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer"
              title="Expand all module items"
            >
              Expand
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleCollapseAllModules}
              className="px-1.5 py-0.5 rounded font-medium hover:bg-white hover:text-slate-900 hover:shadow-2xs transition cursor-pointer"
              title="Collapse all module items"
            >
              Collapse
            </button>
          </div>
        </div>
      </div>

      {modules.length === 0 && (
        <div className="text-center text-slate-500 py-12 bg-white rounded-xl border border-slate-200">
          No modules found.
        </div>
      )}

      {/* VIEW 1: Chronological Increasing Date View with Today Bookmark */}
      {sortMode === 'date' && (
        <div className="space-y-3.5 animate-fadeIn">
          {dateSortedModules.length === 0 ? (
            <div className="text-center text-slate-400 py-8 bg-white rounded-xl border border-slate-200">
              No matching modules found for your search.
            </div>
          ) : (
            dateSortedModules.map(({ module, courseName, emoji, abbr }, idx) => (
              <React.Fragment key={module.id}>
                {idx === todayBookmarkIndex && (
                  <div 
                    ref={todayBookmarkRef}
                    id="modules-today-bookmark"
                    className="flex items-center gap-2.5 py-2.5 px-4 my-2 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200 rounded-xl text-blue-900 shadow-2xs font-semibold text-xs scroll-mt-24"
                  >
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600"></span>
                    </span>
                    <Bookmark className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="font-bold">Today Bookmark</span>
                    <span className="text-[11px] font-normal text-blue-700">
                      — {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 border border-blue-200/80 px-2 py-0.5 rounded-full ml-auto">
                      Default timeline scroll position
                    </span>
                  </div>
                )}
                {renderModuleCard(module, {
                  courseName,
                  emoji,
                  abbr,
                  showCourseBadge: true
                })}
              </React.Fragment>
            ))
          )}
        </div>
      )}

      {/* VIEW 2: Grouped by Course in Sidebar Order */}
      {sortMode === 'course' && (
        <div className="space-y-6 animate-fadeIn">
          {groupedModules.map(group => {
            const isCollapsed = collapsedCourseIds.has(group.courseId);

            if (group.modules.length === 0 && searchQuery) {
              return null;
            }

            return (
              <div 
                key={group.courseId} 
                className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden transition-all duration-200"
              >
                {/* Collapsible Class Block Header */}
                <div 
                  onClick={() => toggleCourseBlock(group.courseId)}
                  className="p-4 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 transition select-none"
                  title={isCollapsed ? "Expand class block" : "Collapse class block"}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-blue-100/70 border border-blue-200 flex items-center justify-center text-base shrink-0">
                      {group.emoji || '📚'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-sm md:text-base truncate">
                          {group.courseName}
                        </h3>
                        {group.abbr && (
                          <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                            {group.abbr}
                          </span>
                        )}
                        {group.courseCode && (
                          <span className="text-[11px] text-slate-400 font-normal">
                            ({group.courseCode})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                      {group.modules.length} {group.modules.length === 1 ? 'module' : 'modules'}
                    </span>
                    <div className="p-1 rounded text-slate-400 hover:text-slate-600">
                      {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Modules inside this class - NO redundant course badge inside block! */}
                {!isCollapsed && (
                  <div className="p-4 space-y-3.5 bg-slate-50/30">
                    {group.modules.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">No matching modules found in this course.</p>
                    ) : (
                      group.modules.map(module => 
                        renderModuleCard(module, {
                          courseName: group.courseName,
                          emoji: group.emoji,
                          abbr: group.abbr,
                          showCourseBadge: false // Suppressed inside course block!
                        })
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
