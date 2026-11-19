import type { VelmMockDatastoreV1 } from './schema.js';

export interface SanitizeMockOptions {
  readonly fakeName?: string;
  readonly fakeEmail?: string;
  readonly fakeStudentId?: string;
  readonly fakeCanvasDomain?: string;
  readonly fakeSynergyDomain?: string;
  readonly extraIdentifiers?: readonly string[];
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectCanvasIdentifiers(store: VelmMockDatastoreV1): string[] {
  const ids = new Set<string>();
  const sources = [store.canvas?.self, store.canvas?.profile];
  const fields = ['name', 'short_name', 'sortable_name', 'login_id', 'sis_user_id', 'primary_email', 'email'];
  for (const src of sources) {
    if (!src) continue;
    for (const f of fields) {
      const val = src[f];
      if (typeof val === 'string' && val.trim().length >= 3) {
        ids.add(val.trim());
      }
    }
  }
  return [...ids];
}

function collectSynergyIdentifiers(store: VelmMockDatastoreV1): string[] {
  const ids = new Set<string>();
  const info = store.synergy?.data?.['student_info'];
  if (!info) return [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (
        /^(FormattedName|PermID|EMail|Phone|Address|HomeAddress|ParentName|UserName)$/i.test(k)
      ) {
        if (typeof v === 'string' && v.trim().length >= 3) {
          ids.add(v.trim());
        } else if (v && typeof v === 'object' && '$' in (v as Record<string, unknown>)) {
          const text = (v as Record<string, unknown>)['$'];
          if (typeof text === 'string' && text.trim().length >= 3) {
            ids.add(text.trim());
          }
        }
      } else {
        walk(v);
      }
    }
  };
  walk(info);
  return [...ids];
}

/**
 * Recursively scrub emails, phone numbers, real student names/IDs, and school domains
 * from a downloaded VelmMockDatastoreV1 while preserving exact API schemas and grade math.
 */
export function sanitizeMockDatastore(
  store: VelmMockDatastoreV1,
  options: SanitizeMockOptions = {}
): VelmMockDatastoreV1 {
  const fakeName = options.fakeName ?? 'Alex Rivera';
  const fakeEmail = options.fakeEmail ?? 'alex.rivera@mock.school.edu';
  const fakeStudentId = options.fakeStudentId ?? '990001';
  const fakeCanvasDomain = options.fakeCanvasDomain ?? 'mock.instructure.com';
  const fakeSynergyDomain = options.fakeSynergyDomain ?? 'mock-sis.edupoint.com';

  const replacements: Array<[RegExp, string]> = [];

  if (store.canvas?.domain && store.canvas.domain !== fakeCanvasDomain) {
    replacements.push([new RegExp(escapeRegExp(store.canvas.domain), 'gi'), fakeCanvasDomain]);
  }
  if (store.synergy?.domain && store.synergy.domain !== fakeSynergyDomain) {
    replacements.push([new RegExp(escapeRegExp(store.synergy.domain), 'gi'), fakeSynergyDomain]);
  }

  const rawIdentifiers = [
    ...collectCanvasIdentifiers(store),
    ...collectSynergyIdentifiers(store),
    ...(options.extraIdentifiers ?? []),
  ]
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .sort((a, b) => b.length - a.length);

  for (const id of rawIdentifiers) {
    const target = id.includes('@')
      ? fakeEmail
      : /^\d{4,}$/.test(id)
        ? fakeStudentId
        : fakeName;
    replacements.push([new RegExp(escapeRegExp(id), 'gi'), target]);
  }

  // Generic email & phone sweep
  replacements.push([/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, fakeEmail]);
  replacements.push([/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, '555-010-0000']);

  const scrubString = (input: string): string => {
    let out = input;
    for (const [re, rep] of replacements) {
      out = out.replace(re, rep);
    }
    return out;
  };

  const scrubValue = (val: unknown): unknown => {
    if (typeof val === 'string') return scrubString(val);
    if (Array.isArray(val)) return val.map(scrubValue);
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (/^(avatar_url|photo|base64photo|session_token|access_token)$/i.test(k)) {
          out[k] = null;
        } else {
          out[k] = scrubValue(v);
        }
      }
      return out;
    }
    return val;
  };

  const scrubbed = scrubValue(store) as VelmMockDatastoreV1;
  return {
    ...scrubbed,
    sanitized: true,
    ...(scrubbed.canvas ? { canvas: { ...scrubbed.canvas, domain: fakeCanvasDomain } } : {}),
    ...(scrubbed.synergy ? { synergy: { ...scrubbed.synergy, domain: fakeSynergyDomain } } : {}),
  };
}
