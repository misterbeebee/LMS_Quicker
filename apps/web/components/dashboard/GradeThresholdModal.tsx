import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Sliders, RotateCcw, Check } from 'lucide-react';
import { GradeScaleConfig, DEFAULT_GRADE_CONFIG, saveGradeConfig, getGradeStyle } from '../../services/gradeScale';

interface GradeThresholdModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GradeScaleConfig;
  onSave: (config: GradeScaleConfig) => void;
  studentId?: string;
}

type ActiveHandle = 'orange' | 'yellow' | 'green' | null;

export const GradeThresholdModal: React.FC<GradeThresholdModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
  studentId
}) => {
  const [greenMin, setGreenMin] = useState<number>(config.greenMin);
  const [yellowMin, setYellowMin] = useState<number>(config.yellowMin);
  const [orangeMin, setOrangeMin] = useState<number>(config.orangeMin);
  const [enableBlending, setEnableBlending] = useState<boolean>(config.enableBlending);
  const [draggingHandle, setDraggingHandle] = useState<ActiveHandle>(null);

  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setGreenMin(config.greenMin);
      setYellowMin(config.yellowMin);
      setOrangeMin(config.orangeMin);
      setEnableBlending(config.enableBlending);
    }
  }, [isOpen, config.greenMin, config.yellowMin, config.orangeMin, config.enableBlending]);

  const updateValueFromClientX = useCallback((clientX: number, handle: ActiveHandle) => {
    if (!trackRef.current || !handle) return;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const rawPct = Math.round(((clientX - rect.left) / rect.width) * 100);
    const clampedPct = Math.max(1, Math.min(100, rawPct));

    if (handle === 'orange') {
      setOrangeMin(Math.min(clampedPct, yellowMin - 1));
    } else if (handle === 'yellow') {
      setYellowMin(Math.max(orangeMin + 1, Math.min(clampedPct, greenMin - 1)));
    } else if (handle === 'green') {
      setGreenMin(Math.max(yellowMin + 1, Math.min(100, clampedPct)));
    }
  }, [orangeMin, yellowMin, greenMin]);

  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (e: PointerEvent) => {
      updateValueFromClientX(e.clientX, draggingHandle);
    };
    const handlePointerUp = () => {
      setDraggingHandle(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingHandle, updateValueFromClientX]);

  if (!isOpen) return null;

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

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickPct = ((e.clientX - rect.left) / rect.width) * 100;

    // Snap drag interaction to the nearest of the three thumbs
    const distOrange = Math.abs(clickPct - orangeMin);
    const distYellow = Math.abs(clickPct - yellowMin);
    const distGreen = Math.abs(clickPct - greenMin);

    let nearest: ActiveHandle = 'green';
    if (distOrange <= distYellow && distOrange <= distGreen) {
      nearest = 'orange';
    } else if (distYellow <= distGreen) {
      nearest = 'yellow';
    }

    setDraggingHandle(nearest);
    updateValueFromClientX(e.clientX, nearest);
  };

  const handleThumbKeyDown = (handle: 'orange' | 'yellow' | 'green', e: React.KeyboardEvent) => {
    const delta = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    if (handle === 'orange') {
      setOrangeMin(prev => Math.max(1, Math.min(yellowMin - 1, prev + delta)));
    } else if (handle === 'yellow') {
      setYellowMin(prev => Math.max(orangeMin + 1, Math.min(greenMin - 1, prev + delta)));
    } else if (handle === 'green') {
      setGreenMin(prev => Math.max(yellowMin + 1, Math.min(100, prev + delta)));
    }
  };

  // Sample grades to demo the swatches
  const sampleGrades = [
    { label: 'High A', score: 98, total: 100 },
    { label: 'Threshold A', score: greenMin, total: 100 },
    { label: 'Borderline B+', score: Math.max(0, greenMin - 1), total: 100 },
    { label: 'Solid B', score: Math.round((greenMin + yellowMin) / 2), total: 100 },
    { label: 'Borderline C', score: Math.max(0, yellowMin - 1), total: 100 },
    { label: 'Passing C', score: orangeMin, total: 100 },
    { label: 'Below Passing', score: Math.max(0, orangeMin - 8), total: 100 }
  ];

  // Build gradient string for the single horizontal slider line
  const trackGradient = enableBlending
    ? `linear-gradient(to right, #ef4444 0%, #ef4444 ${Math.max(0, orangeMin - 4)}%, #f97316 ${orangeMin}%, #facc15 ${yellowMin}%, #10b981 ${greenMin}%, #10b981 100%)`
    : `linear-gradient(to right, #ef4444 0%, #ef4444 ${orangeMin}%, #f97316 ${orangeMin}%, #f97316 ${yellowMin}%, #facc15 ${yellowMin}%, #facc15 ${greenMin}%, #10b981 ${greenMin}%, #10b981 100%)`;

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100/80 text-blue-700">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Grade Color Boundaries</h3>
              <p className="text-xs text-slate-500">Drag the three handles along the bar to set score cutoffs</p>
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

        <div className="p-5 sm:p-6 space-y-5 text-sm overflow-y-auto min-h-0 flex-1">
          {/* Threshold Readout Summary Pills */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-red-50/70 border border-red-200/80">
              <div className="text-[10px] font-bold uppercase text-red-700">Red (D/F)</div>
              <div className="font-mono font-bold text-red-800 mt-0.5">&lt;{orangeMin}%</div>
            </div>
            <div className="p-2 rounded-xl bg-orange-50/70 border border-orange-200/80">
              <div className="text-[10px] font-bold uppercase text-orange-700">Orange (C)</div>
              <div className="font-mono font-bold text-orange-800 mt-0.5">&ge;{orangeMin}%</div>
            </div>
            <div className="p-2 rounded-xl bg-amber-50/70 border border-amber-200/80">
              <div className="text-[10px] font-bold uppercase text-amber-700">Yellow (B)</div>
              <div className="font-mono font-bold text-amber-800 mt-0.5">&ge;{yellowMin}%</div>
            </div>
            <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
              <div className="text-[10px] font-bold uppercase text-emerald-700">Green (A)</div>
              <div className="font-mono font-bold text-emerald-800 mt-0.5">&ge;{greenMin}%</div>
            </div>
          </div>

          {/* Single-Line Three-Thumb Slider Configurator */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 sm:px-5 pt-7 pb-5 select-none">
            <div
              ref={trackRef}
              onPointerDown={handleTrackPointerDown}
              data-testid="single-line-three-slider"
              className="relative h-3.5 rounded-full shadow-inner border border-slate-200/90 cursor-pointer touch-none"
              style={{ background: trackGradient }}
            >
              {/* Handle 1: Orange Minimum */}
              <button
                type="button"
                role="slider"
                aria-label="Orange threshold minimum percentage"
                aria-valuemin={1}
                aria-valuemax={yellowMin - 1}
                aria-valuenow={orangeMin}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingHandle('orange');
                }}
                onKeyDown={(e) => handleThumbKeyDown('orange', e)}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-4 border-orange-500 shadow-md cursor-grab active:cursor-grabbing transition-transform focus:outline-hidden focus:ring-2 focus:ring-orange-400 ${
                  draggingHandle === 'orange' ? 'scale-125 z-30' : 'hover:scale-110 z-10'
                }`}
                style={{ left: `${orangeMin}%` }}
                title={`Orange (C): ${orangeMin}%`}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-orange-600 text-white shadow-xs whitespace-nowrap pointer-events-none">
                  {orangeMin}%
                </span>
              </button>

              {/* Handle 2: Yellow Minimum */}
              <button
                type="button"
                role="slider"
                aria-label="Yellow threshold minimum percentage"
                aria-valuemin={orangeMin + 1}
                aria-valuemax={greenMin - 1}
                aria-valuenow={yellowMin}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingHandle('yellow');
                }}
                onKeyDown={(e) => handleThumbKeyDown('yellow', e)}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-4 border-amber-400 shadow-md cursor-grab active:cursor-grabbing transition-transform focus:outline-hidden focus:ring-2 focus:ring-amber-400 ${
                  draggingHandle === 'yellow' ? 'scale-125 z-30' : 'hover:scale-110 z-20'
                }`}
                style={{ left: `${yellowMin}%` }}
                title={`Yellow (B): ${yellowMin}%`}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500 text-white shadow-xs whitespace-nowrap pointer-events-none">
                  {yellowMin}%
                </span>
              </button>

              {/* Handle 3: Green Minimum */}
              <button
                type="button"
                role="slider"
                aria-label="Green threshold minimum percentage"
                aria-valuemin={yellowMin + 1}
                aria-valuemax={100}
                aria-valuenow={greenMin}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDraggingHandle('green');
                }}
                onKeyDown={(e) => handleThumbKeyDown('green', e)}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border-4 border-emerald-500 shadow-md cursor-grab active:cursor-grabbing transition-transform focus:outline-hidden focus:ring-2 focus:ring-emerald-400 ${
                  draggingHandle === 'green' ? 'scale-125 z-30' : 'hover:scale-110 z-20'
                }`}
                style={{ left: `${greenMin}%` }}
                title={`Green (A): ${greenMin}%`}
              >
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-600 text-white shadow-xs whitespace-nowrap pointer-events-none">
                  {greenMin}%
                </span>
              </button>
            </div>

            {/* Scale Ticks under the single track */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-3 px-0.5">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Smooth Tier Blending Toggle */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="pr-4">
              <span className="font-semibold text-slate-800 text-xs block">Smooth Grade Tier Blending</span>
              <span className="text-[11px] text-slate-500 block leading-snug">
                Blends adjacent assignment grade hues smoothly while preserving sharp course letter boundaries.
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
            <span className="text-xs font-bold text-slate-700 block mb-2">Live Preview:</span>
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
        <div className="px-5 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
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
