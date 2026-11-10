// World language detection and translation service for language courses

export interface WorldLanguageMatch {
  isLanguageCourse: boolean;
  languageName: string;
  sourceCode: string; // ISO 639-1 code (e.g., 'es', 'fr', 'de')
  languageCode?: string; // alias for sourceCode
  targetCode: string; // typically 'en'
  badgeText: string;
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
  const segment = clean.length > 500 ? clean.substring(0, 500) + '...' : clean;
  const langpair = `${sourceLang === 'auto' ? 'autodetect' : sourceLang}|${targetLang}`;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(segment)}&langpair=${encodeURIComponent(langpair)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Translation API returned status ${response.status}`);
    }

    const data = await response.json();
    if (data?.responseData?.translatedText) {
      return {
        success: true,
        translation: data.responseData.translatedText
      };
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
