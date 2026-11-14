import React, { useEffect, useMemo, useState } from 'react';
import { CanvasAssignment } from '../../types';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  List,
  CalendarRange,
  Grid3X3,
  MapPin,
} from 'lucide-react';
import { formatCalendarEventDate, stripHtml } from '../../utils/dashboard-helpers';
import { getCalendarEventWebUrl } from '../../utils/canvasUrls';

export type CalendarViewMode = 'agenda' | 'week' | 'month';

interface CalendarEventsPanelProps {
  events: CanvasAssignment[];
  canvasUrl?: string;
  showPastEvents?: boolean;
  onViewBoard?: () => void;
  viewMode?: CalendarViewMode;
  onViewModeChange?: (mode: CalendarViewMode) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getLocalDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseLocalDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const getEventLocalDate = (ev: CanvasAssignment): Date | null => {
  if (ev.all_day_date && !ev.start_at) {
    const parsed = new Date(`${ev.all_day_date}T12:00:00`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const raw = ev.start_at || ev.due_at || ev.end_at;
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const getEventTimeLabel = (ev: CanvasAssignment): string => {
  if (ev.all_day_date && !ev.start_at) return 'All day';
  const raw = ev.start_at || ev.due_at;
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  if (d.getHours() === 0 && d.getMinutes() === 0) return 'All day';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const startOfWeekSunday = (d: Date): Date => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
};

const addDays = (d: Date, days: number): Date => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
};

export const CalendarEventsPanel: React.FC<CalendarEventsPanelProps> = ({
  events,
  canvasUrl = '',
  showPastEvents = false,
  onViewBoard,
  viewMode: controlledViewMode,
  onViewModeChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [internalViewMode, setInternalViewMode] = useState<CalendarViewMode>('agenda');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => getLocalDateKey(new Date()));

  const viewMode = controlledViewMode ?? internalViewMode;

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const da = getEventLocalDate(a)?.getTime() ?? 0;
      const db = getEventLocalDate(b)?.getTime() ?? 0;
      return da - db;
    });
  }, [events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CanvasAssignment[]>();
    sortedEvents.forEach((ev) => {
      const d = getEventLocalDate(ev);
      if (!d) return;
      const key = getLocalDateKey(d);
      const list = map.get(key) || [];
      list.push(ev);
      map.set(key, list);
    });
    return map;
  }, [sortedEvents]);

  const todayKey = getLocalDateKey(new Date());

  const weekDays = useMemo(() => {
    const start = startOfWeekSunday(anchorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchorDate]);

  const weekHeaderLabel = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    if (!start || !end) return '';
    if (start.getFullYear() === end.getFullYear()) {
      const startPart = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const endPart = end.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${startPart} – ${endPart}`;
    }
    const startPart = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const endPart = end.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${startPart} – ${endPart}`;
  }, [weekDays]);

  const monthDays = useMemo(() => {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const gridStart = startOfWeekSunday(firstOfMonth);
    const totalDays =
      Math.ceil((firstOfMonth.getDay() + lastOfMonth.getDate()) / 7) * 7;
    return Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i));
  }, [anchorDate]);

  const monthHeaderLabel = useMemo(() => {
    return anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [anchorDate]);

  // Keep selectedDayKey anchored to a relevant day inside the displayed month
  useEffect(() => {
    const dayKeys = new Set(monthDays.map(getLocalDateKey));
    if (dayKeys.has(selectedDayKey) && (eventsByDay.get(selectedDayKey)?.length || 0) > 0) {
      return;
    }
    if (dayKeys.has(todayKey) && (eventsByDay.get(todayKey)?.length || 0) > 0) {
      setSelectedDayKey(todayKey);
      return;
    }
    const firstEventDay = monthDays.find((d) => (eventsByDay.get(getLocalDateKey(d))?.length || 0) > 0);
    if (firstEventDay) {
      setSelectedDayKey(getLocalDateKey(firstEventDay));
    } else if (!dayKeys.has(selectedDayKey)) {
      setSelectedDayKey(
        dayKeys.has(todayKey)
          ? todayKey
          : getLocalDateKey(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1))
      );
    }
  }, [monthDays, eventsByDay, todayKey, anchorDate, selectedDayKey]);

  const handleSelectViewMode = (mode: CalendarViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
    setIsExpanded(true);
  };

  const handleStep = (dir: -1 | 1) => {
    setAnchorDate((prev) => {
      if (viewMode === 'week') {
        return addDays(prev, dir * 7);
      }
      return new Date(prev.getFullYear(), prev.getMonth() + dir, 1);
    });
  };

  const handleJumpToday = () => {
    const now = new Date();
    setAnchorDate(now);
    setSelectedDayKey(getLocalDateKey(now));
  };

  const resolveEventUrl = (ev: CanvasAssignment): string | null => {
    return (
      getCalendarEventWebUrl(ev, canvasUrl) ||
      (ev.html_url && ev.html_url !== '#' ? ev.html_url : null)
    );
  };

  const selectedDayEvents = eventsByDay.get(selectedDayKey) || [];
  const selectedDayDate = parseLocalDateKey(selectedDayKey);
  const selectedDayHeading = selectedDayDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <section
      data-testid="calendar-events-panel"
      aria-label="Calendar Events"
      className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs"
    >
      {/* Header Row */}
      <div className={`flex items-center justify-between gap-3 flex-wrap ${isExpanded ? 'mb-4' : ''}`}>
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-100 shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">
            {showPastEvents ? 'Calendar Events' : 'Upcoming Calendar Events'} ({events.length})
          </h3>

          {/* View Mode Segmented Switcher: Agenda | Week | Month */}
          <div
            role="group"
            aria-label="Calendar view mode"
            className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/80"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'agenda'}
              onClick={() => handleSelectViewMode('agenda')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'agenda'
                  ? 'bg-white text-purple-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Agenda event list view"
            >
              <List className="w-3 h-3" />
              <span>Agenda</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'week'}
              onClick={() => handleSelectViewMode('week')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white text-purple-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Wall calendar week view"
            >
              <CalendarRange className="w-3 h-3" />
              <span>Week</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'month'}
              onClick={() => handleSelectViewMode('month')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white text-purple-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Wall calendar month view"
            >
              <Grid3X3 className="w-3 h-3" />
              <span>Month</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onViewBoard && events.length > 0 && (
            <button
              type="button"
              onClick={onViewBoard}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-blue-50/70 transition cursor-pointer"
            >
              <span>View in Board</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse calendar events' : 'Expand calendar events'}
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50/70 hover:bg-slate-100 transition cursor-pointer"
          >
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Collapsible Body */}
      {isExpanded && (
        <div className="space-y-3 animate-fadeIn">
          {/* Agenda / List View */}
          {viewMode === 'agenda' && (
            events.length === 0 ? (
              <div className="p-5 bg-slate-50/70 rounded-xl border border-slate-200/80 text-center">
                <Calendar className="w-6 h-6 text-purple-400 mx-auto mb-1.5 opacity-60" />
                <p className="text-xs font-semibold text-slate-700">
                  {showPastEvents ? 'No Calendar Events' : 'No Upcoming Calendar Events'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 max-w-md mx-auto">
                  Canvas calendar sync is active. When teachers or your campus schedule review sessions, deadlines, or colloquiums, they will display right here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sortedEvents.map((ev) => {
                  const formattedDate = formatCalendarEventDate(ev);
                  const eventUrl = resolveEventUrl(ev);

                  return (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-purple-200 transition flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {eventUrl ? (
                            <a
                              href={eventUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-xs text-slate-900 hover:text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
                              title={`Open "${ev.name}" in Canvas`}
                            >
                              <span className="truncate">{ev.name}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                            </a>
                          ) : (
                            <h4 className="font-semibold text-xs text-slate-900 truncate" title={ev.name}>
                              {ev.name}
                            </h4>
                          )}
                          {ev.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                              {stripHtml(ev.description)}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
                          Event
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        <span className="font-medium text-slate-600 truncate">
                          {formattedDate}
                        </span>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {ev.location_name && (
                            <span className="truncate max-w-[140px] text-slate-500 inline-flex items-center gap-0.5" title={ev.location_name}>
                              <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                              <span className="truncate">{ev.location_name}</span>
                            </span>
                          )}
                          {eventUrl && (
                            <a
                              href={eventUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                              title="Open event in Canvas"
                            >
                              <span>Canvas</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Wall Calendar Controls (Week & Month) */}
          {(viewMode === 'week' || viewMode === 'month') && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap px-1">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStep(-1)}
                    aria-label={viewMode === 'week' ? 'Previous week' : 'Previous month'}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                    title={viewMode === 'week' ? 'Previous week' : 'Previous month'}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleJumpToday}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(1)}
                    aria-label={viewMode === 'week' ? 'Next week' : 'Next month'}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                    title={viewMode === 'week' ? 'Next week' : 'Next month'}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="ml-1.5 text-sm font-bold text-slate-800">
                    {viewMode === 'week' ? weekHeaderLabel : monthHeaderLabel}
                  </span>
                </div>

                {events.length === 0 && (
                  <span className="text-[11px] text-slate-400 italic">
                    {showPastEvents ? 'No calendar events' : 'No upcoming events scheduled'}
                  </span>
                )}
              </div>

              {/* Wall Calendar Week View */}
              {viewMode === 'week' && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <div className="min-w-[720px] grid grid-cols-7 divide-x divide-slate-200">
                    {weekDays.map((day) => {
                      const dayKey = getLocalDateKey(day);
                      const isToday = dayKey === todayKey;
                      const dayEvents = eventsByDay.get(dayKey) || [];
                      const showMonthAbbrev = day.getDate() === 1 || day.getDay() === 0;

                      return (
                        <div
                          key={dayKey}
                          data-testid={`calendar-week-day-${dayKey}`}
                          className={`flex flex-col min-h-[164px] min-w-0 ${isToday ? 'bg-purple-50/35' : 'bg-white'}`}
                        >
                          <div
                            className={`px-2 py-2 border-b border-slate-200 flex items-center justify-between ${
                              isToday ? 'bg-purple-100/70' : 'bg-slate-50/80'
                            }`}
                          >
                            <span className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-purple-800' : 'text-slate-500'}`}>
                              {WEEKDAY_LABELS[day.getDay()]}
                            </span>
                            <span
                              className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                isToday ? 'bg-purple-600 text-white' : 'text-slate-800'
                              }`}
                            >
                              {showMonthAbbrev
                                ? day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                : day.getDate()}
                            </span>
                          </div>

                          <div className="p-1.5 space-y-1.5 flex-1 min-w-0">
                            {dayEvents.map((ev) => {
                              const eventUrl = resolveEventUrl(ev);
                              const timeLabel = getEventTimeLabel(ev);
                              const titleTip = `${ev.name} — ${formatCalendarEventDate(ev)}${
                                ev.location_name ? ` (${ev.location_name})` : ''
                              }`;

                              return (
                                <div
                                  key={ev.id}
                                  className="p-1.5 rounded-lg bg-purple-50/90 border border-purple-200/80 hover:border-purple-300 transition space-y-0.5 min-w-0"
                                  title={titleTip}
                                >
                                  {timeLabel && (
                                    <div className="text-[10px] font-semibold text-purple-700">
                                      {timeLabel}
                                    </div>
                                  )}
                                  {eventUrl ? (
                                    <a
                                      href={eventUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block text-[11px] font-semibold text-slate-900 hover:text-blue-600 hover:underline leading-tight line-clamp-2 break-words"
                                    >
                                      {ev.name}
                                    </a>
                                  ) : (
                                    <div className="text-[11px] font-semibold text-slate-900 leading-tight line-clamp-2 break-words">
                                      {ev.name}
                                    </div>
                                  )}
                                  {ev.location_name && (
                                    <div className="flex items-center gap-0.5 text-[10px] text-slate-500 truncate">
                                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                                      <span className="truncate">{ev.location_name}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Wall Calendar Month View + Interactive Selected Day Details */}
              {viewMode === 'month' && (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div className="min-w-[760px]">
                      {/* Weekday header */}
                      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 divide-x divide-slate-200">
                        {WEEKDAY_LABELS.map((label) => (
                          <div
                            key={label}
                            className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500"
                          >
                            {label}
                          </div>
                        ))}
                      </div>

                      {/* Month day cells */}
                      <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
                        {monthDays.map((day) => {
                          const dayKey = getLocalDateKey(day);
                          const inCurrentMonth = day.getMonth() === anchorDate.getMonth();
                          const isToday = dayKey === todayKey;
                          const isSelected = dayKey === selectedDayKey;
                          const dayEvents = eventsByDay.get(dayKey) || [];
                          const visibleCellEvents = dayEvents.slice(0, 3);
                          const hiddenOverflowCount = dayEvents.length - visibleCellEvents.length;

                          return (
                            <div
                              key={dayKey}
                              data-testid={`calendar-month-day-${dayKey}`}
                              onClick={() => setSelectedDayKey(dayKey)}
                              className={`min-h-[112px] min-w-0 p-1.5 flex flex-col gap-1 cursor-pointer transition ${
                                isSelected
                                  ? 'bg-purple-50/70 ring-2 ring-inset ring-purple-400'
                                  : isToday
                                    ? 'bg-purple-50/35 hover:bg-purple-50/55'
                                    : inCurrentMonth
                                      ? 'bg-white hover:bg-slate-50/70'
                                      : 'bg-slate-50/60 hover:bg-slate-100/70'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`text-[11px] font-bold w-6 h-6 inline-flex items-center justify-center rounded-full shrink-0 ${
                                    isToday
                                      ? 'bg-purple-600 text-white'
                                      : isSelected
                                        ? 'bg-purple-100 text-purple-900'
                                        : inCurrentMonth
                                          ? 'text-slate-800'
                                          : 'text-slate-400'
                                  }`}
                                >
                                  {day.getDate()}
                                </span>
                                {dayEvents.length > 0 && (
                                  <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-purple-100/90 text-purple-800 shrink-0">
                                    {dayEvents.length}
                                  </span>
                                )}
                              </div>

                              <div className="space-y-1 flex-1 min-w-0">
                                {visibleCellEvents.map((ev) => {
                                  const eventUrl = resolveEventUrl(ev);
                                  const timeLabel = getEventTimeLabel(ev);
                                  const chipTip = `${ev.name} — ${formatCalendarEventDate(ev)}${
                                    ev.location_name ? ` (${ev.location_name})` : ''
                                  }`;

                                  const cardContent = (
                                    <div className="space-y-0.5 min-w-0">
                                      {timeLabel && (
                                        <div className="text-[9px] font-bold text-purple-700 leading-tight">
                                          {timeLabel}
                                        </div>
                                      )}
                                      <div className="text-[10px] font-semibold text-slate-900 leading-tight line-clamp-2 break-words">
                                        {ev.name}
                                      </div>
                                    </div>
                                  );

                                  return eventUrl ? (
                                    <a
                                      key={ev.id}
                                      href={eventUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDayKey(dayKey);
                                      }}
                                      title={chipTip}
                                      className="block px-1.5 py-1 rounded-md bg-purple-50 hover:bg-purple-100 border border-purple-200/80 transition min-w-0"
                                    >
                                      {cardContent}
                                    </a>
                                  ) : (
                                    <div
                                      key={ev.id}
                                      title={chipTip}
                                      className="px-1.5 py-1 rounded-md bg-purple-50 border border-purple-200/80 min-w-0"
                                    >
                                      {cardContent}
                                    </div>
                                  );
                                })}

                                {hiddenOverflowCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDayKey(dayKey);
                                    }}
                                    className="w-full text-left px-1.5 py-0.5 text-[10px] font-bold text-purple-700 hover:text-purple-900 hover:bg-purple-100/80 rounded transition cursor-pointer"
                                  >
                                    +{hiddenOverflowCount} more
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Interactive Selected Day Details Panel */}
                  <div
                    data-testid="calendar-month-selected-day"
                    className="rounded-xl border border-purple-200/80 bg-purple-50/40 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                        <h4 className="text-xs font-bold text-slate-900">
                          {selectedDayHeading}
                        </h4>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-purple-200 text-purple-800">
                        {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'event' : 'events'}
                      </span>
                    </div>

                    {selectedDayEvents.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">
                        No calendar events scheduled for this day. Click any highlighted day on the calendar to inspect its events.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {selectedDayEvents.map((ev) => {
                          const eventUrl = resolveEventUrl(ev);
                          const formattedDate = formatCalendarEventDate(ev);
                          const cleanDesc = ev.description ? stripHtml(ev.description).trim() : '';

                          return (
                            <div
                              key={ev.id}
                              className="p-3 rounded-lg bg-white border border-purple-200/70 shadow-2xs flex flex-col justify-between gap-2"
                            >
                              <div className="space-y-1">
                                <div className="flex items-start justify-between gap-2">
                                  <h5 className="text-xs font-bold text-slate-900 leading-snug">
                                    {ev.name}
                                  </h5>
                                  {eventUrl && (
                                    <a
                                      href={eventUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5 shrink-0"
                                      title={`Open "${ev.name}" in Canvas`}
                                    >
                                      <span>Open in Canvas</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>

                                <div className="text-[11px] font-medium text-purple-800">
                                  {formattedDate}
                                </div>

                                {ev.location_name && (
                                  <div className="text-[11px] text-slate-600 inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{ev.location_name}</span>
                                  </div>
                                )}

                                {cleanDesc && (
                                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                                    {cleanDesc}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};
