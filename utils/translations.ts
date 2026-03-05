/**
 * Simple translation system
 * English text is used as key, returns translated text or falls back to English
 */

export type Locale = 'en' | 'ru' | 'be' | 'uk' | 'sr';

// Cache for loaded translations
const translationCache: Record<Locale, Record<string, string>> = {
  en: {}, // English returns the key itself
  ru: {},
  be: {},
  uk: {},
  sr: {},
};

/**
 * Load translations from JSON file
 */
async function loadTranslations(locale: Locale): Promise<Record<string, string>> {
  if (locale === 'en') return {};

  try {
    // Use relative path for GitHub Pages compatibility
    const basePath = import.meta.env.BASE_URL || './';
    const response = await fetch(`${basePath}locales/${locale}.json`);
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Get translation for a text
 * @param text English text (used as key)
 * @param locale Target locale
 * @returns Translated text or original English if not found
 */
export async function translate(text: string, locale: Locale = 'en'): Promise<string> {
  if (locale === 'en') return text;

  // Load translations if not cached
  if (Object.keys(translationCache[locale]).length === 0) {
    translationCache[locale] = await loadTranslations(locale);
  }

  return translationCache[locale][text] || text;
}

/**
 * Synchronous translation hook (translations must be preloaded)
 */
export function t(text: string, locale: Locale = 'en'): string {
  if (locale === 'en') return text;
  return translationCache[locale][text] || text;
}

/**
 * Preload translations for a locale
 */
export async function preloadTranslations(locale: Locale): Promise<void> {
  if (locale === 'en') return;
  if (Object.keys(translationCache[locale]).length > 0) return;

  translationCache[locale] = await loadTranslations(locale);
}

/**
 * Preload all translations
 */
export async function preloadAllTranslations(): Promise<void> {
  await Promise.all(['ru', 'be', 'uk', 'sr'].map(l => preloadTranslations(l as Locale)));
}
