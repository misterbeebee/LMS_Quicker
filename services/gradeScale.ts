import React, { CSSProperties } from 'react';
import { logger } from './logger';

export interface GradeScaleConfig {
  greenMin: number;   // e.g. 90
  yellowMin: number;  // e.g. 80
  orangeMin: number;  // e.g. 70
  enableBlending: boolean; // Smooth blending between tiers for assignment grades
}

export const DEFAULT_GRADE_CONFIG: GradeScaleConfig = {
  greenMin: 90,
  yellowMin: 80,
  orangeMin: 70,
  enableBlending: true
};

const STORAGE_KEY = 'canvas_grade_scale_config_v1';

export const getSavedGradeConfig = (studentId?: string): GradeScaleConfig => {
  try {
    const key = studentId ? `${STORAGE_KEY}_${studentId}` : STORAGE_KEY;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        greenMin: typeof parsed.greenMin === 'number' ? parsed.greenMin : DEFAULT_GRADE_CONFIG.greenMin,
        yellowMin: typeof parsed.yellowMin === 'number' ? parsed.yellowMin : DEFAULT_GRADE_CONFIG.yellowMin,
        orangeMin: typeof parsed.orangeMin === 'number' ? parsed.orangeMin : DEFAULT_GRADE_CONFIG.orangeMin,
        enableBlending: typeof parsed.enableBlending === 'boolean' ? parsed.enableBlending : DEFAULT_GRADE_CONFIG.enableBlending
      };
    }
  } catch (err: any) {
    logger.warn('Failed to load grade config:', err?.message);
  }
  return { ...DEFAULT_GRADE_CONFIG };
};

export const saveGradeConfig = (config: GradeScaleConfig, studentId?: string): GradeScaleConfig => {
  try {
    const key = studentId ? `${STORAGE_KEY}_${studentId}` : STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(config));
  } catch (err: any) {
    logger.error('Failed to save grade config:', err?.message);
  }
  return config;
};

export interface GradeColorStyle {
  percentage: number | null;
  letter: string;
  className: string;
  style: CSSProperties;
  badgeClass: string;
  textClass: string;
  hasScore: boolean;
}

/**
 * Calculates a smooth interpolated RGB color between two hex or rgb values.
 */
function interpolateColor(color1: [number, number, number], color2: [number, number, number], factor: number): string {
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(color1[0] + f * (color2[0] - color1[0]));
  const g = Math.round(color1[1] + f * (color2[1] - color1[1]));
  const b = Math.round(color1[2] + f * (color2[2] - color1[2]));
  return `rgb(${r}, ${g}, ${b})`;
}

// Key reference RGB colors (Emerald, Amber/Yellow, Orange, Crimson Red)
const COLOR_EMERALD: [number, number, number] = [16, 185, 129]; // #10b981
const COLOR_YELLOW: [number, number, number] = [234, 179, 8];   // #eab308
const COLOR_ORANGE: [number, number, number] = [249, 115, 22];  // #f97316
const COLOR_RED: [number, number, number] = [239, 68, 68];      // #ef4444

/**
 * Resolve letter grade label for a percentage based on thresholds
 */
export const getLetterGrade = (percentage: number, config: GradeScaleConfig = DEFAULT_GRADE_CONFIG): string => {
  if (percentage >= config.greenMin) return 'A';
  if (percentage >= config.yellowMin) return 'B';
  if (percentage >= config.orangeMin) return 'C';
  if (percentage >= config.orangeMin - 10) return 'D';
  return 'F';
};

/**
 * Resolve dynamic grade colors with smooth tier blending for assignments,
 * or sharp letter-boundary distinction for overall course averages.
 *
 * CRITICAL: Distinguishes between:
 *  - Real 0%: score === 0 (pointsPossible > 0) -> F (Crimson Red with 0%)
 *  - No Data: score === null / undefined / unreleased -> "-" with neutral gray styling
 */
