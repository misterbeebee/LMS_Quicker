import React, { useMemo, useState } from 'react';
import { CourseData, ALL_COURSES_ID, StudentProfile } from '../../types';
import { BookOpen, PanelLeftOpen, PanelLeftClose, Layers, Bug, LogOut, Check, CheckSquare, Square, Palette, GripVertical, X } from 'lucide-react';
import { computeCourseAbbreviations, pruneCourseTitle } from '../../utils/courseAbbreviations';
import { StudentSwitcher } from './StudentSwitcher';
import { CourseCustomizationModal } from './CourseCustomizationModal';
import { CourseCustomization } from '../../services/courseCustomization';
import { getGradeStyle } from '../../services/gradeScale';
import { isCourseInPastTerm } from '../../utils/dashboard-helpers';
import { getEffectiveCourseGrade } from '../../utils/gradeInspector';

interface SidebarProps {
  data: CourseData[];
  selectedCourseId: number | null;
  onSelectCourse: (id: number) => void;
  visibleCourseIds: Set<number>;
  onToggleCourseVisibility: (id: number) => void;
  onSelectAllCourses: () => void;
  onSelectNoneCourses: () => void;
  onSelectOnlyCourse?: (id: number) => void;
  showHiddenCourses: boolean;
  onToggleHidden: (val: boolean) => void;
  showPastTerms?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: (val: boolean) => void;
  onLogout: () => void;
  onDebug: () => void;
  showScores?: boolean;
  currentStudentId?: string;
  currentStudentName?: string;
  currentDomain?: string;
  onSwitchStudent?: (student: StudentProfile) => void;
  onRenameStudent?: (newName: string) => void;
  courseCustomizations?: Record<number, CourseCustomization>;
  onSaveCustomization?: (courseId: number, custom: CourseCustomization) => void;
  courseOrder?: number[];
  onUpdateCourseOrder?: (order: number[]) => void;
  onInspectCourseGrade?: (courseId: number) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  data,
  selectedCourseId,
  onSelectCourse,
  visibleCourseIds,
  onToggleCourseVisibility,
  onSelectAllCourses,
  onSelectNoneCourses,
  onSelectOnlyCourse,
  showHiddenCourses,
  onToggleHidden,
  showPastTerms = false,
  isCollapsed,
  onToggleCollapse,
  onLogout,
  onDebug,
  showScores = true,
  currentStudentId,
  currentStudentName,
  currentDomain,
  onSwitchStudent,
  onRenameStudent,
  courseCustomizations = {},
  onSaveCustomization,
  courseOrder = [],
  onUpdateCourseOrder,
  onInspectCourseGrade,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);
  const [draggedCourseId, setDraggedCourseId] = useState<number | null>(null);
  const sidebarCourses = useMemo(() => {
    let courses = [...data];

    if (!showPastTerms) {
      courses = courses.filter(c => !isCourseInPastTerm(c.course));
    }

    const hasFavorites = courses.some(c => c.course.is_favorite);
    if (!showHiddenCourses && hasFavorites) {
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
  }, [data, showHiddenCourses, showPastTerms, courseOrder]);

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
  const isEffectiveCollapsed = isCollapsed && !isMobileOpen;
  const visibleCount = useMemo(() => {
    return sidebarCourses.filter(c => visibleCourseIds.has(c.course.id)).length;
  }, [sidebarCourses, visibleCourseIds]);
  const isAllCoursesSelected = isMultiClassView && sidebarCourses.length > 0 && visibleCount === sidebarCourses.length;

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden animate-fadeIn"
          aria-hidden="true"
        />
      )}

      <div 
        data-tutorial="sidebar-container" 
        className={`fixed inset-y-0 left-0 z-50 md:static flex flex-col h-dvh md:h-full bg-white border-r border-slate-200 transition-all duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        } ${isEffectiveCollapsed ? 'md:w-20' : 'md:w-60 lg:w-64'} w-60 sm:w-64 max-w-[85vw]`}>
        {/* Mobile Header Close Bar (only visible on mobile screens) */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800 text-sm">Course Navigation</span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reserved Student Profile Spot in Top-Left Corner */}
        {onSwitchStudent && (
          <div className={`px-3 py-2.5 border-b border-slate-200/80 bg-slate-50/80 flex items-center ${isEffectiveCollapsed ? 'justify-center' : 'justify-between gap-1'} shrink-0`}>
            <StudentSwitcher
              currentStudentId={currentStudentId}
              currentStudentName={currentStudentName}
              currentDomain={currentDomain}
              onSwitchStudent={onSwitchStudent}
              onRenameStudent={onRenameStudent}
              compact={isEffectiveCollapsed}
            />
            {!isEffectiveCollapsed && (
              <button 
                  onClick={() => onToggleCollapse(!isCollapsed)}
                  className="hidden md:block text-slate-400 hover:text-slate-600 transition p-1 hover:bg-slate-200/60 rounded cursor-pointer shrink-0"
                  title="Collapse Sidebar"
              >
                  <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className={`p-4 border-b border-slate-100 flex flex-col shrink-0 ${isEffectiveCollapsed ? 'items-center justify-center gap-3' : ''}`}>
          <div className={`flex items-center ${isEffectiveCollapsed ? 'justify-center' : 'justify-between'} w-full`}>
              {!isEffectiveCollapsed && (
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
              {isEffectiveCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsCustomizationOpen(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                  title="Customize course abbreviations, thematic emojis, and order"
                >
                  <Palette className="w-4 h-4" />
                </button>
              )}
              {(!onSwitchStudent || isEffectiveCollapsed) && (
                <button 
                    onClick={() => onToggleCollapse(!isCollapsed)}
                    className="hidden md:block text-slate-400 hover:text-slate-600 transition p-1 hover:bg-slate-100 rounded cursor-pointer"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                    {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
                </button>
              )}
          </div>

        {!isEffectiveCollapsed && (
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
            onClick={() => {
              onSelectCourse(ALL_COURSES_ID);
              if (onCloseMobile) onCloseMobile();
            }}
            title={isEffectiveCollapsed ? `All Courses (${visibleCount}/${sidebarCourses.length} visible)` : "View data from all active courses combined"}
            className={`transition-all duration-200 border group relative ${
              isMultiClassView
                ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
            } ${isEffectiveCollapsed ? 'w-11 h-11 mx-auto flex justify-center items-center p-0 rounded-xl' : 'w-full text-left p-3 rounded-lg'}`}
          >
             {isEffectiveCollapsed ? (
                <div className="relative flex items-center justify-center w-full h-full">
                  <Layers className={`w-5 h-5 ${isMultiClassView ? 'text-indigo-600' : 'text-slate-400'}`} />
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
          {!isEffectiveCollapsed ? (
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
                  aria-pressed={isAllCoursesSelected}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border transition shadow-xs cursor-pointer ${
                    isAllCoursesSelected
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white hover:bg-indigo-50 text-slate-600 border-slate-200'
                  }`}
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
                  aria-pressed={visibleCount === 0}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border transition shadow-xs cursor-pointer ${
                    visibleCount === 0
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
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
                aria-pressed={isAllCoursesSelected}
                className={`text-[9px] font-bold px-1 py-0.5 rounded border cursor-pointer ${
                  isAllCoursesSelected
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white hover:bg-indigo-50 text-slate-600 border-slate-200'
                }`}
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
                className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 cursor-pointer"
                title="Hide all courses"
              >
                0
              </button>
            </div>
          )}
        </div>
        
        {!isEffectiveCollapsed && <div className="h-px bg-slate-100 my-2 mx-1"></div>}

        {sidebarCourses.length === 0 && (
           <div className="text-sm text-slate-400 text-center italic mt-4">{!isEffectiveCollapsed && "No active courses found."}</div>
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
           {!isEffectiveCollapsed && showSeparator && (
               <div className="flex items-center gap-2 py-3 px-1">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs font-bold text-slate-400 tracking-wider truncate max-w-[120px]">{currentTerm}</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
               </div>
           )}
          <div
            draggable={!isEffectiveCollapsed}
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
                if (onCloseMobile) onCloseMobile();
              }
            }}
            title={`${item.course.name} - Drag up/down to reorder`}
            className={`transition-all duration-200 border group relative cursor-pointer select-none ${
              draggedCourseId === item.course.id ? 'opacity-40 border-dashed border-blue-400' : ''
            } ${
              isSelected
                ? 'bg-blue-50 border-blue-200 shadow-sm'
                : isMultiClassView
                  ? isVisibleInMulti
                    ? 'bg-white border-slate-200/80 hover:border-blue-300 hover:bg-blue-50/30'
                    : 'bg-slate-50/50 border-transparent hover:border-slate-200 opacity-60 hover:opacity-90'
                  : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
            } ${isEffectiveCollapsed ? 'w-11 h-11 mx-auto flex justify-center items-center p-0 rounded-xl' : 'w-full text-left p-3 rounded-lg'}`}
          >
            {isEffectiveCollapsed ? (
              <div 
                className={`w-full h-full rounded-xl transition-all text-center border flex flex-col items-center justify-center font-mono font-bold text-xs tracking-tight ${
                  isSelected 
                    ? 'text-blue-700 bg-blue-100/90 border-blue-300 ring-2 ring-blue-400/50 shadow-xs' 
                    : isMultiClassView
                      ? isVisibleInMulti
                        ? 'text-blue-700 bg-blue-50/90 border-blue-200 shadow-2xs hover:bg-blue-100/80'
                        : 'text-slate-400 bg-slate-100 border-dashed border-slate-300 line-through opacity-60'
                      : 'text-slate-600 bg-slate-50 border-slate-200 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={`${item.course.name} (${isMultiClassView ? (isVisibleInMulti ? 'Visible' : 'Hidden') : 'Click to select'})`}
              >
                  {emoji ? (
                    <span className="text-xl leading-none select-none">{emoji}</span>
                  ) : (
                    <span className="truncate px-1 max-w-[40px] text-[11px] font-bold">{abbr}</span>
                  )}
              </div>
            ) : (
              <>
                  {/* Top Line: Emoji / Abbreviation + Full Course Title */}
                  <div className="flex items-center gap-2 min-w-0 w-full">
                      {emoji ? (
                        <span className="text-base shrink-0 select-none" title={item.course.name}>
                          {emoji}
                        </span>
                      ) : (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${
                          isSelected
                            ? 'bg-blue-100 text-blue-700 border-blue-300'
                            : isVisibleInMulti
                              ? 'bg-slate-100 text-slate-700 border-slate-200/80'
                              : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}>
                          {abbr}
                        </span>
                      )}
                      <span className={`font-semibold text-xs sm:text-sm truncate flex-1 min-w-0 ${
                        isSelected 
                          ? 'text-blue-800' 
                          : isMultiClassView && !isVisibleInMulti
                            ? 'text-slate-400 line-through decoration-slate-300'
                            : 'text-slate-800'
                      }`} title={item.course.name}>
                        {prunedTitle}
                      </span>
                  </div>

                  {/* Underneath Course Title: Checkbox + Only Button + Course Code & Term */}
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs flex-wrap">
                      {/* Checkbox toggle with status */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCourseVisibility(item.course.id);
                          if (!isMultiClassView) {
                            onSelectCourse(ALL_COURSES_ID);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer border ${
                          isVisibleInMulti
                            ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs hover:bg-blue-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                        title={isVisibleInMulti ? "Click to hide from multi-class view" : "Click to include in multi-class view"}
                      >
                        <div className={`w-3 h-3 rounded flex items-center justify-center ${isVisibleInMulti ? 'bg-blue-600 text-white' : 'border border-slate-400'}`}>
                          {isVisibleInMulti && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                        <span>{isVisibleInMulti ? 'Included' : 'Hidden'}</span>
                      </button>

                      {/* "Only" button directly beside check mark */}
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectOnlyCourse) {
                            onSelectOnlyCourse(item.course.id);
                          } else {
                            onSelectCourse(isSelected ? ALL_COURSES_ID : item.course.id);
                          }
                          if (onCloseMobile) onCloseMobile();
                        }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded transition cursor-pointer border shadow-2xs ${
                          isSelected
                            ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                            : 'bg-white hover:bg-blue-600 hover:text-white text-slate-600 border-slate-200'
                        }`}
                        title={isSelected ? `Exit ONLY focus on ${prunedTitle}` : `Focus ONLY on ${prunedTitle}`}
                      >
                        Only
                      </button>

                      <span className="text-[11px] text-slate-400 font-mono truncate">
                        {item.course.course_code}
                      </span>
                      {item.course.term && (
                        <span className="text-[10px] text-slate-400 truncate">
                          • {item.course.term.name}
                        </span>
                      )}
                  </div>

                  {showScores && (() => {
                    const effective = getEffectiveCourseGrade(item);
                    if (!effective || !effective.hasData) {
                      return null;
                    }

                    const style = getGradeStyle(effective.score, 100, undefined, { isCourseGrade: true });
                    const gradeLabel = effective.letter || `${effective.score}%`;

                    if (onInspectCourseGrade) {
                      return (
                        <button
                          type="button"
                          data-testid={`sidebar-inspect-grade-${item.course.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectCourseGrade(item.course.id);
                          }}
                          className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full border shadow-2xs hover:opacity-85 transition cursor-pointer"
                          style={style.style}
                          title={`Inspect how ${prunedTitle}'s grade is fetched or calculated`}
                        >
                          <span>{gradeLabel}</span>
                          {effective.letter && (
                            <span className="text-[10px] opacity-80">({effective.score}%)</span>
                          )}
                          {effective.isEstimated && (
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-100/90 text-amber-800 border border-amber-300/70">
                              Est
                            </span>
                          )}
                        </button>
                      );
                    }

                    return (
                      <div 
                        className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full border shadow-2xs"
                        style={style.style}
                      >
                        <span>{gradeLabel}</span>
                        {effective.letter && (
                          <span className="text-[10px] opacity-80">({effective.score}%)</span>
                        )}
                        {effective.isEstimated && (
                          <span className="text-[9px] font-bold px-1 rounded bg-amber-100/90 text-amber-800 border border-amber-300/70">
                            Est
                          </span>
                        )}
                      </div>
                    );
                  })()}
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
    </>
  );
};
