// World language detection and translation service for language courses

export interface WorldLanguageMatch {
  isLanguageCourse: boolean;
  languageName: string;
  sourceCode: string; // ISO 639-1 code (e.g., 'es', 'fr', 'de')
  languageCode?: string; // alias for sourceCode
  targetCode: string; // typically 'en'
  badgeText: string;
}

export interface CachedTranslation {
  itemId: string | number;
  contentHash: string;
  sourceCode: string;
  targetCode: string;
  translatedTitle: string;
  translatedDescription: string;
  timestamp: number;
}

interface LanguageDef {
  code: string;
  name: string;
  keywords: string[];
}

const WORLD_LANGUAGES: LanguageDef[] = [
  {
    code: 'es',
    name: 'Spanish',
    keywords: ['spanish', 'español', 'espanol', 'castellano', 'hispano', 'ib spanish', 'ap spanish']
  },
  {
    code: 'fr',
    name: 'French',
    keywords: ['french', 'français', 'francais', 'ap french', 'ib french']
  },
  {
    code: 'de',
    name: 'German',
    keywords: ['german', 'deutsch', 'ap german', 'ib german']
  },
  {
    code: 'zh',
    name: 'Chinese',
    keywords: ['chinese', 'mandarin', '中文', '汉语', '漢語', 'huayu', 'ap chinese', 'ib chinese']
  },
  {
    code: 'ja',
    name: 'Japanese',
    keywords: ['japanese', '日本語', 'にほんご', 'nihongo', 'ap japanese', 'ib japanese']
  },
  {
    code: 'it',
    name: 'Italian',
    keywords: ['italian', 'italiano', 'ap italian']
  },
  {
    code: 'la',
    name: 'Latin',
    keywords: ['latin', 'lingua latina', 'latina', 'ap latin']
  },
  {
    code: 'ru',
    name: 'Russian',
    keywords: ['russian', 'русский', 'ap russian']
  },
  {
    code: 'ar',
    name: 'Arabic',
    keywords: ['arabic', 'العربية', 'عربي', 'arabiyya']
  },
  {
    code: 'pt',
    name: 'Portuguese',
    keywords: ['portuguese', 'português', 'portugues']
  },
  {
    code: 'ko',
    name: 'Korean',
    keywords: ['korean', '한국어', '조선말', 'hangul']
  },
  {
    code: 'he',
    name: 'Hebrew',
    keywords: ['hebrew', 'עברית', 'ivrit']
  },
  {
    code: 'el',
    name: 'Greek',
    keywords: ['greek', 'ancient greek', 'ελληνικά']
  }
];

// Memory cache for zero-latency lookups
const memoryCache = new Map<string, CachedTranslation>();
const inProgressSet = new Set<string>();
const STORAGE_PREFIX = 'canvas_translation_v2_';

/**
 * Fast content hash (djb2) to detect whether assignment/module content changed
 */
export function computeContentHash(title: string, description = ''): string {
  const cleanTitle = (title || '').trim();
  const cleanDesc = stripHtml(description || '').trim();
  const combined = `${cleanTitle}||${cleanDesc}`;
  let hash = 5381;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) + hash) + combined.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Retrieves a cached translation from memory or localStorage
 */
export function getCachedTranslation(
  itemId: string | number, 
  currentHash?: string
): CachedTranslation | null {
  if (!itemId && itemId !== 0) return null;
  const key = String(itemId);

  // 1. Check memory cache
  let item = memoryCache.get(key);

  // 2. Check localStorage if not in memory
  if (!item && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed: CachedTranslation = JSON.parse(raw);
        if (parsed && parsed.translatedTitle !== undefined) {
          item = parsed;
          memoryCache.set(key, parsed);
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }

  if (!item) return null;

  // If currentHash is provided, verify match
  if (currentHash && item.contentHash && item.contentHash !== currentHash) {
    return null;
  }

  return item;
}

/**
 * Saves a translation to memory and localStorage, notifying listeners
 */
export function saveCachedTranslation(data: CachedTranslation): void {
  if (!data || (!data.itemId && data.itemId !== 0)) return;
  const key = String(data.itemId);
  memoryCache.set(key, data);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(data));
    } catch {
      // Ignore storage write errors (e.g. quota)
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('canvas:translation_changed', { detail: { itemId: data.itemId } }));
  }
}

/**
 * Clears cached translation for an item
 */
export function clearCachedTranslation(itemId: string | number): void {
  const key = String(itemId);
  memoryCache.delete(key);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      // Ignore
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('canvas:translation_changed', { detail: { itemId } }));
  }
}

/**
 * Checks if a translation is already cached and available instantly
 */
export function isItemTranslated(itemId: string | number, currentHash?: string): boolean {
  return getCachedTranslation(itemId, currentHash) !== null;
}

/**
 * Check if a translation is currently fetching in the background
 */
export function isTranslationInProgress(itemId: string | number): boolean {
  return inProgressSet.has(String(itemId));
}

/**
 * Set in-progress translation status
 */
export function setTranslationInProgress(itemId: string | number, inProgress: boolean): void {
  const key = String(itemId);
  if (inProgress) {
    inProgressSet.add(key);
  } else {
    inProgressSet.delete(key);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('canvas:translation_changed', { detail: { itemId } }));
  }
}

/**
 * Detects whether a course name corresponds to a world language class
 * Checks names in English as well as native course language representations.
 */
