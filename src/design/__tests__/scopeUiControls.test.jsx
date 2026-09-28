/**
 * The ui pieces adapted in the design-system follow-up, inside a scope:
 * every scene of uiScenes.jsx rendered in <ThemedApp> carries theme roles,
 * no legacy console colour, and portalled parts (sheet, alert dialog,
 * context menu and submenu) carry the scope attribute themselves. Plus the
 * new shared pieces: Badge neutral/selected, SegmentedControl, NativeSelect,
 * CompactInput, ChartPanel, NumericTable, the Switch thumb hook and the
 * AppHeader phone layout. (Outside a scope: uiLegacyDom.test.jsx.)
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: {}, from: jest.fn() } }));
jest.mock('@/hooks/useHSEAccess', () => ({ useHSEAccess: () => ({ can: () => true }) }));
jest.mock('@/hooks/useSuiteAccess', () => ({ useSuiteAccess: () => ({ can: () => false }) }));

import { ThemedApp } from '@/design/ThemeProvider';
import { SCENES, AFTER } from './uiScenes';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { NativeSelect, CompactInput } from '@/components/ui/native-select';
import { ChartPanel } from '@/components/ui/chart-panel';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell, signedTone } from '@/components/ui/numeric-table';
import { AppHeader } from '@/components/ui/app-shell';
import { Alert } from '@/components/ui/alert';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.DOMRect = global.DOMRect || class { constructor(x = 0, y = 0, w = 0, h = 0) { Object.assign(this, { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h }); } static fromRect(r = {}) { return new global.DOMRect(r.x, r.y, r.width, r.height); } };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
  window.HTMLElement.prototype.releasePointerCapture = window.HTMLElement.prototype.releasePointerCapture || (() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'table').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());
afterEach(cleanup);

const LEGACY_COLOUR = /(^|\s)([a-z-]+:|\[[^\]]+\]:)*(bg|text|border|ring|ring-offset|from|to|accent)-(slate|lime|cyan|zinc|gray|blue|amber|red|green)-\d|(^|\s)text-white(\s|$)|bg-black\/80|bg-gradient-to/;
const TOKEN = /(^|\s)([a-z-]+:|\[[^\]]+\]:)*(bg|text|border|ring|ring-offset|shadow|font)-pl-/;

// The scenes whose every element is an adapted ui piece. The toaster needs
// an active scope and is covered in toasterTheme.test.jsx; the loader
// scenes are path-driven (coldLoad.test.jsx).
const UI_SCENES = ['controls', 'accordion', 'scrollArea', 'alert', 'sheetRight', 'sheetLeft', 'alertDialog', 'contextMenu', 'accessDenied', 'comingSoon', 'protectedRouteDenied'];

async function renderScoped(name, theme = 'light') {
  const Scene = SCENES[name];
  const utils = render(<ThemedApp userId="t" defaultTheme={theme}><Scene /></ThemedApp>);
  if (AFTER[name]) await act(async () => { await AFTER[name](utils); });
  return utils;
}

describe('inside a scope every adapted scene uses theme roles only', () => {
  it.each(UI_SCENES)('%s has no legacy console colour and some token classes', async (name) => {
    await renderScoped(name);
    const classes = [...document.body.querySelectorAll('[class]')].map((el) => el.getAttribute('class'));
    const legacy = classes.filter((c) => LEGACY_COLOUR.test(c));
    expect(legacy).toEqual([]);
    // jsdom does not lay out, so a ScrollArea never draws its thumb there
    if (name !== 'scrollArea') expect(classes.some((c) => TOKEN.test(c))).toBe(true);
  });

  it.each([
    ['sheetRight', '[role="dialog"]'],
    ['sheetLeft', '[role="dialog"]'],
    ['alertDialog', '[role="alertdialog"]'],
    ['contextMenu', '[role="menu"]'],
  ])('%s: portalled surfaces carry the scope attribute', async (name, sel) => {
    await renderScoped(name, 'dark');
    const surfaces = [...document.querySelectorAll(sel)];
    expect(surfaces.length).toBeGreaterThan(0);
    surfaces.forEach((el) => expect(el).toHaveAttribute('data-pl-theme', 'dark'));
  });

  it('the context submenu is themed and scoped too', async () => {
    await renderScoped('contextMenu');
    const menus = [...document.querySelectorAll('[role="menu"]')];
    expect(menus).toHaveLength(2);
    menus.forEach((m) => {
      expect(m.className).toMatch(/\bbg-pl-raised\b/);
      expect(m).toHaveAttribute('data-pl-theme', 'light');
    });
    expect(screen.getByText('Label').className).toMatch(/\btext-pl-text\b/);
    expect(screen.getByText('Ctrl+K').className).toMatch(/\btext-pl-muted\b/);
  });

  it('the sheet and alert dialog overlays carry the scope attribute', async () => {
    await renderScoped('sheetRight');
    const overlays = [...document.body.querySelectorAll('[data-state="open"][data-pl-theme]')];
    expect(overlays.length).toBeGreaterThanOrEqual(2); // overlay + panel
  });

  it('checkbox, switch, slider and progress take the primary role when on', async () => {
    await renderScoped('controls');
    const boxes = screen.getAllByRole('checkbox');
    boxes.forEach((b) => expect(b.className).toMatch(/data-\[state=checked\]:bg-pl-primary/));
    expect(boxes[0].className).toMatch(/rounded-\[4px\]/);
    const switches = screen.getAllByRole('switch');
    switches.forEach((s) => {
      expect(s.className).toMatch(/data-\[state=checked\]:bg-pl-primary/);
      expect(s.firstElementChild.className).toMatch(/\bbg-pl-surface\b/);
    });
    expect(screen.getByRole('slider').className).toMatch(/\bborder-pl-primary\b/);
    const bars = screen.getAllByRole('progressbar');
    expect(bars[0].firstElementChild.className).toMatch(/\bbg-pl-primary\b/);
    expect(bars[0].firstElementChild.className).not.toMatch(/gradient/);
  });

  it('toggle group items fill with primary when on, and multi toggles expose aria-pressed', async () => {
    await renderScoped('controls');
    const x = screen.getByRole('button', { name: 'X' });
    expect(x).toHaveAttribute('aria-pressed', 'true');
    expect(x.className).toMatch(/data-\[state=on\]:bg-pl-primary/);
  });
});

describe('new shared pieces', () => {
  it('Badge has neutral and selected variants inside a scope', () => {
    render(<ThemedApp userId="t"><Badge variant="neutral">n</Badge><Badge variant="selected">s</Badge></ThemedApp>);
    expect(screen.getByText('n').className).toMatch(/\bbg-pl-sunken\b.*\btext-pl-muted\b|\btext-pl-muted\b.*\bbg-pl-sunken\b/);
    expect(screen.getByText('s').className).toMatch(/\btext-pl-primary-text\b/);
  });

  it('Badge neutral and selected exist outside a scope too, and the old variants are untouched', () => {
    render(<><Badge variant="neutral">n</Badge><Badge variant="selected">s</Badge></>);
    expect(screen.getByText('n').className).toMatch(/\bbg-slate-800\b/);
    expect(screen.getByText('s').className).not.toMatch(/-pl-/);
  });

  it('Alert status variants inside a scope', () => {
    render(<ThemedApp userId="t"><Alert variant="warning">w</Alert><Alert variant="info">i</Alert></ThemedApp>);
    expect(screen.getByText('w').className).toMatch(/\bbg-pl-warning-bg\b/);
    expect(screen.getByText('i').className).toMatch(/\btext-pl-info-text\b/);
  });

  it('Switch thumbClassName reaches the thumb in both looks', () => {
    render(<><Switch aria-label="a" thumbClassName="h-4 w-4" /><ThemedApp userId="t"><Switch aria-label="b" thumbClassName="h-4 w-4" /></ThemedApp></>);
    expect(screen.getByRole('switch', { name: 'a' }).firstElementChild.className).toMatch(/\bh-4 w-4$/);
    expect(screen.getByRole('switch', { name: 'b' }).firstElementChild.className).toMatch(/\bh-4 w-4$/);
  });

  it('SegmentedControl is a labelled group of aria-pressed buttons', () => {
    const onChange = jest.fn();
    render(
      <ThemedApp userId="t">
        <SegmentedControl label="View" value="rate" onValueChange={onChange} options={[{ value: 'rate', label: 'Rate' }, { value: 'cum', label: 'Cumulative' }]} />
      </ThemedApp>,
    );
    const group = screen.getByRole('group', { name: 'View' });
    expect(group.className).toMatch(/\bbg-pl-sunken\b/);
    const rate = screen.getByRole('button', { name: 'Rate' });
    const cum = screen.getByRole('button', { name: 'Cumulative' });
    expect(rate).toHaveAttribute('aria-pressed', 'true');
    expect(cum).toHaveAttribute('aria-pressed', 'false');
    expect(rate.className).toMatch(/\bbg-pl-primary\b/);
    fireEvent.click(cum);
    expect(onChange).toHaveBeenCalledWith('cum');
    fireEvent.click(rate);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('NativeSelect and CompactInput follow the scope', () => {
    render(
      <>
        <NativeSelect aria-label="legacy"><option>a</option></NativeSelect>
        <ThemedApp userId="t">
          <NativeSelect aria-label="themed"><option>a</option></NativeSelect>
          <CompactInput aria-label="cell" />
        </ThemedApp>
      </>,
    );
    expect(screen.getByLabelText('legacy').className).toMatch(/\bbg-slate-800\b/);
    expect(screen.getByLabelText('themed').className).toMatch(/\bborder-pl-border-strong\b/);
    expect(screen.getByLabelText('cell').className).toMatch(/\bh-8\b.*\btext-xs\b/);
  });

  it('ChartPanel is a titled white chart canvas', () => {
    const { container } = render(<ThemedApp userId="t" defaultTheme="dark"><ChartPanel title="Rate" subtitle="stb/d"><div>plot</div></ChartPanel></ThemedApp>);
    const panel = container.querySelector('[data-canvas="chart"]');
    expect(panel).not.toBeNull();
    expect(panel.className).toMatch(/\bbg-pl-chart-surface\b/);
    expect(screen.getByRole('heading', { name: 'Rate' })).toBeInTheDocument();
  });

  it('NumericTable: sticky row labels, mono right-aligned numbers, signed colour, totals rule', () => {
    render(
      <ThemedApp userId="t">
        <NumericTable title="Cash flow">
          <thead><tr><NumTh sticky>Metric</NumTh><NumTh numeric>2027</NumTh></tr></thead>
          <tbody>
            <NumRow><RowLabel>Capex</RowLabel><NumCell value={-5}>-5.0</NumCell></NumRow>
            <NumRow><RowLabel total>Net</RowLabel><NumCell value={3} total>3.0</NumCell></NumRow>
          </tbody>
        </NumericTable>
      </ThemedApp>,
    );
    const label = screen.getByRole('rowheader', { name: 'Capex' });
    expect(label.className).toMatch(/\bsticky\b.*\bleft-0\b/);
    const neg = screen.getByText('-5.0');
    expect(neg.className).toMatch(/\btext-right\b/);
    expect(neg.className).toMatch(/\bfont-pl-mono\b/);
    expect(neg.className).toMatch(/\btabular-nums\b/);
    expect(neg.className).toMatch(/\btext-pl-danger-text\b/);
    expect(screen.getByText('3.0').className).toMatch(/\bborder-t-2\b/);
    expect(screen.getByText('3.0').className).toMatch(/\btext-pl-text\b/);
    expect(signedTone(-1)).toBe('text-pl-danger-text');
    expect(signedTone(0)).toBe('');
  });

  it('AppHeader wraps its actions at phone width (no fixed row)', () => {
    render(
      <ThemedApp userId="t">
        <MemoryRouter><AppHeader title="T" actions={<><button type="button">a</button><button type="button">b</button></>} /></MemoryRouter>
      </ThemedApp>,
    );
    const actions = document.querySelector('[data-slot="app-header-actions"]');
    expect(actions.className).toMatch(/\bflex-wrap\b/);
    expect(actions.parentElement.className).toMatch(/\bflex-wrap\b/);
    expect(actions.parentElement.className).toMatch(/\bsm:flex-nowrap\b/);
    expect(screen.getAllByTestId('theme-toggle')).toHaveLength(1);
  });
});
