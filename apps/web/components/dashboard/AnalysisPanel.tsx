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
  HelpCircle,
  Edit3
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

const CUSTOM_GOAL_ID = 'custom-goal';

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, analyzing, onAnalyze }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('modules-exams');
  
  // Custom goal prompt (when custom goal preset is chosen)
  const [customGoalPrompt, setCustomGoalPrompt] = useState<string>('');

  // General user formatting / tone instructions (saved in settings)
  const [generalInstructions, setGeneralInstructions] = useState<string>(() => {
    return localStorage.getItem('velm_ai_general_instructions') || '';
  });

  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [copied, setCopied] = useState(false);

  const activePreset = TACTICAL_PROMPTS.find(p => p.id === selectedPresetId);

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
  };

  const handleRunAnalysis = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsCollapsed(false);

    let goalPrompt = '';
    if (selectedPresetId === CUSTOM_GOAL_ID) {
      goalPrompt = customGoalPrompt.trim()
        ? `TACTICAL FOCUS & USER GOAL:\n${customGoalPrompt.trim()}`
        : 'Analyze upcoming assignments and current course grades to provide actionable study recommendations.';
    } else if (activePreset) {
      goalPrompt = activePreset.prompt;
    } else {
      goalPrompt = TACTICAL_PROMPTS[0].prompt;
    }

    const fullInstructions = generalInstructions.trim()
      ? `${goalPrompt}\n\nUSER FORMATTING & STYLE INSTRUCTIONS:\n${generalInstructions.trim()}`
      : goalPrompt;

    onAnalyze(fullInstructions, selectedModel);
  };

  const handleCopyReport = async () => {
    if (!analysis) return;
    try {
      const plainText = analysis.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
        return <Sparkles className={className} />;
      case CUSTOM_GOAL_ID:
        return <Edit3 className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  // Render Collapsed: Only the expando button, no action button
  if (isCollapsed) {
    return (
      <div 
        onClick={() => setIsCollapsed(false)}
        className="mb-3 w-fit inline-flex max-w-full bg-gradient-to-r from-indigo-50/80 to-purple-50/80 hover:from-indigo-100/80 hover:to-purple-100/80 rounded-xl px-3 py-1.5 border border-indigo-200/80 shadow-2xs transition-all items-center gap-2.5 cursor-pointer group select-none"
        title="Click to expand AI Academic Advisor"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-indigo-600 p-1 rounded-md text-white shrink-0">
            <BrainCircuit className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <h4 className="text-xs font-bold text-indigo-950 group-hover:text-indigo-700 transition-colors shrink-0">AI Advisor</h4>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-indigo-800 bg-indigo-100/70 px-1.5 py-0.5 rounded border border-indigo-200/60 truncate">
              {getPresetIcon(selectedPresetId, "w-3 h-3 text-indigo-600")}
              {selectedPresetId === CUSTOM_GOAL_ID ? 'Custom Goal' : (activePreset?.shortLabel || 'Advisor')}
            </span>
            <span className="hidden md:inline text-[11px] text-slate-500 truncate">
              {analysis ? '· Report ready' : '· Click to expand'}
            </span>
          </div>
        </div>

        {/* Expando button only */}
        <div className="p-1 text-indigo-500 group-hover:text-indigo-700 transition">
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
    );
  }

  // Render Expanded View
  return (
    <div className="mb-5 bg-gradient-to-r from-indigo-50/90 via-purple-50/60 to-slate-50/80 rounded-xl p-4 border border-indigo-100 shadow-xs transition-all duration-300">
      {/* Top Header: Title on left with (?), Collapse button on top-right */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-2xs text-white shrink-0">
            <BrainCircuit className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-indigo-950">AI Academic Advisor</h3>
              <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200">
                Gemini
              </span>
              
              {/* Help (?) Button replaces repetitive explanatory text */}
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className={`p-1 rounded-full transition cursor-pointer ${
                  showHelp ? 'bg-indigo-200 text-indigo-800' : 'text-slate-400 hover:text-indigo-700 hover:bg-indigo-100/70'
                }`}
                title="What does the AI Advisor do?"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        
        {/* Right Action Bar: Settings, Run Button, and Top-Right Collapse Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg transition border cursor-pointer ${
              showSettings 
                ? 'bg-indigo-100 border-indigo-300 text-indigo-700' 
                : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50'
            }`}
            title="General Instructions & AI Model Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          
          <button 
            type="button"
            onClick={(e) => handleRunAnalysis(e)}
            disabled={analyzing}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer ${
              analyzing 
                ? 'bg-white text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700'
            }`}
            title="Run analysis with active goal"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <Star className="w-3.5 h-3.5 text-amber-300 fill-current" />
                <span>Run {selectedPresetId === CUSTOM_GOAL_ID ? 'Custom Goal' : (activePreset?.shortLabel || 'Analysis')}</span>
              </>
            )}
          </button>

          {/* Prominent Collapse Button in Top-Right Corner */}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-700 hover:bg-white border border-slate-200 transition cursor-pointer"
            title="Collapse AI Advisor"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Help Passage: Pops up cleanly when (?) button is clicked */}
      {showHelp && (
        <div className="mb-3.5 p-3 bg-white/95 rounded-xl border border-indigo-200 shadow-2xs text-xs text-slate-600 leading-relaxed animate-fadeIn">
          <p className="font-semibold text-indigo-950 mb-1">About the AI Academic Advisor:</p>
          <p>
            The Advisor connects directly to your visible Canvas LMS data. It links lecture slides, study guides, and module pages to upcoming assignments and exams, pinpoints high-impact tasks to rescue low grades, reviews teacher feedback for corrections, and paces out a realistic study plan.
          </p>
        </div>
      )}

      {/* Focus Area & Presets Grid (with Custom Goal option at bottom of list) */}
      <div className="mb-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {TACTICAL_PROMPTS.map((preset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white/80 hover:bg-white border-indigo-100 hover:border-indigo-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className={`p-1 rounded-md shrink-0 ${
                    isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                  }`}>
                    {getPresetIcon(preset.id)}
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded truncate ${
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

          {/* Custom Goal Card at the bottom/end of the presets list */}
          <button
            type="button"
            onClick={() => handleSelectPreset(CUSTOM_GOAL_ID)}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between group ${
              selectedPresetId === CUSTOM_GOAL_ID
                ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                : 'bg-white/80 hover:bg-white border-indigo-100 hover:border-indigo-300 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <div className={`p-1 rounded-md shrink-0 ${
                selectedPresetId === CUSTOM_GOAL_ID ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600'
              }`}>
                <Edit3 className="w-3.5 h-3.5" />
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded truncate ${
                selectedPresetId === CUSTOM_GOAL_ID ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                Custom
              </span>
            </div>
            <div>
              <div className={`text-xs font-bold leading-tight ${selectedPresetId === CUSTOM_GOAL_ID ? 'text-indigo-950' : 'text-slate-800'}`}>
                Custom Goal
              </div>
              <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Enter your own custom question, topic, or analysis target.
              </p>
            </div>
          </button>
        </div>

        {/* When Custom Goal is selected, open freeform prompt entry right below */}
        {selectedPresetId === CUSTOM_GOAL_ID && (
          <div className="mt-2.5 p-3 bg-white rounded-xl border border-indigo-200 shadow-2xs space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                Custom Analysis Goal
              </label>
              <span className="text-[11px] text-slate-400">Target a specific topic or question</span>
            </div>
            <textarea
              value={customGoalPrompt}
              onChange={(e) => setCustomGoalPrompt(e.target.value)}
              placeholder="e.g. 'What slides should I study for Unit 3 chemistry lab?' or 'Review my Spanish essay rubric and outline corrections.'"
              className="w-full h-20 p-2 text-xs border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-800"
            />
          </div>
        )}
      </div>

      {/* Settings Drawer: General Instructions (Voice/Format) & Model Configuration */}
      {showSettings && (
        <div className="mb-4 animate-fadeIn bg-white p-4 rounded-xl border border-indigo-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
              Advisor Settings: Output Style & Model
            </h4>
            <span className="text-[11px] text-slate-400">
              Persistent style instructions applied to all reports
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
                Gemini 3.8 Flash delivers fast, high-reasoning academic insights.
              </p>
            </div>

            {/* General Custom Instructions (Tone, Formatting, Bullet lists) */}
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-indigo-800 uppercase tracking-wide">
                  General Instructions (Tone, Style & Formatting)
                </label>
                <span className="text-[10px] text-slate-400">Saved automatically</span>
              </div>
              <textarea
                value={generalInstructions}
                onChange={(e) => {
                  setGeneralInstructions(e.target.value);
                  localStorage.setItem('velm_ai_general_instructions', e.target.value);
                }}
                placeholder="e.g. 'Format answers as concise bulleted checklists. Keep tone direct and encouraging. Always bold upcoming deadlines.'"
                className="w-full h-20 p-2.5 text-xs border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white resize-none text-slate-800"
                title="General formatting instructions for AI reports"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                These personal preferences guide how reports are written across every preset.
              </p>
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
                {selectedPresetId === CUSTOM_GOAL_ID ? 'Custom Goal' : (activePreset?.shortLabel || 'Analysis')}
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
                onClick={(e) => handleRunAnalysis(e)}
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
