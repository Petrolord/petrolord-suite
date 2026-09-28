// Petrolord design tokens (design system phase 1, 2026-09-27).
//
// Single source of truth for the shared visual family of Suite, NextGen and
// HSE. The palette comes from the certificate brand pack the two new
// homepages use (petrol-green ink, gold, ivory paper; see src/pages/Home.css
// `.suite-home` and NextGen src/pages/LandingPage.css `.ng-home`).
// The app consoles' light theme uses light grey neutrals ("grey panel",
// owner decision 2026-09-28): grey page, lighter grey panels, near-white
// menus. Primary, accent, ink text and status colours keep the brand pack;
// the homepages keep their own paper look (Home.css, scoped separately).
//
// src/design/theme.css is GENERATED from this file by
// `node scripts/design/build-theme-css.mjs`; src/design/__tests__/tokens.test.js
// fails when the two drift, and checks WCAG AA contrast for every text role.
//
// Every colour is a 6-digit hex. Roles, not hues: components ask for
// `surface` or `muted`, never for "green".

export const BRAND = {
  ink: '#0C1F16',
  ink2: '#12301F',
  ink3: '#07140E',
  gold: '#C8A24E',
  goldSoft: '#E6D3A0',
  lime: '#A6D83A',
  paper: '#F2F4EF',
  paper2: '#E7EBE3',
  petrol: '#2F6B48',
};

// Colour roles. The same role names exist in both themes.
//   bg            page canvas behind everything
//   surface       cards, panels, table bodies
//   raised        popovers, dialogs, menus (paired with a shadow)
//   sunken        tab rails, table headers, input wells, hover fills
//   border        hairlines between regions
//   border-strong input and control outlines (3:1 against surface, WCAG 1.4.11)
//   text / muted  body text and secondary text
//   primary       the main action fill; primary-fg is text on it;
//                 primary-text is primary used as text or icon on a surface;
//                 primary-text-hover is its hover (links, text buttons)
//   accent        brand gold fill (highlights, selected pills); accent-fg on it;
//                 accent-text is gold dark enough to read as text
//   success, warning, danger, info
//                 status only: solid fill (with -fg text), -bg tint, -text for
//                 words on a surface or on the tint
//   focus         focus ring (3:1 against bg and surface)
export const THEMES = {
  light: {
    bg: '#E1E4E8',
    surface: '#EDEFF2',
    raised: '#F8F9FA',
    sunken: '#D8DCE1',
    border: '#C3C9D0',
    'border-strong': '#6E7883',
    text: '#14231B',
    muted: '#4D5761',
    primary: '#2F6B48',
    'primary-hover': '#245A3B',
    'primary-fg': '#FFFFFF',
    'primary-text': '#2F6B48',
    'primary-text-hover': '#1F4E33',
    accent: '#C8A24E',
    'accent-fg': '#0C1F16',
    'accent-text': '#7A5A12',
    success: '#1E7A46',
    'success-fg': '#FFFFFF',
    'success-bg': '#E3F2E8',
    'success-text': '#18663A',
    warning: '#8F5300',
    'warning-fg': '#FFFFFF',
    'warning-bg': '#FBF0DC',
    'warning-text': '#7F4A00',
    danger: '#B42318',
    'danger-fg': '#FFFFFF',
    'danger-bg': '#FCE8E6',
    'danger-text': '#A11F15',
    info: '#1D5FA8',
    'info-fg': '#FFFFFF',
    'info-bg': '#E4EEF9',
    'info-text': '#1A5596',
    focus: '#8A6A1F',
  },
  dark: {
    bg: '#07140E',
    surface: '#0C1F16',
    raised: '#12301F',
    sunken: '#0A1A12',
    border: '#24402F',
    'border-strong': '#5F7D6B',
    text: '#EEF2EC',
    muted: '#A9B8AE',
    primary: '#7CC49A',
    'primary-hover': '#94D2AD',
    'primary-fg': '#07140E',
    'primary-text': '#8FD0AA',
    'primary-text-hover': '#B3E2C6',
    accent: '#C8A24E',
    'accent-fg': '#0C1F16',
    'accent-text': '#E6D3A0',
    success: '#6FD19A',
    'success-fg': '#07140E',
    'success-bg': '#10301F',
    'success-text': '#7FD9A6',
    warning: '#F0B955',
    'warning-fg': '#07140E',
    'warning-bg': '#33270C',
    'warning-text': '#F3C470',
    danger: '#F28B82',
    'danger-fg': '#07140E',
    'danger-bg': '#3A1614',
    'danger-text': '#F59C94',
    info: '#8AB8F2',
    'info-fg': '#07140E',
    'info-bg': '#0F2440',
    'info-text': '#9CC4F5',
    focus: '#E6D3A0',
  },
};

// The chart standard (white chartTheme + ChartLogo) keeps a white plot in
// both themes, so a chart surface always takes the light roles.
export const CHART_SURFACE = '#FFFFFF';

// Type. Cormorant Garamond is for display headings only (page titles, hero
// numbers); Public Sans is the working face; IBM Plex Mono is for numbers in
// tables and code. All three are loaded in index.html.
export const FONTS = {
  display: '"Cormorant Garamond", "Iowan Old Style", Georgia, serif',
  sans: '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
};

