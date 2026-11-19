import React, { useState } from 'react';
import { ShieldCheck, Lock, HardDrive, AlertTriangle } from 'lucide-react';
import { isLocalRuntime } from '../services/backend';

const FIRST_RUN_ACK_KEY = 'velm_local_first_run_ack_v1';

export const LocalFirstRunModal: React.FC = () => {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (!isLocalRuntime()) return true;
    try {
      return localStorage.getItem(FIRST_RUN_ACK_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (acknowledged || !isLocalRuntime()) {
    return null;
  }

  const handleConfirm = () => {
    try {
      localStorage.setItem(FIRST_RUN_ACK_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setAcknowledged(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-emerald-50 border-b border-slate-200 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Welcome to Velm (Local Edition)</h2>
            <p className="text-xs text-slate-600">
              Please review how Velm handles your school data before continuing.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-xs text-slate-700 leading-relaxed">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">100% Local — Zero Velm Cloud Servers</p>
              <p className="mt-0.5 text-slate-600">
                Velm runs exclusively on your device. Your Canvas token and StudentVUE / ParentVUE
                credentials are sent only over HTTPS directly to your school district&apos;s own servers.
                Velm is an independent open-source tool and is not affiliated with Instructure or Edupoint.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">Unsigned Community Build</p>
              <p className="mt-0.5 text-slate-600">
                This release is not yet code-signed by Apple or Microsoft. Only install Velm from the
                official GitHub Releases page and verify the <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">SHA256SUMS.txt</code> checksum.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <HardDrive className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-900">Your Data &amp; Optional AI</p>
              <p className="mt-0.5 text-slate-600">
                All cached assignments, grades, and encrypted API keys stay in your local app profile
                and can be wiped at any time. AI features are off by default until you connect a local
                model (Ollama / LM Studio) or your own API key.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            I Understand — Continue to Velm
          </button>
        </div>
      </div>
    </div>
  );
};
