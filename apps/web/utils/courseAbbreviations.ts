import { CourseData } from '../types';

// Dash characters: standard hyphen, en-dash, em-dash, minus, non-breaking hyphen, figure dash, horizontal bar
const DASH_REGEX = /[-–—−‑‒―]/;
const DASH_SPLIT_REGEX = /[-–—−‑‒―]/g;

/**
 * Prunes long course titles by hiding everything after the first metadata hyphen.
 * E.g. "AP Chemistry - Period 1 - Smith" -> "AP Chemistry"
 * "Honors Pre-Calculus - Period 4" -> "Honors Pre-Calculus"
 * "Spanish 3-Room 102" -> "Spanish 3"
 * "Biology 1 – Alexander – Per 4" -> "Biology 1"
 */
export function pruneCourseTitle(name: string): string {
  if (!name) return '';
  let text = name.trim();

  // 1. Strip leading academic year range at the very start (e.g. 2024-2025, 24-25, [2024-25])
  // so that the hyphen in the year range is not mistaken for the metadata separator.
  const yearMatch = text.match(/^\s*(?:\[|\()?(\d{2,4}[-_/]\d{2,4})(?:\]|\))?\s*[:\-_|–—−‑‒―]?\s*/i);
  if (yearMatch) {
    const afterYear = text.slice(yearMatch[0].length).trim();
    if (afterYear.length > 0) text = afterYear;
  }

  // 2. Find the first hyphen that is NOT part of a recognized internal compound prefix
  // (such as "Pre-Calculus", "Pre-Algebra", "Pre-AP", "Post-Modern", "Sci-Fi", "K-12", "Non-STEM", "Co-Op")
  let match: RegExpExecArray | null;
  const regex = new RegExp(DASH_SPLIT_REGEX);
  
  while ((match = regex.exec(text)) !== null) {
    const dashIndex = match.index;
    const beforeDash = text.slice(0, dashIndex);
    const afterDash = text.slice(dashIndex + 1);

    // Check if this dash is part of an internal compound word without spaces
    // e.g. "Pre-Calc", "Post-War", "Sci-Fi", "K-12", "Non-Majors", "Co-Op"
    const isInternalCompound = (
      dashIndex > 0 &&
      !/\s/.test(text[dashIndex - 1]) &&
      afterDash.length > 0 &&
      !/\s/.test(afterDash[0]) &&
      /\b(?:pre|post|sci|non|co|k)\b/i.test(beforeDash.split(/\s+/).pop() || '')
    );

    if (isInternalCompound) {
      // Continue to look for the next hyphen (which separates metadata)
      continue;
    }

    // Found the first metadata separator hyphen!
    const pruned = beforeDash.trim();
    if (pruned.length > 0) {
      return pruned;
    }
  }

  return text;
}

/**
 * Strips common institutional, term, year, and period prefixes from a course name.
 */
export function stripCommonPrefixes(name: string): { cleaned: string; strippedPrefix: string } {
  let text = name.trim();
  let strippedPrefix = '';

  let changed = true;
  let iterations = 0;

  while (changed && iterations < 10) {
    changed = false;
    iterations++;

    // 1. Bracketed or parenthesized tags at start: [Term], (Period 1), etc.
    const bracketMatch = text.match(/^(\[[^\]]+\]|\([^)]+\))\s*[:\-_|–—−‑‒―]?\s*/);
    if (bracketMatch) {
      strippedPrefix += ' ' + bracketMatch[0];
      text = text.slice(bracketMatch[0].length).trim();
      changed = true;
      continue;
    }

    // 2. Academic Years (e.g. "2024-2025 ", "2024_2025 - ", "24-25: ")
    const yearMatch = text.match(/^(\d{2,4}[-_]\d{2,4})\b\s*[:\-_|–—−‑‒―]?\s*/i);
    if (yearMatch) {
      strippedPrefix += ' ' + yearMatch[0];
      text = text.slice(yearMatch[0].length).trim();
      changed = true;
      continue;
    }

    // 3. Period / Section / Block prefixes (e.g. "Period 1 - ", "Pd 3: ", "P4 - ", "Block 2: ", "Sec 01: ")
    const periodMatch = text.match(/^(?:Period|Pd\.?|Per\.?|P\s*\d+|Block|Blk|Section|Sec\.?)\s*[0-9A-Z]*\s*[:\-_|–—−‑‒―]?\s*/i);
    if (periodMatch) {
      strippedPrefix += ' ' + periodMatch[0];
      text = text.slice(periodMatch[0].length).trim();
      changed = true;
      continue;
    }

    // 4. Term / Semester / Quarter prefixes (e.g. "Fall 2024 - ", "S1: ", "Q2 - ")
    const termMatch = text.match(/^(?:Fall|Spring|Summer|Winter|Semester|Sem|Quarter|Qtr|Term|S\d|Q\d)\s*\d*\s*[:\-_|–—−‑‒―]?\s*/i);
    if (termMatch) {
      strippedPrefix += ' ' + termMatch[0];
      text = text.slice(termMatch[0].length).trim();
      changed = true;
      continue;
    }

    // 5. Academic program / Track prefixes (e.g. "Adv ", "Advanced ", "Mag ", "Magnet ", "Hon ", "Honors ", "AP ", "IB ", "GT ")
    const programMatch = text.match(/^(?:Adv\.?|Advanced|Mag\.?|Magnet|Hon\.?|Honors|AP|IB|GT|Pre-AP|Dual|DE|HS|MS)\s*[:\-_|–—−‑‒―]?\s*/i);
    if (programMatch) {
      strippedPrefix += ' ' + programMatch[0];
      text = text.slice(programMatch[0].length).trim();
      changed = true;
      continue;
    }

    // 6. School / District identifiers (e.g. "MCPS - ", "BHS: ", "WHS - ")
    const schoolMatch = text.match(/^([A-Z0-9]{2,6})\s*[:\-_|–—−‑‒―]\s*/);
    if (schoolMatch) {
      strippedPrefix += ' ' + schoolMatch[0];
      text = text.slice(schoolMatch[0].length).trim();
      changed = true;
      continue;
    }
  }

  return {
    cleaned: text || name.trim(),
    strippedPrefix: strippedPrefix.trim()
  };
}

