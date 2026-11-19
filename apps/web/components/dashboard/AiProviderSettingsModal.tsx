import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Cpu,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Sparkles,
  Server,
  Globe,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  isErr,
  type DiscoveredLocalProvider,
  type LlmProviderConfig,
  type PrivacyTier,
  type ProviderPreset,
} from '@velm/core';
import {
  getLocalBackend,
  getLlmMinimizeStudentData,
  getSavedLlmConfig,
  saveLlmConfig,
  setLlmMinimizeStudentData,
} from '../../services/backend';

interface AiProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: LlmProviderConfig | null) => void;
}

const GROUP_LABELS: Record<ProviderPreset['group'], string> = {
  'local-server': 'On-Device Local AI Servers (100% Private)',
  'browser-builtin': 'On-Device Browser Built-in AI',
  'byo-key': 'Well-Known Cloud Providers (Bring Your Own Key)',
  'free-key-tier': 'Reputable Free-Tier Cloud Endpoints (Free Key Required)',
  'keyless-public': 'Keyless Public Endpoints',
  custom: 'Custom OpenAI-Compatible Server',
};

const GROUP_ORDER: ProviderPreset['group'][] = [
  'local-server',
  'browser-builtin',
  'byo-key',
  'free-key-tier',
  'custom',
  'keyless-public',
];

