
import React, { useState } from 'react';
import { BrainCircuit, Star, Settings2, ChevronUp, ChevronDown, Cpu } from 'lucide-react';

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
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');

  const handleAnalyzeClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsCollapsed(false);
    onAnalyze(customInstructions, selectedModel);
  };

  if (isCollapsed) {
    return (
      <div 
        onClick={() => setIsCollapsed(false)}
        className="mb-3 w-fit inline-flex max-w-full bg-gradient-to-r from-indigo-50/70 to-purple-50/70 hover:from-indigo-100/70 hover:to-purple-100/70 rounded-xl px-3 py-1.5 border border-indigo-200/80 shadow-2xs transition-all items-center gap-3 cursor-pointer group"
        title="Click to expand AI Analysis"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="bg-indigo-600 p-1 rounded-md text-white shrink-0">
            <BrainCircuit className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <h4 className="text-xs font-bold text-indigo-950 group-hover:text-indigo-700 transition-colors truncate">AI Analysis</h4>
            <span className="hidden sm:inline text-[11px] text-slate-500 truncate">
              {analysis ? 'Report ready · Click to view' : 'Analyze your workload for highlights and recommendations.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            type="button"
            onClick={handleAnalyzeClick}
            disabled={analyzing}
            className={`px-2.5 py-0.5 rounded-md text-xs font-semibold shadow-2xs transition flex items-center gap-1 ${
              analyzing 
                ? 'bg-white text-slate-400 cursor-not-allowed' 
                : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200/80 cursor-pointer'
            }`}
          >
            {analyzing ? 'Analyzing...' : analysis ? 'Re-analyze' : 'Analyze'}
            {!analyzing && <Star className="w-3 h-3 text-amber-500 fill-current" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(false);
            }}
            className="p-1 rounded-md text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/60 transition"
            title="Expand section"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-5 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 rounded-xl p-4 border border-indigo-100 shadow-xs transition-all duration-300">
       <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
           <div className="flex items-center gap-2.5">
               <div className="bg-indigo-600 p-1.5 rounded-lg shadow-2xs text-white">
                  <BrainCircuit className="w-4 h-4" />
               </div>
               <div>
                   <h3 className="text-sm font-bold text-indigo-950">AI Analysis</h3>
                   <p className="text-xs text-slate-600 mt-0.5">Analyze your workload for highlights and recommendations.</p>
               </div>
           </div>
           
           <div className="flex items-center gap-1.5 self-end md:self-auto">
             <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1.5 rounded-lg transition border cursor-pointer ${showSettings ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:text-indigo-600'}`}
                title="Analysis Settings"
             >
                <Settings2 className="w-4 h-4" />
             </button>
             <button 
                onClick={() => handleAnalyzeClick()}
                disabled={analyzing}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition flex items-center gap-1.5 cursor-pointer ${analyzing ? 'bg-white text-slate-400 cursor-not-allowed' : 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200'}`}
                title="Run AI analysis on visible assignments"
             >
                {analyzing ? 'Analyzing...' : 'Generate Report'}
                {!analyzing && <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />}
             </button>
             <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="p-1 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100/60 transition cursor-pointer"
                title="Collapse AI Analysis"
             >
                <ChevronUp className="w-4 h-4" />
             </button>
           </div>
       </div>

       {showSettings && (
         <div className="mb-4 animate-fadeIn bg-white/50 p-4 rounded-lg border border-indigo-100 space-y-4">
            {/* Model Selection */}
            <div>
                <label className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Cpu className="w-3 h-3" /> AI Model Version
                </label>
                <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full md:w-1/2 p-2 text-sm border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-700"
                    title="Select the AI model for analysis"
                >
                    {AVAILABLE_MODELS.map(model => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                </select>
            </div>

            {/* Instructions */}
            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-indigo-800 uppercase tracking-wide">Custom Focus Instructions</label>
                    <button onClick={() => setCustomInstructions('')} className="text-xs text-slate-400 hover:text-indigo-600 underline" title="Restore default AI prompt">Reset to Default</button>
                </div>
                <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="E.g., 'Focus specifically on my Math grades', 'Roast me about my late assignments', or 'Give me a very strict schedule'."
                    className="w-full h-24 p-3 text-sm border border-indigo-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white resize-none"
                    title="Enter custom instructions for the AI"
                />
            </div>
         </div>
       )}
       
       {analysis && (
           <div className="bg-white p-6 rounded-lg shadow-sm border border-indigo-100 animate-fadeIn relative">
               <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-lg"></div>
               <div 
                  className="prose prose-sm prose-indigo max-w-none"
                  dangerouslySetInnerHTML={{ __html: analysis }}
               />
           </div>
       )}
    </div>
  );
};
