import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  User,
  Lock,
  Globe,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  Link2,
  Unlink,
} from 'lucide-react';
import {
  verifyStudentVueAccount,
  compareStudentProfiles,
  StudentVueVerifyOutcome,
  SYNERGY_ENDPOINT_OPTIONS,
  inferSuggestedSynergyDomain,
  LinkedStudentVueProfile,
  getLinkedStudentVueProfile,
  saveLinkedStudentVueProfile,
  clearLinkedStudentVueProfile,
  checkSchoolviewAuthRequired,
  resolveDefaultSchoolviewApiUrl,
} from '../../services/studentvue';
import {
  fetchSynergyGradebookWithSession,
  saveStudentVueGrades,
  StudentVueGradebookSnapshot,
} from '../../services/studentvueGrades';
import { logger } from '../../services/logger';
import { isExtensionRuntime, isLocalRuntime } from '../../services/backend';

interface StudentVueVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: string;
  studentName: string;
  canvasDomain?: string;
  canvasToken?: string;
  useProxy?: boolean;
  onLinkSaved?: (link: LinkedStudentVueProfile | null) => void;
  onGradesSynced?: (snapshot: StudentVueGradebookSnapshot) => void;
}

const DEFAULT_API_URL = resolveDefaultSchoolviewApiUrl();

