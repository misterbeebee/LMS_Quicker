import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  Loader2,
  Server,
  User,
  Lock,
  Globe,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Link2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  ShieldCheck,
} from 'lucide-react';
import {
  getLinkedStudentVueProfile,
  inferSuggestedSynergyDomain,
  LinkedStudentVueProfile,
} from '../../services/studentvue';
import {
  clearSavedStudentVueGrades,
  saveStudentVueGrades,
  StudentVueGradebookSnapshot,
  syncStudentVueGradebook,
} from '../../services/studentvueGrades';

interface StudentVueGradeSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: string;
  studentName: string;
  canvasDomain?: string;
  currentSnapshot?: StudentVueGradebookSnapshot | null;
  onGradesSynced: (snapshot: StudentVueGradebookSnapshot | null) => void;
  onOpenVerifyModal?: () => void;
}

function resolveDefaultApiUrl(): string {
  const envUrl =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SCHOOLVIEW_API_URL) || '';
  return envUrl || 'http://localhost:8080';
}

const DEFAULT_API_URL = resolveDefaultApiUrl();

export const StudentVueGradeSyncModal: React.FC<StudentVueGradeSyncModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  canvasDomain = '',
  currentSnapshot = null,
  onGradesSynced,
  onOpenVerifyModal,
}) => {
  const [linkedProfile, setLinkedProfile] = useState<LinkedStudentVueProfile | null>(() =>
    getLinkedStudentVueProfile(studentId)
  );
  const [edupointUsername, setEdupointUsername] = useState('');
  const [edupointPassword, setEdupointPassword] = useState('');
  const [showEdupointPassword, setShowEdupointPassword] = useState(false);

  const [districtDomain, setDistrictDomain] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>('');

  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiServerUrl, setApiServerUrl] = useState(DEFAULT_API_URL);
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [showApiPassword, setShowApiPassword] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const link = getLinkedStudentVueProfile(studentId);
      setLinkedProfile(link);
      setDistrictDomain(
        link?.districtDomain ||
          currentSnapshot?.districtDomain ||
          inferSuggestedSynergyDomain(canvasDomain)
      );
      setIsParent(Boolean(link?.isParent ?? currentSnapshot?.isParent ?? false));
      setApiServerUrl(link?.apiServerUrl || DEFAULT_API_URL);
      setSelectedPeriodKey(
        currentSnapshot?.reportingPeriodGu ||
          (typeof currentSnapshot?.reportingPeriodIndex === 'number'
            ? String(currentSnapshot.reportingPeriodIndex)
            : '')
      );
      setSyncError(null);
      setSyncSuccessMsg(null);
    } else {
      // Wipe all transient secrets whenever the modal closes
      setEdupointUsername('');
      setEdupointPassword('');
      setShowEdupointPassword(false);
      setApiPassword('');
      setShowApiPassword(false);
      setIsSyncing(false);
      setSyncError(null);
      setSyncSuccessMsg(null);
    }
  }, [isOpen, studentId, canvasDomain, currentSnapshot]);

  useEffect(() => {
    return () => {
      setEdupointUsername('');
      setEdupointPassword('');
      setApiPassword('');
    };
  }, []);

  if (!isOpen) return null;

  const reportingPeriods = currentSnapshot?.reportingPeriods || [];

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncError(null);
    setSyncSuccessMsg(null);
    setIsSyncing(true);

    try {
      let reportPeriod: number | undefined = undefined;
      let reportPeriodGu: string | undefined = undefined;
      if (selectedPeriodKey) {
        const foundByGu = reportingPeriods.find((rp) => rp.gu && rp.gu === selectedPeriodKey);
        if (foundByGu) {
          reportPeriod = foundByGu.index;
          reportPeriodGu = foundByGu.gu;
        } else if (/^\d+$/.test(selectedPeriodKey)) {
          reportPeriod = Number(selectedPeriodKey);
        }
      }

      const outcome = await syncStudentVueGradebook({
        apiServerUrl,
        apiUsername,
        apiPassword,
        districtDomain,
        edupointUsername,
        edupointPassword,
        isParent,
        agu: linkedProfile?.agu || currentSnapshot?.agu,
        permId: linkedProfile?.permId || currentSnapshot?.permId,
        studentName: linkedProfile?.studentName || currentSnapshot?.studentName || studentName,
        reportPeriod,
        reportPeriodGu,
      });

      if (!outcome.ok) {
        setSyncError('error' in outcome ? outcome.error : 'Official grade sync failed.');
        return;
      }

      const saved = saveStudentVueGrades(studentId, outcome.snapshot);
      onGradesSynced(saved);
      setSyncSuccessMsg(
        `Synced ${saved.courses.length} course${saved.courses.length === 1 ? '' : 's'}${
          saved.reportingPeriodName ? ` (${saved.reportingPeriodName})` : ''
        }.`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearSynced = () => {
    clearSavedStudentVueGrades(studentId);
    onGradesSynced(null);
    setSyncSuccessMsg('Cleared cached official StudentVUE grades for this student.');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studentvue-grade-sync-title"
      data-testid="studentvue-grade-sync-modal"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  id="studentvue-grade-sync-title"
                  className="text-sm font-bold text-slate-900 truncate"
                >
                  Sync Official StudentVUE Grades
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                  Official
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                Student: <span className="font-semibold text-slate-700">{studentName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSync} className="p-5 overflow-y-auto space-y-4">
          {/* Linked Student Status */}
          {linkedProfile ? (
            <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="truncate">
                    Targeting Linked Student: {linkedProfile.studentName || studentName}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-800 mt-0.5 truncate">
                  {linkedProfile.permId ? `PermID: ${linkedProfile.permId}` : ''}
                  {linkedProfile.school ? ` • ${linkedProfile.school}` : ''}
                </div>
              </div>
              {onOpenVerifyModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVerifyModal();
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg transition cursor-pointer shrink-0"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-900">
              <span>
                No linked child saved yet. If using ParentVUE with multiple children, link the matching child first.
              </span>
              {onOpenVerifyModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVerifyModal();
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition cursor-pointer shrink-0 inline-flex items-center gap-1"
                >
                  <ShieldCheck className="w-3 h-3" />
                  Verify & Link
                </button>
              )}
            </div>
          )}

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
            Credentials are kept strictly in memory for this sync and are never stored. Parsed course totals and Synergy grade details are saved locally for quick viewing.
          </div>

          {/* Synergy Domain + Account Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Synergy District Domain
              </label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={districtDomain}
                  onChange={(e) => setDistrictDomain(e.target.value)}
                  placeholder="md-mcps-psv.edupoint.com"
                  required
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Portal Account Type
              </label>
              <div className="inline-flex w-full rounded-xl border border-slate-300 p-0.5 bg-slate-100">
                <button
                  type="button"
                  onClick={() => setIsParent(false)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    !isParent ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  StudentVUE
                </button>
                <button
                  type="button"
                  onClick={() => setIsParent(true)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    isParent ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  ParentVUE
                </button>
              </div>
            </div>
          </div>

          {/* Reporting Period Selector (when known or optional) */}
          {reportingPeriods.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                Reporting Period
              </label>
              <select
                value={selectedPeriodKey}
                onChange={(e) => setSelectedPeriodKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-emerald-500"
              >
                <option value="">Default / Current Grading Period</option>
                {reportingPeriods.map((rp) => {
                  const val = rp.gu || String(rp.index);
                  return (
                    <option key={val} value={val}>
                      {rp.name}
                      {rp.startDate && rp.endDate ? ` (${rp.startDate} – ${rp.endDate})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Edupoint Credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                {isParent ? 'ParentVUE Username' : 'StudentVUE Username'}
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoComplete="off"
                  value={edupointUsername}
                  onChange={(e) => setEdupointUsername(e.target.value)}
                  placeholder="Username"
                  required
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                {isParent ? 'ParentVUE Password' : 'StudentVUE Password'}
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showEdupointPassword ? 'text' : 'password'}
                  autoComplete="off"
                  value={edupointPassword}
                  onChange={(e) => setEdupointPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowEdupointPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showEdupointPassword ? 'Hide password' : 'Show password'}
                  aria-label={showEdupointPassword ? 'Hide Synergy password' : 'Show Synergy password'}
                >
                  {showEdupointPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* API Server Auth */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowApiConfig((prev) => !prev)}
              className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                StudentVUE API Server Settings
                {!apiUsername || !apiPassword ? (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                    Credentials needed
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                    Ready
                  </span>
                )}
              </span>
              {showApiConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {(showApiConfig || !apiUsername || !apiPassword) && (
              <div className="p-3 bg-white space-y-2.5 border-t border-slate-100">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    API Server URL
                  </label>
                  <input
                    type="text"
                    value={apiServerUrl}
                    onChange={(e) => setApiServerUrl(e.target.value)}
                    placeholder="/api/studentvue"
                    required
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      API Username
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      value={apiUsername}
                      onChange={(e) => setApiUsername(e.target.value)}
                      placeholder="API user"
                      required
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      API Password
                    </label>
                    <div className="relative">
                      <input
                        type={showApiPassword ? 'text' : 'password'}
                        autoComplete="off"
                        value={apiPassword}
                        onChange={(e) => setApiPassword(e.target.value)}
                        placeholder="API secret"
                        required
                        className="w-full pl-3 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title={showApiPassword ? 'Hide API password' : 'Show API password'}
                      >
                        {showApiPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {syncError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{syncError}</span>
            </div>
          )}

          {syncSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{syncSuccessMsg}</span>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
            <div>
              {currentSnapshot && (
                <button
                  type="button"
                  onClick={handleClearSynced}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Cached
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSyncing}
                data-testid="submit-sync-official-grades"
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white shadow-xs transition cursor-pointer inline-flex items-center gap-1.5"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Syncing Official Grades...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync Official Grades
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
