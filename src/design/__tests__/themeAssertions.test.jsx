/**
 * Wave 0A: the shared theme-test helpers (src/design/testing/themeAssertions.js)
 * check what they claim, both ways:
 *   - describeAppTheme passes on a small migrated app (light by default,
 *     toggle round trip, no legacy chrome, registered route);
 *   - each assertion fails on the matching broken app (dark default, no
 *     toggle, legacy classes, unregistered route): the negative controls;
 *   - the detector finds nothing on the adapted ui kit inside a scope (no
 *     false positives for later batches) and plenty on the unmigrated
 *     legacy fixture wrapped in a scope.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: {}, from: jest.fn() } }));
jest.mock('@/hooks/useHSEAccess', () => ({ useHSEAccess: () => ({ can: () => true }) }));
jest.mock('@/hooks/useSuiteAccess', () => ({ useSuiteAccess: () => ({ can: () => false }) }));

import { ThemedApp } from '@/design/ThemeProvider';
import { AppHeader, PageContainer, PageSection } from '@/components/ui/app-shell';
import { StatTile } from '@/components/ui/stat-tile';
import { ChartPanel } from '@/components/ui/chart-panel';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import LegacyAppFixture from '@/design/testing/LegacyAppFixture';
import {
  describeAppTheme, hasLegacyChrome, legacyChromeClasses, getScopeRoot,
  expectLightByDefault, expectToggleRoundTrip, expectNoLegacyChrome,
  expectNegativeControl, expectThemedPath, installDomShims,
} from '@/design/testing/themeAssertions';
import { SCENES, AFTER } from './uiScenes';

const ROUTE = '/dashboard/apps/reservoir/decline-curve-analysis'; // a registered pilot

// A small migrated app: wraps itself, AppHeader with the toggle, roles only,
// a white chart canvas that keeps its chart colours.
function MigratedApp({ defaultTheme }) {
  return (
    <ThemedApp data-testid="mini-theme-scope" defaultTheme={defaultTheme}>
      <AppHeader title="Mini Studio" />
      <PageContainer>
        <PageSection title="Inputs">
          <Card>
            <CardHeader><CardTitle>Case</CardTitle></CardHeader>
            <CardContent><Input aria-label="rate" defaultValue="1" /><Button>Run</Button><Badge variant="success">OK</Badge></CardContent>
          </Card>
          <StatTile label="EUR" value="4.2" unit="MMbbl" />
          <ChartPanel title="Rate"><div className="text-slate-600">chart ink</div></ChartPanel>
        </PageSection>
      </PageContainer>
    </ThemedApp>
  );
}

beforeAll(installDomShims);
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describeAppTheme({
  name: 'A migrated app',
  route: ROUTE,
  renderApp: () => render(<MemoryRouter><MigratedApp /></MemoryRouter>),
  ready: () => screen.findByText('Mini Studio'),
  scopeTestId: 'mini-theme-scope',
});

describe('the detector', () => {
  it.each([
    'bg-slate-900', 'hover:bg-slate-800', 'text-white', 'text-white/80', 'md:text-lime-400',
    'border-t-slate-700', 'bg-white/10', 'bg-black', 'bg-[#0f172a]', 'from-blue-600',
    'bg-gradient-to-r', 'data-[state=checked]:bg-cyan-600', 'ring-offset-slate-900', 'fill-amber-300',
  ])('flags %s', (cls) => expect(hasLegacyChrome(`p-2 ${cls}`)).toBe(true));

  it.each([
    'bg-pl-surface', 'text-pl-text', 'border-pl-border', 'dark:bg-slate-800', 'bg-white', 'bg-black/50',
    'text-pl-warning-text', 'ring-pl-focus', 'shadow-pl-sm', 'text-xs', 'font-pl-mono',
  ])('ignores %s', (cls) => expect(hasLegacyChrome(`p-2 ${cls}`)).toBe(false));

  it('honours an allow list (strings and regexes)', () => {
    expect(hasLegacyChrome('text-slate-500', { allow: ['text-slate-500'] })).toBe(false);
    expect(hasLegacyChrome('text-red-600 p-1', { allow: [/^text-red-/] })).toBe(false);
    expect(hasLegacyChrome('text-red-600 bg-slate-900', { allow: [/^text-red-/] })).toBe(true);
  });

  it('finds nothing on the adapted ui kit inside a scope', async () => {
    const scenes = ['controls', 'accordion', 'alert', 'sheetRight', 'alertDialog', 'contextMenu', 'accessDenied', 'comingSoon', 'protectedRouteDenied', 'wave0a'];
    for (const theme of ['light', 'dark']) {
      for (const name of scenes) {
        const Scene = SCENES[name];
        const utils = render(<ThemedApp userId="t" defaultTheme={theme}><Scene /></ThemedApp>);
        if (AFTER[name]) await act(async () => { await AFTER[name](utils); });
        expect({ theme, name, found: legacyChromeClasses() }).toEqual({ theme, name, found: [] });
        cleanup();
      }
    }
  });

  it('finds the unmigrated fixture\'s classes when it is wrapped in a scope', () => {
    render(<MemoryRouter><ThemedApp userId="t"><LegacyAppFixture /></ThemedApp></MemoryRouter>);
    const found = legacyChromeClasses();
    expect(found.length).toBeGreaterThan(5);
    // the kit themes itself; the app's own classes are what is left
    expect(found.some((c) => /\btext-lime-400\b/.test(c))).toBe(true);
    expect(found.some((c) => /\bbg-slate-900\b/.test(c))).toBe(true);
  });

  it('skips data-canvas regions and elements outside any scope', () => {
    render(
      <div>
        <div className="bg-slate-900">outside</div>
        <ThemedApp userId="t">
          <div data-canvas="dark"><span className="text-slate-300">seismic</span></div>
          <div data-canvas="chart"><span className="text-slate-600">axis</span></div>
        </ThemedApp>
      </div>,
    );
    expect(legacyChromeClasses()).toEqual([]);
  });
});

describe('each assertion fails on the matching broken app (negative controls)', () => {
  const fails = (fn) => expect(fn).toThrow();

  it('expectLightByDefault fails on an app that opens dark', async () => {
    render(<MemoryRouter><MigratedApp defaultTheme="dark" /></MemoryRouter>);
    await screen.findByText('Mini Studio');
    fails(() => expectLightByDefault(getScopeRoot('mini-theme-scope')));
  });

  it('expectToggleRoundTrip fails when the header has no toggle', () => {
    render(<ThemedApp data-testid="no-toggle"><p>no header</p></ThemedApp>);
    fails(() => expectToggleRoundTrip(getScopeRoot('no-toggle')));
  });

  it('expectToggleRoundTrip fails when the choice is stored under another user', async () => {
    render(<MemoryRouter><MigratedApp /></MemoryRouter>);
    await screen.findByText('Mini Studio');
    fails(() => expectToggleRoundTrip(getScopeRoot('mini-theme-scope'), { userId: 'someone-else' }));
  });

  it('expectNoLegacyChrome fails on a scope with a legacy class, and on a page with no scope', () => {
    render(<ThemedApp userId="t"><div className="bg-slate-900 text-white">old panel</div></ThemedApp>);
    fails(() => expectNoLegacyChrome());
    cleanup();
    render(<div className="p-2">no scope</div>);
    fails(() => expectNoLegacyChrome());
  });

  it('getScopeRoot fails on an app that is not wrapped', () => {
    render(<LegacyAppFixture />, { wrapper: MemoryRouter });
    fails(() => getScopeRoot());
  });

  it('expectNegativeControl fails when every legacy class is allowed (a blind detector)', async () => {
    render(<MemoryRouter><MigratedApp /></MemoryRouter>);
    await screen.findByText('Mini Studio');
    fails(() => expectNegativeControl(getScopeRoot('mini-theme-scope'), { allow: [/./] }));
    // and the plants are gone afterwards
    expect(document.querySelector('.legacy-negative-control')).toBeNull();
    expect(document.querySelector('.legacy-negative-control-canvas')).toBeNull();
  });

  it('expectThemedPath fails on a route no batch registers', () => {
    fails(() => expectThemedPath('/dashboard/apps/legacy/unmigrated-fixture'));
  });
});