export const getGradeStyle = (
  score: number | null | undefined,
  pointsPossible: number | null | undefined,
  config: GradeScaleConfig = DEFAULT_GRADE_CONFIG,
  options: { isCourseGrade?: boolean } = {}
): GradeColorStyle => {
  // Check specifically for absence of score data (null or undefined) or missing points possible
  if (score === null || score === undefined || pointsPossible === null || pointsPossible === undefined || pointsPossible <= 0) {
    return {
      percentage: null,
      letter: '-',
      className: 'bg-slate-100 text-slate-500 border border-slate-200',
      style: {},
      badgeClass: 'bg-slate-100 text-slate-500 border border-slate-200',
      textClass: 'text-slate-500',
      hasScore: false
    };
  }

  // Real numeric score exists (including 0!)
  const rawPct = (score / pointsPossible) * 100;
  const percentage = Math.round(rawPct * 10) / 10;
  const letter = getLetterGrade(percentage, config);

  const { greenMin, yellowMin, orangeMin, enableBlending } = config;

  // Discrete Stepped Classes (used when blending is disabled or for clean baseline styling)
  if (!enableBlending || options.isCourseGrade) {
    if (percentage >= greenMin) {
      return {
        percentage,
        letter,
        className: 'bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold',
        style: {
          backgroundColor: 'rgba(16, 185, 129, 0.14)',
          borderColor: 'rgba(16, 185, 129, 0.45)',
          color: '#065f46',
          borderWidth: '1px',
          borderStyle: 'solid'
        },
        badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
        textClass: 'text-emerald-700',
        hasScore: true
      };
    }
    if (percentage >= yellowMin) {
      const nearBoundary = percentage >= greenMin - 1.5;
      return {
        percentage,
        letter,
        className: `bg-amber-50 text-amber-800 border ${nearBoundary ? 'border-amber-400 ring-1 ring-amber-300' : 'border-amber-300'} font-bold`,
        style: {
          backgroundColor: 'rgba(245, 158, 11, 0.14)',
          borderColor: nearBoundary ? 'rgba(217, 119, 6, 0.6)' : 'rgba(245, 158, 11, 0.45)',
          color: '#92400e',
          borderWidth: '1px',
          borderStyle: 'solid'
        },
        badgeClass: 'bg-amber-50 text-amber-800 border border-amber-300',
        textClass: 'text-amber-700',
        hasScore: true
      };
    }
    if (percentage >= orangeMin) {
      const nearBoundary = percentage >= yellowMin - 1.5;
      return {
        percentage,
        letter,
        className: `bg-orange-50 text-orange-800 border ${nearBoundary ? 'border-orange-400 ring-1 ring-orange-300' : 'border-orange-300'} font-bold`,
        style: {
          backgroundColor: 'rgba(249, 115, 22, 0.14)',
          borderColor: nearBoundary ? 'rgba(234, 88, 12, 0.6)' : 'rgba(249, 115, 22, 0.45)',
          color: '#9a3412',
          borderWidth: '1px',
          borderStyle: 'solid'
        },
        badgeClass: 'bg-orange-50 text-orange-800 border border-orange-300',
        textClass: 'text-orange-700',
        hasScore: true
      };
    }
    // Below orangeMin (<70%, including 0%) -> Red
    return {
      percentage,
      letter,
      className: 'bg-red-50 text-red-800 border border-red-300 font-bold',
      style: {
        backgroundColor: 'rgba(239, 68, 68, 0.14)',
        borderColor: 'rgba(239, 68, 68, 0.45)',
        color: '#991b1b',
        borderWidth: '1px',
        borderStyle: 'solid'
      },
      badgeClass: 'bg-red-50 text-red-800 border border-red-300',
      textClass: 'text-red-700',
      hasScore: true
    };
  }

  // Smooth Tier Blending for Assignment Grades:
  // Distinct hue foundations with wider color value gaps between adjacent tiers
  let primaryRgb: [number, number, number] = [220, 38, 38];
  if (percentage >= greenMin) {
    // Green Tier: crisp emerald from [34, 197, 94] (greenMin) to deep forest [5, 150, 105] (100%)
    const span = Math.max(1, 100 - greenMin);
    const factor = Math.min(1, Math.max(0, (percentage - greenMin) / span));
    primaryRgb = [
      Math.round(34 - factor * 29),
      Math.round(197 - factor * 47),
      Math.round(94 + factor * 11)
    ];
  } else if (percentage >= yellowMin) {
    // Yellow/Amber Tier: warm gold [245, 158, 11] (yellowMin) to [217, 119, 6] (greenMin - 0.1)
    // Notice: Never bleeds into green, maintaining a decisive color value gap against 90%
    const span = Math.max(1, greenMin - yellowMin);
    const factor = Math.min(1, Math.max(0, (percentage - yellowMin) / span));
    primaryRgb = [
      Math.round(245 - factor * 28),
      Math.round(158 - factor * 39),
      Math.round(11 - factor * 5)
    ];
  } else if (percentage >= orangeMin) {
    // Orange Tier: warm tangerine [249, 115, 22] to [234, 88, 12]
    // Notice: Decisive color value gap against 80% amber
    const span = Math.max(1, yellowMin - orangeMin);
    const factor = Math.min(1, Math.max(0, (percentage - orangeMin) / span));
    primaryRgb = [
      Math.round(249 - factor * 15),
      Math.round(115 - factor * 27),
      Math.round(22 - factor * 10)
    ];
  } else {
    // Below orangeMin: Crimson Red
    const span = Math.max(1, orangeMin);
    const factor = Math.min(1, Math.max(0, percentage / span));
    primaryRgb = [
      Math.round(185 + factor * 35),
      Math.round(28 + factor * 20),
      Math.round(28 + factor * 20)
    ];
  }

  const [r, g, b] = primaryRgb;
  const bgStyle = `rgba(${r}, ${g}, ${b}, 0.12)`;
  const borderStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
  const textStyle = `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`;

  return {
    percentage,
    letter,
    className: 'font-semibold transition-colors',
    style: {
      backgroundColor: bgStyle,
      borderColor: borderStyle,
      color: textStyle,
      borderWidth: '1px',
      borderStyle: 'solid'
    },
    badgeClass: 'font-semibold',
    textClass: '',
    hasScore: true
  };
};
