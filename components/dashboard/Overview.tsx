

import React from 'react';
import { CourseData } from '../../types';
import { ExternalLink, GraduationCap, ClipboardList, Layers } from 'lucide-react';
import { isAssignmentSubmitted } from '../../utils/dashboard-helpers';

interface OverviewProps {
  course: CourseData;
  onNavigate: (tab: 'assignments' | 'modules') => void;
  showScores?: boolean;
}

export const Overview: React.FC<OverviewProps> = ({ course, onNavigate, showScores = true }) => {
  const score = course.enrollment?.grades?.current_score;
  const grade = course.enrollment?.grades?.current_grade;
  const hasScore = score !== null && score !== undefined;
  
  const notSubmittedCount = course.assignments.filter(a => !a.is_calendar_event && !isAssignmentSubmitted(a)).length;
  const eventCount = course.assignments.filter(a => !!a.is_calendar_event).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Grade Card - Compact */}
      <div className="bg-white px-4 py-3 rounded-xl shadow-xs border border-slate-200/90 flex items-center justify-between" title="Current Grade Summary">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-100 text-slate-600 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Current Grade</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              {hasScore && showScores ? (
                <>
                  <span className="text-xl font-bold text-slate-900">{score}%</span>
                  <span className="text-xs font-semibold text-slate-500">({grade || 'N/A'})</span>
                </>
              ) : (
                <span className="text-xs font-medium text-slate-400 italic">
                  {hasScore ? 'Hidden (Settings)' : 'Hidden by teacher'}
                </span>
              )}
            </div>
          </div>
        </div>
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
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded-full" title="Upcoming calendar events merged in">
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
  );
};