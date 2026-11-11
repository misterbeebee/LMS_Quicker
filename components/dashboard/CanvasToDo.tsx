import React, { useState } from 'react';
import { CanvasTodoItem } from '../../types';
import { 
  CheckCircle, 
  Calendar, 
  ExternalLink, 
  Loader2, 
  Megaphone, 
  FileText,
  ChevronDown,
  ChevronRight,
  FileQuestion
} from 'lucide-react';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import { cleanAssignmentDescription, linkifyHtml, formatPoints, formatRelativeDueDate } from '../../utils/dashboard-helpers';
import { CourseCustomization } from '../../services/courseCustomization';
import { CourseData } from '../../types';
import { useNow } from '../../utils/useRelativeTime';

interface CanvasToDoProps {
  items: CanvasTodoItem[];
  onMarkDone: (item: CanvasTodoItem) => Promise<void>;
  showIds?: boolean;
  courseCustomizations?: Record<number, CourseCustomization>;
  getCourseName?: (id: number) => string;
  courses?: CourseData[];
}

export const CanvasToDo: React.FC<CanvasToDoProps> = ({ 
  items, 
  onMarkDone, 
  showIds = false,
  courseCustomizations = {},
  getCourseName,
  courses = []
}) => {
  const now = useNow();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const handleDone = async (item: CanvasTodoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = item.ignore || item.html_url;
    setProcessingId(key);
    try {
      await onMarkDone(item);
    } finally {
      setProcessingId(null);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-slate-200 border-dashed p-8 text-center animate-fadeIn">
        <div className="bg-emerald-50 p-4 rounded-full mb-3 border border-emerald-100">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-base font-bold text-slate-800">You're All Caught Up!</h3>
        <p className="text-xs text-slate-500 mt-1">No To-Do items found in your Canvas planner.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-2xs">
            <Megaphone className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              Canvas To Do
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                {items.length} {items.length === 1 ? 'task' : 'tasks'}
              </span>
            </h2>
            <p className="text-xs text-slate-500">Official Canvas planner assignments & actionable items</p>
          </div>
        </div>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Same layout & edge-bonding as assignment cards
        </span>
      </div>
      
      {/* Grid of edge-bonded ToDo cards identical to assignment cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item, index) => {
          const uniqueKey = item.ignore || item.html_url || String(index);
          const date = item.assignment?.due_at || null;
          const points = item.assignment?.points_possible;
          const isProcessing = processingId === uniqueKey;
          const isExpanded = expandedKeys.has(uniqueKey);

          const title = item.assignment?.name || item.quiz?.title || 'Canvas To-Do Item';
          const courseId = item.course_id || item.assignment?.course_id || item.context_id;
          const matchedCourse = !courseId && courses.length > 0 && item.context_name 
            ? courses.find(c => c.course.name === item.context_name || c.course.course_code === item.context_name)
            : undefined;
          const resolvedCourseId = courseId || matchedCourse?.course.id;

          const customCourse = resolvedCourseId ? courseCustomizations[resolvedCourseId] : undefined;
          const rawCourseName = item.context_name ? pruneCourseTitle(item.context_name) : 'Course';
          const courseName = (resolvedCourseId && getCourseName)
            ? getCourseName(resolvedCourseId)
            : (customCourse?.abbreviation || rawCourseName);
          const emoji = customCourse?.emoji;

          const rawDesc = item.assignment?.description || item.quiz?.description;
          const cleanedDesc = cleanAssignmentDescription(rawDesc);
          const hasBodyContent = !!cleanedDesc;

          const isQuiz = !!item.quiz || item.type === 'online_quiz';
          const isGrading = item.type === 'grading';
          const itemId = item.assignment?.id || item.quiz?.id || item.id;

          return (
            <div 
              key={uniqueKey} 
              onClick={() => hasBodyContent && toggleExpand(uniqueKey)}
              className={`relative bg-white rounded-xl shadow-xs border border-slate-200/90 hover:shadow-md hover:border-slate-300 transition-all group flex flex-col justify-between overflow-hidden ${
                hasBodyContent ? 'cursor-pointer' : ''
              } ${isExpanded ? 'ring-2 ring-blue-100' : ''}`}
              title={hasBodyContent ? (isExpanded ? "Click to collapse instructions" : "Click to view instructions") : undefined}
            >
              {/* Flat left accent stripe (replaces border-l-4 to eliminate C-shape curve and tip hooks) */}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-400/80 pointer-events-none z-10" />

              {/* Top bonded header bar */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/90 border-b border-slate-100 text-[11px] gap-2">
                {/* Course Name & Badges bonded flush to top-left */}
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span 
                    className="font-semibold text-slate-800 text-xs truncate max-w-[170px]" 
                    title={rawCourseName}
                  >
                    {emoji ? `${emoji} ` : ''}{courseName}
                  </span>
                  {isQuiz && (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 shrink-0">
                      Quiz
                    </span>
                  )}
                  {isGrading && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 shrink-0">
                      To Grade
                    </span>
                  )}
                  {showIds && itemId && (
                    <span 
                      className="text-[10px] font-mono text-slate-400 select-all shrink-0" 
                      title={`Task ID: ${itemId}`}
                    >
                      #{itemId}
                    </span>
                  )}
                </div>

                {/* Flush top-right: Points pill & external link */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {points !== undefined && points !== null && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-600 border border-slate-200/80">
                      {formatPoints(points)}
                    </span>
                  )}
                  {item.html_url && (
                    <a 
                      href={item.html_url} 
                      target="_blank" 
                      rel="noreferrer" 
                      onClick={(e) => e.stopPropagation()} 
                      className="text-slate-300 hover:text-blue-600 p-0.5 transition rounded hover:bg-slate-200/60"
                      title="Open in Canvas"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-3 flex-1 min-w-0 bg-white">
                <h4 className="font-semibold text-slate-800 group-hover:text-blue-600 transition text-sm leading-snug line-clamp-2" title={title}>
                  {item.html_url ? (
                    <a 
                      href={item.html_url} 
                      target="_blank" 
                      rel="noreferrer" 
                      onClick={(e) => e.stopPropagation()} 
                      className="hover:underline"
                    >
                      {title}
                    </a>
                  ) : title}
                </h4>

                {hasBodyContent && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {isExpanded ? (
                      <div 
                        className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 prose prose-xs max-w-none mt-1 max-h-48 overflow-y-auto custom-scrollbar"
                        dangerouslySetInnerHTML={{ __html: linkifyHtml(cleanedDesc) }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className="line-clamp-2 text-slate-500 leading-relaxed">{cleanedDesc.replace(/<[^>]*>/g, ' ')}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom bonded footer bar */}
              <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs bg-slate-50/80 text-slate-600">
                {/* Due date bonded flush to bottom-left */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="font-medium truncate">
                    {date ? formatRelativeDueDate(date, now) : 'No Due Date'}
                  </span>
                </div>

                {/* Right controls: Details toggle + "Done?" Checkbox */}
                <div className="flex items-center gap-2 shrink-0">
                  {hasBodyContent && (
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(uniqueKey);
                      }}
                      className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/80 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-100 transition cursor-pointer"
                    >
                      {isExpanded ? 'Hide' : 'Details'}
                    </button>
                  )}

                  {item.ignore && (
                    <label 
                      onClick={(e) => e.stopPropagation()}
                      className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-2.5 py-0.5 rounded text-xs font-semibold transition shadow-2xs ${
                        isProcessing 
                          ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                          : 'bg-white text-slate-700 border border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/60 hover:text-emerald-800'
                      }`}
                      title="Check Done? to dismiss this task from Canvas"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                      ) : (
                        <input 
                          type="checkbox"
                          checked={false}
                          disabled={isProcessing}
                          onChange={(e) => handleDone(item, e as any)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      )}
                      <span>Done?</span>
                    </label>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
