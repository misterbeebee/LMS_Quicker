

import React from 'react';
import { CourseData, ALL_COURSES_ID, CanvasCalendarEvent } from '../../types';
import { ExternalLink, GraduationCap, ClipboardList, Layers, Settings, AlertTriangle, Compass, HelpCircle, Play, Calendar, Clock } from 'lucide-react';
import { isAssignmentSubmitted } from '../../utils/dashboard-helpers';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, getGradeStyle } from '../../services/gradeScale';
import { CourseCustomization } from '../../services/courseCustomization';
import { TutorialId } from './InteractiveTutorialModal';

interface OverviewProps {
  course: CourseData;
  allCoursesData?: CourseData[];
  onNavigate: (tab: 'assignments' | 'modules') => void;
  showScores?: boolean;
  showCalendarEvents?: boolean;
  calendarEvents?: CanvasCalendarEvent[];
  gradeConfig?: GradeScaleConfig;
  onOpenGradeSettings?: () => void;
  courseCustomizations?: Record<number, CourseCustomization>;
  onSelectCourse?: (courseId: number) => void;
  onStartTutorial?: (tutorialId?: TutorialId) => void;
}

export const Overview: React.FC<OverviewProps> = ({ 
  course, 
  allCoursesData = [],
  onNavigate, 
  showScores = true,
  showCalendarEvents = false,
  calendarEvents = [],
  gradeConfig = DEFAULT_GRADE_CONFIG,
  onOpenGradeSettings,
  courseCustomizations,
  onSelectCourse,
  onStartTutorial
}) => {
  const isMultiCourse = course.course.id === ALL_COURSES_ID;

  // Helper to compute assignment average if official grade is hidden
  const computeCourseAverage = (c: CourseData) => {
    let earned = 0;
    let possible = 0;
    let gradedCount = 0;

    c.assignments.forEach(a => {
      if (!a.is_calendar_event && a.points_possible > 0 && a.submission?.score !== null && a.submission?.score !== undefined) {
        earned += Number(a.submission.score);
        possible += Number(a.points_possible);
        gradedCount++;
      }
    });

    if (possible > 0 && gradedCount > 0) {
      return {
        score: Math.round((earned / possible) * 1000) / 10,
        gradedCount,
        isEstimated: true
      };
    }
    return null;
  };

  const getEffectiveGrade = (c: CourseData): { score: number; letter?: string; isEstimated: boolean; hasData: boolean } | null => {
    const officialScore = c.enrollment?.grades?.current_score;
    const officialGrade = c.enrollment?.grades?.current_grade;

    // Check if official score is a real number (including 0!)
    if (typeof officialScore === 'number' && !isNaN(officialScore)) {
      return {
        score: officialScore,
        letter: officialGrade || undefined,
        isEstimated: false,
        hasData: true
      };
    }

    // Try computing from graded assignments
    const estimated = computeCourseAverage(c);
    if (estimated) {
      return {
        score: estimated.score,
        letter: undefined,
        isEstimated: true,
        hasData: true
      };
    }

    return null;
  };

  const singleGradeInfo = getEffectiveGrade(course);
  const notSubmittedCount = course.assignments.filter(a => !a.is_calendar_event && !isAssignmentSubmitted(a)).length;
  const eventCount = course.assignments.filter(a => !!a.is_calendar_event).length;

  return (
    <div className="space-y-6">
      {/* Calm, Neutral Guided Walkthroughs Banner */}
      {onStartTutorial && (
        <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-800 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-slate-200/70 text-slate-700 shrink-0">
              <Compass className="w-4 h-4 text-slate-700" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-slate-800">Guided Walkthroughs</h3>
              <p className="text-[11px] text-slate-500">Automated interactive tours showcasing interface controls and navigation</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onStartTutorial('major_views')}
              className="px-3 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Tour Major UI Views (Overview, Board, Table, Modules, ToDo)"
            >
              <Play className="w-3 h-3 text-blue-600 fill-blue-600" />
              <span>Tour Major Views</span>
            </button>
            <button
              type="button"
              onClick={() => onStartTutorial('filters_and_controls')}
              className="px-3 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium text-xs shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
              title="Tour Display popover, filters, calendar events, and color thresholds"
            >
              <Settings className="w-3 h-3 text-slate-500" />
              <span>Tour Filters & Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Grade Card */}
        <div className="bg-white px-4 py-3 rounded-xl shadow-xs border border-slate-200/90 flex items-center justify-between group relative" title="Course Grade Summary">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {isMultiCourse ? 'Active Courses' : 'Current Grade'}
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                {isMultiCourse ? (
                  <span className="text-xl font-bold text-slate-900">
                    {allCoursesData.length} classes
                  </span>
                ) : singleGradeInfo && singleGradeInfo.hasData && showScores ? (
                  (() => {
                    const style = getGradeStyle(singleGradeInfo.score, 100, gradeConfig, { isCourseGrade: true });
                    return (
                      <>
                        <span className="text-xl font-bold" style={{ color: style.style.color || undefined }}>
                          {singleGradeInfo.score}%
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.2 rounded ${style.badgeClass}`}>
                          {singleGradeInfo.letter || style.letter}
                        </span>
                        {singleGradeInfo.isEstimated && (
                          <span 
                            className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded font-medium cursor-help" 
                            title="Estimated Course Grade: Canvas does not provide an official course grade for this class, so this is calculated as a heuristic unweighted average of your graded assignments."
                          >
                            Est
                          </span>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <span className="text-xs font-medium text-slate-400 italic">
                    {!showScores ? 'Hidden (Settings)' : 'No Grade Data (Hidden by teacher)'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Settings Micro-button */}
          {onOpenGradeSettings && (
            <button
              type="button"
              onClick={onOpenGradeSettings}
              className="p-1 rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition opacity-0 group-hover:opacity-100 cursor-pointer"
              title="Configure Grade Threshold Colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Assignments Card - Compact & Clickable */}
        <div 
          onClick={() => onNavigate('assignments')}
          className="bg-white px-4 py-3 rounded-xl shadow-xs border border-slate-200/90 cursor-pointer hover:border-blue-300 hover:shadow-xs transition-all group flex items-center justify-between"
          title="Click to view Assignments"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0 group-hover:bg-blue-100 transition-colors">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-blue-600 transition-colors">Assignments</div>
              <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                <span className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{notSubmittedCount}</span>
                <span className="text-xs text-slate-500">not submitted</span>
                {eventCount > 0 && (
                  <span className="text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded-full" title="Upcoming calendar events merged in">
                    +{eventCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Modules Card - Compact & Clickable */}
        <div 
          onClick={() => onNavigate('modules')}
          className="bg-white px-4 py-3 rounded-xl shadow-xs border border-slate-200/90 cursor-pointer hover:border-blue-300 hover:shadow-xs transition-all group flex items-center justify-between"
          title="Click to view Modules"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0 group-hover:bg-indigo-100 transition-colors">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 group-hover:text-blue-600 transition-colors">Modules</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{course.modules.length}</span>
                <span className="text-xs text-slate-500">units</span>
              </div>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Upcoming Calendar Events Panel */}
      {showCalendarEvents && eventCount > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-100">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Upcoming Calendar Events ({eventCount})</h3>
                <p className="text-xs text-slate-500">Live events scheduled from Canvas calendar</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('assignments')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              <span>View in Board</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {course.assignments
              .filter(a => !!a.is_calendar_event)
              .map(ev => {
                const formattedDate = ev.due_at 
                  ? new Date(ev.due_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : 'Date TBD';

                return (
                  <div key={ev.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-purple-200 transition flex flex-col justify-between gap-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-xs text-slate-900 truncate" title={ev.name}>{ev.name}</h4>
                        {ev.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                            {ev.description.replace(/<[^>]*>/g, ' ')}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
                        Event
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formattedDate}
                      </span>
                      {ev.location_name && (
                        <span className="truncate max-w-[140px] text-slate-500" title={ev.location_name}>
                          📍 {ev.location_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Multi-Course View: Course Grade & Workload Grid */}
      {isMultiCourse && allCoursesData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Course Academic Standing & Workload</h3>
              <p className="text-xs text-slate-500">Overview of grades, pending items, and activity across all active courses</p>
            </div>
            {onOpenGradeSettings && (
              <button
                type="button"
                onClick={onOpenGradeSettings}
                className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Grade Scales</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allCoursesData.map((c) => {
              const gradeInfo = getEffectiveGrade(c);
              const custom = courseCustomizations?.[c.course.id];
              const displayName = custom?.abbreviation || c.course.name;
              const emoji = custom?.emoji;
              const pending = c.assignments.filter(a => !a.is_calendar_event && !isAssignmentSubmitted(a)).length;

              return (
                <div 
                  key={c.course.id}
                  onClick={() => onSelectCourse && onSelectCourse(c.course.id)}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer bg-slate-50/40 hover:bg-white flex flex-col justify-between group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {emoji ? (
                        <span className="text-base shrink-0">{emoji}</span>
                      ) : null}
                      <span className="font-semibold text-xs text-slate-900 truncate group-hover:text-blue-600 transition-colors" title={c.course.name}>
                        {displayName}
                      </span>
                    </div>

                    {/* Grade pill with fixed vertical alignment */}
                    {gradeInfo && gradeInfo.hasData && showScores ? (
                      (() => {
                        const style = getGradeStyle(gradeInfo.score, 100, gradeConfig, { isCourseGrade: true });
                        return (
                          <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                            <span className="text-xs font-bold w-12 text-right" style={{ color: style.style.color || undefined }}>
                              {gradeInfo.score}%
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded w-7 text-center shrink-0 ${style.badgeClass}`}>
                              {gradeInfo.letter || style.letter}
                            </span>
                            {/* Reserved fixed-width slot for Est marker so grades fall in an exact vertical line */}
                            <span className="w-7 flex justify-center shrink-0">
                              {gradeInfo.isEstimated ? (
                                <span 
                                  className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded font-medium cursor-help" 
                                  title="Estimated Course Grade: Canvas does not provide an official course grade for this class, so this is calculated as a heuristic unweighted average of your graded assignments."
                                >
                                  Est
                                </span>
                              ) : null}
                            </span>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-slate-400 italic">
                          {!showScores ? 'Hidden' : 'No Data'}
                        </span>
                        <span className="w-7 shrink-0" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                    <span>{pending} pending {pending === 1 ? 'task' : 'tasks'}</span>
                    <span className="text-slate-400 group-hover:text-blue-600 transition-colors flex items-center gap-0.5">
                      View <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};