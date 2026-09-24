import { readFileSync } from 'node:fs';
import { setLocaleCatalog } from '../src/i18n';

setLocaleCatalog('en', JSON.parse(readFileSync(new URL('../public/locales/en.json', import.meta.url), 'utf8')));
setLocaleCatalog('ja', JSON.parse(readFileSync(new URL('../public/locales/ja.json', import.meta.url), 'utf8')));
