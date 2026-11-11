// Course customization service for custom abbreviations, thematic emojis, and course ordering

export interface CourseCustomization {
  abbreviation?: string;
  emoji?: string;
}

export interface EmojiOption {
  emoji: string;
  label: string;
  category: 'STEM & Math' | 'Humanities & Languages' | 'Arts & Music' | 'Sports & Health' | 'General';
}

export const THEMATIC_EMOJIS: EmojiOption[] = [
  // STEM & Math
  { emoji: '📐', label: 'Geometry / Trig', category: 'STEM & Math' },
  { emoji: '🔢', label: 'Math / Numbers', category: 'STEM & Math' },
  { emoji: '📊', label: 'Statistics / Data', category: 'STEM & Math' },
  { emoji: '♾️', label: 'Calculus / Advanced Math', category: 'STEM & Math' },
  { emoji: '🔬', label: 'Science / Lab', category: 'STEM & Math' },
  { emoji: '🧬', label: 'Biology / Genetics', category: 'STEM & Math' },
  { emoji: '🧪', label: 'Chemistry', category: 'STEM & Math' },
  { emoji: '⚡', label: 'Physics / Electricity', category: 'STEM & Math' },
  { emoji: '💻', label: 'Computer Science / Coding', category: 'STEM & Math' },
  { emoji: '🤖', label: 'Robotics / AI', category: 'STEM & Math' },
  { emoji: '🌱', label: 'Environmental / Botany', category: 'STEM & Math' },
  { emoji: '🌌', label: 'Astronomy / Space', category: 'STEM & Math' },
  { emoji: '⚙️', label: 'Engineering / Tech', category: 'STEM & Math' },

  // Humanities & Languages
  { emoji: '📚', label: 'English / Reading', category: 'Humanities & Languages' },
  { emoji: '✍️', label: 'Writing / Composition', category: 'Humanities & Languages' },
  { emoji: '📖', label: 'Literature', category: 'Humanities & Languages' },
  { emoji: '🏛️', label: 'History / Government', category: 'Humanities & Languages' },
  { emoji: '📜', label: 'World History / Civics', category: 'Humanities & Languages' },
  { emoji: '⚖️', label: 'Law / Ethics', category: 'Humanities & Languages' },
  { emoji: '🌍', label: 'Geography / World', category: 'Humanities & Languages' },
  { emoji: '🗣️', label: 'Speech / Debate', category: 'Humanities & Languages' },
  { emoji: '🇪🇸', label: 'Spanish', category: 'Humanities & Languages' },
  { emoji: '🇫🇷', label: 'French', category: 'Humanities & Languages' },
  { emoji: '🇩🇪', label: 'German', category: 'Humanities & Languages' },
  { emoji: '🇨🇳', label: 'Chinese / Mandarin', category: 'Humanities & Languages' },
  { emoji: '🧠', label: 'Psychology', category: 'Humanities & Languages' },
  { emoji: '📈', label: 'Economics / Business', category: 'Humanities & Languages' },

  // Arts & Music
  { emoji: '🎨', label: 'Visual Arts / Painting', category: 'Arts & Music' },
  { emoji: '🖌️', label: 'Studio Art / Drawing', category: 'Arts & Music' },
  { emoji: '🎭', label: 'Theater / Drama', category: 'Arts & Music' },
  { emoji: '📷', label: 'Photography / Film', category: 'Arts & Music' },
  { emoji: '🎵', label: 'Music / Choir', category: 'Arts & Music' },
  { emoji: '🎺', label: 'Band / Brass', category: 'Arts & Music' },
  { emoji: '🎻', label: 'Orchestra / Strings', category: 'Arts & Music' },
  { emoji: '🎹', label: 'Keyboard / Piano', category: 'Arts & Music' },
  { emoji: '💃', label: 'Dance', category: 'Arts & Music' },

  // Sports & Health
  { emoji: '🏃', label: 'Physical Education / Track', category: 'Sports & Health' },
  { emoji: '⚽', label: 'Soccer / Sports', category: 'Sports & Health' },
  { emoji: '🏀', label: 'Basketball / Athletics', category: 'Sports & Health' },
  { emoji: '🏋️', label: 'Weightlifting / Fitness', category: 'Sports & Health' },
  { emoji: '🩺', label: 'Health / Medical', category: 'Sports & Health' },
  { emoji: '🧘', label: 'Wellness / Mindfulness', category: 'Sports & Health' },

  // General & School
  { emoji: '📝', label: 'Notes / Assignment', category: 'General' },
  { emoji: '🎒', label: 'Homeroom / Advisory', category: 'General' },
  { emoji: '⭐', label: 'Favorite / Honors', category: 'General' },
  { emoji: '💡', label: 'Innovation / Seminar', category: 'General' },
  { emoji: '🧭', label: 'Navigation / College Prep', category: 'General' },
];

import { pruneCourseTitle } from '../utils/courseAbbreviations';