// Type scale in px. Matches the Tailwind defaults on purpose, so apps use
// text-xs ... text-4xl and no new font-size utilities are needed.
export const TYPE_SCALE = {
  xs: { size: 12, line: 16 },
  sm: { size: 14, line: 20 },
  base: { size: 16, line: 24 },
  lg: { size: 18, line: 28 },
  xl: { size: 20, line: 28 },
  '2xl': { size: 24, line: 32 },
  '3xl': { size: 30, line: 36 },
  '4xl': { size: 36, line: 40 },
};

// Spacing on a 4px grid (Tailwind's own steps: 1 = 4px, 2 = 8px ...).
export const SPACING = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };

export const RADII = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };

// Canvas frames (seismic sections, maps, 3D viewers) keep the legacy 8px
// corner inside a scope, where --radius grows to 12px. Class: rounded-pl-canvas.
export const CANVAS_RADIUS = '0.5rem';

export const SHADOWS = {
  light: {
    sm: '0 1px 2px rgba(12, 31, 22, 0.06)',
    md: '0 4px 12px -2px rgba(12, 31, 22, 0.10)',
    lg: '0 16px 40px -12px rgba(12, 31, 22, 0.22)',
  },
  dark: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.40)',
    md: '0 4px 12px -2px rgba(0, 0, 0, 0.50)',
    lg: '0 16px 40px -12px rgba(0, 0, 0, 0.65)',
  },
};

// Contrast contract, checked by the test in both themes.
// [foreground role, background role, minimum ratio]
export const CONTRAST_PAIRS = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'raised', 4.5],
  ['text', 'sunken', 4.5],
  ['muted', 'bg', 4.5],
  ['muted', 'surface', 4.5],
  ['muted', 'sunken', 4.5],
  ['primary-fg', 'primary', 4.5],
  ['primary-fg', 'primary-hover', 4.5],
  ['primary-text', 'surface', 4.5],
  ['primary-text', 'bg', 4.5],
  ['primary-text-hover', 'surface', 4.5],
  ['primary-text-hover', 'bg', 4.5],
  ['primary-text-hover', 'sunken', 4.5],
  ['accent-fg', 'accent', 4.5],
  ['accent-text', 'surface', 4.5],
  ['accent-text', 'bg', 4.5],
  ...['success', 'warning', 'danger', 'info'].flatMap((s) => [
    [`${s}-fg`, s, 4.5],
    [`${s}-text`, 'surface', 4.5],
    [`${s}-text`, `${s}-bg`, 4.5],
  ]),
  // non-text UI (WCAG 1.4.11)
  ['border-strong', 'surface', 3],
  // checked checkbox, switch track and slider range against the surface
  ['primary', 'surface', 3],
  // switch thumb (surface) on its checked (primary) and unchecked
  // (border-strong) track
  ['surface', 'border-strong', 3],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
];

// Which legacy shadcn variable each role feeds inside a themed scope, so
// stock shadcn classes (bg-background, text-muted-foreground, border-input,
// ring-ring ...) follow the theme there.
export const SHADCN_ALIASES = {
  background: 'bg',
  foreground: 'text',
  'secondary-background': 'sunken',
  card: 'surface',
  'card-foreground': 'text',
  popover: 'raised',
  'popover-foreground': 'text',
  border: 'border',
  input: 'border-strong',
  'input-foreground': 'text',
  ring: 'focus',
  primary: 'primary',
  'primary-foreground': 'primary-fg',
  'primary-hover': 'primary-hover',
  secondary: 'sunken',
  'secondary-foreground': 'text',
  muted: 'sunken',
  'muted-foreground': 'muted',
  accent: 'sunken',
  'accent-foreground': 'text',
  destructive: 'danger',
  'destructive-foreground': 'danger-fg',
  success: 'success',
  'success-foreground': 'success-fg',
  warning: 'warning',
  'warning-foreground': 'warning-fg',
  info: 'info',
  'info-foreground': 'info-fg',
};

// Chart series inside themed scopes: the chartTheme colours validated on the
// white chart surface (blue-600, emerald-600, amber-600, red-600, violet-600).
export const CHART_SERIES = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED'];

export const THEME_NAMES = ['light', 'dark'];
export const DEFAULT_THEME = 'light';

// ---- colour maths (shared by the CSS renderer and the contrast test) ----

export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// "H S% L%" triplet in the format the shadcn variables in index.css use.
export function hexToHslTriplet(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const f = (x) => Number(x.toFixed(1));
  return `${f(h)} ${f(s * 100)}% ${f(l * 100)}%`;
}

// Inverse of hexToHslTriplet, used by the test to prove the rounded HSL
// aliases keep the contrast of the hex tokens.
export function hslTripletToHex(triplet) {
  const m = /^([\d.]+) ([\d.]+)% ([\d.]+)%$/.exec(triplet);
  if (!m) throw new Error(`Bad HSL triplet: ${triplet}`);
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue = (p, q, t) => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  let rgb;
  if (s === 0) rgb = [l, l, l];
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rgb = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  }
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function hexToRgbChannels(hex) {
  return hexToRgb(hex).join(' ');
}
