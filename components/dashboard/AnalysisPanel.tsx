import React, { useState } from 'react';
import { 
  BrainCircuit, 
  Star, 
  Settings2, 
  ChevronUp, 
  ChevronDown, 
  Cpu, 
  BookOpen, 
  TrendingUp, 
  MessageSquare, 
  CalendarDays, 
  Sparkles, 
  Copy, 
  Check, 
  RotateCcw, 
  Loader2, 
  ExternalLink 
} from 'lucide-react';
import { TACTICAL_PROMPTS, TacticalPromptOption } from '../../services/gemini';

interface AnalysisPanelProps {
  analysis: string | null;
  analyzing: boolean;
  onAnalyze: (customInstructions?: string, model?: string) => void;
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Recommended)' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (Fast)' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Deep Reasoning)' },
];

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, analyzing, onAnalyze }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('modules-exams');
  const [customInstructions, setCustomInstructions] = useState<string>(() => {
    const defaultPreset = TACTICAL_PROMPTS.find(p => p.id === 'modules-exams') || TACTICAL_PROMPTS[0];
    return defaultPreset ? defaultPreset.prompt : '';
  });
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [copied, setCopied] = useState(false);

  const activePreset = TACTICAL_PROMPTS.find(p => p.id === selectedPresetId) || TACTICAL_PROMPTS[0];

  const handleSelectPreset = (preset: TacticalPromptOption) => {
    setSelectedPresetId(preset.id);
    setCustomInstructions(preset.prompt);
  };

  const handleAnalyzeClick = (e?: React.MouseEvent, overridePrompt?: string) => {
    if (e) e.stopPropagation();
    setIsCollapsed(false);
    const promptToUse = overridePrompt !== undefined ? overridePrompt : customInstructions;
    onAnalyze(promptToUse, selectedModel);
  };

  const handleCopyReport = async () => {
    if (!analysis) return;
    try {
      // Strip basic HTML tags for plain text copying
      const plainText = analysis.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const getPresetIcon = (id: string, className = "w-3.5 h-3.5") => {
    switch (id) {
      case 'modules-exams':
        return <BookOpen className={className} />;
      case 'grade-impact':
        return <TrendingUp className={className} />;
      case 'teacher-feedback':
        return <MessageSquare className={className} />;
      case 'study-plan-7day':
        return <CalendarDays className={className} />;
      case 'workload-overview':
      default:
        return <Sparkles className={className} />;
    }
  };

  if (isCollapsed) {
    return (
      <div 
        onClick={() => setIsCollapsed(false)}
        className="mb-3 w-fit inline-flex max-w-full bg-gradient-to-r from-indigo-50/80 to-purple-50/80 hover:from-indigo-100/80 hover:to-purple-100/80 rounded-xl px-3 py-1.5 border border-indigo-200/80 shadow-2xs transition-all items-center gap-2.5 cursor-pointer group"
        title="Click to expand AI Tactical Advisor"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-indigo-600 p-1 rounded-md text-white shrink-0">
            <BrainCircuit className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-xs font-bold text-indigo-950 group-hover:text-indigo-700 transition-colors shrink-0">AI Advisor</h4>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-indigo-800 bg-indigo-100/70 px-1.5 py-0.5 rounded border border-indigo-200/60 truncate">
              {getPresetIcon(activePreset.id, "w-3 h-3 text-indigo-600")}
              {activePreset.shortLabel}
            </span>
            <span className="hidden md:inline text-[11px] text-slate-500 truncate">
              {analysis ? '· Report ready' : '· Click to expand'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            type="button"
            onClick={(e) => handleAnalyzeClick(e)}
            disabled={analyzing}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 ${
              analyzing 
                ? 'bg-white text-slate-400 cursor-not-allowed' 
                : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200/80 cursor-pointer'
            }`}
          >
            {analyzing ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <span>{analysis ? 'Re-analyze' : 'Analyze'}</span>
                <Star className="w-3 h-3 text-amber-500 fill-current" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(false);
            }}
            className="p-1 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/60 transition cursor-pointer"
            title="Expand section"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 bg-gradient-to-r from-indigo-50/90 via-purple-50/60 to-slate-50/80 rounded-xl p-4 border border-indigo-100 shadow-xs transition-all duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-2xs text-white shrink-0">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-indigo-950">AI Academic Advisor & Tactical Analyzer</h3>
              <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
                Gemini Powered
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Tactical problem solving: link module resources to assignments & exams, triage grades, and schedule prep.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg transition border cursor-pointer ${
              showSettings 
                ? 'bg-indigo-100 border-indigo-300 text-indigo-700' 
                : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
            }`}
            title="Prompt & Model Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          
          <button 
            type="button"
            onClick={(e) => handleAnalyzeClick(e)}
            disabled={analyzing}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer ${
              analyzing 
                ? 'bg-white text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700'
            }`}
            title="Run analysis with active tactical preset"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Analyzing Workload...</span>
              </>
            ) : (
              <>
                <Star className="w-3.5 h-3.5 text-amber-300 fill-current" />
                <span>Run {activePreset.shortLabel}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/60 transition cursor-pointer"
            title="Collapse AI Analysis"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tactical Prompt Presets Selector */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-600" />
            Tactical Problem Solving Presets
          </label>
          <span className="text-[11px] text-slate-500">
            Click any tactical option to focus analysis
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {TACTICAL_PROMPTS.map((preset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white/80 hover:bg-white border-indigo-100 hover:border-indigo-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className={`p-1 rounded-md shrink-0 ${
                    isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                  }`}>
                    {getPresetIcon(preset.id)}
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {preset.badge}
                  </span>
                </div>
                <div>
                  <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-indigo-950' : 'text-slate-800'}`}>
                    {preset.shortLabel}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Preset Info Banner */}
        <div className="mt-2.5 p-2.5 bg-white/70 rounded-lg border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-indigo-900 shrink-0">Active Focus:</span>
            <span className="font-semibold text-slate-800 truncate">{activePreset.title}</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => handleAnalyzeClick(undefined, activePreset.prompt)}
              disabled={analyzing}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset custom notes to preset
            </button>
          </div>
        </div>
      </div>

      {/* Settings Drawer (Model selection & Prompt Editor) */}
      {showSettings && (
        <div className="mb-4 animate-fadeIn bg-white p-4 rounded-xl border border-indigo-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
              Custom Instructions & Model Configuration
            </h4>
            <span className="text-[11px] text-slate-400">
              Personalize prompt instructions or change LLM model
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Model Selection */}
            <div>
              <label className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Cpu className="w-3 h-3" /> AI Model Version
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full p-2 text-xs border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-700"
                title="Select the AI model for analysis"
              >
                {AVAILABLE_MODELS.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                Gemini 3.8 Flash delivers instant, high-reasoning academic insights.
              </p>
            </div>

            {/* Custom Instructions */}
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-indigo-800 uppercase tracking-wide">
                  Prompt Directives & Tactical Goals
                </label>
                <button 
                  type="button"
                  onClick={() => setCustomInstructions(activePreset.prompt)} 
                  className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                  title="Reset instructions to current preset text"
                >
                  Reset to {activePreset.shortLabel}
                </button>
              </div>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Enter tactical instructions or specific topics (e.g. 'Link Chemistry Chapter 4 slides to homework')."
                className="w-full h-24 p-2.5 text-xs font-mono border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white resize-none text-slate-800"
                title="Enter custom instructions for the AI"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Generated Analysis Report Container */}
      {analysis && (
        <div className="bg-white p-5 rounded-xl shadow-xs border border-indigo-100 animate-fadeIn relative">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 rounded-l-xl" />
          
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                Academic Action Report
              </span>
              <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200/60">
                {activePreset.shortLabel}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyReport}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition flex items-center gap-1 cursor-pointer"
                title="Copy report text to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={(e) => handleAnalyzeClick(e)}
                disabled={analyzing}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition flex items-center gap-1 cursor-pointer"
                title="Re-run analysis"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Re-run</span>
              </button>
            </div>
          </div>

          <div 
            className="prose prose-sm prose-indigo max-w-none text-slate-800 leading-relaxed [&_a]:text-indigo-600 [&_a]:font-semibold [&_a]:underline [&_a:hover]:text-indigo-800 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_h3]:text-indigo-950 [&_h3]:font-bold [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-slate-900 [&_h4]:font-semibold"
            dangerouslySetInnerHTML={{ __html: analysis }}
          />
        </div>
      )}
    </div>
  );
};
