import type englishCatalog from '../../public/locales/en.json';

export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = keyof typeof englishCatalog;
export type LocaleCatalog = Record<MessageKey, string>;

let catalogs: Partial<Record<Locale, LocaleCatalog>> = {};

export function getLocaleCatalog(locale: Locale): Readonly<LocaleCatalog> | null {
  return catalogs[locale] ?? null;
}

export function setLocaleCatalog(locale: Locale, value: unknown): void {
  if (!isCatalog(value)) throw new Error(`Invalid ${locale} language catalog.`);
  catalogs = { ...catalogs, [locale]: value };
}

/** Load public dictionaries before mounting the game; translations stay out of JS bundles. */
export async function loadLocaleCatalogs(request: typeof fetch = fetch): Promise<void> {
  const loaded = await Promise.all(LOCALES.map(async (locale) => {
    const base = import.meta.env.BASE_URL;
    const url = `${base.endsWith('/') ? base : `${base}/`}locales/${locale}.json`;
    const response = await request(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Could not load ${locale} language data (HTTP ${response.status}).`);
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new Error(`Could not read ${locale} language data.`); }
    if (!isCatalog(data)) throw new Error(`Invalid ${locale} language data.`);
    return [locale, data] as const;
  }));
  const next = Object.fromEntries(loaded) as Record<Locale, LocaleCatalog>;
  validateCatalogPair(next.en, next.ja);
  catalogs = next;
}

export function t(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = catalogs[locale]?.[key] ?? catalogs.en?.[key] ?? key;
  return interpolate(message, values);
}

export function interpolate(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function detectLocale(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): Locale {
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja';
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  }
  return 'en';
}

function isCatalog(value: unknown): value is LocaleCatalog {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((message) => typeof message === 'string'));
}

function validateCatalogPair(en: LocaleCatalog, ja: LocaleCatalog): void {
  const enKeys = Object.keys(en); const jaKeys = Object.keys(ja);
  if (enKeys.length !== jaKeys.length || enKeys.some((key) => !(key in ja))) {
    throw new Error('Language catalogs have different message keys.');
  }
  for (const key of enKeys) {
    const expected = [...en[key as MessageKey].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const translated = [...ja[key as MessageKey].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    if (expected.join('|') !== translated.join('|')) throw new Error(`Placeholder mismatch in language message: ${key}.`);
  }
}
