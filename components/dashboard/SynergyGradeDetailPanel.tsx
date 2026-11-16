import React, { useMemo, useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Calendar,
  User,
  MapPin,
  Percent,
  ListChecks,
  Search,
  ChevronDown,
  ChevronUp,
  Link2,
  AlertCircle,
} from 'lucide-react';
import {
  StudentVueCourseGrade,
  StudentVueGradebookSnapshot,
  SYNERGY_NO_MATCH_KEY,
} from '../../services/studentvueGrades';
import { DEFAULT_GRADE_CONFIG, GradeScaleConfig, getGradeStyle } from '../../services/gradeScale';

interface SynergyGradeDetailPanelProps {
  canvasCourseId: number;
  canvasCourseName: string;
  canvasEffectiveScore: number | null;
  canvasEffectiveLetter?: string;
  canvasIsEstimated?: boolean;
  synergySnapshot?: StudentVueGradebookSnapshot | null;
  matchedSynergyCourse?: StudentVueCourseGrade | null;
  synergyMatchReason?: string;
  isManualSynergyMatch?: boolean;
  gradeConfig?: GradeScaleConfig;
  showScores?: boolean;
  onOpenSynergySync?: () => void;
  onMapSynergyCourse?: (canvasCourseId: number, synergyCourseKey: string | null) => void;
}

