import React, { useState } from 'react';
import { CanvasAnnouncement } from '../../types';
import { CourseCustomization } from '../../services/courseCustomization';
import { Bell, ChevronDown, ExternalLink, Loader2, X, User } from 'lucide-react';
import { sanitizeRichHtml, stripHtml } from '../../utils/dashboard-helpers';
import { useNow } from '../../utils/useRelativeTime';

interface AnnouncementsWidgetProps {
  announcements?: CanvasAnnouncement[];
  onDismissAnnouncement?: (announcement: CanvasAnnouncement) => Promise<void> | void;
  getCourseName: (id: number) => string;
  courseCustomizations?: Record<number, CourseCustomization>;
  showIds?: boolean;
  defaultExpanded?: boolean;
  defaultShowRead?: boolean;
}

const formatAnnouncementTime = (dateStr: string | null | undefined, nowMs: number): string => {
  if (!dateStr) return 'Recently';
  const date = new Date(dateStr);
  const time = date.getTime();
  if (isNaN(time)) return 'Recently';

  const diffMs = nowMs - time;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const AnnouncementsWidget: React.FC<AnnouncementsWidgetProps> = ({
  announcements = [],
  onDismissAnnouncement,
  getCourseName,
  courseCustomizations,
  showIds = false,
  defaultExpanded = true,
  defaultShowRead = false,
}) => {
  const now = useNow();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showRead, setShowRead] = useState(defaultShowRead);
  const [dismissingId, setDismissingId] = useState<number | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<number>>(new Set());

  if (!announcements || announcements.length === 0) {
    return null;
  }

  const unreadAnnouncements = announcements.filter(a => a.read_state !== 'read');
  const unreadCount = unreadAnnouncements.length;
  const totalCount = announcements.length;
  const readCount = totalCount - unreadCount;
  const hasReadAnnouncements = readCount > 0;

  const displayedAnnouncements = showRead || !hasReadAnnouncements
    ? announcements
    : unreadAnnouncements;

  const showBody = isExpanded && displayedAnnouncements.length > 0;

  const toggleExpandMessage = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDismiss = async (ann: CanvasAnnouncement, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDismissAnnouncement) return;
    setDismissingId(ann.id);
    try {
      await onDismissAnnouncement(ann);
    } finally {
      setDismissingId(prev => (prev === ann.id ? null : prev));
    }
  };

  return (
    <section
      data-testid="announcements-widget"
      aria-label="Canvas Announcements"
      className="bg-gradient-to-r from-amber-50/70 via-orange-50/35 to-slate-50/60 border border-amber-200/80 rounded-2xl p-4 shadow-2xs"
    >
      <div className={`flex items-center justify-between gap-2 flex-wrap ${showBody ? 'mb-3' : ''}`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center shadow-2xs shrink-0">
            <Bell className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 className="font-bold text-xs text-slate-800">Canvas Announcements</h3>

            {hasReadAnnouncements ? (
              /* Show Unread vs All (total incl. read) toggle whenever already-read announcements exist to view */
              <div
                role="group"
                aria-label="Filter announcements by read state"
                className="inline-flex items-center p-0.5 rounded-lg bg-amber-100/80 border border-amber-200/80"
              >
                <button
                  type="button"
                  aria-pressed={!showRead}
                  onClick={() => setShowRead(false)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    !showRead
                      ? 'bg-white text-amber-900 shadow-2xs'
                      : 'text-amber-800/80 hover:text-amber-950'
                  }`}
                  title="Show only unread announcements"
                >
                  Unread ({unreadCount})
                </button>
                <button
                  type="button"
                  aria-pressed={showRead}
                  onClick={() => {
                    setShowRead(true);
                    setIsExpanded(true);
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    showRead
                      ? 'bg-white text-amber-900 shadow-2xs'
                      : 'text-amber-800/80 hover:text-amber-950'
                  }`}
                  title="Show all announcements including already read"
                >
                  All ({totalCount})
                </button>
              </div>
            ) : (
              <span className="text-[10px] font-bold px-1.5 py-0.2 bg-orange-600 text-white rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>
        </div>

        {displayedAnnouncements.length > 0 && (
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded(prev => !prev)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-white/80 transition cursor-pointer shrink-0"
          >
            <span>{isExpanded ? 'Collapse' : 'Show All'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {showBody && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-fadeIn">
          {displayedAnnouncements.map((ann) => {
            const courseId =
              ann.course_id ||
              (ann.context_code?.startsWith('course_')
                ? parseInt(ann.context_code.replace('course_', ''), 10)
                : 0);
            const customCourse = courseId ? courseCustomizations?.[courseId] : undefined;
            const courseName = courseId ? getCourseName(courseId) : (ann.context_code || 'Course');
            const emoji = customCourse?.emoji;
            const isUnread = ann.read_state !== 'read';
            const isDismissing = dismissingId === ann.id;
            const cleanHtml = sanitizeRichHtml(ann.message);
            const plainText = stripHtml(ann.message).trim();
            const isLongMessage = plainText.length > 180;
            const isMsgExpanded = expandedMessageIds.has(ann.id);
            const hasLink = !!(ann.html_url && ann.html_url !== '#');

            return (
              <article
                key={ann.id}
                data-testid={`announcement-card-${ann.id}`}
                className="relative rounded-xl border border-amber-200/75 bg-white shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
              >
                {/* Left accent stripe */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 pointer-events-none z-10 ${
                    isUnread ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                />

                {/* Top bonded header */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/90 border-b border-slate-100 text-[11px] gap-2 pl-3.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-slate-800 truncate" title={courseName}>
                      {emoji ? `${emoji} ` : ''}{courseName}
                    </span>
                    {showIds && (
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">#{ann.id}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isUnread ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Unread
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        Read
                      </span>
                    )}
                    {hasLink && (
                      <a
                        href={ann.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-400 hover:text-amber-700 p-0.5 rounded transition"
                        title="Open announcement in Canvas"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-3 pl-3.5 flex-1 min-w-0 bg-white space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-900 leading-snug" title={ann.title}>
                    {hasLink ? (
                      <a
                        href={ann.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline hover:text-amber-700 transition"
                      >
                        {ann.title}
                      </a>
                    ) : (
                      ann.title
                    )}
                  </h4>

                  {cleanHtml ? (
                    <div>
                      <div
                        className={`text-xs text-slate-600 leading-relaxed prose prose-xs max-w-none break-words [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc ${
                          !isMsgExpanded && isLongMessage ? 'line-clamp-3' : ''
                        }`}
                        dangerouslySetInnerHTML={{ __html: cleanHtml }}
                      />
                      {isLongMessage && (
                        <button
                          type="button"
                          onClick={(e) => toggleExpandMessage(ann.id, e)}
                          className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 mt-1 cursor-pointer"
                        >
                          {isMsgExpanded ? 'Show less' : 'Read more'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No additional message body.</p>
                  )}
                </div>

                {/* Bottom bonded footer */}
                <div className="px-3 py-1.5 pl-3.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs bg-slate-50/80 text-slate-600">
                  <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500">
                    {ann.author?.display_name && (
                      <span className="inline-flex items-center gap-1 truncate max-w-[120px]" title={ann.author.display_name}>
                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{ann.author.display_name}</span>
                      </span>
                    )}
                    {ann.author?.display_name && <span aria-hidden="true">·</span>}
                    <span className="shrink-0 font-medium">
                      {formatAnnouncementTime(ann.posted_at || ann.created_at, now.getTime())}
                    </span>
                  </div>

                  {onDismissAnnouncement && (
                    <button
                      type="button"
                      disabled={isDismissing}
                      onClick={(e) => handleDismiss(ann, e)}
                      aria-label={`Dismiss ${ann.title}`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition border shadow-2xs shrink-0 ${
                        isDismissing
                          ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                          : 'bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-800 border-slate-300 hover:border-amber-300 cursor-pointer'
                      }`}
                      title="Dismiss announcement and mark as read in Canvas"
                    >
                      {isDismissing ? (
                        <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                      ) : (
                        <X className="w-3 h-3" />
                      )}
                      <span>Dismiss</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
