import React, { useEffect, useState } from 'react';
import { CanvasAssignment, CanvasAssignmentDetail } from '../../types';
import { fetchAssignmentDetails, getCachedAssignmentDetail } from '../../services/canvas';
import { 
  X, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  FileText, 
  ListChecks, 
  MessageSquare, 
  BarChart2, 
  Loader2, 
  Calendar,
  Lock,
  MapPin,
  RefreshCw,
  Maximize2,
  Check,
  Settings,
  Languages
} from 'lucide-react';
import { formatSubmissionType, cleanAssignmentDescription, isAssignmentSubmitted, isAssignmentPastDue, isAssignmentLocked, isPresumedCompleted, getAssignmentLockInfo, linkifyHtml, getAssignmentFeedbackComments } from '../../utils/dashboard-helpers';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, getGradeStyle } from '../../services/gradeScale';
import { TranslationModal } from './TranslationModal';
import { detectWorldLanguage } from '../../services/translation';

interface AssignmentZoomModalProps {
  assignment: CanvasAssignment | null;
  courseName: string;
  canvasUrl: string;
  apiKey: string;
  useProxy: boolean;
  onClose: () => void;
  acknowledgedFeedbackIds?: Set<string | number>;
  onToggleAcknowledgeComment?: (commentId: string | number) => void;
  onAcknowledgeAllComments?: (commentIds: (string | number)[]) => void;
  gradeConfig?: GradeScaleConfig;
  onOpenGradeSettings?: () => void;
}

