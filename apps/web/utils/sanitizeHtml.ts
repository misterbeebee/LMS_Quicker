import { linkifyHtml } from './dashboard-helpers';

const FORBIDDEN_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'style',
  'link',
  'meta',
  'base',
  'applet',
  'frame',
  'frameset',
]);

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);

function isUnsafeUrlScheme(rawValue: string): boolean {
  const normalized = rawValue.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html')
  );
}

export interface SanitizeHtmlOptions {
  emptyFallbackHtml?: string;
  styleAnchors?: boolean;
  linkifyPlainUrls?: boolean;
}

/**
 * Sanitizes untrusted HTML (Canvas assignment descriptions, comments, or LLM output)
 * using DOMParser when available (with a strict regex fallback) to strip active content,
 * inline event handlers, and unsafe URL schemes.
 */
export function sanitizeHtml(html?: string | null, options: SanitizeHtmlOptions = {}): string {
  const {
    emptyFallbackHtml = '',
    styleAnchors = false,
    linkifyPlainUrls = false,
  } = options;

  if (!html || !html.trim()) {
    return emptyFallbackHtml;
  }

  let sanitized = html;

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const walk = (root: ParentNode) => {
      const children = Array.from(root.children);
      for (const el of children) {
        const tag = el.tagName.toLowerCase();
        if (FORBIDDEN_TAGS.has(tag)) {
          el.remove();
          continue;
        }

        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on') || name === 'srcdoc') {
            el.removeAttribute(attr.name);
            continue;
          }
          if (URL_ATTRIBUTES.has(name) && isUnsafeUrlScheme(attr.value)) {
            el.removeAttribute(attr.name);
          }
        }

        if (tag === 'a') {
          let href = (el.getAttribute('href') ?? '').trim();
          if (!href || href === '#' || isUnsafeUrlScheme(href)) {
            if (styleAnchors) {
              const span = doc.createElement('span');
              span.className = 'inline';
              span.innerHTML = el.innerHTML;
              el.replaceWith(span);
              walk(span);
              continue;
            } else {
              el.removeAttribute('href');
            }
          } else {
            if (/^hhttps?:\/\//i.test(href)) {
              href = href.replace(/^h/i, '');
            } else if (
              styleAnchors &&
              !href.startsWith('http://') &&
              !href.startsWith('https://') &&
              !href.startsWith('mailto:') &&
              !href.startsWith('/')
            ) {
              href = `https://${href}`;
            }
            el.setAttribute('href', href);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
            if (styleAnchors && !el.className.includes('text-blue-600')) {
              el.className =
                'text-blue-600 hover:text-blue-800 underline font-medium break-words cursor-pointer inline';
            }
          }
        }

        walk(el);
      }
    };

    walk(doc.body);
    sanitized = doc.body.innerHTML;
  } else {
    sanitized = sanitized
      .replace(/<(script|iframe|object|embed|svg|form|style|meta|link|base)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<(script|iframe|object|embed|svg|form|style|meta|link|base)\b[^>]*\/?>/gi, '')
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
  }

  if (linkifyPlainUrls) {
    sanitized = linkifyHtml(sanitized);
  }

  return sanitized;
}
