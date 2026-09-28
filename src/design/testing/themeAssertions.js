// TEST-ONLY. Shared assertions for an app's design-system theme test
// (docs/scope/DesignSystem-Rollout.md section 4, step 7; the API is
// documented in docs/scope/DesignSystem.md section 4). Lifted from the VRR,
// DCA and EPE theme tests so every migrated app checks the same things:
//
//   1. the app opens light inside a [data-pl-root] scope;
//   2. the header toggle switches to dark and back, and the choice is stored
//      under the user's key;
//   3. no legacy console colour class is left under the scope outside
//      data-canvas regions (with a planted negative control, so a detector
//      that finds nothing is not mistaken for a clean page);
//   4. isThemedPath(<route>) is true, so the cold-load loaders paint the
//      user's theme on that route.
//
// Since batch 7A a page under /dashboard no longer wraps itself in
// <ThemedApp>: DashboardLayout's one scope (DashboardScope) themes it. For a
// /dashboard route describeAppTheme therefore mounts the app inside that
// same DashboardScope (installDashboardScope), so the checks are unchanged.
//
// Uses the jest globals (expect, describe, it); never import this file from
// application code.
import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent } from '@testing-library/react';
import { isThemedPath, DASHBOARD_PREFIX } from '../coldLoad.jsx';
import { themeStorageKey } from '../ThemeProvider.jsx';
import { DashboardScope, DASHBOARD_SCOPE_TEST_ID } from '../DashboardScope.jsx';

// One class token (variants such as hover: or md: included) that paints a
// legacy console colour: any Tailwind palette colour on a colour utility,
// white text, a solid black or translucent white fill, gradients and hex
// colours. A translucent black scrim (bg-black/50 behind dialogs) is theme
// neutral and is not flagged.
const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY = 'bg|text|border(?:-[trblxy])?|ring|ring-offset|from|via|to|shadow|divide|placeholder|outline|fill|stroke|decoration|accent|caret';
export const LEGACY_CHROME_TOKEN = new RegExp(
  `^(?:[^:\\s]+:)*(?:(?:${UTILITY})-(?:${PALETTE})-\\d|text-white(?:\\/\\d+)?$|bg-black$|bg-white\\/|bg-gradient-|(?:${UTILITY})-\\[#)`,
);

const tokenIsLegacy = (token, allow) => {
  // `dark:` variants need a .dark ancestor, which the Suite never sets.
  if (token.startsWith('dark:')) return false;
  if (!LEGACY_CHROME_TOKEN.test(token)) return false;
  return !allow.some((a) => (a instanceof RegExp ? a.test(token) : a === token));
};

/** True when a class string carries at least one legacy console colour. */
export function hasLegacyChrome(classString, { allow = [] } = {}) {
  return String(classString || '').split(/\s+/).some((t) => t && tokenIsLegacy(t, allow));
}

/** Every [data-pl-theme] scope on the page (the app root plus scoped portals). */
export function themeScopes(root = document.body) {
  const own = root.matches && root.matches('[data-pl-theme]') ? [root] : [];
  return [...own, ...root.querySelectorAll('[data-pl-theme]')];
}

/**
 * The class strings under a theme scope that still paint a legacy console
 * colour, skipping anything inside a `data-canvas` region (white charts,
 * dark seismic and map canvases). Portals that carry the scope attribute
 * are included. `allow` lists tokens (strings or regexes) an app keeps on
 * purpose; name the reason next to it in the test.
 */
export function legacyChromeClasses({ root = document.body, allow = [] } = {}) {
  const seen = new Set();
  const out = [];
  for (const scope of themeScopes(root)) {
    for (const el of [scope, ...scope.querySelectorAll('[class]')]) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[data-canvas]')) continue;
      const cls = el.getAttribute('class');
      if (cls && hasLegacyChrome(cls, { allow })) out.push(cls);
    }
  }
  return out;
}

/**
 * The app's scope root: by test id, else the first [data-pl-root]. An app
 * under /dashboard keeps its old scope test id on its own root element,
 * which since batch 7A sits inside the dashboard scope; the scope root is
 * then the nearest [data-pl-root] around it.
 */