export const AssignmentZoomModal: React.FC<AssignmentZoomModalProps> = ({
  assignment,
  courseName,
  canvasUrl,
  apiKey,
  useProxy,
  onClose,
  acknowledgedFeedbackIds,
  onToggleAcknowledgeComment,
  onAcknowledgeAllComments,
  gradeConfig = DEFAULT_GRADE_CONFIG,
  onOpenGradeSettings
}) => {
  if (!assignment) return null;

  const [detail, setDetail] = useState<CanvasAssignmentDetail | null>(() => {
    return getCachedAssignmentDetail(assignment.course_id, assignment.id) || null;
  });
  const [loading, setLoading] = useState<boolean>(!detail);
  const isInitiallySubmitted = isAssignmentSubmitted(assignment);
  const initialComments = getAssignmentFeedbackComments(assignment);
  const [confirmingAcknowledgeAll, setConfirmingAcknowledgeAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'instructions' | 'rubric' | 'feedback'>(() => {
    return (initialComments.length > 0 || isInitiallySubmitted) ? 'feedback' : 'instructions';
  });

  useEffect(() => {
    const isSub = isAssignmentSubmitted(assignment);
    const hasFb = getAssignmentFeedbackComments(assignment).length > 0;
    setActiveTab((hasFb || isSub) ? 'feedback' : 'instructions');
  }, [assignment.id]);

  const loadDetails = async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const data = await fetchAssignmentDetails(
        canvasUrl,
        apiKey,
        assignment.course_id,
        assignment.id,
        useProxy,
        assignment
      );
      setDetail(data);
    } catch (err) {
      console.warn("Error loading assignment detail:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [assignment.id, assignment.course_id, canvasUrl, apiKey, useProxy]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clean and sanitize HTML for safe display
  const sanitizeHtml = (html?: string) => {
    if (!html) return '<p class="text-slate-400 italic">No instructions or description provided for this assignment.</p>';
    
    let clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/on\w+="[^"]*"/g, '')
      .replace(/on\w+='[^']*'/g, '');

    // Transform all anchor tags: style valid links as inline blue links, and unwrap empty/hash links
    clean = clean.replace(/<a\b([^>]*)>(.*?)<\/a>/gis, (_match, attrs, content) => {
      const hrefMatch = attrs.match(/href=["']([^"']*)["']/i);
      let href = hrefMatch ? hrefMatch[1].trim() : '';

      // If href is empty or anchor hash only, render as inline span without making it a dead link
      if (!href || href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
        return `<span class="inline">${content}</span>`;
      }

      // Fix typos like hhttps:// -> https://
      if (/^hhttps?:\/\//i.test(href)) {
        href = href.replace(/^h/i, '');
      } else if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:') && !href.startsWith('/')) {
        href = `https://${href}`;
      }

      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline font-medium break-words cursor-pointer inline">${content}</a>`;
    });

    // Handle any standalone or unclosed <a ...> tags
    clean = clean.replace(/<a\b([^>]*)>/gi, (match, attrs) => {
      if (attrs.includes('text-blue-600')) return match;
      const hrefMatch = attrs.match(/href=["']([^"']*)["']/i);
      let href = hrefMatch ? hrefMatch[1].trim() : '';
      if (!href || href === '#') return '<span class="inline">';
      if (/^hhttps?:\/\//i.test(href)) href = href.replace(/^h/i, '');
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline font-medium break-words cursor-pointer inline">`;
    });

    // Linkify plain text URLs outside existing <a> tags
    clean = linkifyHtml(clean);

    return clean;
  };

  const cleanedDesc = cleanAssignmentDescription(detail?.description || assignment.description);
  const hasInstructions = !!cleanedDesc;
  const hasRubric = !!(detail?.rubric && detail.rubric.length > 0);
  const submission = detail?.submission || assignment.submission;
  const detailComments = detail ? getAssignmentFeedbackComments(detail) : [];
  const assignComments = getAssignmentFeedbackComments(assignment);
  const comments = detailComments.length > 0 ? detailComments : assignComments;
  const hasComments = comments.length > 0;
  const isSubmitted = isAssignmentSubmitted(detail ? (detail as CanvasAssignment) : assignment);
  const score = submission?.score ?? assignment.submission?.score;

  // Unacknowledged feedback comments
  const unackComments = comments.filter(
    c => !acknowledgedFeedbackIds?.has(c.id) && !acknowledgedFeedbackIds?.has(String(c.id))
  );
  const hasUnackFeedback = unackComments.length > 0;

  // Tab fallback: if current tab is rubric but no rubric exists, prioritize feedback if available, else instructions
  const currentTab = (activeTab === 'rubric' && !hasRubric)
    ? (hasComments || isSubmitted ? 'feedback' : 'instructions')
    : activeTab;

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-start justify-between gap-4 p-5 pb-3 border-b border-slate-100 bg-slate-50/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded uppercase tracking-wider truncate max-w-[260px]">
                {courseName}
              </span>
              {assignment.is_calendar_event && (
                <span className="text-xs font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-purple-600" /> Event
                </span>
              )}
              <span className="text-xs font-mono text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded">
                #{Math.abs(assignment.id)}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 text-lg md:text-xl leading-snug break-words" title={assignment.name}>
              {assignment.name}
            </h3>
          </div>

          {/* Quick actions top right */}
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            <button
              type="button"
              onClick={() => loadDetails(true)}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
              title="Refresh details from Canvas"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Metadata Strip */}
        <div className="py-2.5 px-5 flex items-center flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600 border-b border-slate-100 bg-slate-50/30">
          <div className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {assignment.due_at 
                ? (isAssignmentPastDue(assignment)
                    ? `Due: ${new Date(assignment.due_at).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}`
                    : `Due: ${new Date(assignment.due_at).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}`)
                : 'No Due Date'}
            </span>
          </div>

          {!assignment.is_calendar_event && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Points:</span>
              <span className="text-slate-800 font-semibold">{assignment.points_possible || 0} pts</span>
            </div>
          )}

          {!assignment.is_calendar_event && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Status:</span>
              {isSubmitted ? (
                score !== null && score !== undefined ? (
                  (() => {
                    const style = getGradeStyle(score, assignment.points_possible, gradeConfig, { isCourseGrade: false });
                    return (
                      <span 
                        className="font-medium inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs group/grade relative"
                        style={style.style}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Graded: {score}/{assignment.points_possible}</span>
                        {onOpenGradeSettings && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenGradeSettings();
                            }}
                            className="p-0.5 text-slate-400 hover:text-slate-700 bg-white/80 rounded-full border border-slate-200/80 shadow-2xs opacity-0 group-hover/grade:opacity-100 transition-opacity ml-0.5 cursor-pointer"
                            title="Configure grade threshold colors"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    );
                  })()
                ) : (
                  <span className="text-emerald-800 font-medium inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      {isPresumedCompleted(assignment).presumed 
                        ? (isPresumedCompleted(assignment).reason === 'zero_points' ? 'Presumed Complete (0 pts)' : 'Presumed Complete (External)') 
                        : 'Submitted'}
                    </span>
                  </span>
                )
              ) : (
                <span className="text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-flex items-center gap-1">
                  {getAssignmentLockInfo(assignment).isLockedUntil ? (
                    <>
                      <Lock className="w-3 h-3 text-amber-600" />
                      {getAssignmentLockInfo(assignment).badgeText}
                    </>
                  ) : (
                    isAssignmentLocked(assignment) ? 'Missing (Locked)' : 'Not Submitted'
                  )}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="text-slate-400">Type:</span>
            <span>{formatSubmissionType(detail?.submission_types || assignment.submission_types)}</span>
          </div>

          {detail?.allowed_extensions && detail.allowed_extensions.length > 0 && (
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="text-slate-400">Accepted:</span>
              <span className="font-mono text-[11px] bg-slate-200/60 px-1.5 py-0.5 rounded text-slate-700">
                {detail.allowed_extensions.map(ext => `.${ext}`).join(', ')}
              </span>
            </div>
          )}

          {assignment.location_name && (
            <div className="flex items-center gap-1 text-purple-700">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{assignment.location_name}</span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-3 px-5 border-b border-slate-200 pt-2 bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('instructions')}
            className={`pb-2.5 px-1.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              currentTab === 'instructions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            Instructions
          </button>

          {hasRubric && (
            <button
              type="button"
              onClick={() => setActiveTab('rubric')}
              className={`pb-2.5 px-1.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                currentTab === 'rubric'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              Rubric ({detail?.rubric?.length})
            </button>
          )}

          {(hasComments || isSubmitted) && (
            <button
              type="button"
              onClick={() => setActiveTab('feedback')}
              className={`pb-2.5 px-1.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
                currentTab === 'feedback'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Feedback & Submission
              {hasComments && (
                <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full ${
                  hasUnackFeedback ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-200 text-slate-700'
                }`}>
                  {hasUnackFeedback ? `${unackComments.length} New` : comments.length}
                </span>
              )}
            </button>
          )}

          {detail?.score_statistics && (
            <div className="ml-auto hidden sm:flex items-center gap-3 text-xs text-slate-500 pr-1">
              <BarChart2 className="w-4 h-4 text-slate-400" />
              <span>Class Mean: <strong className="text-slate-800">{detail.score_statistics.mean?.toFixed(1)}</strong></span>
              <span>High: <strong className="text-slate-800">{detail.score_statistics.max}</strong></span>
            </div>
          )}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 text-sm text-slate-700 space-y-4">
          {loading && !detail ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Fetching complete assignment details from Canvas...</p>
            </div>
          ) : (
            <>
              {/* Instructions Tab */}
              {currentTab === 'instructions' && (
                <div className="space-y-4">
                  {detail?.lock_explanation && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
                      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{detail.lock_explanation}</span>
                    </div>
                  )}

                  {(() => {
                    const cleaned = cleanAssignmentDescription(detail?.description || assignment.description);
                    if (!cleaned) {
                      return (
                        <div className="py-4 text-xs text-slate-400 italic">
                          No instructions posted by instructor.
                        </div>
                      );
                    }
                    return (
                      <div 
                        className="instructions-content prose prose-slate max-w-none text-slate-700 leading-relaxed space-y-3 [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800 [&_a]:font-medium [&_a]:inline [&_span]:inline [&_p]:mb-2.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-900 [&_h3]:mt-3 [&_h4]:text-sm [&_h4]:font-bold [&_h4]:text-slate-800 [&_h4]:mt-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_li]:mb-1 [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_blockquote]:border-l-3 [&_blockquote]:border-blue-400 [&_blockquote]:pl-3.5 [&_blockquote]:italic [&_blockquote]:text-slate-600"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleaned) }}
                      />
                    );
                  })()}
                </div>
              )}

              {/* Rubric Tab */}
              {currentTab === 'rubric' && hasRubric && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pb-2 border-b border-slate-100">
                    <span>Grading Rubric Criteria</span>
                    <span>Total Rubric Points: {detail?.rubric_settings?.points_possible || assignment.points_possible} pts</span>
                  </div>
                  {detail?.rubric?.map((item, idx) => (
                    <div key={item.id || idx} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-semibold text-slate-900 text-sm">{item.description}</span>
                        <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded text-xs shrink-0 border border-blue-100">
                          {item.points} pts
                        </span>
                      </div>
                      {item.long_description && (
                        <p className="text-xs text-slate-500 leading-relaxed">{item.long_description}</p>
                      )}
                      {item.ratings && item.ratings.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200/70">
                          {item.ratings.map((rating, rIdx) => (
                            <div key={rating.id || rIdx} className="bg-white p-2 rounded-lg border border-slate-200/80 text-xs">
                              <div className="font-bold text-slate-800">{rating.points} pts</div>
                              <div className="text-slate-500 text-[11px] leading-tight mt-0.5 truncate" title={rating.description}>
                                {rating.description || 'Level'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Feedback & Submission Tab */}
              {currentTab === 'feedback' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Submission Details</span>
                      <span className="text-xs font-bold text-slate-800">
                        {submission?.submitted_at
                          ? `Submitted on ${new Date(submission.submitted_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}`
                          : assignment.manual_marked_submitted
                          ? 'Marked as Done locally'
                          : 'No submission file'}
                      </span>
                    </div>
                    {submission?.graded_at && (
                      <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200">
                        <span>Graded on {new Date(submission.graded_at).toLocaleDateString()}</span>
                        {(() => {
                          const subScore = submission.score;
                          const style = getGradeStyle(subScore, assignment.points_possible, gradeConfig, { isCourseGrade: false });
                          return (
                            <div className="group/subGrade relative inline-flex items-center gap-1">
                              <span 
                                className="font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1"
                                style={style.style}
                              >
                                <span>Grade: {submission.score} / {assignment.points_possible}</span>
                                {submission.grade ? `(${submission.grade})` : `(${style.letter})`}
                              </span>
                              {onOpenGradeSettings && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onOpenGradeSettings();
                                  }}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 bg-white/80 rounded-full border border-slate-200/80 shadow-2xs opacity-0 group-hover/subGrade:opacity-100 transition-opacity cursor-pointer"
                                  title="Configure grade threshold colors"
                                >
                                  <Settings className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {(detail?.score_statistics?.mean !== undefined || assignment.score_statistics?.mean !== undefined) && (
                      <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200">
                        <span className="flex items-center gap-1 font-medium">
                          <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
                          Class Average:
                        </span>
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {Math.round(((detail?.score_statistics || assignment.score_statistics)!.mean!) * 10) / 10} / {assignment.points_possible}
                          {(detail?.score_statistics || assignment.score_statistics)!.min !== undefined && (
                            <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                              (Low {(detail?.score_statistics || assignment.score_statistics)!.min}, High {(detail?.score_statistics || assignment.score_statistics)!.max})
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {hasComments ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                          Instructor Feedback & Comments ({comments.length})
                        </h5>
                        {hasUnackFeedback && onAcknowledgeAllComments && (
                          confirmingAcknowledgeAll ? (
                            <div className="flex items-center gap-1.5 animate-fadeIn bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                              <span className="text-[11px] font-semibold text-amber-900">Acknowledge all ({unackComments.length})?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onAcknowledgeAllComments(comments.map(c => c.id));
                                  setConfirmingAcknowledgeAll(false);
                                }}
                                className="px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingAcknowledgeAll(false)}
                                className="px-1.5 py-0.5 text-[11px] font-medium rounded text-slate-500 hover:text-slate-800 transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingAcknowledgeAll(true)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer hover:underline"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Acknowledge All ({unackComments.length})
                            </button>
                          )
                        )}
                      </div>
                      {comments.map(comment => {
                        const isAck = acknowledgedFeedbackIds?.has(comment.id) || acknowledgedFeedbackIds?.has(String(comment.id));
                        return (
                          <div 
                            key={comment.id} 
                            className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                              isAck 
                                ? 'border-slate-200 bg-slate-50/70 text-slate-600' 
                                : 'border-blue-200 bg-blue-50/50 shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center justify-between font-semibold">
                              <div className="flex items-center gap-2">
                                <span className={isAck ? 'text-slate-800' : 'text-blue-900 font-bold'}>{comment.author_name}</span>
                                {!isAck && (
                                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-normal text-slate-400">
                                  {new Date(comment.created_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                  })}
                                </span>
                                {onToggleAcknowledgeComment && (
                                  <button
                                    type="button"
                                    onClick={() => onToggleAcknowledgeComment(comment.id)}
                                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded transition cursor-pointer ${
                                      isAck 
                                        ? 'text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100' 
                                        : 'text-white bg-blue-600 hover:bg-blue-700 shadow-2xs'
                                    }`}
                                    title={isAck ? "Click to mark as unread" : "Mark feedback as acknowledged"}
                                  >
                                    <Check className="w-3 h-3" />
                                    {isAck ? 'Acknowledged' : 'Acknowledge'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-slate-700 text-xs whitespace-pre-wrap leading-relaxed">{comment.comment}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-4 text-center">No comments or feedback found for this submission.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition cursor-pointer"
          >
            Close
          </button>

          {assignment.html_url && (
            <a
              href={assignment.html_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
            >
              <span>Open in Canvas</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