/**
 * Extracts 3-letter abbreviation candidate based on:
 * "pick the first 3 letters of the longest alphanumeric word"
 * "Don't include the A/B suffix or the 1/2/3/4 suffix in the class abbreviation"
 * Pruning long titles to hide metadata after the first hyphen is applied FIRST before computing words.
 */
function extractAbbrCandidate(inputName: string) {
  // CRITICAL: Prune first so NO metadata after the first hyphen enters abbreviation computation
  const pruned = pruneCourseTitle(inputName);
  const { cleaned, strippedPrefix } = stripCommonPrefixes(pruned);

  // Split into alphanumeric words
  const rawWords = cleaned.split(/[^a-zA-Z0-9]+/).filter(Boolean);

  // Filter out pure numbers and A/B/1/2/3/4 suffixes
  const filtered = rawWords.filter(w => {
    // Pure digits e.g. "11", "1", "2024"
    if (/^\d+$/.test(w)) return false;
    // Standalone letter A or B suffix
    if (/^[ab]$/i.test(w)) return false;
    // Suffix like 1A, 2B, 1, 2, 3, 4, S1, S2, Q1-Q4, P1-P8
    if (/^[1-4][ab]?$/i.test(w)) return false;
    if (/^[spq]\d+$/i.test(w)) return false;
    // Roman numerals I, II, III, IV
    if (/^(i|ii|iii|iv)$/i.test(w)) return false;
    // School level markers (HS = High School, MS = Middle School)
    if (/^(hs|ms)$/i.test(w)) return false;
    return true;
  });

  // Strip trailing 1, 2, 3, 4, A, B from individual words (e.g. "Sci4" -> "Sci", "Algebra1" -> "Algebra", "Bio1A" -> "Bio")
  const normalized = filtered
    .map(w => w.replace(/(?:[1-4]|[1-4]?[ab])$/i, ''))
    .filter(w => w.length >= 2);

  const words = normalized.length > 0 ? normalized : (filtered.length > 0 ? filtered : rawWords);

  // Filter common minor conjunctions/prepositions and descriptor prefixes
  const substantive = words.filter(w => !/^(and|the|for|with|of|to|in|adv|mag|hon|hs|ms)$/i.test(w));
  const pool = substantive.length > 0 ? substantive : words;

  // Heuristic: Sort by length descending to find the longest alphanumeric word
  const sorted = [...pool].sort((a, b) => b.length - a.length);
  const longestWord = sorted[0] || 'CRS';

  // Base abbreviation: first 3 letters of the longest alphanumeric word
  let baseAbbr = longestWord.slice(0, 3).toUpperCase();
  if (baseAbbr.length < 3) {
    baseAbbr = baseAbbr.padEnd(3, 'X');
  }

  // Backup candidates for collision disambiguation
  const altCandidates: string[] = [];

  // 1. Program prefix (AP -> A, Honors -> H, IB -> I) + 2 letters
  const lowerCleaned = cleaned.toLowerCase();
  if (lowerCleaned.includes('ap ') || lowerCleaned.includes(' ap') || strippedPrefix.toLowerCase().includes('ap')) {
    altCandidates.push(('A' + baseAbbr.slice(0, 2)).toUpperCase());
  } else if (lowerCleaned.includes('honors') || lowerCleaned.includes('hon') || strippedPrefix.toLowerCase().includes('hon')) {
    altCandidates.push(('H' + baseAbbr.slice(0, 2)).toUpperCase());
  } else if (lowerCleaned.includes('ib ') || strippedPrefix.toLowerCase().includes('ib')) {
    altCandidates.push(('I' + baseAbbr.slice(0, 2)).toUpperCase());
  }

  // 2. Second longest word if available (e.g. "World History" -> "WOR", "Pre-Calculus" -> "CAL" / "PRE")
  if (sorted.length > 1) {
    const second = sorted[1];
    altCandidates.push(second.slice(0, 3).toUpperCase());
    // Initial of word 1 + 2 letters of word 2
    altCandidates.push((sorted[0][0] + sorted[1].slice(0, 2)).toUpperCase());
    altCandidates.push((sorted[1][0] + sorted[0].slice(0, 2)).toUpperCase());
  }

  // 3. Alternative letters / consonants from longest word
  if (longestWord.length >= 4) {
    altCandidates.push((longestWord[0] + longestWord[1] + longestWord[longestWord.length - 1]).toUpperCase());
    altCandidates.push((longestWord[0] + longestWord[2] + longestWord[3]).toUpperCase());
    const consonants = longestWord.replace(/[AEIOU]/gi, '').toUpperCase();
    if (consonants.length >= 3) {
      altCandidates.push(consonants.slice(0, 3));
    }
  }

  // Filter out any alt candidates that end with 1-4 or A-B
  const safeAlts = altCandidates.filter(c => c.length === 3 && !/[1-4ab]$/i.test(c));

  return {
    baseAbbr,
    safeAlts,
    longestWord,
    pruned
  };
}