export const StudentVueVerifyModal: React.FC<StudentVueVerifyModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  canvasDomain = '',
  canvasToken = '',
  useProxy = true,
  onLinkSaved,
  onGradesSynced,
}) => {
  // Strictly transient in-memory state — never persisted to localStorage or any server
  const [edupointUsername, setEdupointUsername] = useState('');
  const [edupointPassword, setEdupointPassword] = useState('');
  const [showEdupointPassword, setShowEdupointPassword] = useState(false);
  const [districtDomain, setDistrictDomain] = useState(() => inferSuggestedSynergyDomain(canvasDomain));
  const [isEndpointDropdownOpen, setIsEndpointDropdownOpen] = useState(false);
  const [endpointShowAll, setEndpointShowAll] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [reuseExistingSession, setReuseExistingSession] = useState(false);

  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiServerUrl, setApiServerUrl] = useState(DEFAULT_API_URL);
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [showApiPassword, setShowApiPassword] = useState(false);
  const [apiAuthRequired, setApiAuthRequired] = useState(true);

  const [isVerifying, setIsVerifying] = useState(false);
  const [outcome, setOutcome] = useState<StudentVueVerifyOutcome | null>(null);
  const [savedLink, setSavedLink] = useState<LinkedStudentVueProfile | null>(() =>
    getLinkedStudentVueProfile(studentId)
  );
  const [justSaved, setJustSaved] = useState(false);
  const [isSyncingGrades, setIsSyncingGrades] = useState(false);
  const [gradeSyncMessage, setGradeSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const endpointComboboxRef = useRef<HTMLDivElement>(null);

  // Close Synergy endpoint combobox menu on outside click
  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (endpointComboboxRef.current && !endpointComboboxRef.current.contains(event.target as Node)) {
        setIsEndpointDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Probe whether schoolview-api currently requires API credentials when modal is open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    checkSchoolviewAuthRequired(apiServerUrl).then((required) => {
      if (!cancelled) setApiAuthRequired(required);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiServerUrl]);

  // Load saved link & suggest matching Synergy endpoint on open; clear transient secrets on close
  useEffect(() => {
    if (isOpen) {
      const existing = getLinkedStudentVueProfile(studentId);
      setSavedLink(existing);
      setJustSaved(false);
      if (existing) {
        if (existing.districtDomain) setDistrictDomain(existing.districtDomain);
        setIsParent(Boolean(existing.isParent));
        if (existing.apiServerUrl) setApiServerUrl(existing.apiServerUrl);
      } else {
        setDistrictDomain((prev) => prev || inferSuggestedSynergyDomain(canvasDomain));
      }
    } else {
      setEdupointUsername('');
      setEdupointPassword('');
      setShowEdupointPassword(false);
      setReuseExistingSession(false);
      setApiPassword('');
      setShowApiPassword(false);
      setOutcome(null);
      setJustSaved(false);
      setIsVerifying(false);
      setIsEndpointDropdownOpen(false);
    }
  }, [isOpen, canvasDomain, studentId]);

  useEffect(() => {
    return () => {
      setEdupointUsername('');
      setEdupointPassword('');
      setApiPassword('');
    };
  }, []);

  const query = districtDomain.trim().toLowerCase();
  const filteredEndpointOptions =
    endpointShowAll || !query
      ? SYNERGY_ENDPOINT_OPTIONS
      : SYNERGY_ENDPOINT_OPTIONS.filter(
          (opt) =>
            opt.domain.toLowerCase().includes(query) ||
            opt.label.toLowerCase().includes(query)
        );
  const displayedEndpointOptions =
    filteredEndpointOptions.length > 0 ? filteredEndpointOptions : SYNERGY_ENDPOINT_OPTIONS;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return;

    setIsVerifying(true);
    setOutcome(null);
    setJustSaved(false);

    try {
      const result = await verifyStudentVueAccount({
        apiServerUrl,
        apiUsername,
        apiPassword,
        districtDomain,
        edupointUsername,
        edupointPassword,
        isParent,
        reuseExistingSession,
        canvasDomain,
        canvasToken,
        useProxy,
      });
      setOutcome(result);

      if (!result.ok && 'stage' in result && result.stage === 'api_auth') {
        setShowApiConfig(true);
      }
    } catch (err: any) {
      // Defensive catch-all: verifyStudentVueAccount already catches everything,
      // but we double-guard here so nothing can ever escape to the main app.
      const msg = err?.message || 'Unexpected error during StudentVUE verification';
      logger.error('[StudentVUE Verify Modal] Guarded error:', msg);
      setOutcome({ ok: false, stage: 'unknown', error: msg });
    } finally {
      // Discard transient StudentVUE password immediately after the check
      setEdupointPassword('');
      setIsVerifying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studentvue-verify-title"
      data-testid="studentvue-verify-modal"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-left max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="studentvue-verify-title" className="text-sm font-bold text-slate-900">
                  Verify StudentVUE Account
                </h3>
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  Experimental
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Verify that StudentVUE matches Canvas profile ({studentName})
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close StudentVUE Verification"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 leading-relaxed">
            Your StudentVUE username and password are never saved on any server or browser storage.
          </div>

          {savedLink && (
            <div
              data-testid="saved-studentvue-link-banner"
              className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-[11px] flex items-start justify-between gap-2"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Saved StudentVUE Match: {savedLink.studentName || 'Student'}
                    {savedLink.permId ? ` (PermID ${savedLink.permId})` : ''}
                  </span>
                </div>
                <div className="text-emerald-800 truncate">
                  {[
                    savedLink.isParent ? 'ParentVUE' : 'StudentVUE',
                    savedLink.districtDomain,
                    savedLink.school,
                    savedLink.grade ? `Grade ${savedLink.grade}` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearLinkedStudentVueProfile(studentId);
                  setSavedLink(null);
                  setJustSaved(false);
                  onLinkSaved?.(null);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-800 hover:text-red-700 hover:border-red-200 text-[10px] font-semibold transition cursor-pointer shrink-0"
                title="Remove saved StudentVUE link"
              >
                <Unlink className="w-3 h-3" />
                Unlink
              </button>
            </div>
          )}

          {/* Account Type Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsParent(false)}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                !isParent
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              StudentVUE
            </button>
            <button
              type="button"
              onClick={() => setIsParent(true)}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isParent
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              ParentVUE
            </button>
          </div>

          {/* Synergy Endpoint Combo Box */}
          <div ref={endpointComboboxRef}>
            <label
              htmlFor="synergy-endpoint-input"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              Synergy Endpoint (District Domain)
            </label>
            <div className="relative">
              <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                id="synergy-endpoint-input"
                type="text"
                role="combobox"
                aria-expanded={isEndpointDropdownOpen}
                aria-controls="synergy-endpoint-listbox"
                aria-autocomplete="list"
                data-testid="synergy-endpoint-combobox"
                placeholder="Select or enter e.g. md-mcps-psv.edupoint.com"
                value={districtDomain}
                onFocus={() => {
                  setEndpointShowAll(true);
                  setIsEndpointDropdownOpen(true);
                }}
                onChange={(e) => {
                  setDistrictDomain(e.target.value);
                  setEndpointShowAll(false);
                  setIsEndpointDropdownOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsEndpointDropdownOpen(false);
                  } else if (e.key === 'ArrowDown') {
                    setEndpointShowAll(true);
                    setIsEndpointDropdownOpen(true);
                  }
                }}
                className="w-full text-xs pl-8 pr-8 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                required
              />
              <button
                type="button"
                aria-label="Toggle Synergy endpoints"
                data-testid="synergy-endpoint-toggle"
                onClick={() => {
                  setEndpointShowAll(true);
                  setIsEndpointDropdownOpen((prev) => !prev);
                }}
                className="absolute right-2 top-1.5 p-1 text-slate-400 hover:text-indigo-600 rounded-lg transition cursor-pointer"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    isEndpointDropdownOpen ? 'rotate-180 text-indigo-600' : ''
                  }`}
                />
              </button>

              {isEndpointDropdownOpen && (
                <div
                  id="synergy-endpoint-listbox"
                  role="listbox"
                  aria-label="Known Synergy endpoints"
                  className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 max-h-52 overflow-y-auto animate-fadeIn"
                >
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Known District Synergy Endpoints (or type custom)
                  </div>
                  {displayedEndpointOptions.map((opt) => {
                    const isSelected = districtDomain.trim().toLowerCase() === opt.domain.toLowerCase();
                    return (
                      <button
                        key={opt.domain}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setDistrictDomain(opt.domain);
                          setIsEndpointDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-indigo-50/70 transition cursor-pointer ${
                          isSelected ? 'bg-indigo-50/90' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 font-mono truncate">
                            {opt.domain}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{opt.label}</div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Open-tab SSO reuse (Chrome / Firefox extension runtime) */}
          {isExtensionRuntime() && (
            <label
              data-testid="verify-reuse-session-toggle"
              className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={reuseExistingSession}
                onChange={(e) => setReuseExistingSession(e.target.checked)}
                className="mt-0.5 rounded border-blue-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="font-bold block">Reuse open StudentVUE/ParentVUE tab (for SSO districts)</span>
                <span className="text-[11px] text-blue-800/90">
                  Sign into StudentVUE in another tab first, then verify without entering a password here.
                </span>
              </span>
            </label>
          )}

          {/* Edupoint Username & Password */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${reuseExistingSession ? 'opacity-60' : ''}`}>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isParent ? 'ParentVUE' : 'StudentVUE'} Username
                {reuseExistingSession && <span className="font-normal text-slate-400"> (optional)</span>}
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Student ID / Username"
                  value={edupointUsername}
                  onChange={(e) => setEdupointUsername(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  required={!reuseExistingSession}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isParent ? 'ParentVUE' : 'StudentVUE'} Password
                {reuseExistingSession && <span className="font-normal text-slate-400"> (optional)</span>}
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showEdupointPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Password (transient)"
                  value={edupointPassword}
                  onChange={(e) => setEdupointPassword(e.target.value)}
                  className="w-full text-xs pl-8 pr-8 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  required={!reuseExistingSession}
                />
                <button
                  type="button"
                  onClick={() => setShowEdupointPassword((prev) => !prev)}
                  aria-label={showEdupointPassword ? 'Hide Vue password' : 'Show Vue password'}
                  title={showEdupointPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1.5 p-1 text-slate-400 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                >
                  {showEdupointPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* API Server Connection Section (hosted mode only) */}
          {isLocalRuntime() ? (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Direct Local Connection:</strong> connects directly from this device to your district&apos;s Synergy server (no middleware server).
              </span>
            </div>
          ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowApiConfig(!showApiConfig)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span>StudentVUE API Server ({apiServerUrl})</span>
                {!apiAuthRequired && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    Auth disabled (dev)
                  </span>
                )}
              </span>
              {showApiConfig ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {(showApiConfig || (apiAuthRequired && (!apiUsername || !apiPassword))) && (
              <div className="p-3.5 space-y-3 border-t border-slate-200 bg-white">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    API Server URL
                  </label>
                  <input
                    type="text"
                    placeholder="/api/studentvue or http://localhost:8080"
                    value={apiServerUrl}
                    onChange={(e) => setApiServerUrl(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:outline-hidden focus:border-indigo-500 font-mono"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      API Username {!apiAuthRequired ? '(optional)' : ''}
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder={!apiAuthRequired ? 'Optional (auth disabled)' : 'e.g. alice'}
                      value={apiUsername}
                      onChange={(e) => setApiUsername(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:outline-hidden focus:border-indigo-500"
                      required={apiAuthRequired}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      API Password {!apiAuthRequired ? '(optional)' : ''}
                    </label>
                    <div className="relative">
                      <input
                        type={showApiPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder={!apiAuthRequired ? 'Optional (auth disabled)' : 'API user password'}
                        value={apiPassword}
                        onChange={(e) => setApiPassword(e.target.value)}
                        className="w-full text-xs pl-3 pr-8 py-1.5 rounded-lg border border-slate-300 focus:outline-hidden focus:border-indigo-500"
                        required={apiAuthRequired}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiPassword((prev) => !prev)}
                        aria-label={showApiPassword ? 'Hide API password' : 'Show API password'}
                        title={showApiPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-1.5 top-1 p-1 text-slate-400 hover:text-indigo-600 rounded-md transition cursor-pointer"
                      >
                        {showApiPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Outcome Display */}
          {outcome && !outcome.ok && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Verification Failed ({String(outcome.stage || 'error')})</span>
              </div>
              <p className="text-[11px] text-red-700 leading-relaxed">
                {typeof outcome.error === 'string'
                  ? outcome.error
                  : 'Unexpected Synergy error. Your Canvas session was not affected.'}
              </p>
            </div>
          )}

          {outcome && outcome.ok && outcome.comparison && (() => {
            const cmp = outcome.comparison;
            const matchReasons = Array.isArray(cmp.matchReasons) ? cmp.matchReasons : [];
            const mismatchReasons = Array.isArray(cmp.mismatchReasons) ? cmp.mismatchReasons : [];
            const warnings = Array.isArray(cmp.warnings) ? cmp.warnings : [];
            const canvasProf = cmp.canvasProfile || {};
            const svProf = cmp.studentVueProfile || {};
            const availableStudents = Array.isArray(cmp.availableStudents) ? cmp.availableStudents : [];
            const selectedIndex =
              typeof cmp.selectedStudentIndex === 'number' &&
              cmp.selectedStudentIndex >= 0 &&
              cmp.selectedStudentIndex < availableStudents.length
                ? cmp.selectedStudentIndex
                : 0;

            return (
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  cmp.matched
                    ? 'bg-emerald-50/80 border-emerald-200'
                    : 'bg-amber-50/80 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {cmp.matched ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {cmp.matched
                        ? `Accounts Match (${cmp.confidence} confidence)`
                        : 'Account Mismatch Detected'}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {cmp.matched
                        ? matchReasons.join(' • ') || 'Comparison completed.'
                        : mismatchReasons.join(' • ') || matchReasons.join(' • ') || 'Comparison completed.'}
                    </div>
                  </div>
                </div>

                {!cmp.matched && matchReasons.length > 0 && mismatchReasons.length > 0 && (
                  <div className="text-[11px] text-emerald-800 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Matched signals: {matchReasons.join(' • ')}</span>
                  </div>
                )}

                {availableStudents.length > 1 && (
                  <div className="bg-white/90 rounded-lg p-2.5 border border-slate-200/80 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="parentvue-student-select"
                        className="text-[11px] font-bold text-slate-700"
                      >
                        ParentVUE Student
                      </label>
                      <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {cmp.matched
                          ? `Auto-matched from ${availableStudents.length} ParentVUE students`
                          : `Showing student ${selectedIndex + 1} of ${availableStudents.length} — select another below`}
                      </span>
                    </div>
                    <select
                      id="parentvue-student-select"
                      data-testid="parentvue-student-select"
                      value={selectedIndex}
                      onChange={(e) => {
                        const nextIdx = Number(e.target.value);
                        const chosen = availableStudents[nextIdx];
                        if (!chosen) return;
                        const recomputed = compareStudentProfiles(canvasProf, chosen);
                        setJustSaved(false);
                        setOutcome({
                          ok: true,
                          comparison: {
                            ...recomputed,
                            availableStudents,
                            selectedStudentIndex: nextIdx,
                          },
                        });
                      }}
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:border-indigo-500"
                    >
                      {availableStudents.map((st, idx) => {
                        const parts = [
                          st.name || `Student ${idx + 1}`,
                          st.permId ? `ID: ${st.permId}` : null,
                          st.grade ? `Grade ${st.grade}` : null,
                          st.school || null,
                        ].filter(Boolean);
                        return (
                          <option key={`${st.permId || st.name || 'stu'}-${idx}`} value={idx}>
                            {parts.join(' • ')}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {mismatchReasons.length > 0 && cmp.matched && (
                  <div className="text-[11px] text-amber-800 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{mismatchReasons.join(' • ')}</span>
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="text-[11px] text-slate-600 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{warnings.join(' ')}</span>
                  </div>
                )}

                {/* Side-by-side profile details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/70 text-[11px]">
                  <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/70 space-y-1">
                    <div className="font-bold text-slate-700">Canvas Profile</div>
                    <div className="text-slate-600 truncate">
                      Name: {canvasProf.name || '—'}
                    </div>
                    <div className="text-slate-600 truncate">
                      ID: {canvasProf.sisUserId || canvasProf.loginId || '—'}
                    </div>
                    <div className="text-slate-600 truncate">
                      Email: {canvasProf.email || '—'}
                    </div>
                  </div>
                  <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/70 space-y-1">
                    <div className="font-bold text-slate-700">StudentVUE Profile</div>
                    <div className="text-slate-600 truncate">
                      Name: {svProf.name || '—'}
                    </div>
                    <div className="text-slate-600 truncate">
                      PermID: {svProf.permId || '—'}
                    </div>
                    <div className="text-slate-600 truncate">
                      School: {svProf.school || '—'}
                    </div>
                    {svProf.grade && (
                      <div className="text-slate-600 truncate">
                        Grade: {svProf.grade}
                      </div>
                    )}
                  </div>
                </div>

                {/* Confirm & Save Match (+ immediate Official Grade Sync if transient session is open) */}
                <div className="pt-2 border-t border-slate-200/70 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-600">
                      {justSaved
                        ? `Match saved for ${studentName}.`
                        : 'Save this StudentVUE student link for official grade sync.'}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        data-testid="confirm-save-studentvue-match"
                        onClick={() => {
                          const saved = saveLinkedStudentVueProfile(studentId, {
                            confirmedAt: new Date().toISOString(),
                            districtDomain,
                            isParent,
                            apiServerUrl,
                            studentName: svProf.name,
                            permId: svProf.permId,
                            school: svProf.school,
                            grade: svProf.grade,
                            agu: svProf.agu,
                            confidence: cmp.confidence,
                            matched: cmp.matched,
                          });
                          setSavedLink(saved);
                          setJustSaved(true);
                          onLinkSaved?.(saved);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer inline-flex items-center gap-1.5 ${
                          justSaved
                            ? 'bg-emerald-600 text-white'
                            : cmp.matched
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                            : 'bg-amber-600 hover:bg-amber-700 text-white shadow-2xs'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {justSaved
                          ? 'Match Saved'
                          : cmp.matched
                          ? 'Confirm & Save Match'
                          : 'Confirm & Save Selection'}
                      </button>

                      {outcome.transientSession && onGradesSynced && (
                        <button
                          type="button"
                          disabled={isSyncingGrades}
                          data-testid="save-match-and-sync-grades"
                          onClick={async () => {
                            const saved = saveLinkedStudentVueProfile(studentId, {
                              confirmedAt: new Date().toISOString(),
                              districtDomain,
                              isParent,
                              apiServerUrl,
                              studentName: svProf.name,
                              permId: svProf.permId,
                              school: svProf.school,
                              grade: svProf.grade,
                              agu: svProf.agu,
                              confidence: cmp.confidence,
                              matched: cmp.matched,
                            });
                            setSavedLink(saved);
                            setJustSaved(true);
                            onLinkSaved?.(saved);

                            setIsSyncingGrades(true);
                            setGradeSyncMessage(null);
                            try {
                              const res = await fetchSynergyGradebookWithSession({
                                ...outcome.transientSession!,
                                districtDomain,
                                isParent,
                                agu: svProf.agu,
                                permId: svProf.permId,
                                studentName: svProf.name,
                              });
                              if (!res.ok) {
                                setGradeSyncMessage({
                                  ok: false,
                                  text: 'error' in res ? res.error : 'Failed to sync grades.',
                                });
                              } else {
                                const persisted = saveStudentVueGrades(studentId, res.snapshot);
                                onGradesSynced(persisted);
                                setGradeSyncMessage({
                                  ok: true,
                                  text: `Synced ${persisted.courses.length} course(s)${
                                    persisted.reportingPeriodName ? ` (${persisted.reportingPeriodName})` : ''
                                  }.`,
                                });
                              }
                            } finally {
                              setIsSyncingGrades(false);
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white shadow-2xs transition cursor-pointer inline-flex items-center gap-1.5"
                        >
                          {isSyncingGrades ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Syncing Grades...
                            </>
                          ) : (
                            'Save Match & Sync Grades'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  {gradeSyncMessage && (
                    <div
                      className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                        gradeSyncMessage.ok
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      {gradeSyncMessage.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verify Account Match
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