export function detectWorldLanguage(courseName: string): WorldLanguageMatch {
  if (!courseName) {
    return { isLanguageCourse: false, languageName: '', sourceCode: 'auto', targetCode: 'en', badgeText: '' };
  }

  const normalized = courseName.toLowerCase();

  for (const lang of WORLD_LANGUAGES) {
    for (const kw of lang.keywords) {
      // Word boundary or substring match with safety
      const regex = new RegExp(`(^|[^a-zA-Z0-9_À-ÿ])${kw}([^a-zA-Z0-9_À-ÿ]|$)`, 'i');
      if (regex.test(normalized) || normalized.includes(kw)) {
        return {
          isLanguageCourse: true,
          languageName: lang.name,
          sourceCode: lang.code,
          languageCode: lang.code,
          targetCode: 'en',
          badgeText: `${lang.code.toUpperCase()} ➔ EN`
        };
      }
    }
  }

  return {
    isLanguageCourse: false,
    languageName: '',
    sourceCode: 'auto',
    languageCode: 'auto',
    targetCode: 'en',
    badgeText: ''
  };
}

/**
 * Generates an external web translation URL (Google Translate)
 */
export function generateGoogleTranslateUrl(text: string, sourceLang = 'auto', targetLang = 'en'): string {
  const clean = stripHtml(text).trim();
  const truncated = clean.length > 2000 ? clean.substring(0, 2000) + '...' : clean;
  return `https://translate.google.com/?sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&text=${encodeURIComponent(truncated)}&op=translate`;
}

/**
 * Strips HTML tags and entities for clean translation
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Free translation API call using public MyMemory Translated endpoint
 * Supports automatic source detection and fallback handling.
 */
export async function translateTextWithFreeApi(
  text: string, 
  sourceLang = 'auto', 
  targetLang = 'en'
): Promise<{ success: boolean; translation: string; error?: string }> {
  const clean = stripHtml(text).trim();
  if (!clean) {
    return { success: true, translation: '' };
  }

  // Segment to max 500 characters for the free API tier
  const segment = clean.length > 500 ? clean.substring(0, 500) : clean;
  const langpair = `${sourceLang === 'auto' ? 'autodetect' : sourceLang}|${targetLang}`;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(segment)}&langpair=${encodeURIComponent(langpair)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation API returned status ${response.status}`);
    }

    const data = await response.json();
    if (data?.responseData?.translatedText) {
      let result = data.responseData.translatedText;
      if (clean.length > 500) {
        result += '... [Full text available in Google Translate]';
      }
      return {
        success: true,
        translation: result
      };
    } else if (data?.responseStatus === 403 || data?.responseStatus === 429) {
      throw new Error('Free translation quota reached. Click Google Translate below.');
    } else {
      throw new Error('No translated text returned from free API.');
    }
  } catch (err: any) {
    return {
      success: false,
      translation: '',
      error: err?.message || 'Free translation API unavailable. Use web translate link below.'
    };
  }
}

/**
 * High-level parallel translation with automatic caching and progress state
 */
export async function translateItemContent({
  itemId,
  title,
  description = '',
  sourceLang = 'auto',
  targetLang = 'en',
  forceRefresh = false
}: {
  itemId?: string | number;
  title: string;
  description?: string;
  sourceLang?: string;
  targetLang?: string;
  forceRefresh?: boolean;
}): Promise<{
  success: boolean;
  translatedTitle: string;
  translatedDescription: string;
  fromCache: boolean;
  error?: string;
}> {
  const hash = computeContentHash(title, description);

  // 1. Check cache first
  if (!forceRefresh && itemId !== undefined) {
    const cached = getCachedTranslation(itemId, hash);
    if (cached) {
      return {
        success: true,
        translatedTitle: cached.translatedTitle,
        translatedDescription: cached.translatedDescription,
        fromCache: true
      };
    }
  }

  // 2. Mark in progress
  if (itemId !== undefined) {
    setTranslationInProgress(itemId, true);
  }

  const cleanDesc = stripHtml(description);

  try {
    const emptyResult: { success: boolean; translation: string; error?: string } = { success: true, translation: '' };
    // 3. Parallelize requests to prevent sequential 2x latency
    const [titleResult, descResult] = await Promise.all([
      translateTextWithFreeApi(title, sourceLang, targetLang),
      cleanDesc 
        ? translateTextWithFreeApi(cleanDesc, sourceLang, targetLang)
        : Promise.resolve(emptyResult)
    ]);

    const anySuccess = titleResult.success || descResult.success;
    const translatedTitle = titleResult.success ? titleResult.translation : title;
    const translatedDescription = descResult.success ? descResult.translation : cleanDesc;

    if (anySuccess && itemId !== undefined) {
      // 4. Save to persistent cache
      saveCachedTranslation({
        itemId,
        contentHash: hash,
        sourceCode: sourceLang,
        targetCode: targetLang,
        translatedTitle,
        translatedDescription,
        timestamp: Date.now()
      });
    }

    return {
      success: anySuccess,
      translatedTitle,
      translatedDescription,
      fromCache: false,
      error: !anySuccess ? (titleResult.error || descResult.error || 'Failed to translate content') : undefined
    };
  } finally {
    if (itemId !== undefined) {
      setTranslationInProgress(itemId, false);
    }
  }
}
