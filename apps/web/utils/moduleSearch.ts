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
 * Finds the parent/containing module in which an assignment is embedded
 */
export function findContainingModule(
  assignment: CanvasAssignment,
  modules: CanvasModule[] = []
): CanvasModule | null {
  if (!assignment || !modules || modules.length === 0) return null;

  const targetName = (assignment.name || '').trim().toLowerCase();

  for (const mod of modules) {
    for (const item of (mod.items || [])) {
      if (!item) continue;
      // 1. Direct content_id match
      if (item.content_id && item.content_id === assignment.id) {
        return mod;
      }
      // 2. Direct title match if assignment item
      if (item.title && item.title.trim().toLowerCase() === targetName && item.type === 'Assignment') {
        return mod;
      }
    }
  }

  return null;
}

/**
 * Proactively searches course modules for helpful study materials related to an assignment.
 * Prioritizes the containing module's lessons, readings, and slide decks, while excluding
 * redundant links to the assignment itself.
 */
export function findRelatedModuleContent(
  assignment: CanvasAssignment,
  modules: CanvasModule[] = []
): RelatedModuleContentMatch[] {
  if (!assignment || !modules || modules.length === 0) return [];

  const { unitPatterns, keywords } = extractSearchTokens(assignment.name);
  const matches: RelatedModuleContentMatch[] = [];
  const seenItemKeys = new Set<string>();
  const targetName = (assignment.name || '').trim().toLowerCase();

  // 1. Find the containing module that holds this assignment
  const containingModule = findContainingModule(assignment, modules);

  // 2. If assignment belongs to a containing module, include all OTHER materials from that module (highest priority)
  if (containingModule) {
    const items = containingModule.items || [];
    for (const item of items) {
      if (!item || item.type === 'SubHeader') continue;

      // Do NOT include self-reference to the assignment we are already looking at
      const isSelf = (item.content_id && item.content_id === assignment.id) || 
                     (item.title && item.title.trim().toLowerCase() === targetName && item.type === 'Assignment');
      if (isSelf) continue;

      const itemKey = `${containingModule.id}-${item.id}`;
      seenItemKeys.add(itemKey);

      matches.push({
        module: containingModule,
        item,
        score: 95,
        reason: `From containing module: ${containingModule.name}`
      });
    }
  }

  // 3. Search other modules for unit/chapter patterns and keyword matches
  for (const mod of modules) {
    const isContaining = containingModule && mod.id === containingModule.id;
    const modTitleLower = (mod.name || '').toLowerCase();

    // Check if module title matches unit pattern
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

      // Exclude self reference
      const isSelf = (item.content_id && item.content_id === assignment.id) || 
                     (item.title && item.title.trim().toLowerCase() === targetName && item.type === 'Assignment');
      if (isSelf) continue;

      const itemKey = `${mod.id}-${item.id}`;
      if (seenItemKeys.has(itemKey)) continue;

      const itemTitleLower = (item.title || '').toLowerCase();
      let score = 0;
      let reason = '';

      if (moduleUnitMatch) {
        score = 70;
        reason = `From matching ${moduleUnitMatch.toUpperCase()} module`;
        
        // Bonus if item title also shares keywords
        for (const kw of keywords) {
          if (itemTitleLower.includes(kw)) {
            score += 15;
            reason += ` (${kw})`;
            break;
          }
        }
      } else {
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