/**
 * Automatically suggests a smart thematic emoji and standard 4-letter abbreviation based on course name
 */
export function suggestCourseCustomization(courseName: string): { emoji: string; abbreviation: string; explanation: string } {
  const lower = courseName.toLowerCase();

  // Standard 4-letter academic course codes
  if (lower.includes('calc') || lower.includes('calculus')) {
    return { emoji: '♾️', abbreviation: 'CALC', explanation: 'Matched Calculus' };
  }
  if (lower.includes('geom') || lower.includes('geometry')) {
    return { emoji: '📐', abbreviation: 'GEOM', explanation: 'Matched Geometry' };
  }
  if (lower.includes('stat') || lower.includes('statistics')) {
    return { emoji: '📊', abbreviation: 'STAT', explanation: 'Matched Statistics' };
  }
  if (lower.includes('algebra')) {
    return { emoji: '🔢', abbreviation: 'ALGB', explanation: 'Matched Algebra' };
  }
  if (lower.includes('math') || lower.includes('pre-calc')) {
    return { emoji: '🔢', abbreviation: 'MATH', explanation: 'Matched Mathematics' };
  }
  if (lower.includes('bio') || lower.includes('living environment') || lower.includes('genetics')) {
    return { emoji: '🧬', abbreviation: 'BIOL', explanation: 'Matched Biology' };
  }
  if (lower.includes('chem') || lower.includes('chemistry')) {
    return { emoji: '🧪', abbreviation: 'CHEM', explanation: 'Matched Chemistry' };
  }
  if (lower.includes('phys') || lower.includes('physics')) {
    return { emoji: '⚡', abbreviation: 'PHYS', explanation: 'Matched Physics' };
  }
  if (lower.includes('astronomy') || lower.includes('space')) {
    return { emoji: '🌌', abbreviation: 'ASTR', explanation: 'Matched Astronomy' };
  }
  if (lower.includes('earth') || lower.includes('geo') || lower.includes('geology')) {
    return { emoji: '🌍', abbreviation: 'ERTH', explanation: 'Matched Earth Science' };
  }
  if (lower.includes('comp') || lower.includes('cs') || lower.includes('program') || lower.includes('code') || lower.includes('software')) {
    return { emoji: '💻', abbreviation: 'CSCI', explanation: 'Matched Computer Science' };
  }
  if (lower.includes('robot') || lower.includes('engineering') || lower.includes('tech')) {
    return { emoji: '⚙️', abbreviation: 'ENGR', explanation: 'Matched Engineering/Robotics' };
  }
  if (lower.includes('hist') || lower.includes('history') || lower.includes('ush') || lower.includes('whap') || lower.includes('euro')) {
    return { emoji: '🏛️', abbreviation: 'HIST', explanation: 'Matched History' };
  }
  if (lower.includes('gov') || lower.includes('civic') || lower.includes('politics')) {
    return { emoji: '📜', abbreviation: 'GOVT', explanation: 'Matched Government & Civics' };
  }
  if (lower.includes('econ') || lower.includes('business') || lower.includes('finance')) {
    return { emoji: '📈', abbreviation: 'ECON', explanation: 'Matched Economics' };
  }
  if (lower.includes('lit') || lower.includes('literature') || lower.includes('english') || lower.includes('lang') || lower.includes('reading')) {
    return { emoji: '📚', abbreviation: 'ENGL', explanation: 'Matched English Literature' };
  }
  if (lower.includes('span') || lower.includes('español')) {
    return { emoji: '🇪🇸', abbreviation: 'SPAN', explanation: 'Matched Spanish' };
  }
  if (lower.includes('french') || lower.includes('français')) {
    return { emoji: '🇫🇷', abbreviation: 'FREN', explanation: 'Matched French' };
  }
  if (lower.includes('chinese') || lower.includes('mandarin')) {
    return { emoji: '🇨🇳', abbreviation: 'CHIN', explanation: 'Matched Chinese' };
  }
  if (lower.includes('german') || lower.includes('deutsch')) {
    return { emoji: '🇩🇪', abbreviation: 'GERM', explanation: 'Matched German' };
  }
  if (lower.includes('art') || lower.includes('draw') || lower.includes('paint') || lower.includes('ceramics') || lower.includes('sculpt')) {
    return { emoji: '🎨', abbreviation: 'ARTS', explanation: 'Matched Visual Arts' };
  }
  if (lower.includes('piano') || lower.includes('keyboard')) {
    return { emoji: '🎹', abbreviation: 'PIAN', explanation: 'Matched Piano' };
  }
  if (lower.includes('band')) {
    return { emoji: '🎺', abbreviation: 'BAND', explanation: 'Matched Band' };
  }
  if (lower.includes('orch') || lower.includes('strings') || lower.includes('orchestra')) {
    return { emoji: '🎻', abbreviation: 'ORCH', explanation: 'Matched Orchestra' };
  }
  if (lower.includes('music') || lower.includes('choir') || lower.includes('chorus') || lower.includes('vocal')) {
    return { emoji: '🎵', abbreviation: 'MUSC', explanation: 'Matched Music' };
  }
  if (lower.includes('theater') || lower.includes('theatre') || lower.includes('drama')) {
    return { emoji: '🎭', abbreviation: 'DRAM', explanation: 'Matched Theater/Drama' };
  }
  if (lower.includes('photo') || lower.includes('film') || lower.includes('media')) {
    return { emoji: '📷', abbreviation: 'PHOT', explanation: 'Matched Media/Photo' };
  }
  if (lower.includes('pe') || lower.includes('phys ed') || lower.includes('gym') || lower.includes('fitness')) {
    return { emoji: '🏃', abbreviation: 'PHED', explanation: 'Matched PE & Health' };
  }
  if (lower.includes('health') || lower.includes('nutrition')) {
    return { emoji: '🍎', abbreviation: 'HLTH', explanation: 'Matched Health' };
  }
  if (lower.includes('psych') || lower.includes('philosophy')) {
    return { emoji: '🧠', abbreviation: 'PSYC', explanation: 'Matched Psychology' };
  }
  if (lower.includes('advisory') || lower.includes('homeroom') || lower.includes('seminar') || lower.includes('study')) {
    return { emoji: '🎒', abbreviation: 'ADVS', explanation: 'Matched Advisory' };
  }

  // Consistent 4-letter alphanumeric fallback from pruned course name
  const pruned = pruneCourseTitle(courseName);
  const lettersOnly = pruned.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const fallbackAbbr = (lettersOnly.slice(0, 4) || 'CRSE').padEnd(4, 'X');

  return { emoji: '📝', abbreviation: fallbackAbbr, explanation: 'Default academic emoji' };
}