export function getScopeRoot(scopeTestId) {
  let el = scopeTestId
    ? document.querySelector(`[data-testid="${scopeTestId}"]`)
    : document.querySelector('[data-pl-root]');
  if (el && !el.hasAttribute('data-pl-root')) el = el.closest('[data-pl-root]');
  if (!el) throw new Error(`No design-system scope root found${scopeTestId ? ` (data-testid="${scopeTestId}")` : ''}: is the app mounted inside a scope (installDashboardScope for a /dashboard page)?`);
  return el;
}

// The render function every test file calls lives on RTL's pure module
// (@testing-library/react re-exports it through a getter), so replacing it
// there reaches `render` as imported by the test file.
const rtlPure = () => require('@testing-library/react/pure'); // eslint-disable-line global-require

/**
 * Mount every render() in the current describe block (or the whole file,
 * when called at the top level) inside the dashboard's one scope, as
 * DashboardLayout does in the app. The scope sits inside any `wrapper` the
 * test passes and survives rerender(). `userId` is the user the scope keys
 * the stored choice to (null is the anonymous key). describeAppTheme calls
 * this for a /dashboard route; call it yourself for further tests of a
 * dashboard page in the same file that need the scope.
 */
export function installDashboardScope({ userId = null } = {}) {
  let original = null;
  beforeEach(() => {
    const pure = rtlPure();
    if (pure.render.plDashboardScope) return;
    original = pure.render;
    const scoped = (ui, options = {}) => {
      const Outer = options.wrapper;
      const Wrapper = ({ children }) => {
        const inner = React.createElement(DashboardScope, { userId }, children);
        return Outer ? React.createElement(Outer, null, inner) : inner;
      };
      return original(ui, { ...options, wrapper: Wrapper });
    };
    scoped.plDashboardScope = true;
    pure.render = scoped;
  });
  afterEach(() => {
    if (original) rtlPure().render = original;
    original = null;
  });
}

export { DASHBOARD_SCOPE_TEST_ID };

/** 1. The app opens light inside a [data-pl-root] scope. */
export function expectLightByDefault(scope = getScopeRoot()) {
  expect(scope).toHaveAttribute('data-pl-root');
  expect(scope).toHaveAttribute('data-pl-theme', 'light');
}

const toggleIn = (scope) => {
  const all = scope.querySelectorAll('[data-testid="theme-toggle"]');
  if (!all.length) throw new Error('No ThemeToggle (data-testid="theme-toggle") inside the scope: the toggle must be visible in the app header.');
  return all[0];
};

/**
 * 2. The toggle switches to dark and back, aria-pressed follows, and the
 * choice is stored under the user's key (`userId` null means the anonymous
 * key, which is what a test without an AuthContext user resolves to).
 */
export function expectToggleRoundTrip(scope = getScopeRoot(), { userId = null } = {}) {
  const key = themeStorageKey(userId);
  expect(scope).toHaveAttribute('data-pl-theme', 'light');
  expect(toggleIn(scope)).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(toggleIn(scope));
  expect(scope).toHaveAttribute('data-pl-theme', 'dark');
  expect(toggleIn(scope)).toHaveAttribute('aria-pressed', 'true');
  expect(window.localStorage.getItem(key)).toBe('dark');
  fireEvent.click(toggleIn(scope));
  expect(scope).toHaveAttribute('data-pl-theme', 'light');
  expect(toggleIn(scope)).toHaveAttribute('aria-pressed', 'false');
  expect(window.localStorage.getItem(key)).toBe('light');
}

/** 3. No legacy console colour under the scope outside data-canvas regions. */
export function expectNoLegacyChrome({ root = document.body, allow = [] } = {}) {
  expect(themeScopes(root).length).toBeGreaterThan(0);
  expect(legacyChromeClasses({ root, allow })).toEqual([]);
}

/**
 * 3b. Negative control: a legacy class planted under the scope root is
 * reported, and one planted inside a data-canvas region is not. Run it in
 * the same render as expectNoLegacyChrome. The plants are removed again.
 */
