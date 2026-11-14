import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  verifyStudentVueAccount,
  StudentVueVerifyOutcome,
} from '../../services/studentvue';
import { logger } from '../../services/logger';

interface StudentVueVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  canvasDomain?: string;
  canvasToken?: string;
  useProxy?: boolean;
}

const DEFAULT_API_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SCHOOLVIEW_API_URL) ||
  'http://localhost:8080';

export const StudentVueVerifyModal: React.FC<StudentVueVerifyModalProps> = ({
  isOpen,
  onClose,
  studentName,
  canvasDomain = '',
  canvasToken = '',
  useProxy = true,
}) => {
  // Strictly transient in-memory state — never persisted to localStorage or any server
  const [edupointUsername, setEdupointUsername] = useState('');
  const [edupointPassword, setEdupointPassword] = useState('');
  const [districtDomain, setDistrictDomain] = useState('');
  const [isParent, setIsParent] = useState(false);

  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiServerUrl, setApiServerUrl] = useState(DEFAULT_API_URL);
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');

  const [isVerifying, setIsVerifying] = useState(false);
  const [outcome, setOutcome] = useState<StudentVueVerifyOutcome | null>(null);

  // Clear all transient secrets whenever the modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      setEdupointUsername('');
      setEdupointPassword('');
      setApiPassword('');
      setOutcome(null);
      setIsVerifying(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      setEdupointUsername('');
      setEdupointPassword('');
      setApiPassword('');
    };
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return;

    setIsVerifying(true);
    setOutcome(null);

    try {
      const result = await verifyStudentVueAccount({
        apiServerUrl,
        apiUsername,
        apiPassword,
        districtDomain,
        edupointUsername,
        edupointPassword,
        isParent,
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
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden text-left max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Verify StudentVUE Account</h3>
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
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 leading-relaxed">
            <strong>Transient only:</strong> Your StudentVUE username and password are never saved on any server or browser storage. They are only used in memory to verify your profile against Canvas.
          </div>

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

          {/* District Domain */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              District Synergy Domain
            </label>
            <div className="relative">
              <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="e.g. md-mcps-psv.edupoint.com or portal.sfusd.edu"
                value={districtDomain}
                onChange={(e) => setDistrictDomain(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                required
              />
            </div>
          </div>

          {/* Edupoint Username & Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isParent ? 'ParentVUE' : 'StudentVUE'} Username
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
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isParent ? 'ParentVUE' : 'StudentVUE'} Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Password (transient)"
                  value={edupointPassword}
                  onChange={(e) => setEdupointPassword(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  required
                />
              </div>
            </div>
          </div>

          {/* API Server Connection Section */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowApiConfig(!showApiConfig)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                StudentVUE API Server ({apiServerUrl})
              </span>
              {showApiConfig ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {(showApiConfig || !apiUsername || !apiPassword) && (
              <div className="p-3.5 space-y-3 border-t border-slate-200 bg-white">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    API Server URL
                  </label>
                  <input
                    type="url"
                    placeholder="http://localhost:8080"
                    value={apiServerUrl}
                    onChange={(e) => setApiServerUrl(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:outline-hidden focus:border-indigo-500 font-mono"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      API Username
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      placeholder="e.g. alice"
                      value={apiUsername}
                      onChange={(e) => setApiUsername(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:outline-hidden focus:border-indigo-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      API Password
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder="API user password"
                      value={apiPassword}
                      onChange={(e) => setApiPassword(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:outline-hidden focus:border-indigo-500"
                      required
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Outcome Display */}
          {outcome && !outcome.ok && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Verification Failed ({outcome.stage})</span>
              </div>
              <p className="text-[11px] text-red-700 leading-relaxed">{outcome.error}</p>
            </div>
          )}

          {outcome && outcome.ok && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                outcome.comparison.matched
                  ? 'bg-emerald-50/80 border-emerald-200'
                  : 'bg-amber-50/80 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {outcome.comparison.matched ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    {outcome.comparison.matched
                      ? `Accounts Match (${outcome.comparison.confidence} confidence)`
                      : 'Account Mismatch Detected'}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {outcome.comparison.matchReasons.join(' • ') ||
                      outcome.comparison.mismatchReasons.join(' • ')}
                  </div>
                </div>
              </div>

              {outcome.comparison.mismatchReasons.length > 0 && outcome.comparison.matched && (
                <div className="text-[11px] text-amber-800 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{outcome.comparison.mismatchReasons.join(' • ')}</span>
                </div>
              )}

              {outcome.comparison.warnings.length > 0 && (
                <div className="text-[11px] text-slate-600 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{outcome.comparison.warnings.join(' ')}</span>
                </div>
              )}

              {/* Side-by-side profile details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/70 text-[11px]">
                <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/70 space-y-1">
                  <div className="font-bold text-slate-700">Canvas Profile</div>
                  <div className="text-slate-600 truncate">
                    Name: {outcome.comparison.canvasProfile.name || '—'}
                  </div>
                  <div className="text-slate-600 truncate">
                    ID: {outcome.comparison.canvasProfile.sisUserId || outcome.comparison.canvasProfile.loginId || '—'}
                  </div>
                  <div className="text-slate-600 truncate">
                    Email: {outcome.comparison.canvasProfile.email || '—'}
                  </div>
                </div>
                <div className="bg-white/80 rounded-lg p-2.5 border border-slate-200/70 space-y-1">
                  <div className="font-bold text-slate-700">StudentVUE Profile</div>
                  <div className="text-slate-600 truncate">
                    Name: {outcome.comparison.studentVueProfile.name || '—'}
                  </div>
                  <div className="text-slate-600 truncate">
                    PermID: {outcome.comparison.studentVueProfile.permId || '—'}
                  </div>
                  <div className="text-slate-600 truncate">
                    School: {outcome.comparison.studentVueProfile.school || '—'}
                  </div>
                </div>
              </div>
            </div>
          )}

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
