// Regenerates src/design/theme.css from src/design/tokens.js.
// Usage: node scripts/design/build-theme-css.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderThemeCss } from '../../src/design/themeCss.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'src/design/theme.css');
writeFileSync(out, renderThemeCss());
console.log(`wrote ${out}`);
