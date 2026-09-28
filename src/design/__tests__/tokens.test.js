/**
 * Design system tokens: WCAG AA contrast in both themes, theme.css in step
 * with tokens.js, and every generated rule scoped so non-pilot apps are
 * untouched.
 */
import fs from 'fs';
import path from 'path';
import {
  THEMES, CONTRAST_PAIRS, SHADCN_ALIASES, contrastRatio,
  hexToHslTriplet, hslTripletToHex,
} from '@/design/tokens';
import { renderThemeCss } from '@/design/themeCss';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('colour roles', () => {
  it('both themes define exactly the same roles', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort());
  });

  for (const theme of ['light', 'dark']) {
    describe(`${theme} theme contrast (WCAG 2.1 AA)`, () => {
      it.each(CONTRAST_PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
        const t = THEMES[theme];
        expect(t[fg]).toBeDefined();
        expect(t[bg]).toBeDefined();
        expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
      });
    });
  }

  it('keeps AA after rounding to the HSL triplets the shadcn variables use', () => {
    for (const theme of ['light', 'dark']) {
      const t = THEMES[theme];
      const viaHsl = Object.fromEntries(
        Object.entries(t).map(([k, hex]) => [k, hslTripletToHex(hexToHslTriplet(hex))]),
      );
      for (const [fg, bg, min] of CONTRAST_PAIRS) {
        expect(contrastRatio(viaHsl[fg], viaHsl[bg])).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('computes the reference ratios correctly (black/white 21:1, same colour 1:1)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2F6B48', '#2F6B48')).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1 AA boundary grey
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it('takes the brand primary and accent from the homepage brand pack', () => {
    const home = read('src/pages/Home.css');
    expect(home).toMatch(/--gold:#C8A24E/);
    expect(THEMES.light.accent).toBe('#C8A24E');
    expect(THEMES.light.text).toBe('#14231B'); // --text
    expect(THEMES.dark.surface).toBe('#0C1F16'); // --ink
  });

  it('uses the grey panel neutrals in light (owner decision, 2026-09-28)', () => {
    expect(THEMES.light).toMatchObject({
      bg: '#E1E4E8',
      surface: '#EDEFF2',
      raised: '#F8F9FA',
      sunken: '#D8DCE1',
      border: '#C3C9D0',
      'border-strong': '#6E7883',
      muted: '#4D5761',
    });
    // brand roles are unchanged by the grey panel
    expect(THEMES.light.primary).toBe('#2F6B48');
    expect(THEMES.light['primary-text']).toBe('#2F6B48');
  });

  it('maps every shadcn alias to a real role', () => {
    for (const role of Object.values(SHADCN_ALIASES)) {
      expect(THEMES.light[role]).toBeDefined();
    }
  });
});

describe('theme.css', () => {
  const css = read('src/design/theme.css');

  it('is the generated output of tokens.js (run scripts/design/build-theme-css.mjs)', () => {
    expect(css).toBe(renderThemeCss());
  });

  it('scopes every rule under [data-pl-theme], so it is inert outside an opted-in app', () => {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectorGroups = [...noComments.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectorGroups.length).toBeGreaterThan(0);
    for (const group of selectorGroups) {
      for (const sel of group.split(',').map((s) => s.trim()).filter(Boolean)) {
        expect(sel).toMatch(/^(:where\()?\[data-pl-(theme|root)/);
      }
    }
    expect(noComments).not.toMatch(/(^|[\s,}]):root\b/);
    expect(noComments).not.toMatch(/(^|[\s,}])\.dark\b/);
    expect(noComments).not.toMatch(/(^|[\s,}])(body|html)\b/);
  });

  it('keeps dark canvases dark and chart surfaces white inside any themed app', () => {
    expect(css).toMatch(/\[data-pl-theme\] \[data-canvas="dark"\]/);
    expect(css).toMatch(/\[data-pl-theme\] \[data-canvas="chart"\]/);
    expect(css).toMatch(/\[data-canvas="chart"\]\) \{\n  background-color: rgb\(var\(--pl-chart-surface\)\)/);
  });

  it('leaves the legacy global dark variables in index.css as they were', () => {
    const index = read('src/index.css');
    expect(index).toMatch(/:root, \.dark \{/);
    expect(index).toMatch(/--background: 210 25% 8%;/);
    expect(index).toMatch(/--card: 219 25% 18%;/);
    expect(index).toMatch(/--primary: 217 91% 60%;/);
    expect(index).not.toMatch(/data-pl-theme/);
  });

  it('is imported once, after index.css, from main.jsx', () => {
    const main = read('src/main.jsx');
    expect(main.indexOf("import './design/theme.css'")).toBeGreaterThan(main.indexOf("import './index.css'"));
  });
});

describe('tailwind wiring', () => {
  it('exposes every role as a pl-* colour and adds nothing to the legacy colour keys', () => {
    const cfg = read('tailwind.config.js');
    const listed = [...cfg.match(/const PL_ROLES = \[([\s\S]*?)\];/)[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...Object.keys(THEMES.light), 'chart-surface'].sort());
    // the legacy shadcn colour entries are still hsl(var(--x)) and untouched
    expect(cfg).toMatch(/background: "hsl\(var\(--background\)\)"/);
    expect(cfg).toMatch(/darkMode: \["class"\]/);
  });
});
