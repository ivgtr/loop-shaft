import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localeDirectory = path.join(root, 'public', 'locales');
const files = (await readdir(localeDirectory)).filter((file) => file.endsWith('.json')).sort();
if (!files.includes('en.json') || !files.includes('ja.json')) throw new Error('public/locales must contain en.json and ja.json.');

const catalogs = new Map();
for (const file of files) {
  const locale = path.basename(file, '.json');
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale)) throw new Error(`Invalid locale filename: ${file}`);
  let catalog;
  try { catalog = JSON.parse(await readFile(path.join(localeDirectory, file), 'utf8')); }
  catch (error) { throw new Error(`Could not parse ${file}: ${error.message}`); }
  if (!catalog || Array.isArray(catalog) || typeof catalog !== 'object'
    || Object.entries(catalog).some(([key, value]) => !key || typeof value !== 'string')) {
    throw new Error(`${file} must be a JSON object with string values.`);
  }
  catalogs.set(locale, catalog);
}

const english = catalogs.get('en');
const expectedKeys = Object.keys(english).sort();
for (const [locale, catalog] of catalogs) {
  const keys = Object.keys(catalog).sort();
  const missing = expectedKeys.filter((key) => !(key in catalog));
  const extra = keys.filter((key) => !(key in english));
  if (missing.length || extra.length) {
    throw new Error(`${locale}.json key mismatch; missing: ${missing.slice(0, 8).join(', ') || 'none'}; extra: ${extra.slice(0, 8).join(', ') || 'none'}.`);
  }
  if (locale === 'en') continue;
  for (const key of expectedKeys) {
    const placeholders = (message) => [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join('|');
    if (placeholders(english[key]) !== placeholders(catalog[key])) {
      throw new Error(`${locale}.json placeholder mismatch for ${key}.`);
    }
  }
}

const source = await readFile(path.join(root, 'src', 'i18n', 'index.ts'), 'utf8');
const localesMatch = /export const LOCALES = \[([^\]]+)\] as const/.exec(source);
if (!localesMatch) throw new Error('Could not read LOCALES in src/i18n/index.ts.');
const configuredLocales = [...localesMatch[1].matchAll(/[\'"]([a-z]{2,3}(?:-[A-Z]{2})?)[\'"]/g)].map((match) => match[1]);
for (const locale of catalogs.keys()) if (!configuredLocales.includes(locale)) throw new Error(`${locale}.json exists but ${locale} is missing from LOCALES in src/i18n/index.ts.`);
for (const locale of configuredLocales) if (!catalogs.has(locale)) throw new Error(`${locale} is configured but public/locales/${locale}.json is missing.`);

console.log(`Checked ${catalogs.size} locale catalogs (${expectedKeys.length} messages each).`);
