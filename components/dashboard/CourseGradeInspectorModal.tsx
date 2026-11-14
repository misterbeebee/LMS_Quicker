import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Database,
  Calculator,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Layers,
  Code2,
  ListChecks,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { CourseData, CourseGradeDiagnosticsResult } from '../../types';
import { fetchCourseGradeDiagnostics } from '../../services/canvas';
import {
  DEFAULT_GRADE_CONFIG,
  GradeScaleConfig,
  getGradeStyle,
} from '../../services/gradeScale';
import { inspectCourseGrade } from '../../utils/gradeInspector';
import { formatSubmissionType } from '../../utils/dashboard-helpers';

interface CourseGradeInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseData: CourseData;
  canvasUrl: string;
  apiKey: string;
  useProxy: boolean;
  gradeConfig?: GradeScaleConfig;
  showScores?: boolean;
  onLiveDiagnosticsLoaded?: (result: CourseGradeDiagnosticsResult) => void;
}

type InspectorTab = 'breakdown' | 'raw';
type AssignmentFilterMode = 'all' | 'included' | 'zero_or_missing' | 'excluded';

const formatScoreVal = (score: number | null | undefined, grade?: string | null): string => {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return grade ? grade : 'null';
  }
  return grade ? `${score}% (${grade})` : `${score}%`;
};

const formatShortDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const CourseGradeInspectorModal: React.FC<CourseGradeInspectorModalProps> = ({
  isOpen,
  onClose,
  courseData,
  canvasUrl,
  apiKey,
  useProxy,
  gradeConfig = DEFAULT_GRADE_CONFIG,
  showScores = true,
  onLiveDiagnosticsLoaded,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('breakdown');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilterMode>('all');
  const [liveDiagnostics, setLiveDiagnostics] = useState<CourseGradeDiagnosticsResult | null>(null);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);
  const [expandedGradedJsonIds, setExpandedGradedJsonIds] = useState<Set<number>>(new Set());
  const [showRawUngraded, setShowRawUngraded] = useState(false);

  const inspection = useMemo(
    () => inspectCourseGrade(courseData, liveDiagnostics),
    [courseData, liveDiagnostics]
  );

  // Reset per-course transient live diagnostics when switching inspected course or reopening
  useEffect(() => {
    setLiveDiagnostics(null);
    setFetchError(null);
    setActiveTab('breakdown');
    setAssignmentFilter(inspection.assignments.length > 12 ? 'included' : 'all');
    setCopiedJson(false);
    setExpandedGradedJsonIds(new Set());
    setShowRawUngraded(false);
  }, [courseData.course.id, isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredAssignments = useMemo(() => {
    return inspection.assignments.filter((row) => {
      if (assignmentFilter === 'included') return row.includedInCalculation;
      if (assignmentFilter === 'zero_or_missing') {
        return row.score === 0 || row.missing;
      }
      if (assignmentFilter === 'excluded') return !row.includedInCalculation;
      return true;
    });
  }, [inspection.assignments, assignmentFilter]);

  if (!isOpen) return null;

  const toggleGradedItemJson = (id: number) => {
    setExpandedGradedJsonIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFetchLive = async () => {
    setFetchingLive(true);
    setFetchError(null);
    try {
      const result = await fetchCourseGradeDiagnostics(
        canvasUrl,
        apiKey,
        courseData.course.id,
        useProxy
      );
      setLiveDiagnostics(result);
      if (onLiveDiagnosticsLoaded) {
        onLiveDiagnosticsLoaded(result);
      }
      if (result.errors.length > 0 && result.enrollmentsRaw.length === 0) {
        setFetchError(result.errors.join(' • '));
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Failed to fetch live grade ground truth from Canvas.');
    } finally {
      setFetchingLive(false);
    }
  };

  const handleCopyJson = async () => {
    const payloadText = JSON.stringify(
      {
        courseId: inspection.courseId,
        courseName: inspection.courseName,
        displayed: inspection.displayed,
        coverage: inspection.coverage,
        fetched: {
          endpoint: inspection.fetched.endpoint,
          fetchedAt: inspection.fetched.fetchedAt,
          currentScore: inspection.fetched.currentScore,
          finalScore: inspection.fetched.finalScore,
          unpostedCurrentScore: inspection.fetched.unpostedCurrentScore,
          currentPeriodScore: inspection.fetched.currentPeriodScore,
          enrollmentsCount: inspection.fetched.enrollmentsCount,
        },
        calculated: inspection.calculated,
        anomalies: inspection.anomalies,
        gradedAssignments: inspection.rawPayloads.gradedAssignments,
        allEnrollments: inspection.rawPayloads.allEnrollments,
        assignmentGroups: inspection.rawPayloads.assignmentGroups,
        ungradedAssignmentsCount: inspection.rawPayloads.ungradedOrExcludedAssignments.length,
      },
      null,
      2
    );

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(payloadText);
      }
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      setCopiedJson(false);
    }
  };

  const displayedStyle =
    inspection.displayed.score !== null
      ? getGradeStyle(inspection.displayed.score, 100, gradeConfig, { isCourseGrade: true })
      : null;

  const zeroOrMissingCount = inspection.assignments.filter(
    (r) => r.score === 0 || r.missing
  ).length;

  const isSuppressed =
    inspection.displayed.source === 'suppressed_zero_ungraded' ||
    inspection.displayed.source === 'suppressed_zero_unreliable';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-grade-inspector-title"
      data-testid="course-grade-inspector-modal"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                <Database className="w-4 h-4" />
              </span>
              <h2
                id="course-grade-inspector-title"
                className="text-base sm:text-lg font-bold text-slate-900 truncate"
              >
                Grade Data Inspector: {inspection.courseName}
              </h2>
              {inspection.courseCode && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 shrink-0">
                  {inspection.courseCode}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ground-truth audit of Canvas enrollment scores, grading coverage, and individual graded work.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleFetchLive}
              disabled={fetchingLive}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white shadow-2xs transition cursor-pointer"
              title="Query Canvas /courses, /enrollments, and /assignment_groups live"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingLive ? 'animate-spin' : ''}`} />
              <span>{fetchingLive ? 'Fetching...' : 'Fetch Live Ground Truth'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              title="Copy focused ground-truth grade report as JSON"
            >
              {copiedJson ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Grade Data Inspector"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
          {!showScores && (
            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Note: <strong>Show Scores</strong> is currently turned off in Display settings, so dashboard cards hide grades visually. Ground truth data is still shown below.
              </span>
            </div>
          )}

          {fetchError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Live Canvas Diagnostic Warning: </span>
                <span>{fetchError}</span>
              </div>
            </div>
          )}

          {liveDiagnostics && liveDiagnostics.errors.length === 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Live ground truth refreshed from Canvas at{' '}
                {new Date(liveDiagnostics.fetchedAt).toLocaleTimeString()} (
                {liveDiagnostics.enrollmentsRaw.length} enrollment row
                {liveDiagnostics.enrollmentsRaw.length === 1 ? '' : 's'},{' '}
                {liveDiagnostics.assignmentGroupsRaw.length} assignment group
                {liveDiagnostics.assignmentGroupsRaw.length === 1 ? '' : 's'}).
              </span>
            </div>
          )}

          {/* Top 3 Comparison Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Displayed in App */}
            <div
              data-testid="inspector-displayed-card"
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between"
            >
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Displayed in Dashboard
                </div>
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  {inspection.displayed.hasData && inspection.displayed.score !== null ? (
                    <>
                      <span
                        className="text-2xl font-extrabold tabular-nums"
                        style={{ color: displayedStyle?.style.color || undefined }}
                      >
                        {inspection.displayed.score}%
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          displayedStyle?.badgeClass || 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {inspection.displayed.letter || displayedStyle?.letter}
                      </span>
                      {inspection.displayed.isEstimated && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                          Calculated Est
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold text-slate-700">
                        {isSuppressed ? 'Suppressed (No Data)' : 'No Grade Data'}
                      </span>
                      {isSuppressed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <ShieldCheck className="w-3 h-3" />
                          <span>0% Filtered</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {inspection.displayed.suppressionReason && (
                  <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                    {inspection.displayed.suppressionReason}
                  </p>
                )}
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-200/70 text-[11px] text-slate-600">
                <span className="font-semibold">Rule: </span>
                <span>{inspection.displayed.sourceLabel}</span>
              </div>
            </div>

            {/* 2. Fetched from Canvas API */}
            <div
              data-testid="inspector-fetched-card"
              className="rounded-xl border border-blue-200/80 bg-blue-50/40 p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    Fetched (Canvas Enrollment)
                  </span>
                  <Database className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 font-mono text-[11px]">current_score</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatScoreVal(
                        inspection.fetched.currentScore,
                        inspection.fetched.currentGrade
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 font-mono text-[11px]">final_score</span>
                    <span className="font-semibold text-slate-800 tabular-nums">
                      {formatScoreVal(
                        inspection.fetched.finalScore,
                        inspection.fetched.finalGrade
                      )}
                    </span>
                  </div>
                  {inspection.fetched.unpostedCurrentScore !== null && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 font-mono text-[11px]">unposted_current</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatScoreVal(
                          inspection.fetched.unpostedCurrentScore,
                          inspection.fetched.unpostedCurrentGrade
                        )}
                      </span>
                    </div>
                  )}
                  {inspection.fetched.currentPeriodScore !== null && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 font-mono text-[11px]">current_period</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatScoreVal(
                          inspection.fetched.currentPeriodScore,
                          inspection.fetched.currentPeriodGrade
                        )}
                      </span>
                    </div>
                  )}
                  {inspection.fetched.overrideScore !== null && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 font-mono text-[11px]">override_score</span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatScoreVal(
                          inspection.fetched.overrideScore,
                          inspection.fetched.overrideGrade
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-blue-200/60 text-[11px] text-slate-600 truncate">
                {inspection.fetched.hasEnrollment ? (
                  <span title={inspection.fetched.endpoint}>
                    {inspection.fetched.enrollmentType}
                    {inspection.fetched.enrollmentState
                      ? ` (${inspection.fetched.enrollmentState})`
                      : ''}
                    {inspection.fetched.enrollmentsCount > 1
                      ? ` • ${inspection.fetched.enrollmentsCount} rows`
                      : ''}
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium">No enrollment record returned</span>
                )}
              </div>
            </div>

            {/* 3. Calculated from Ground Truth Assignments */}
            <div
              data-testid="inspector-calculated-card"
              className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                    Calculated (Graded Work)
                  </span>
                  <Calculator className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                </div>
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
                    {inspection.calculated.percentage !== null
                      ? `${inspection.calculated.percentage}%`
                      : 'N/A'}
                  </span>
                  {inspection.calculated.weightedPercentage !== null && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200">
                      Weighted: {inspection.calculated.weightedPercentage}%
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-700 mt-1 tabular-nums">
                  {inspection.calculated.earnedPoints} / {inspection.calculated.possiblePoints} pts
                  across {inspection.calculated.gradedCount} graded item
                  {inspection.calculated.gradedCount === 1 ? '' : 's'}
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-indigo-200/60 text-[11px] text-slate-600">
                <span>
                  {inspection.calculated.zeroScoreCount} zero-scored •{' '}
                  {inspection.coverage.ungradedAssignmentsCount} ungraded
                </span>
              </div>
            </div>
          </div>

          {/* Grading Coverage & Recency Health Strip */}
          <div
            data-testid="inspector-coverage-strip"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
          >
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Fraction Graded
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-900 tabular-nums">
                  {inspection.coverage.gradedAssignmentsCount} /{' '}
                  {inspection.coverage.gradableAssignmentsCount} ({inspection.coverage.gradedAssignmentPercent}%)
                </span>
                {inspection.coverage.isLowGradedFraction && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    Low Fraction
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Points Coverage
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-900 tabular-nums">
                  {inspection.coverage.gradedPossiblePoints} / {inspection.coverage.totalPossiblePoints} pts ({inspection.coverage.gradedPointsPercent}%)
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Recent Graded (6 wks)
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-900 tabular-nums">
                  {inspection.coverage.recentGradedCount} / {inspection.coverage.recentGradableCount} due
                </span>
                {inspection.coverage.hasNoRecentGradedWork && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    No Recent Grades
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Last Graded Item
              </div>
              <div className="mt-1 text-xs font-bold text-slate-900 truncate">
                {inspection.coverage.daysSinceLastGraded !== null
                  ? `${inspection.coverage.daysSinceLastGraded}d ago`
                  : 'None'}
                {inspection.coverage.latestGradedAt && (
                  <span className="font-normal text-slate-500 ml-1">
                    ({formatShortDateTime(inspection.coverage.latestGradedAt)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Anomalies / Why 0% Findings */}
          {inspection.anomalies.length > 0 && (
            <div data-testid="inspector-anomalies" className="space-y-2">
              {inspection.anomalies.map((item, idx) => {
                const isWarn = item.severity === 'warning';
                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3.5 flex items-start gap-2.5 ${
                      isWarn
                        ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                        : 'bg-sky-50/80 border-sky-200 text-sky-950'
                    }`}
                  >
                    {isWarn ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs leading-relaxed">
                      <div className="font-bold">{item.title}</div>
                      <p className="mt-0.5 opacity-90">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Segmented Tabs */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 flex-wrap">
            <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('breakdown')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'breakdown'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>Breakdown &amp; Graded Work</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('raw')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'raw'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Raw Canvas Data (JSON)</span>
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-500 truncate max-w-full">
              Endpoint: {inspection.fetched.endpoint}
            </div>
          </div>

          {activeTab === 'breakdown' ? (
            <div className="space-y-5">
              {/* Highlighted Graded Work Detail Cards */}
              <div
                data-testid="inspector-graded-work-spotlight"
                className="space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Graded Work Contributing to Score ({inspection.gradedAssignments.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {inspection.calculated.earnedPoints} / {inspection.calculated.possiblePoints} pts total
                  </span>
                </div>

                {inspection.gradedAssignments.length === 0 ? (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600">
                    No assignments in this course currently have a numeric score in Canvas.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {inspection.gradedAssignments.map((row) => {
                      const hasCanvasLink = Boolean(row.htmlUrl && row.htmlUrl !== '#');
                      const isJsonOpen = expandedGradedJsonIds.has(row.id);
                      const isZero = row.score === 0;
                      return (
                        <div
                          key={row.id}
                          data-testid={`graded-item-detail-${row.id}`}
                          className={`rounded-xl border p-3.5 transition ${
                            isZero
                              ? 'border-red-200 bg-red-50/40'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {hasCanvasLink ? (
                                  <a
                                    href={row.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-sm text-slate-900 hover:text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
                                  >
                                    <span className="truncate">{row.name}</span>
                                    <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                  </a>
                                ) : (
                                  <span className="font-bold text-sm text-slate-900">{row.name}</span>
                                )}
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  ID {row.id}
                                </span>
                                {row.assignmentGroupName && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {row.assignmentGroupName}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <span
                                className={`text-xs font-extrabold px-2.5 py-1 rounded-lg border tabular-nums ${
                                  isZero
                                    ? 'bg-red-100 text-red-900 border-red-300'
                                    : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                }`}
                              >
                                {row.score} / {row.pointsPossible} pts ({row.percentage}%)
                              </span>
                              {row.pointsSharePercent !== null && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {row.pointsSharePercent}% of graded pts
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white/80 rounded-lg border border-slate-200/70 p-2.5">
                            <div>
                              <span className="text-slate-400 block">Due Date</span>
                              <span className="font-semibold text-slate-700">
                                {formatShortDateTime(row.dueAt)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Submitted</span>
                              <span className="font-semibold text-slate-700">
                                {formatShortDateTime(row.submittedAt)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Graded</span>
                              <span className="font-semibold text-slate-700">
                                {formatShortDateTime(row.gradedAt || row.postedAt)}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Canvas State &amp; Type</span>
                              <span className="font-semibold text-slate-700">
                                {row.workflowState || 'graded'} • {formatSubmissionType(row.submissionTypes)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isZero && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                                  Zero Score
                                </span>
                              )}
                              {row.missing && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                  Missing
                                </span>
                              )}
                              {row.late && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-200">
                                  Late
                                </span>
                              )}
                              {row.grade && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  grade: &quot;{row.grade}&quot;
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              data-testid={`inspect-graded-item-json-${row.id}`}
                              onClick={() => toggleGradedItemJson(row.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 px-2 py-0.5 rounded hover:bg-blue-50 border border-blue-200/70 transition cursor-pointer"
                            >
                              <Code2 className="w-3 h-3" />
                              <span>{isJsonOpen ? 'Hide Item JSON' : 'Inspect Item JSON'}</span>
                              <ChevronDown
                                className={`w-3 h-3 transition-transform ${
                                  isJsonOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>

                          {isJsonOpen && (
                            <pre
                              data-testid={`graded-item-json-box-${row.id}`}
                              className="mt-2.5 p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-56"
                            >
                              {JSON.stringify(row.rawAssignment, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step-by-Step Resolution Trace */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  How This Grade Was Resolved
                </h3>
                <div className="space-y-2">
                  {inspection.steps.map((step, i) => {
                    const badgeClasses =
                      step.status === 'used'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : step.status === 'warning'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : step.status === 'skipped'
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200';
                    const badgeText =
                      step.status === 'used'
                        ? 'Used'
                        : step.status === 'warning'
                          ? 'Notice'
                          : step.status === 'skipped'
                            ? 'Skipped'
                            : 'Checked';
                    return (
                      <div
                        key={i}
                        className="p-3 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                      >
                        <div className="text-xs">
                          <div className="font-bold text-slate-800">{step.title}</div>
                          <p className="text-slate-600 mt-0.5 leading-relaxed">{step.detail}</p>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 self-start ${badgeClasses}`}
                        >
                          {badgeText}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assignment Groups Breakdown (when available) */}
              {inspection.calculated.groups.length > 0 && (
                <div data-testid="inspector-assignment-groups" className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Assignment Groups</span>
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-600">
                      {inspection.calculated.applyAssignmentGroupWeights
                        ? 'Weighted categories enabled'
                        : 'Unweighted categories'}
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2 text-right">Weight</th>
                          <th className="px-3 py-2 text-right">Graded</th>
                          <th className="px-3 py-2 text-right">Points</th>
                          <th className="px-3 py-2 text-right">Group Avg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {inspection.calculated.groups.map((grp) => (
                          <tr key={grp.id}>
                            <td className="px-3 py-2 font-medium text-slate-800">{grp.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                              {grp.groupWeight}%
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                              {grp.gradedCount}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {grp.earnedPoints} / {grp.possiblePoints}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900">
                              {grp.groupPercent !== null ? `${grp.groupPercent}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Full Course Assignment Ledger */}
              <div data-testid="inspector-assignment-ledger" className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    All Course Assignments Ledger ({inspection.assignments.length})
                  </h3>

                  <div className="inline-flex flex-wrap gap-1 bg-slate-100 p-1 rounded-lg">
                    {(
                      [
                        { id: 'all', label: `All (${inspection.assignments.length})` },
                        {
                          id: 'included',
                          label: `Included (${inspection.calculated.gradedCount})`,
                        },
                        {
                          id: 'zero_or_missing',
                          label: `Zero / Missing (${zeroOrMissingCount})`,
                        },
                        {
                          id: 'excluded',
                          label: `Excluded (${inspection.calculated.excludedCount})`,
                        },
                      ] as const
                    ).map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setAssignmentFilter(pill.id)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                          assignmentFilter === pill.id
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredAssignments.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
                    No assignments match this filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">Assignment</th>
                          <th className="px-3 py-2 whitespace-nowrap">Due Date</th>
                          <th className="px-3 py-2 text-right">Raw Score</th>
                          <th className="px-3 py-2 text-right">Pct</th>
                          <th className="px-3 py-2">Status &amp; Inclusion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredAssignments.map((row) => {
                          const hasCanvasLink = Boolean(row.htmlUrl && row.htmlUrl !== '#');
                          return (
                            <tr
                              key={row.id}
                              className={
                                row.score === 0 && row.includedInCalculation
                                  ? 'bg-red-50/40'
                                  : undefined
                              }
                            >
                              <td className="px-3 py-2 max-w-[240px]">
                                <div className="font-medium text-slate-800 truncate">
                                  {hasCanvasLink ? (
                                    <a
                                      href={row.htmlUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:text-blue-600 hover:underline inline-flex items-center gap-1 max-w-full"
                                    >
                                      <span className="truncate">{row.name}</span>
                                      <ExternalLink className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                                    </a>
                                  ) : (
                                    row.name
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ID {row.id}
                                  {row.assignmentGroupName ? ` • ${row.assignmentGroupName}` : ''}
                                </div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                                {formatShortDateTime(row.dueAt)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold text-slate-800">
                                {row.score !== null ? row.score : '—'} / {row.pointsPossible}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-bold">
                                {row.percentage !== null ? (
                                  <span
                                    className={
                                      row.score === 0 ? 'text-red-700' : 'text-slate-800'
                                    }
                                  >
                                    {row.percentage}%
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {row.includedInCalculation ? (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Included
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      Excluded: {row.exclusionReason}
                                    </span>
                                  )}
                                  {row.score === 0 && row.includedInCalculation && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                                      Zero Score
                                    </span>
                                  )}
                                  {row.missing && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                      Missing
                                    </span>
                                  )}
                                  {row.excused && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                                      Excused
                                    </span>
                                  )}
                                  {row.late && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-200">
                                      Late
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div data-testid="inspector-raw-json-panel" className="space-y-4">
              <div>
                <div className="text-xs font-bold text-slate-700 mb-1.5">
                  Canvas Enrollment Record(s) ({inspection.rawPayloads.allEnrollments.length})
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-56">
                  {JSON.stringify(inspection.rawPayloads.allEnrollments, null, 2)}
                </pre>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-1.5">
                  Graded Assignments Only ({inspection.rawPayloads.gradedAssignments.length})
                </div>
                <pre
                  data-testid="raw-graded-assignments-json"
                  className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-64"
                >
                  {JSON.stringify(inspection.rawPayloads.gradedAssignments, null, 2)}
                </pre>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 mb-1.5">
                  Course Metadata
                </div>
                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(inspection.rawPayloads.courseMeta, null, 2)}
                </pre>
              </div>

              {inspection.rawPayloads.assignmentGroups.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-700 mb-1.5">
                    Assignment Groups ({inspection.rawPayloads.assignmentGroups.length})
                  </div>
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-48">
                    {JSON.stringify(inspection.rawPayloads.assignmentGroups, null, 2)}
                  </pre>
                </div>
              )}

              {inspection.rawPayloads.ungradedOrExcludedAssignments.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70">
                  <button
                    type="button"
                    onClick={() => setShowRawUngraded((prev) => !prev)}
                    className="w-full flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    <span>
                      Ungraded / Excluded Assignments ({inspection.rawPayloads.ungradedOrExcludedAssignments.length})
                    </span>
                    <span className="text-blue-600 hover:underline">
                      {showRawUngraded ? 'Hide JSON' : 'Show Full Ungraded JSON'}
                    </span>
                  </button>
                  {showRawUngraded && (
                    <pre className="mt-2.5 p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-64">
                      {JSON.stringify(inspection.rawPayloads.ungradedOrExcludedAssignments, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-slate-500">
            Canvas <span className="font-mono">current_score</span> is suppressed automatically when 0% has sparse/stale graded coverage or no numeric grades.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