export function expectNegativeControl(scope = getScopeRoot(), { allow = [] } = {}) {
  const planted = 'bg-slate-900 text-white legacy-negative-control';
  const inCanvas = 'text-slate-300 legacy-negative-control-canvas';
  const bad = document.createElement('div');
  bad.className = planted;
  const canvas = document.createElement('div');
  canvas.setAttribute('data-canvas', 'dark');
  const inner = document.createElement('span');
  inner.className = inCanvas;
  canvas.appendChild(inner);
  scope.appendChild(bad);
  scope.appendChild(canvas);
  try {
    const found = legacyChromeClasses({ root: scope, allow });
    expect(found).toContain(planted);
    expect(found).not.toContain(inCanvas);
  } finally {
    bad.remove();
    canvas.remove();
  }
  expect(legacyChromeClasses({ root: scope, allow })).not.toContain(planted);
}

/** 4. The route is registered for the themed cold-load loaders. */
export function expectThemedPath(route) {
  expect({ route, themed: isThemedPath(route) }).toEqual({ route, themed: true });
}

/** The jsdom shims the Suite's app tests need (ResizeObserver, DOMRect, matchMedia, Radix pointer APIs). */
export function installDomShims() {
  if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!global.DOMRect) {
    global.DOMRect = class {
      constructor(x = 0, y = 0, w = 0, h = 0) { Object.assign(this, { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h }); }
      static fromRect(r = {}) { return new global.DOMRect(r.x, r.y, r.width, r.height); }
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  }
  const proto = window.HTMLElement.prototype;
  proto.scrollIntoView = proto.scrollIntoView || (() => {});
  proto.hasPointerCapture = proto.hasPointerCapture || (() => false);
  proto.releasePointerCapture = proto.releasePointerCapture || (() => {});
}

/**
 * The standard four checks as one describe block. In an app's
 * `__tests__/<App>.theme.test.jsx`:
 *
 *   describeAppTheme({
 *     name: 'Material Balance Studio',
 *     route: '/dashboard/apps/reservoir/material-balance-studio',
 *     renderApp: () => render(<MemoryRouter><MaterialBalanceStudio /></MemoryRouter>),
 *     ready: () => screen.findByText('Material Balance Studio'),
 *     scopeTestId: 'mbal-theme-scope',
 *   });
 *
 * renderApp mounts the app as its route does; for a /dashboard route the
 * render happens inside the dashboard scope (installDashboardScope, for
 * every test in the block that calls describeAppTheme), and a page outside
 * /dashboard opens its own scope. ready (optional, may be async) waits for
 * the first screen. scopeTestId (optional) is the app's root test id; the
 * checks run on the scope around it.
 * userId (default null) is the user the scope resolves, for the storage
 * key; allow lists deliberate legacy tokens. Further states (tabs, dialogs,
 * results) go in the app's own tests with expectNoLegacyChrome().
 */
export function describeAppTheme({
  name, route, renderApp, ready, scopeTestId, userId = null, allow = [],
}) {
  if (typeof route === 'string' && (route === DASHBOARD_PREFIX || route.startsWith(`${DASHBOARD_PREFIX}/`))) {
    installDashboardScope({ userId });
  }
  describe(`${name} on the design system`, () => {
    beforeAll(installDomShims);
    beforeEach(() => {
      try { window.localStorage.clear(); } catch { /* storage unavailable */ }
    });

    const mount = async () => {
      renderApp();
      if (ready) await ready();
      return getScopeRoot(scopeTestId);
    };

    it('opens light inside its theme scope', async () => {
      expectLightByDefault(await mount());
    });

    it('the header toggle switches to dark and back and stores the choice', async () => {
      expectToggleRoundTrip(await mount(), { userId });
    });

    it('leaves no legacy console colour outside canvases (with a negative control)', async () => {
      const scope = await mount();
      expectNoLegacyChrome({ allow });
      expectNegativeControl(scope, { allow });
    });

    it(`registers ${route} for the themed cold-load loaders`, () => {
      expectThemedPath(route);
    });
  });
}
