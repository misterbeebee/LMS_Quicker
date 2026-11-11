import { CanvasAssignment, CanvasModule, CanvasModuleItem } from '../types';

export interface RelatedModuleContentMatch {
  module: CanvasModule;
  item?: CanvasModuleItem;
  score: number;
  reason: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'were', 'what',
  'your', 'when', 'into', 'some', 'about', 'more', 'then', 'them', 'these', 'will',
  'assignment', 'homework', 'quiz', 'test', 'exam', 'paper', 'read', 'reading',
  'worksheet', 'turn', 'submit', 'complete', 'classwork', 'due', 'date', 'pts', 'points'
]);

/**
 * Extracts normalized search terms and unit/chapter tokens from an assignment
 */
export function extractSearchTokens(title: string): {
  unitPatterns: string[];
  keywords: string[];
} {
  if (!title) return { unitPatterns: [], keywords: [] };

  const unitPatterns: string[] = [];
  
  // Pattern 1: Unit / Chapter / Module / Week numbers (e.g., "Unit 3", "Ch 4", "Week 2", "Module 5")
  const unitRegex = /\b(Unit|Chapter|Ch\.?|Week|Module|Mod\.?|Lesson|Section|Sec\.?|Part)\s*(\d+[a-z]?|\b[ivxlcdm]+\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = unitRegex.exec(title)) !== null) {
    unitPatterns.push(match[0].toLowerCase());
  }

  // Tokenize keywords (alphanumeric strings >= 3 characters)
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  return {
    unitPatterns,
    keywords: Array.from(new Set(words))
  };
}

/**
 * Proactively searches course modules for content related to a specific assignment
 */
export function findRelatedModuleContent(
  assignment: CanvasAssignment,
  modules: CanvasModule[] = []
): RelatedModuleContentMatch[] {
  if (!assignment || !modules || modules.length === 0) return [];

  const { unitPatterns, keywords } = extractSearchTokens(assignment.name);
  const matches: RelatedModuleContentMatch[] = [];
  const seenItemKeys = new Set<string>();

  for (const mod of modules) {
    const modTitleLower = (mod.name || '').toLowerCase();

    // Check if the module itself matches a unit pattern
    let moduleUnitMatch = '';
    for (const pattern of unitPatterns) {
      if (modTitleLower.includes(pattern)) {
        moduleUnitMatch = pattern;
        break;
      }
    }

    const items = mod.items || [];
    for (const item of items) {
      if (!item || item.type === 'SubHeader') continue;

      const itemKey = `${mod.id}-${item.id}`;
      if (seenItemKeys.has(itemKey)) continue;

      const itemTitleLower = (item.title || '').toLowerCase();
      let score = 0;
      let reason = '';

      // 1. Direct assignment match (100 pts)
      if (
        (item.content_id && item.content_id === assignment.id) ||
        (item.title && assignment.name && itemTitleLower === assignment.name.trim().toLowerCase())
      ) {
        score = 100;
        reason = 'Direct module assignment reference';
      }
      // 2. Direct unit/chapter match in same module (70 pts)
      else if (moduleUnitMatch) {
        score = 70;
        reason = `From matching ${moduleUnitMatch.toUpperCase()} module`;
        
        // Bonus if item title also shares keywords (+15)
        for (const kw of keywords) {
          if (itemTitleLower.includes(kw)) {
            score += 15;
            reason += ` (${kw})`;
            break;
          }
        }
      }
      // 3. Keyword matches between item title and assignment title (30-60 pts)
      else {
        let matchedKws: string[] = [];
        for (const kw of keywords) {
          if (itemTitleLower.includes(kw)) {
            matchedKws.push(kw);
          }
        }

        if (matchedKws.length > 0) {
          score = Math.min(65, 30 + matchedKws.length * 15);
          reason = `Keyword match: ${matchedKws.slice(0, 2).join(', ')}`;
        }
      }

      if (score > 0) {
        seenItemKeys.add(itemKey);
        matches.push({
          module: mod,
          item,
          score,
          reason
        });
      }
    }
  }

  // Sort descending by score
  matches.sort((a, b) => b.score - a.score);

  return matches;
}
