import React, { useEffect, useState } from 'react';
import { CanvasAssignment, CanvasAssignmentDetail } from '../../types';
import { fetchAssignmentDetails, getCachedAssignmentDetail } from '../../services/canvas';
import { 
  RotateCcw, 
  ExternalLink, 
  Clock, 
  CheckCircle2, 
  FileText, 
  ListChecks, 
  MessageSquare, 
  BarChart2, 
  AlertCircle, 
  Loader2, 
  Calendar,
  Lock,
  Unlock,
  MapPin,
  RefreshCw
} from 'lucide-react';
import { formatSubmissionType, cleanAssignmentDescription, isAssignmentSubmitted, isAssignmentPastDue, linkifyHtml, formatPoints } from '../../utils/dashboard-helpers';

interface AssignmentDetailFlipSideProps {
  assignment: CanvasAssignment;
  courseName: string;
  canvasUrl: string;
  apiKey: string;
  useProxy: boolean;
  onFlipBack: () => void;
  variant?: 'board' | 'table';
}

export const AssignmentDetailFlipSide: React.FC<AssignmentDetailFlipSideProps> = ({
  assignment,
  courseName,
  canvasUrl,
  apiKey,
  useProxy,
  onFlipBack,
  variant = 'board'
}) => {
  const [detail, setDetail] = useState<CanvasAssignmentDetail | null>(() => {
    return getCachedAssignmentDetail(assignment.course_id, assignment.id) || null;
  });
  const [loading, setLoading] = useState<boolean>(!detail);
  const [activeTab, setActiveTab] = useState<'instructions' | 'rubric' | 'feedback'>('instructions');

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

  // Clean and sanitize HTML for safe display
  const sanitizeHtml = (html?: string) => {
    if (!html) return '<p class="text-slate-400 italic">No instructions or description provided.</p>';
    
    // Simple sanitization: remove scripts and malicious elements
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

  const hasRubric = !!(detail?.rubric && detail.rubric.length > 0);
  const hasComments = !!(detail?.submission?.submission_comments && detail.submission.submission_comments.length > 0);
  const isSubmitted = isAssignmentSubmitted(detail ? (detail as CanvasAssignment) : assignment);
  const score = detail?.submission?.score ?? assignment.submission?.score;
  const grade = detail?.submission?.grade ?? assignment.submission?.grade;

  const currentTab = (activeTab === 'rubric' && !hasRubric) || (activeTab === 'feedback' && !hasComments && !isSubmitted)
    ? 'instructions'
    : activeTab;

  return (
    <div 
      className={`bg-white rounded-lg border border-blue-200 shadow-md flex flex-col h-full overflow-hidden text-left ${
        variant === 'table' ? 'p-5' : 'p-4'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded truncate max-w-[200px]">
              {courseName}
            </span>
            {assignment.is_calendar_event && (
              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Event
              </span>
            )}
            <span className="text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
              #{Math.abs(assignment.id)}
            </span>
          </div>
          <h4 className="font-semibold text-slate-900 text-sm md:text-base leading-snug truncate" title={assignment.name}>
            {assignment.name}
          </h4>
        </div>

        {/* Quick actions top right */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              loadDetails(true);
            }}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition"
            title="Refresh details from Canvas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFlipBack();
            }}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            title="Flip back to front"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Flip Back</span>
          </button>
        </div>
      </div>

      {/* Meta quick row */}
      <div className="py-2.5 px-0 flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600 border-b border-slate-100 bg-slate-50/50 -mx-4 px-4 mb-2">
        {/* Due Date */}
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>
            {assignment.due_at 
              ? (isAssignmentPastDue(assignment)
                  ? `Due: ${new Date(assignment.due_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric'
                    })}`
                  : `Due: ${new Date(assignment.due_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}`)
              : 'No Due Date'}
          </span>
        </div>

        {/* Points */}
        {!assignment.is_calendar_event && (
          <div className="flex items-center gap-1 font-medium">
            <span className="text-slate-400">Points:</span>
            <span className="text-slate-800 font-semibold">{formatPoints(assignment.points_possible || 0)}</span>
          </div>
        )}

        {/* Submission / Grade status */}
        {!assignment.is_calendar_event && (
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Status:</span>
            {isSubmitted ? (
              <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {score !== null && score !== undefined ? `Graded: ${score}/${assignment.points_possible}` : 'Submitted'}
              </span>
            ) : (
              <span className="text-amber-700 font-medium">Not Submitted</span>
            )}
          </div>
        )}

        {/* Submission type */}
        <div className="flex items-center gap-1 text-slate-500">
          <span className="text-slate-400">Type:</span>
          <span>{formatSubmissionType(detail?.submission_types || assignment.submission_types)}</span>
        </div>

        {/* Allowed extensions if any */}
        {detail?.allowed_extensions && detail.allowed_extensions.length > 0 && (
          <div className="flex items-center gap-1 text-slate-500">
            <span className="text-slate-400">Accepted:</span>
            <span className="font-mono text-[11px] bg-slate-200/60 px-1 rounded">
              {detail.allowed_extensions.map(ext => `.${ext}`).join(', ')}
            </span>
          </div>
        )}

        {/* Location for events */}
        {assignment.location_name && (
          <div className="flex items-center gap-1 text-purple-700">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{assignment.location_name}</span>
          </div>
        )}
      </div>

      {/* Tabs bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-2.5">
        <button
          type="button"
          onClick={() => setActiveTab('instructions')}
          className={`pb-1.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
            currentTab === 'instructions'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Instructions
        </button>

        {hasRubric && (
          <button
            type="button"
            onClick={() => setActiveTab('rubric')}
            className={`pb-1.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              currentTab === 'rubric'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            Rubric ({detail?.rubric?.length})
          </button>
        )}

        {(hasComments || isSubmitted) && (
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            className={`pb-1.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              currentTab === 'feedback'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Feedback & Submission
            {hasComments && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
            )}
          </button>
        )}

        {detail?.score_statistics && (
          <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500 pr-1">
            <BarChart2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Mean: <strong className="text-slate-700">{detail.score_statistics.mean?.toFixed(1)}</strong></span>
            <span>High: <strong className="text-slate-700">{detail.score_statistics.max}</strong></span>
          </div>
        )}
      </div>

      {/* Main Body Content with scroll */}
      <div className="flex-1 overflow-y-auto max-h-[320px] md:max-h-[380px] pr-1.5 text-xs text-slate-700 space-y-3">
        {loading && !detail ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-xs">Fetching assignment instructions from Canvas...</p>
          </div>
        ) : (
          <>
            {/* Tab: Instructions */}
            {currentTab === 'instructions' && (
              <div className="space-y-3">
                {detail?.lock_explanation && (
                  <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{detail.lock_explanation}</span>
                  </div>
                )}

                {(() => {
                  const cleaned = cleanAssignmentDescription(detail?.description || assignment.description);
                  if (!cleaned) {
                    return (
                      <div className="py-3 text-slate-400 text-xs italic">
                        No instructions posted by instructor.
                      </div>
                    );
                  }
                  return (
                    <div 
                      className="instructions-content prose prose-sm max-w-none text-slate-700 leading-relaxed space-y-2 [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800 [&_a]:font-medium [&_a]:inline [&_span]:inline [&_p]:mb-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-slate-900 [&_h3]:mt-2 [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-slate-800 [&_h4]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_li]:mb-0.5 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[11px] [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-2.5 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_blockquote]:border-l-2 [&_blockquote]:border-blue-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-600"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleaned) }}
                    />
                  );
                })()}
              </div>
            )}

            {/* Tab: Rubric */}
            {currentTab === 'rubric' && hasRubric && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pb-1 border-b border-slate-100">
                  <span>Grading Criteria</span>
                  <span>Total Rubric: {formatPoints(detail?.rubric_settings?.points_possible || assignment.points_possible)}</span>
                </div>
                {detail?.rubric?.map((item, idx) => (
                  <div key={item.id || idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-800 text-xs">{item.description}</span>
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] shrink-0 border border-blue-100">
                        {formatPoints(item.points)}
                      </span>
                    </div>
                    {item.long_description && (
                      <p className="text-[11px] text-slate-500 leading-normal">{item.long_description}</p>
                    )}
                    {item.ratings && item.ratings.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mt-2 pt-1.5 border-t border-slate-200/60">
                        {item.ratings.map((rating, rIdx) => (
                          <div key={rating.id || rIdx} className="bg-white p-1.5 rounded border border-slate-100 text-[10px]">
                            <div className="font-bold text-slate-700">{formatPoints(rating.points)}</div>
                            <div className="text-slate-500 leading-tight truncate" title={rating.description}>
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

            {/* Tab: Feedback & Submission */}
            {currentTab === 'feedback' && (
              <div className="space-y-3">
                {/* Submission summary banner */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Submission Status</span>
                    <span className="text-xs font-bold text-slate-800">
                      {detail?.submission?.submitted_at
                        ? `Submitted ${new Date(detail.submission.submitted_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}`
                        : assignment.manual_marked_submitted
                        ? 'Manually Marked as Done'
                        : 'No submission recorded'}
                    </span>
                  </div>
                  {detail?.submission?.graded_at && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                      <span>Graded on {new Date(detail.submission.graded_at).toLocaleDateString()}</span>
                      <span className="font-semibold text-emerald-700">
                        Score: {detail.submission.score} / {assignment.points_possible} {detail.submission.grade ? `(${detail.submission.grade})` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Submission Comments list */}
                {hasComments ? (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      Comments & Grader Feedback ({detail?.submission?.submission_comments?.length})
                    </h5>
                    {detail?.submission?.submission_comments?.map(comment => (
                      <div key={comment.id} className="p-2.5 rounded-lg border border-blue-100 bg-blue-50/40 text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold text-slate-800">
                          <span>{comment.author_name}</span>
                          <span className="text-[10px] font-normal text-slate-400">
                            {new Date(comment.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-3 text-center">No comments or feedback provided for this submission.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer action bar */}
      <div className="pt-3 border-t border-slate-100 mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFlipBack();
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Flip to Front</span>
        </button>

        {assignment.html_url && (
          <a
            href={assignment.html_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
          >
            <span>Open in Canvas</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};
