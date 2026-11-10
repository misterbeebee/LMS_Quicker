import React, { useState } from 'react';
import { CanvasTodoItem } from '../../types';
import { 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  ExternalLink, 
  Loader2, 
  Megaphone, 
  FileText,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  FileQuestion,
  Clock
} from 'lucide-react';
import { pruneCourseTitle } from '../../utils/courseAbbreviations';
import { cleanAssignmentDescription, linkifyHtml } from '../../utils/dashboard-helpers';

interface CanvasToDoProps {
  items: CanvasTodoItem[];
  onMarkDone: (item: CanvasTodoItem) => Promise<void>;
  showIds?: boolean;
}

export const CanvasToDo: React.FC<CanvasToDoProps> = ({ items, onMarkDone, showIds = false }) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const handleDone = async (item: CanvasTodoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = item.ignore || item.html_url;
    setProcessingId(key);
    await onMarkDone(item);
    setProcessingId(null);
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
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Megaphone className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              Canvas To Do
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </h2>
          </div>
        </div>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Click an item to view body content
        </span>
      </div>
      
      {/* List of compact ToDo cards */}
      <div className="space-y-2.5">
        {items.map((item, index) => {
          const uniqueKey = item.ignore || item.html_url || String(index);
          const date = item.assignment?.due_at || null;
          const points = item.assignment?.points_possible;
          const isProcessing = processingId === uniqueKey;
          const isExpanded = expandedKeys.has(uniqueKey);

          const title = item.assignment?.name || item.quiz?.title || 'Untitled Item';
          const courseName = item.context_name ? pruneCourseTitle(item.context_name) : 'Course';
          const rawDesc = item.assignment?.description || item.quiz?.description;
          const cleanedDesc = cleanAssignmentDescription(rawDesc);
          const hasBodyContent = !!cleanedDesc;

          // Replace confusing "submitting" internal Canvas label with clear descriptive tag
          const isQuiz = !!item.quiz || item.type === 'online_quiz';
          const isGrading = item.type === 'grading';

          return (
            <div 
              key={uniqueKey} 
              onClick={() => toggleExpand(uniqueKey)}
              className={`bg-white rounded-xl shadow-2xs border transition cursor-pointer select-none overflow-hidden ${
                isExpanded 
                  ? 'border-blue-300 ring-2 ring-blue-50' 
                  : 'border-slate-200 hover:border-blue-200 hover:shadow-xs'
              }`}
            >
              {/* Main Card Content */}
              <div className="p-3.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${isGrading ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                    {isQuiz ? <FileQuestion className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Course & ID Tag */}
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-2 flex-wrap">
                      <span className="text-blue-700 bg-blue-50 px-2 py-0.2 rounded font-semibold border border-blue-100/60">
                        {courseName}
                      </span>
                      {showIds && (item.assignment?.id || item.quiz?.id || item.id) && (
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded select-all font-normal">
                          #{item.assignment?.id || item.quiz?.id || item.id}
                        </span>
                      )}
                    </div>

                    {/* Title - wrapped nicely */}
                    <h3 className="font-semibold text-slate-800 text-sm leading-snug break-words mb-1.5" title={title}>
                      {title}
                    </h3>

                    {/* Metadata Strip - No "Submitting" pill! */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                      {date && (
                        <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/80">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Due {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                      {points !== undefined && points !== null && (
                        <span className="text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/80">
                          {points} pts
                        </span>
                      )}
                      {isGrading && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          To Grade
                        </span>
                      )}
                      {hasBodyContent && (
                        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50/80 px-1.5 py-0.5 rounded border border-blue-100">
                          {isExpanded ? 'Hide Details' : 'View Instructions'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Actions: Canvas link & Mark Done */}
                <div className="flex items-center gap-1.5 shrink-0 ml-1 self-start pt-1">
                  {item.html_url && (
                    <a 
                      href={item.html_url} 
                      target="_blank" 
                      rel="noreferrer" 
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Open assignment directly in Canvas"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  {item.ignore && (
                    <button 
                      onClick={(e) => handleDone(item, e)}
                      disabled={isProcessing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-emerald-400 text-slate-700 hover:text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-50/50 transition disabled:opacity-50 cursor-pointer shadow-2xs"
                      title="Dismiss from Canvas planner To-Do list"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                      )}
                      <span>{isProcessing ? 'Saving...' : 'Mark Done'}</span>
                    </button>
                  )}

                  <div className="p-1 text-slate-300 hover:text-slate-500">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Expandable Body Content / Instructions */}
              {isExpanded && (
                <div 
                  className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 text-xs text-slate-700 animate-fadeIn"
                  onClick={(e) => e.stopPropagation()}
                >
                  {hasBodyContent ? (
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Instructions / Description
                      </span>
                      <div 
                        className="prose prose-sm max-w-none text-slate-700 bg-white p-3 rounded-lg border border-slate-200/80 max-h-60 overflow-y-auto custom-scrollbar"
                        dangerouslySetInnerHTML={{ __html: linkifyHtml(cleanedDesc) }}
                      />
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-lg border border-slate-200/60 text-slate-400 italic">
                      No additional instructions provided for this item.
                    </div>
                  )}

                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {date ? `Scheduled on Canvas planner for ${new Date(date).toLocaleDateString()}` : 'No due date specified'}
                    </span>
                    {item.html_url && (
                      <a 
                        href={item.html_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-blue-600 hover:underline flex items-center gap-1 font-medium"
                      >
                        Open in Canvas <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
