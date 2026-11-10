import React, { useState } from 'react';
import { X, Sliders, RotateCcw, Check, Info } from 'lucide-react';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, saveGradeConfig, getGradeStyle } from '../../services/gradeScale';

interface GradeThresholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GradeScaleConfig;
  onSave: (config: GradeScaleConfig) => void;
  studentId?: string;
}

export const GradeThresholdModal: React.FC<GradeThresholdModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  studentId
}) => {
  if (!isOpen) return null;

  const [greenMin, setGreenMin] = useState<number>(config.greenMin);
  const [yellowMin, setYellowMin] = useState<number>(config.yellowMin);
  const [orangeMin, setOrangeMin] = useState<number>(config.orangeMin);
  const [enableBlending, setEnableBlending] = useState<boolean>(config.enableBlending);

  const previewConfig: GradeScaleConfig = {
    greenMin,
    yellowMin,
    orangeMin,
    enableBlending
  };

  const handleReset = () => {
    setGreenMin(DEFAULT_GRADE_CONFIG.greenMin);
    setYellowMin(DEFAULT_GRADE_CONFIG.yellowMin);
    setOrangeMin(DEFAULT_GRADE_CONFIG.orangeMin);
    setEnableBlending(DEFAULT_GRADE_CONFIG.enableBlending);
  };

  const handleSave = () => {
    const updated: GradeScaleConfig = {
      greenMin: Math.max(yellowMin + 1, greenMin),
      yellowMin: Math.max(orangeMin + 1, Math.min(greenMin - 1, yellowMin)),
      orangeMin: Math.max(1, Math.min(yellowMin - 1, orangeMin)),
      enableBlending
    };
    saveGradeConfig(updated, studentId);
    onSave(updated);
    onClose();
  };

  // Sample grades to demo the swatches
  const sampleGrades = [
    { label: 'High A', score: 98, total: 100 },
    { label: 'Threshold A', score: greenMin, total: 100 },
    { label: 'Borderline B+', score: greenMin - 1, total: 100 },
    { label: 'Solid B', score: Math.round((greenMin + yellowMin) / 2), total: 100 },
    { label: 'Borderline C', score: yellowMin - 1, total: 100 },
    { label: 'Passing C', score: orangeMin, total: 100 },
    { label: 'Below Passing', score: Math.max(0, orangeMin - 8), total: 100 }
  ];

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100/80 text-blue-700">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Grade Color Boundaries</h3>
              <p className="text-xs text-slate-500">Configure score percentage ranges and tier blending</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sliders Body */}
        <div className="p-6 space-y-5 text-sm">
          {/* Green Tier */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-2xs" />
                <span>Green Tier (A / Excellent)</span>
              </label>
              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs border border-emerald-200">
                &ge; {greenMin}%
              </span>
            </div>
            <input 
              type="range"
              min={yellowMin + 1}
              max={100}
              value={greenMin}
              onChange={(e) => setGreenMin(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">Scores at or above this percentage appear emerald green.</p>
          </div>

          {/* Yellow Tier */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-amber-400 inline-block shadow-2xs" />
                <span>Yellow Tier (B / Good)</span>
              </label>
              <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200">
                {yellowMin}% &ndash; {greenMin - 1}%
              </span>
            </div>
            <input 
              type="range"
              min={orangeMin + 1}
              max={greenMin - 1}
              value={yellowMin}
              onChange={(e) => setYellowMin(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">Scores between yellow and green appear amber/yellow.</p>
          </div>

          {/* Orange Tier */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-700 flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full bg-orange-500 inline-block shadow-2xs" />
                <span>Orange Tier (C / Fair)</span>
              </label>
              <span className="font-mono font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded text-xs border border-orange-200">
                {orangeMin}% &ndash; {yellowMin - 1}%
              </span>
            </div>
            <input 
              type="range"
              min={40}
              max={yellowMin - 1}
              value={orangeMin}
              onChange={(e) => setOrangeMin(Number(e.target.value))}
              className="w-full accent-orange-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">Scores below {orangeMin}% appear red (Needs Attention).</p>
          </div>

          {/* Smooth Tier Blending Toggle */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="pr-4">
              <span className="font-semibold text-slate-800 text-xs block">Smooth Grade Tier Blending</span>
              <span className="text-[11px] text-slate-500 block leading-snug">
                Smoothly blends colors between boundaries for raw assignment grades (e.g. 89% and 90% look similar), while maintaining sharp letter distinctions for overall course grades.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input 
                type="checkbox"
                checked={enableBlending}
                onChange={(e) => setEnableBlending(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Live Preview Swatches */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-700 block mb-2">Live Preview (Assignment Grade Swatches):</span>
            <div className="flex flex-wrap gap-1.5">
              {sampleGrades.map((sample) => {
                const style = getGradeStyle(sample.score, sample.total, previewConfig, { isCourseGrade: false });
                return (
                  <div 
                    key={sample.label}
                    className="flex flex-col items-center px-2 py-1 rounded-lg border text-center"
                    style={style.style}
                    title={`${sample.label}: ${sample.score}%`}
                  >
                    <span className="text-[10px] font-bold">{sample.score}%</span>
                    <span className="text-[9px] opacity-75">{style.letter}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition cursor-pointer"
            title="Reset to 90 / 80 / 70 defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg shadow-xs transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply & Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
