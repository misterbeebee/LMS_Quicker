import * as cheerio from 'cheerio';

export type CheerioSelection = ReturnType<cheerio.CheerioAPI>;

export function firstNonEmpty(...values: ReadonlyArray<string | null | undefined>): string | null {
  for (const val of values) {
    if (typeof val === 'string') {
      const cleaned = val.replace(/\s+/g, ' ').trim();
      if (cleaned) return cleaned;
    }
  }
  return null;
}

export function stripNodeText(_$: cheerio.CheerioAPI, el: CheerioSelection): string {
  return el.text().replace(/\s+/g, ' ').trim();
}

export function parseNumericScore(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'N/A' || upper === 'NA' || upper === '--' || upper === '-') {
    return null;
  }
  const mPct = /(-?\d+(?:\.\d+)?)\s*%/.exec(cleaned);
  if (mPct?.[1]) {
    return Number.parseFloat(mPct[1]);
  }
  const mNum = /^(-?\d+(?:\.\d+)?)$/.exec(cleaned);
  if (mNum?.[1]) {
    return Number.parseFloat(mNum[1]);
  }
  return null;
}

export function formatScoreRaw(scoreNum: number | null): string {
  if (scoreNum === null || !Number.isFinite(scoreNum)) return '';
  return scoreNum.toFixed(1).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Extract a JSON object or array literal starting at startIdx, balancing brackets cleanly.
 */
export function extractBalancedJson(text: string, startIdx: number): unknown {
  if (startIdx < 0 || startIdx >= text.length) return null;
  const opener = text[startIdx];
  if (opener !== '{' && opener !== '[') return null;
  const closer = opener === '{' ? '}' : ']';

  let depth = 0;
  let inStr: string | null = null;
  let escaped = false;

  for (let idx = startIdx; idx < text.length; idx++) {
    const ch = text[idx]!;
    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === opener) {
      depth += 1;
    } else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        const snippet = text.slice(startIdx, idx + 1);
        try {
          return JSON.parse(snippet) as unknown;
        } catch {
          const cleaned = snippet.replace(/,\s*([}\]])/g, '$1');
          try {
            return JSON.parse(cleaned) as unknown;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Find `<pattern> = { ... }` or `<pattern>({ ... })` in HTML/JS scripts and parse JSON.
 */
export function extractJsAssignmentJson(htmlText: string, pattern: RegExp): unknown {
  if (!htmlText) return null;
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(htmlText)) !== null) {
    const rest = htmlText.slice(match.index + match[0].length);
    const braceMatch = /[{[]/.exec(rest);
    if (!braceMatch) continue;
    const parsed = extractBalancedJson(rest, braceMatch.index);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

/**
 * Extract label -> value pairs from Synergy PXP2 HTML tables/definition blocks.
 */
export function extractLabelValuePairs(htmlText: string): Record<string, string> {
  const $ = cheerio.load(htmlText);
  const pairs: Record<string, string> = {};

  $('tr').each((_idx, row) => {
    const cells = $(row).children('th, td');
    if (cells.length >= 2) {
      for (let i = 0; i < cells.length - 1; i += 2) {
        const k = $(cells[i]!).text().replace(/\s+/g, ' ').trim().replace(/:+$/, '').toLowerCase();
        const v = $(cells[i + 1]!).text().replace(/\s+/g, ' ').trim();
        if (k && v && !(k in pairs)) {
          pairs[k] = v;
        }
      }
    }
  });

  $('span[class*="lbl"], span[id*="lbl"], span[class*="label"], label').each((_idx, lbl) => {
    const k = $(lbl).text().replace(/\s+/g, ' ').trim().replace(/:+$/, '').toLowerCase();
    if (!k) return;
    const sib = $(lbl).next();
    if (sib.length > 0) {
      const v = sib.text().replace(/\s+/g, ' ').trim();
      if (v && !(k in pairs)) {
        pairs[k] = v;
      }
    }
  });

  return pairs;
}

export function parsePxp2CategoryRows(
  $: cheerio.CheerioAPI,
  tableEl: CheerioSelection
): Array<Record<string, unknown>> {
  const categories: Array<Record<string, unknown>> = [];
  if (tableEl.length === 0) return categories;

  const headers: string[] = [];
  tableEl.find('thead th, thead td').each((_i, el) => {
    headers.push(stripNodeText($, $(el)).toLowerCase());
  });

  let rows = tableEl.find('tbody > tr');
  if (rows.length === 0) {
    rows = tableEl.find('tr').filter((_i, tr) => $(tr).children('td').length > 0);
  }

  rows.each((_i, tr) => {
    const cells = $(tr).children('td, th');
    if (cells.length < 2) return;
    const vals: string[] = [];
    cells.each((_j, c) => {
      vals.push(stripNodeText($, $(c)));
    });
    const first = vals[0] ?? '';
    const firstLower = first.toLowerCase();
    if (
      !first ||
      firstLower === 'total' ||
      firstLower === 'totals' ||
      firstLower === 'assignment type' ||
      firstLower === 'category'
    ) {
      return;
    }

    const entry: Record<string, unknown> = { '@Type': first };
    if (headers.length > 0 && headers.length === vals.length) {
      for (let idx = 1; idx < headers.length; idx++) {
        const h = headers[idx] ?? '';
        const v = vals[idx] ?? '';
        if (!v) continue;
        if (h.includes('weight') || h.includes('% of grade')) {
          entry['@Weight'] = v.endsWith('%') ? v : `${v}%`;
        } else if (h.includes('possible') || h.includes('max')) {
          entry['@PointsPossible'] = v;
        } else if (h.includes('point')) {
          const mPair = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(v);
          if (mPair?.[1] && mPair[2]) {
            entry['@Points'] = mPair[1];
            entry['@PointsPossible'] = mPair[2];
          } else {
            entry['@Points'] = v;
          }
        } else if (
          h.includes('score') ||
          h.includes('pct') ||
          h.includes('%') ||
          h.includes('mark') ||
          h.includes('calc')
        ) {
          entry['@CalculatedMark'] = v;
        }
      }
    } else {
      const v1 = vals[1];
      if (v1) {
        entry['@Weight'] = v1.includes('%') ? v1 : `${v1}%`;
      }
      const v2 = vals[2];
      if (v2) {
        const mPair = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(v2);
        if (mPair?.[1] && mPair[2]) {
          entry['@Points'] = mPair[1];
          entry['@PointsPossible'] = mPair[2];
        } else {
          entry['@Points'] = v2;
        }
      }
      const v3 = vals[3];
      if (v3) {
        entry['@CalculatedMark'] = v3;
      }
      const v4 = vals[4];
      if (v4 && !('@PointsPossible' in entry)) {
        entry['@CalculatedMark'] = v4;
      }
    }

    categories.push(entry);
  });

  return categories;
}

function asStr(val: unknown): string {
  return val === null || val === undefined ? '' : String(val);
}

export function normalizePxp2AssignmentItem(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const rec = item as Record<string, unknown>;

  const title = firstNonEmpty(
    asStr(rec['Measure']),
    asStr(rec['Assignment']),
    asStr(rec['AssignmentName']),
    asStr(rec['Title']),
    asStr(rec['title']),
    asStr(rec['measure']),
    asStr(rec['Name'])
  );
  if (!title) return null;

  const category = firstNonEmpty(
    asStr(rec['Type']),
    asStr(rec['AssignmentType']),
    asStr(rec['Category']),
    asStr(rec['category'])
  );
  const dateStr = firstNonEmpty(
    asStr(rec['Date']),
    asStr(rec['AssignedDate']),
    asStr(rec['DueDate']),
    asStr(rec['DateDue'])
  );
  const dueStr = firstNonEmpty(asStr(rec['DueDate']), asStr(rec['DateDue']), dateStr ?? '');
  const scoreStr = firstNonEmpty(
    asStr(rec['DisplayScore']),
    asStr(rec['Score']),
    asStr(rec['score']),
    asStr(rec['Points'])
  );
  const pointsStr = firstNonEmpty(
    asStr(rec['Points']),
    asStr(rec['PointString']),
    asStr(rec['MaxScore']),
    scoreStr ?? ''
  );
  const notesStr = firstNonEmpty(asStr(rec['Notes']), asStr(rec['notes']), asStr(rec['Comment']));

  const out: Record<string, unknown> = { '@Measure': title };
  if (category) out['@Type'] = category;
  if (dateStr) out['@Date'] = dateStr;
  if (dueStr) out['@DueDate'] = dueStr;
  if (scoreStr) out['@Score'] = scoreStr;
  if (pointsStr) out['@Points'] = pointsStr;
  if (notesStr) out['@Notes'] = notesStr;
  return out;
}

/**
 * Extract (categories, assignments) from a Gradebook_ClassDetails HTML snippet.
 */
export function parsePxp2ClassDetailsHtml(htmlText: string): {
  categories: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
} {
  let categories: Array<Record<string, unknown>> = [];
  const assignments: Array<Record<string, unknown>> = [];

  if (!htmlText || !htmlText.trim()) {
    return { categories, assignments };
  }

  // 1. Extract DevExtreme dxDataGrid dataSource JSON array from inline <script>
  const ds = extractJsAssignmentJson(htmlText, /dataSource\s*:/);
  if (Array.isArray(ds)) {
    for (const row of ds) {
      const norm = normalizePxp2AssignmentItem(row);
      if (norm) assignments.push(norm);
    }
  }

  // 2. Extract Category weights & fallback assignments from HTML tables
  const $ = cheerio.load(`<div>${htmlText}</div>`);

  let catTable = $('.CategoryWeightsGrid table').first();
  if (catTable.length === 0) {
    catTable = $('#category-graph table').first();
  }
  if (catTable.length > 0) {
    categories = parsePxp2CategoryRows($, catTable);
  } else {
    $('table').each((_i, tbl) => {
      if (categories.length > 0) return;
      const tblEl = $(tbl);
      const headerTxt = tblEl
        .find('thead th, tr:first-child > th')
        .map((_j, th) => stripNodeText($, $(th)).toLowerCase())
        .get()
        .join(' ');
      if (
        headerTxt.includes('weight') ||
        (headerTxt.includes('category') && (headerTxt.includes('points') || headerTxt.includes('%')))
      ) {
        const parsed = parsePxp2CategoryRows($, tblEl);
        if (parsed.length > 0) {
          categories = parsed;
        }
      }
    });
  }

  if (assignments.length === 0) {
    const asgnTables: CheerioSelection[] = [];
    const primaryAsgn = $('#assignment-details table');
    if (primaryAsgn.length > 0) {
      primaryAsgn.each((_i, t) => {
        asgnTables.push($(t));
      });
    } else {
      const dataTables = $('table.data-table');
      if (dataTables.length > 0) {
        dataTables.each((_i, t) => {
          asgnTables.push($(t));
        });
      }
    }
    if (asgnTables.length === 0) {
      $('table').each((_i, tbl) => {
        if (asgnTables.length > 0) return;
        const tblEl = $(tbl);
        const headerTxt = tblEl
          .find('thead th, tr:first-child > th')
          .map((_j, th) => stripNodeText($, $(th)).toLowerCase())
          .get()
          .join(' ');
        const hasTitleCol = ['assignment', 'measure', 'score'].some((k) => headerTxt.includes(k));
        const hasMetaCol = ['date', 'type', 'category', 'points', 'notes'].some((k) =>
          headerTxt.includes(k)
        );
        if (hasTitleCol && hasMetaCol) {
          asgnTables.push(tblEl);
        }
      });
    }

    for (const tbl of asgnTables) {
      let headerNodes = tbl.find('thead th');
      if (headerNodes.length === 0) {
        headerNodes = tbl.find('tr').first().children('th');
      }
      const headers = headerNodes.map((_i, th) => stripNodeText($, $(th)).toLowerCase()).get();
      if (headers.length === 0) continue;

      let rows = tbl.find('tbody > tr');
      if (rows.length === 0) {
        rows = tbl.find('tr').filter((_i, tr) => $(tr).children('td').length > 0);
      }

      rows.each((_i, tr) => {
        const cells = $(tr).children('td');
        if (cells.length < 2) return;
        const vals = cells.map((_j, c) => stripNodeText($, $(c))).get();
        const rowMap: Record<string, string> = {};
        const len = Math.min(headers.length, vals.length);
        for (let idx = 0; idx < len; idx++) {
          const h = headers[idx] ?? '';
          const v = vals[idx] ?? '';
          if (!v) continue;
          if (h.includes('assignment') || h.includes('measure') || h.includes('title')) {
            rowMap['Measure'] = v;
          } else if (h.includes('type') || h.includes('category')) {
            rowMap['Type'] = v;
          } else if (h.includes('due')) {
            rowMap['DueDate'] = v;
          } else if (h.includes('date')) {
            rowMap['Date'] = v;
          } else if (h.includes('point')) {
            rowMap['Points'] = v;
          } else if (h.includes('score')) {
            rowMap['Score'] = v;
          } else if (h.includes('note') || h.includes('comment')) {
            rowMap['Notes'] = v;
          }
        }
        const norm = normalizePxp2AssignmentItem(rowMap);
        if (norm) assignments.push(norm);
      });
    }
  }

  return { categories, assignments };
}

export interface ParsedLoginForm {
  readonly action: string;
  readonly fields: Record<string, string>;
  readonly userField: string | null;
  readonly passField: string | null;
  readonly submitField: string | null;
  readonly submitValue: string;
  readonly usesJsEncode: boolean;
}

export function parsePxp2LoginForm(htmlText: string): ParsedLoginForm | null {
  const $ = cheerio.load(htmlText);
  const form = $('form#aspnetForm').first().length > 0 ? $('form#aspnetForm').first() : $('form').first();
  if (form.length === 0) return null;

  const fields: Record<string, string> = {};
  let userField: string | null = null;
  let passField: string | null = null;
  let submitField: string | null = null;
  let submitValue = 'Login';

  form.find('input[name]').each((_i, inp) => {
    const el = $(inp);
    const name = el.attr('name') ?? '';
    if (!name) return;
    const itype = (el.attr('type') ?? 'text').toLowerCase();
    const val = el.attr('value') ?? '';
    if (itype === 'password' && passField === null) {
      passField = name;
    } else if ((itype === 'text' || itype === 'email') && userField === null) {
      userField = name;
    } else if (itype === 'submit' && submitField === null) {
      submitField = name;
      submitValue = val || 'Login';
    } else if (!['submit', 'button', 'image', 'reset'].includes(itype)) {
      fields[name] = val;
    }
  });

  const usesJsEncode = htmlText.includes('PXP2_Login.js') || htmlText.includes('encodeURIComponent');
  return {
    action: form.attr('action') ?? '',
    fields,
    userField,
    passField,
    submitField,
    submitValue,
    usesJsEncode,
  };
}

export function extractPxp2LoginError(htmlText: string): { errorMsg: string | null; hasPasswordInput: boolean } {
  const $ = cheerio.load(htmlText);
  const errNodes = $('#ctl00_MainContent_ERROR, [id*="_ERROR"], .alert-danger');
  let errorMsg: string | null = null;
  errNodes.each((_i, node) => {
    if (errorMsg) return;
    const txt = stripNodeText($, $(node));
    if (txt) errorMsg = txt;
  });
  const hasPasswordInput = $('input[type="password"]').length > 0;
  return { errorMsg, hasPasswordInput };
}

export function extractDomStudents(landingHtml: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (!landingHtml) return out;
  const $ = cheerio.load(landingHtml);
  const seen = new Set<string>();
  $('[data-agu]').each((_i, node) => {
    const el = $(node);
    const agu = (el.attr('data-agu') ?? '').trim();
    const label = firstNonEmpty(el.text());
    if (agu && !seen.has(agu)) {
      seen.add(agu);
      out.push({ AGU: agu, name: label });
    }
  });
  return out;
}

/**
 * Pure ES2023 relative URL resolver (replaces urllib.parse.urljoin without DOM URL global).
 */
export function resolveUrl(baseUrl: string, relative: string): string {
  const rel = relative.trim();
  if (!rel) return baseUrl;
  if (/^https?:\/\//i.test(rel)) return rel;

  const originMatch = /^(https?:\/\/[^/?#]+)(.*)$/i.exec(baseUrl);
  if (!originMatch) return rel;
  const origin = originMatch[1]!;
  const basePath = (originMatch[2] ?? '/').split(/[?#]/)[0] ?? '/';

  if (rel.startsWith('//')) {
    const proto = origin.startsWith('https:') ? 'https:' : 'http:';
    return `${proto}${rel}`;
  }
  if (rel.startsWith('/')) {
    return `${origin}${rel}`;
  }
  if (rel.startsWith('?')) {
    return `${origin}${basePath}${rel}`;
  }

  const lastSlash = basePath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? basePath.slice(0, lastSlash + 1) : '/';
  const cleanedRel = rel.replace(/^\.\//, '');
  return `${origin}${dir}${cleanedRel}`;
}

export function encodeFormUrlEncoded(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Matches JS encodeURIComponent() used by PXP2_Login.js (leaves -_.!~*'() unencoded).
 */
export function encodePxp2Password(password: string): string {
  return encodeURIComponent(password);
}

export function randomGuid(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}