/**
 * Computes optimal, distinct 3-letter abbreviations for a collection of courses relative to each other.
 * Heuristic: first 3 letters of longest alphanumeric word, without A/B or 1/2/3/4 suffix.
 * Pruning is applied BEFORE computing abbreviations.
 */
export function computeCourseAbbreviations(courses: CourseData[]): Map<number, string> {
  const result = new Map<number, string>();
  if (!courses || courses.length === 0) return result;

  // Prune first for every course before extracting candidates
  const items = courses.map(c => {
    const pruned = pruneCourseTitle(c.course.name);
    return {
      id: c.course.id,
      name: c.course.name,
      pruned,
      ...extractAbbrCandidate(pruned)
    };
  });

  const taken = new Set<string>();
  const assigned = new Map<number, string>();

  // Group by base abbreviation to identify collisions
  const groups = new Map<string, typeof items>();
  items.forEach(it => {
    if (!groups.has(it.baseAbbr)) groups.set(it.baseAbbr, []);
    groups.get(it.baseAbbr)!.push(it);
  });

  // Assign unique first
  groups.forEach((group, base) => {
    if (group.length === 1) {
      assigned.set(group[0].id, base);
      taken.add(base);
    }
  });

  // Resolve collisions across the active courses set without 1-4 or A-B suffixes
  groups.forEach((group, base) => {
    if (group.length <= 1) return;

    group.forEach((it, idx) => {
      let chosen: string | null = null;
      if (idx === 0 && !taken.has(base)) {
        chosen = base;
      } else {
        for (const alt of it.safeAlts) {
          if (!taken.has(alt)) {
            chosen = alt;
            break;
          }
        }
      }

      // Fallback: extract any valid 3-letter sequence from the pruned name
      if (!chosen) {
        const lettersOnly = it.pruned.replace(/[^a-zA-Z]/g, '').toUpperCase();
        for (let i = 0; i <= lettersOnly.length - 3; i++) {
          const tri = lettersOnly.slice(i, i + 3);
          if (!taken.has(tri) && !/[1-4ab]$/i.test(tri)) {
            chosen = tri;
            break;
          }
        }
      }

      // Ultimate fallback: course code or first 3 letters
      if (!chosen) {
        const fallback = (it.pruned.replace(/[^a-zA-Z]/g, '').slice(0, 3) || 'CRS').toUpperCase().padEnd(3, 'X');
        chosen = fallback;
      }

      assigned.set(it.id, chosen);
      taken.add(chosen);
    });
  });

  items.forEach(it => {
    result.set(it.id, assigned.get(it.id) || it.baseAbbr);
  });

  return result;
}