const STORAGE_KEY_PREFIX = 'canvas_course_customizations_';
const ORDER_KEY_PREFIX = 'canvas_course_order_';

export function getCourseCustomizations(studentId?: string): Record<number, CourseCustomization> {
  try {
    const key = `${STORAGE_KEY_PREFIX}${studentId || 'default'}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    // Fallback to default if student-specific record is empty
    if (studentId && studentId !== 'default') {
      const defaultRaw = localStorage.getItem(`${STORAGE_KEY_PREFIX}default`);
      if (defaultRaw) {
        const parsed = JSON.parse(defaultRaw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }
    return {};
  } catch (e) {
    console.error('Failed to load course customizations', e);
    return {};
  }
}

export function saveCourseCustomization(
  courseId: number, 
  custom: CourseCustomization, 
  studentId?: string
): Record<number, CourseCustomization> {
  try {
    const current = getCourseCustomizations(studentId);
    const updated = {
      ...current,
      [courseId]: {
        ...current[courseId],
        ...custom
      }
    };
    const key = `${STORAGE_KEY_PREFIX}${studentId || 'default'}`;
    localStorage.setItem(key, JSON.stringify(updated));
    // Also update default key so any session or fallback can access it
    localStorage.setItem(`${STORAGE_KEY_PREFIX}default`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save course customization', e);
    return {};
  }
}

export function getSavedCourseOrder(studentId?: string): number[] {
  try {
    const key = `${ORDER_KEY_PREFIX}${studentId || 'default'}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    if (studentId && studentId !== 'default') {
      const defaultRaw = localStorage.getItem(`${ORDER_KEY_PREFIX}default`);
      if (defaultRaw) {
        const parsed = JSON.parse(defaultRaw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
    return [];
  } catch (e) {
    console.error('Failed to load course order', e);
    return [];
  }
}

export function saveCourseOrder(order: number[], studentId?: string): void {
  try {
    const key = `${ORDER_KEY_PREFIX}${studentId || 'default'}`;
    localStorage.setItem(key, JSON.stringify(order));
    localStorage.setItem(`${ORDER_KEY_PREFIX}default`, JSON.stringify(order));
  } catch (e) {
    console.error('Failed to save course order', e);
  }
}

export function saveCourseCustomizationsBulk(
  customizations: Record<number, CourseCustomization>,
  studentId?: string
): Record<number, CourseCustomization> {
  try {
    const key = `${STORAGE_KEY_PREFIX}${studentId || 'default'}`;
    const current = getCourseCustomizations(studentId);
    const merged: Record<number, CourseCustomization> = { ...current };

    // Deep merge each course's properties and normalize string/number keys from JSON
    if (customizations && typeof customizations === 'object') {
      for (const [idStr, custom] of Object.entries(customizations)) {
        const numId = Number(idStr);
        if (!isNaN(numId) && custom && typeof custom === 'object') {
          merged[numId] = {
            ...(merged[numId] || {}),
            ...custom
          };
        }
      }
    }

    localStorage.setItem(key, JSON.stringify(merged));
    localStorage.setItem(`${STORAGE_KEY_PREFIX}default`, JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.error('Failed to save bulk course customizations', e);
    return customizations;
  }
}