function getPrivacyBadge(privacy: PrivacyTier): { label: string; className: string } {
  switch (privacy) {
    case 'local':
      return {
        label: 'Local · Data stays on device',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'paid-no-training':
      return {
        label: 'Cloud BYO Key · Commercial API',
        className: 'bg-sky-100 text-sky-800 border-sky-200',
      };
    case 'free-tier-may-train':
      return {
        label: 'Free Tier · May train on prompts',
        className: 'bg-amber-100 text-amber-900 border-amber-200',
      };
    default:
      return {
        label: 'Custom · Check server privacy',
        className: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}

export const AiProviderSettingsModal: React.FC<AiProviderSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const backend = getLocalBackend();
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [hasSavedSecret, setHasSavedSecret] = useState<boolean>(false);
  const [minimizeStudentData, setMinimizeStudentData] = useState<boolean>(() =>
    getLlmMinimizeStudentData()
  );

  const [discovering, setDiscovering] = useState<boolean>(false);
  const [discovered, setDiscovered] = useState<DiscoveredLocalProvider[]>([]);
  const [testing, setTesting] = useState<boolean>(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

  // Load presets + saved configuration when modal opens
  useEffect(() => {
    if (!isOpen || !backend) return;
    let cancelled = false;
    setStatusMessage(null);
    setAvailableModels([]);
    setApiKeyInput('');

    backend.llm.listPresets().then(async (list) => {
      if (cancelled) return;
      setPresets(list);
      const saved = getSavedLlmConfig();
      const initialPreset =
        (saved && list.find((p) => p.id === saved.id)) || list[0] || null;
      if (initialPreset) {
        setSelectedPresetId(initialPreset.id);
        setBaseUrl(saved?.id === initialPreset.id ? (saved.baseUrl ?? initialPreset.baseUrl ?? '') : (initialPreset.baseUrl ?? ''));
        setModel(saved?.id === initialPreset.id ? saved.model : initialPreset.defaultModel);
        if (initialPreset.authType !== 'none') {
          const exists = await backend.secrets.has(`llm:${initialPreset.id}`);
          if (!cancelled) setHasSavedSecret(exists);
        } else {
          setHasSavedSecret(false);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, backend]);

  const handleSelectPreset = async (preset: ProviderPreset) => {
    setSelectedPresetId(preset.id);
    setBaseUrl(preset.baseUrl ?? '');
    setModel(preset.defaultModel);
    setApiKeyInput('');
    setAvailableModels([]);
    setStatusMessage(null);
    if (backend && preset.authType !== 'none') {
      const exists = await backend.secrets.has(`llm:${preset.id}`);
      setHasSavedSecret(exists);
    } else {
      setHasSavedSecret(false);
    }
  };

  const buildCurrentConfig = (): LlmProviderConfig | null => {
    if (!selectedPreset) return null;
    const secretRef = `llm:${selectedPreset.id}`;
    const auth: LlmProviderConfig['auth'] =
      selectedPreset.authType === 'none'
        ? { type: 'none' }
        : selectedPreset.authType === 'apiKey'
          ? { type: 'apiKey', secretRef }
          : { type: 'bearer', secretRef };

    return {
      id: selectedPreset.id,
      kind: selectedPreset.kind,
      label: selectedPreset.label,
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      auth,
      model: model.trim() || selectedPreset.defaultModel,
      ...(selectedPreset.fallbackModels ? { fallbackModels: [...selectedPreset.fallbackModels] } : {}),
      privacy: selectedPreset.privacy,
      ...(selectedPreset.privacyUnfriendly ? { privacyUnfriendly: true } : {}),
    };
  };

  const handleDiscoverLocal = async () => {
    if (!backend) return;
    setDiscovering(true);
    setStatusMessage(null);
    try {
      const found = await backend.llm.discoverLocal();
      setDiscovered(found);
      if (found.length === 0) {
        setStatusMessage({
          ok: false,
          text: 'No local AI servers detected on localhost (checked Ollama, LM Studio, llama.cpp, Jan). Start one and try again.',
        });
      } else {
        setStatusMessage({
          ok: true,
          text: `Detected ${found.length} local AI server${found.length > 1 ? 's' : ''}! Click one below to select it.`,
        });
      }
    } finally {
      setDiscovering(false);
    }
  };

  const handleApplyDiscovered = (item: DiscoveredLocalProvider) => {
    setSelectedPresetId(item.presetId);
    setBaseUrl(item.baseUrl);
    setAvailableModels([...item.models]);
    if (item.models.length > 0) {
      setModel(item.models[0]);
    }
    setHasSavedSecret(false);
    setStatusMessage({
      ok: true,
      text: `Selected ${item.label} (${item.models.length} model${item.models.length === 1 ? '' : 's'} available). Click Save Provider to activate.`,
    });
  };

  const persistPendingSecretIfAny = async (): Promise<void> => {
    if (!backend || !selectedPreset || selectedPreset.authType === 'none') return;
    if (apiKeyInput.trim()) {
      await backend.secrets.set(`llm:${selectedPreset.id}`, apiKeyInput.trim());
      setHasSavedSecret(true);
      setApiKeyInput('');
    }
  };

  const handleTestConnection = async () => {
    if (!backend) return;
    const config = buildCurrentConfig();
    if (!config) return;
    setTesting(true);
    setStatusMessage(null);
    try {
      await persistPendingSecretIfAny();
      const res = await backend.llm.test(config);
      if (isErr(res)) {
        setStatusMessage({ ok: false, text: res.error.message });
      } else {
        const models = res.data.models;
        setAvailableModels(models);
        if (models.length > 0 && !models.includes(model.trim())) {
          setModel(models[0]);
        }
        setStatusMessage({
          ok: true,
          text:
            models.length > 0
              ? `Connection successful! Found ${models.length} model${models.length === 1 ? '' : 's'}.`
              : 'Connection successful!',
        });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backend) return;
    const config = buildCurrentConfig();
    if (!config) return;
    setSaving(true);
    try {
      await persistPendingSecretIfAny();
      saveLlmConfig(config);
      setLlmMinimizeStudentData(minimizeStudentData);
      onConfigSaved?.(config);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSavedKey = async () => {
    if (!backend || !selectedPreset) return;
    await backend.secrets.del(`llm:${selectedPreset.id}`);
    setHasSavedSecret(false);
    setApiKeyInput('');
    setStatusMessage({ ok: true, text: 'Removed saved API key from local secret store.' });
  };

  const handleClearProvider = () => {
    saveLlmConfig(null);
    onConfigSaved?.(null);
    onClose();
  };

  if (!isOpen || !backend) return null;

  const groupedPresets = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: presets.filter((p) => p.group === group),
  })).filter((g) => g.items.length > 0);

  const hasLocalServerPresets = presets.some((p) => p.group === 'local-server');
  const privacyBadge = selectedPreset ? getPrivacyBadge(selectedPreset.privacy) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-indigo-50/80 to-purple-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">AI Provider Settings</h3>
              <p className="text-[11px] text-slate-600">
                Connect a local AI server or your own API key — Velm never proxies your keys through a third-party server.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white transition cursor-pointer"
            aria-label="Close AI Provider Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4">
          {/* Local Discovery Bar (Desktop) */}
          {hasLocalServerPresets && (
            <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-emerald-950 font-semibold">
                  <Server className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Running Ollama, LM Studio, llama.cpp, or Jan on this machine?</span>
                </div>
                <button
                  type="button"
                  onClick={handleDiscoverLocal}
                  disabled={discovering}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 shrink-0"
                >
                  {discovering ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Detect Local AI</span>
                </button>
              </div>
              {discovered.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {discovered.map((item) => (
                    <button
                      key={item.presetId}
                      type="button"
                      onClick={() => handleApplyDiscovered(item)}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 hover:border-emerald-500 text-xs text-emerald-900 font-medium flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{item.label}</span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 rounded">
                        {item.models.length} model{item.models.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Provider Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              AI Provider
            </label>
            <select
              value={selectedPresetId}
              onChange={(e) => {
                const found = presets.find((p) => p.id === e.target.value);
                if (found) void handleSelectPreset(found);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              {groupedPresets.map((group) => (
                <optgroup key={group.group} label={group.label}>
                  {group.items.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedPreset && privacyBadge && (
              <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${privacyBadge.className}`}
                  >
                    {selectedPreset.privacy === 'local' ? (
                      <ShieldCheck className="w-3 h-3" />
                    ) : (
                      <ShieldAlert className="w-3 h-3" />
                    )}
                    {privacyBadge.label}
                  </span>
                  <span className="text-[11px] text-slate-600">{selectedPreset.description}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {selectedPreset.privacyNotice}
                </p>
              </div>
            )}
          </div>

          {/* Endpoint URL + Model */}
          {selectedPreset && selectedPreset.kind !== 'chrome-builtin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Endpoint Base URL
                </label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-hidden focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Model ID
                </label>
                {availableModels.length > 0 ? (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono focus:outline-hidden focus:border-indigo-500"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={selectedPreset.defaultModel}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-hidden focus:border-indigo-500"
                    required
                  />
                )}
              </div>
            </div>
          )}

          {/* API Key (stored in OS keychain / encrypted store, never localStorage) */}
          {selectedPreset && selectedPreset.authType !== 'none' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                  <span>API Key</span>
                </label>
                {hasSavedSecret && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Saved in local secret store
                    </span>
                    <button
                      type="button"
                      onClick={handleDeleteSavedKey}
                      className="text-[11px] text-red-600 hover:text-red-700 font-medium flex items-center gap-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    hasSavedSecret
                      ? 'Leave blank to keep saved key, or paste a new key to replace it'
                      : 'Paste your API key (stored encrypted on this device)'
                  }
                  className="w-full text-xs pl-3 pr-9 py-2 rounded-xl border border-slate-300 font-mono focus:outline-hidden focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((prev) => !prev)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Minimize Student Data Toggle */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={minimizeStudentData}
              onChange={(e) => setMinimizeStudentData(e.target.checked)}
              className="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="text-xs">
              <div className="font-bold text-indigo-950">
                Minimize student data sent to cloud AI (Recommended)
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Automatically redacts email addresses and student identifiers before sending prompts to non-local cloud providers.
              </p>
            </div>
          </label>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                statusMessage.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {statusMessage.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !selectedPreset}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
              >
                {testing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>Test Connection</span>
              </button>

              {getSavedLlmConfig() && (
                <button
                  type="button"
                  onClick={handleClearProvider}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
                >
                  Disable AI
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !selectedPreset}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition cursor-pointer disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Provider'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
