import React, { useMemo, useState } from 'react';
import { CourseData, ALL_COURSES_ID, StudentProfile } from '../../types';
import { BookOpen, PanelLeftOpen, PanelLeftClose, Layers, Bug, LogOut, Check, CheckSquare, Square, Palette, GripVertical } from 'lucide-react';
import { computeCourseAbbreviations, pruneCourseTitle } from '../../utils/courseAbbreviations';
import { StudentSwitcher } from './StudentSwitcher';
import { CourseCustomizationModal } from './CourseCustomizationModal';
import { CourseCustomization } from '../../services/courseCustomization';

interface SidebarProps {
  data: CourseData[];
  selectedCourseId: number | null;
  onSelectCourse: (id: number) => void;
  visibleCourseIds: Set<number>;
  onToggleCourseVisibility: (id: number) => void;
  onSelectAllCourses: () => void;
  onSelectNoneCourses: () => void;
  showHiddenCourses: boolean;
  onToggleHidden: (val: boolean) => void;
  isCollapsed: boolean;
  onToggleCollapse: (val: boolean) => void;
  onLogout: () => void;
  onDebug: () => void;
  showScores?: boolean;
  currentStudentId?: string;
  currentStudentName?: string;
  currentDomain?: string;
  onSwitchStudent?: (student: StudentProfile) => void;
  courseCustomizations?: Record<number, CourseCustomization>;
  onSaveCustomization?: (courseId: number, custom: CourseCustomization) => void;
  courseOrder?: number[];
  onUpdateCourseOrder?: (order: number[]) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  data,
  selectedCourseId,
  onSelectCourse,
  visibleCourseIds,
  onToggleCourseVisibility,
  onSelectAllCourses,
  onSelectNoneCourses,
  showHiddenCourses,
  onToggleHidden,
  isCollapsed,
  onToggleCollapse,
  onLogout,
  onDebug,
  showScores = true,
  currentStudentId,
  currentStudentName,
  currentDomain,
  onSwitchStudent,
  courseCustomizations = {},
  onSaveCustomization,
  courseOrder = [],
  onUpdateCourseOrder
}) => {
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);
  const [draggedCourseId, setDraggedCourseId] = useState<number | null>(null);
  const sidebarCourses = useMemo(() => {
    let courses = [...data];

    if (!showHiddenCourses) {
      courses = courses.filter(c => c.course.is_favorite);
    }

    // Apply custom user drag-reordered course order if set
    if (courseOrder && courseOrder.length > 0) {
      courses.sort((a, b) => {
        const indexA = courseOrder.indexOf(a.course.id);
        const indexB = courseOrder.indexOf(b.course.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.course.name.localeCompare(b.course.name);
      });
      return courses;
    }

    // Default sorting by term weight and favorites
    courses.sort((a, b) => {
      const termA = a.course.term?.name || 'Default Term';
      const termB = b.course.term?.name || 'Default Term';

      const getTermWeight = (term: string) => {
        if (term === 'Default Term') return 0;
        if (term.includes('Schoolwide')) return 1;
        return 2;
      };

      const weightA = getTermWeight(termA);
      const weightB = getTermWeight(termB);

      if (weightA !== weightB) return weightB - weightA;
      if (weightA === 2 && termA !== termB) return termB.localeCompare(termA);

      if (a.course.is_favorite && !b.course.is_favorite) return -1;
      if (!a.course.is_favorite && b.course.is_favorite) return 1;
      
      return a.course.name.localeCompare(b.course.name);
    });

    return courses;
  }, [data, showHiddenCourses, courseOrder]);

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedCourseId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (!draggedCourseId || draggedCourseId === targetId) return;

    const currentIds = sidebarCourses.map(c => c.course.id);
    const sourceIdx = currentIds.indexOf(draggedCourseId);
    const targetIdx = currentIds.indexOf(targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const newOrder = [...currentIds];
    const [removed] = newOrder.splice(sourceIdx, 1);
    newOrder.splice(targetIdx, 0, removed);

    if (onUpdateCourseOrder) {
      onUpdateCourseOrder(newOrder);
    }
    setDraggedCourseId(null);
  };

  const courseAbbreviations = useMemo(() => {
    return computeCourseAbbreviations(sidebarCourses);
  }, [sidebarCourses]);

  const isMultiClassView = selectedCourseId === ALL_COURSES_ID;
  const visibleCount = useMemo(() => {
    return sidebarCourses.filter(c => visibleCourseIds.has(c.course.id)).length;
  }, [sidebarCourses, visibleCourseIds]);

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} h-full bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out z-30 relative`}>
      {/* Reserved Student Profile Spot in Top-Left Corner */}
      {onSwitchStudent && (
        <div className={`px-3 py-2.5 border-b border-slate-200/80 bg-slate-50/80 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-1'} shrink-0`}>
          <StudentSwitcher
            currentStudentId={currentStudentId}
            currentStudentName={currentStudentName}
            currentDomain={currentDomain}
            onSwitchStudent={onSwitchStudent}
            compact={isCollapsed}
          />
          {!isCollapsed && (
            <button 
                onClick={() => onToggleCollapse(!isCollapsed)}
                className="text-slate-400 hover:text-slate-600 transition p-1 hover:bg-slate-200/60 rounded cursor-pointer shrink-0"
                title="Collapse Sidebar"
            >
                <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      <div className={`p-4 border-b border-slate-100 flex flex-col shrink-0 ${isCollapsed ? 'items-center justify-center gap-3' : ''}`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} w-full`}>
            {!isCollapsed && (
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 truncate">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    My Courses
                </h2>
                <button
                  type="button"
                  onClick={() => setIsCustomizationOpen(true)}
                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition cursor-pointer"
                  title="Customize course abbreviations, thematic emojis, and order"
                >
                  <Palette className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {isCollapsed && (
              <button
                type="button"
                onClick={() => setIsCustomizationOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                title="Customize course abbreviations, thematic emojis, and order"
              >
                <Palette className="w-4 h-4" />
              </button>
            )}
            {(!onSwitchStudent || isCollapsed) && (
              <button 
                  onClick={() => onToggleCollapse(!isCollapsed)}
                  className="text-slate-400 hover:text-slate-600 transition p-1 hover:bg-slate-100 rounded cursor-pointer"
                  title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                  {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
              </button>
            )}
        </div>

        {!isCollapsed && (
          <label 
            className="flex items-center gap-2 mt-4 text-xs text-slate-500 cursor-pointer select-none hover:text-slate-700 transition w-full"
            title="Show courses not marked as favorites"
          >
              <input 
                  type="checkbox" 
                  checked={showHiddenCourses} 
                  onChange={e => onToggleHidden(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Show hidden courses
          </label>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar min-h-0">
        {/* All Courses / Multi-Class Container */}
        <div className="space-y-1.5">
          <button
            onClick={() => onSelectCourse(ALL_COURSES_ID)}
            title={isCollapsed ? `All Courses (${visibleCount}/${sidebarCourses.length} visible)` : "View data from all active courses combined"}
            className={`w-full rounded-lg transition-all duration-200 border group relative ${
              isMultiClassView
                ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
            } ${isCollapsed ? 'p-2 flex justify-center items-center aspect-square' : 'text-left p-3'}`}
          >
             {isCollapsed ? (
                <div className="relative flex items-center justify-center">
                  <Layers className={`w-6 h-6 ${isMultiClassView ? 'text-indigo-600' : 'text-slate-400'}`} />
                  {visibleCount < sidebarCourses.length && (
                    <span className="absolute -bottom-1 -right-1 text-[9px] font-mono font-bold bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center">
                      {visibleCount}
                    </span>
                  )}
                </div>
             ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-md ${isMultiClassView ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                          <Layers className="w-4 h-4" />
                      </div>
                      <div>
                          <div className={`font-semibold text-sm ${isMultiClassView ? 'text-indigo-900' : 'text-slate-800'}`}>
                            All Courses
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {isMultiClassView ? `${visibleCount} of ${sidebarCourses.length} visible` : 'Combined View'}
                          </div>
                      </div>
                  </div>
                </div>
             )}
          </button>

          {/* All / None Multi-Class Toggle Bar */}
          {!isCollapsed ? (
            <div className="flex items-center justify-between px-2 py-1 bg-slate-50/80 rounded-md border border-slate-100 text-xs">
              <span className="text-[11px] font-medium text-slate-500">
                Visible: <span className="font-bold text-slate-700">{visibleCount}/{sidebarCourses.length}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAllCourses();
                  }}
                  className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 transition shadow-xs"
                  title="Show all classes in multi-class view"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNoneCourses();
                  }}
                  className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition shadow-xs"
                  title="Hide all classes in multi-class view"
                >
                  None
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1 py-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAllCourses();
                }}
                className="text-[9px] font-bold px-1 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                title="Show all courses"
              >
                All
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNoneCourses();
                }}
                className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                title="Hide all courses"
              >
                0
              </button>
            </div>
          )}
        </div>
        
        {!isCollapsed && <div className="h-px bg-slate-100 my-2 mx-1"></div>}

        {sidebarCourses.length === 0 && (
           <div className="text-sm text-slate-400 text-center italic mt-4">{!isCollapsed && "No active courses found."}</div>
        )}
        {sidebarCourses.map((item, index) => {
          const currentTerm = item.course.term?.name || 'Default Term';
          const prevTerm = index > 0 ? (sidebarCourses[index - 1].course.term?.name || 'Default Term') : null;
          const showSeparator = index > 0 && currentTerm !== prevTerm;

          const isVisibleInMulti = visibleCourseIds.has(item.course.id);
          const isSelected = selectedCourseId === item.course.id;
          const prunedTitle = pruneCourseTitle(item.course.name);
          const custom = courseCustomizations[item.course.id] || {};
          const emoji = custom.emoji || '';
          const abbr = custom.abbreviation || courseAbbreviations.get(item.course.id) || item.course.name.substring(0, 3).toUpperCase();

          return (
          <React.Fragment key={item.course.id}>
           {!isCollapsed && showSeparator && (
               <div className="flex items-center gap-2 py-3 px-1">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs font-bold text-slate-400 tracking-wider truncate max-w-[120px]">{currentTerm}</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
               </div>
           )}
          <div
            draggable={!isCollapsed}
            onDragStart={(e) => handleDragStart(e, item.course.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, item.course.id)}
            onClick={() => {
              if (isMultiClassView) {
                // In multi-class view: clicking toggles hide/show for this course
                onToggleCourseVisibility(item.course.id);
              } else {
                // In single-course view: clicking switches to this course
                onSelectCourse(item.course.id);
              }
            }}
            title={`${item.course.name} - Drag up/down to reorder`}
            className={`w-full rounded-lg transition-all duration-200 border group relative cursor-pointer select-none ${
              draggedCourseId === item.course.id ? 'opacity-40 border-dashed border-blue-400' : ''
            } ${
              isSelected
                ? 'bg-blue-50 border-blue-200 shadow-sm'
                : isMultiClassView
                  ? isVisibleInMulti
                    ? 'bg-white border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/30'
                    : 'bg-slate-50/50 border-transparent hover:border-slate-200 opacity-60 hover:opacity-90'
                  : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
            } ${isCollapsed ? 'p-2 flex justify-center items-center aspect-square' : 'text-left p-3'}`}
          >
            {isCollapsed ? (
              <div 
                className={`font-mono font-bold text-xs tracking-wide px-1 py-1 rounded transition-colors text-center border flex flex-col items-center justify-center ${
                  isSelected 
                    ? 'text-blue-700 bg-blue-100/80 border-blue-300' 
                    : isMultiClassView
                      ? isVisibleInMulti
                        ? 'text-blue-700 bg-blue-50 border-blue-200 shadow-xs'
                        : 'text-slate-400 bg-slate-100 border-dashed border-slate-300 line-through'
                      : 'text-slate-600 group-hover:text-slate-900 group-hover:bg-slate-100 border-transparent'
                }`}
                title={`${item.course.name} (${isMultiClassView ? (isVisibleInMulti ? 'Visible' : 'Hidden') : 'Click to select'})`}
              >
                  {emoji ? (
                    <span className="text-lg leading-none select-none">{emoji}</span>
                  ) : (
                    <span className="truncate max-w-[48px]">{abbr}</span>
                  )}
              </div>
            ) : (
              <>
                  <div className="flex justify-between items-start gap-2">
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                          {/* Drag handle */}
                          <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 opacity-0 group-hover:opacity-100 transition cursor-grab shrink-0 mt-0.5" title="Drag to reorder class" />

                          {/* Checkbox for toggle hide/show */}
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleCourseVisibility(item.course.id);
                              if (!isMultiClassView) {
                                // If in single view, clicking checkbox switches to multi-view with that course toggled
                                onSelectCourse(ALL_COURSES_ID);
                              }
                            }}
                            className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center transition border shrink-0 ${
                              isVisibleInMulti
                                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                                : 'bg-white border-slate-300 text-transparent group-hover:border-slate-400'
                            }`}
                            title={isVisibleInMulti ? "Hide this course in multi-class view" : "Show this course in multi-class view"}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>

                          <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm truncate flex items-center gap-1.5 ${
                                isSelected 
                                  ? 'text-blue-800' 
                                  : isMultiClassView && !isVisibleInMulti
                                    ? 'text-slate-400 line-through decoration-slate-300'
                                    : 'text-slate-800'
                              }`}>
                                  {emoji ? (
                                    <span className="text-base leading-none shrink-0 select-none" title={item.course.name}>
                                      {emoji}
                                    </span>
                                  ) : (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${
                                      isSelected
                                        ? 'bg-blue-100 text-blue-700 border-blue-300'
                                        : isVisibleInMulti
                                          ? 'bg-slate-100 text-slate-700 border-slate-200/80'
                                          : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                                    }`}>
                                      {abbr}
                                    </span>
                                  )}
                                  <span className="truncate" title={item.course.name}>
                                    {prunedTitle}
                                  </span>
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-0.5">{item.course.course_code}</div>
                              {item.course.term && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">{item.course.term.name}</div>
                              )}
                          </div>
                      </div>

                      {/* "Only" quick button on hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCourse(item.course.id);
                        }}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition shadow-xs shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'opacity-0 group-hover:opacity-100 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 border border-slate-200'
                        }`}
                        title={`View ONLY ${prunedTitle}`}
                      >
                        Only
                      </button>
                  </div>

                  {item.enrollment?.grades.current_grade && showScores && (
                      <div className="mt-2 inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                      Grade: {item.enrollment.grades.current_grade}
                      </div>
                  )}
              </>
            )}
          </div>
          </React.Fragment>
        )})}
      </div>
      <div className={`p-4 border-t border-slate-100 bg-slate-50 flex items-center shrink-0 ${isCollapsed ? 'flex-col gap-4 justify-center' : 'justify-between'}`}>
          <button 
              onClick={onDebug} 
              className={`flex items-center justify-center gap-2 transition-colors font-medium rounded-lg ${
                  isCollapsed 
                  ? 'w-10 h-10 text-slate-400 hover:text-blue-600 hover:bg-slate-200' 
                  : 'text-sm text-slate-500 hover:text-slate-700'
              }`}
              title="Open API Debugger"
          >
              <Bug className="w-4 h-4" /> 
              {!isCollapsed && "Debug"}
          </button>
          <button 
              onClick={onLogout} 
              className={`flex items-center justify-center gap-2 transition-colors font-medium rounded-lg ${
                  isCollapsed 
                  ? 'w-10 h-10 text-slate-500 hover:text-red-600 hover:bg-red-50' 
                  : 'text-sm text-slate-500 hover:text-slate-700'
              }`}
              title="Log Out"
          >
              <LogOut className="w-4 h-4" />
              {!isCollapsed && "Log Out"}
          </button>
      </div>

      {/* Course Customization Modal */}
      {isCustomizationOpen && onSaveCustomization && onUpdateCourseOrder && (
        <CourseCustomizationModal
          courses={data}
          customizations={courseCustomizations}
          courseOrder={courseOrder}
          onSaveCustomization={onSaveCustomization}
          onUpdateCourseOrder={onUpdateCourseOrder}
          onClose={() => setIsCustomizationOpen(false)}
          defaultAbbreviations={Object.fromEntries(
            data.map(c => [c.course.id, courseAbbreviations.get(c.course.id) || c.course.name.slice(0, 3).toUpperCase()])
          )}
        />
      )}
    </div>
  );
};