export const SynergyGradeDetailPanel: React.FC<SynergyGradeDetailPanelProps> = ({
  canvasCourseId,
  canvasCourseName,
  canvasEffectiveScore,
  canvasEffectiveLetter,
  canvasIsEstimated = false,
  synergySnapshot = null,
  matchedSynergyCourse = null,
  synergyMatchReason,
  isManualSynergyMatch = false,
  gradeConfig = DEFAULT_GRADE_CONFIG,
  showScores = true,
  onOpenSynergySync,
  onMapSynergyCourse,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRawSynergyJson, setShowRawSynergyJson] = useState(false);

  const manualMappingValue = synergySnapshot?.manualMappings?.[canvasCourseId];
  const currentSelectValue =
    manualMappingValue === SYNERGY_NO_MATCH_KEY
      ? SYNERGY_NO_MATCH_KEY
      : manualMappingValue || '';

  const categories = matchedSynergyCourse?.categories || [];
  const assignments = matchedSynergyCourse?.assignments || [];

  const distinctAssignmentCategories = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      if (a.category) set.add(a.category);
    }
    return Array.from(set);
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assignments.filter((a) => {
      if (categoryFilter !== 'ALL' && (a.category || '') !== categoryFilter) {
        return false;
      }
      if (q) {
        const hay = `${a.title} ${a.category || ''} ${a.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assignments, categoryFilter, searchQuery]);

  // Empty state: no Synergy snapshot synced yet
  if (!synergySnapshot) {
    return (
      <div
        className="p-6 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 text-center space-y-3"
        data-testid="synergy-empty-state"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            No Official StudentVUE Grades Synced Yet
          </h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto mt-1">
            Sync your StudentVUE / ParentVUE gradebook to view official district course totals, weighted category averages, and individual Synergy item grades for{' '}
            <span className="font-semibold">{canvasCourseName}</span>.
          </p>
        </div>
        {onOpenSynergySync && (
          <button
            type="button"
            data-testid="synergy-panel-sync-btn"
            onClick={onOpenSynergySync}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Official Grades
          </button>
        )}
      </div>
    );
  }

  const syncedDateLabel = (() => {
    const d = new Date(synergySnapshot.syncedAt);
    return isNaN(d.getTime()) ? synergySnapshot.syncedAt : d.toLocaleString();
  })();

  return (
    <div className="space-y-4" data-testid="synergy-detail-panel">
      {/* Synced Snapshot Banner & Course Matcher */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <ShieldCheck className="w-3 h-3" />
              Synergy Official
            </span>
            {synergySnapshot.reportingPeriodName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-slate-700 border border-slate-200">
                <Calendar className="w-3 h-3 text-slate-400" />
                {synergySnapshot.reportingPeriodName}
              </span>
            )}
            <span className="text-[11px] text-slate-500">
              Synced {syncedDateLabel}
            </span>
          </div>

          {onOpenSynergySync && (
            <button
              type="button"
              data-testid="synergy-panel-resync-btn"
              onClick={onOpenSynergySync}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Re-sync Synergy
            </button>
          )}
        </div>

        {/* Course Mapping Override */}
        {onMapSynergyCourse && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-slate-200/70">
            <label
              htmlFor={`synergy-course-mapper-${canvasCourseId}`}
              className="text-[11px] font-semibold text-slate-700 flex items-center gap-1 shrink-0"
            >
              <Link2 className="w-3.5 h-3.5 text-slate-500" />
              Matched Synergy Course:
            </label>
            <select
              id={`synergy-course-mapper-${canvasCourseId}`}
              data-testid="synergy-course-mapper-select"
              value={currentSelectValue}
              onChange={(e) => {
                const val = e.target.value;
                onMapSynergyCourse(canvasCourseId, val === '' ? null : val);
              }}
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:border-emerald-500"
            >
              <option value="">
                Auto-match{matchedSynergyCourse && !isManualSynergyMatch ? ` (${matchedSynergyCourse.title})` : ''}
              </option>
              {synergySnapshot.courses.map((sc) => (
                <option key={sc.key} value={sc.key}>
                  {sc.period ? `Per ${sc.period} • ` : ''}
                  {sc.title}
                  {sc.scorePercent !== null ? ` (${sc.scorePercent}% ${sc.letterGrade || ''})` : ' (N/A)'}
                </option>
              ))}
              <option value={SYNERGY_NO_MATCH_KEY}>Do not match to any Synergy course</option>
            </select>
          </div>
        )}
      </div>

      {/* Unmatched notice */}
      {!matchedSynergyCourse ? (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">No Synergy course matched "{canvasCourseName}"</div>
            <p className="mt-0.5 text-amber-800">
              Use the <span className="font-semibold">Matched Synergy Course</span> selector above to link this Canvas class to one of your {synergySnapshot.courses.length} synced Synergy courses.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Official Synergy Course Standing vs Canvas Standing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Official Synergy Grade
              </div>
              {showScores && matchedSynergyCourse.scorePercent !== null ? (
                (() => {
                  const style = getGradeStyle(matchedSynergyCourse.scorePercent, 100, gradeConfig, {
                    isCourseGrade: true,
                  });
                  return (
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-2xl font-extrabold"
                        style={{ color: style.style.color || undefined }}
                      >
                        {matchedSynergyCourse.scorePercent}%
                      </span>
                      {(matchedSynergyCourse.letterGrade || style.letter) && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${style.badgeClass}`}>
                          {matchedSynergyCourse.letterGrade || style.letter}
                        </span>
                      )}
                      {matchedSynergyCourse.markName && (
                        <span className="text-xs text-slate-500">
                          • {matchedSynergyCourse.markName}
                        </span>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div className="text-sm font-semibold text-slate-500 italic">
                  {!showScores ? 'Hidden (Settings)' : matchedSynergyCourse.scoreRawText || 'N/A (No grade yet)'}
                </div>
              )}

              <div className="text-[11px] text-slate-600 pt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-slate-800">{matchedSynergyCourse.title}</span>
                {matchedSynergyCourse.period && <span>Per {matchedSynergyCourse.period}</span>}
                {matchedSynergyCourse.staff && (
                  <span className="inline-flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    {matchedSynergyCourse.staff}
                  </span>
                )}
                {matchedSynergyCourse.room && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    Rm {matchedSynergyCourse.room}
                  </span>
                )}
              </div>
              {synergyMatchReason && (
                <div className="text-[10px] text-emerald-700 font-medium">
                  Link: {synergyMatchReason}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Canvas Standing (Reference)
              </div>
              {showScores && canvasEffectiveScore !== null ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-800">{canvasEffectiveScore}%</span>
                  {canvasEffectiveLetter && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      {canvasEffectiveLetter}
                    </span>
                  )}
                  {canvasIsEstimated && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      Unweighted Est
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-slate-400 italic">No Canvas grade total</div>
              )}
              <p className="text-[11px] text-slate-500 pt-1">
                District Synergy grades use official category weights and gradebook rounding rules; individual Synergy items below come directly from Synergy rather than Canvas assignments.
              </p>
            </div>
          </div>

          {/* Weighted Categories Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-emerald-600" />
                Synergy Weighted Categories ({categories.length})
              </h4>
            </div>
            {categories.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 italic">
                No weighted category breakdown reported by Synergy for this course.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/70 text-[11px] uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold text-right">Weight</th>
                      <th className="px-3 py-2 font-semibold text-right">Points</th>
                      <th className="px-4 py-2 font-semibold text-right">Category Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.map((cat, idx) => (
                      <tr key={`${cat.type}-${idx}`} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2 font-medium text-slate-800">{cat.type}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">
                          {cat.weightLabel}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600">
                          {cat.pointsEarned !== null && cat.pointsPossible !== null
                            ? `${cat.pointsEarned} / ${cat.pointsPossible}`
                            : cat.pointsEarned !== null
                            ? String(cat.pointsEarned)
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-slate-900">
                          {showScores ? cat.calculatedMark || '—' : 'Hidden'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Individual Synergy Assignments Ledger */}
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-emerald-600" />
                Individual Synergy Items ({filteredAssignments.length}
                {filteredAssignments.length !== assignments.length ? ` of ${assignments.length}` : ''})
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                {distinctAssignmentCategories.length > 1 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-2 py-1 text-[11px] rounded-lg border border-slate-300 bg-white text-slate-700"
                    aria-label="Filter Synergy items by category"
                  >
                    <option value="ALL">All Categories</option>
                    {distinctAssignmentCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter items..."
                    className="pl-7 pr-2.5 py-1 text-[11px] rounded-lg border border-slate-300 bg-white w-36 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {filteredAssignments.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 italic">
                {assignments.length === 0
                  ? 'No individual Synergy assignments found for this course in this reporting period.'
                  : 'No Synergy assignments match the current filter.'}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50/80 text-[11px] uppercase text-slate-500 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Assignment</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold text-right">Score</th>
                      <th className="px-4 py-2 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAssignments.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 align-top">
                        <td className="px-4 py-2 font-medium text-slate-900">{item.title}</td>
                        <td className="px-3 py-2 text-slate-600">{item.category || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                          {item.dueDate || item.date || '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          {showScores ? (
                            <span className="font-semibold text-slate-900">
                              {item.scoreText || item.pointsText || '—'}
                              {item.scorePercent !== null && (
                                <span className="text-[10px] text-slate-500 ml-1">
                                  ({item.scorePercent}%)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Hidden</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-600 max-w-[200px]">
                          {item.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Collapsible Raw Synergy Payload */}
      {Boolean(synergySnapshot.rawGradebook) && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setShowRawSynergyJson((prev) => !prev)}
            className="w-full px-4 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 transition cursor-pointer"
          >
            <span>Raw Synergy Gradebook Payload (JSON)</span>
            {showRawSynergyJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showRawSynergyJson && (
            <pre className="p-3 bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-64">
              {JSON.stringify(synergySnapshot.rawGradebook, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
