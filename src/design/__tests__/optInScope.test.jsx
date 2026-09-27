/**
 * Opt-in proof. The design system must change nothing for the 100+ apps
 * that have not migrated:
 *   1. the shared ui pieces render their legacy class strings byte for byte
 *      outside a <ThemedApp> scope (the strings below are copied from main
 *      before the design system landed);
 *   2. a real non-pilot app (Voidage Replacement Monitor) mounts with its
 *      dark console classes, no themed scope and no pl-* token classes;
 *   3. inside a scope the same pieces switch to theme roles, and portal
 *      content (dialogs, menus) carries the scope attribute itself.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { ThemedApp } from '@/design/ThemeProvider';
import { Card, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import StudioHeader from '@/components/studio/StudioHeader';
import ChartFrame from '@/components/charts/ChartFrame';
import VoidageReplacementMonitor from '@/pages/apps/VoidageReplacementMonitor';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

// Legacy class strings as they were on main (10b28abb0).
const LEGACY = {
  card: 'rounded-lg border border-slate-700 bg-slate-800/30 text-slate-100 shadow-sm backdrop-blur-sm',
  cardDescription: 'text-sm text-slate-400',
  tabsList: 'inline-flex h-10 items-center justify-center rounded-md bg-slate-800 p-1 text-slate-500',
  tabsTrigger: 'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-slate-950 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-slate-950 data-[state=active]:text-slate-50 data-[state=active]:shadow-sm',
  input: 'flex h-10 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 ring-offset-slate-900 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  textarea: 'flex min-h-[80px] w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 ring-offset-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  label: 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-white mb-1 block',
  button: 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-600/90 h-10 px-4 py-2',
  buttonOutline: 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white h-10 px-4 py-2',
  // tailwind-merge already drops border-slate-200 on main (border-transparent wins)
  badge: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 dark:border-slate-800 dark:focus:ring-slate-300 border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/80',
  tableHeader: '[&_tr]:border-b',
  tableRow: 'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
  tableHead: 'h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0',
  tableCell: 'p-4 align-middle [&:has([role=checkbox])]:pr-0',
  selectTrigger: 'flex h-10 w-full items-center justify-between gap-2 text-left [&>span]:line-clamp-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white ring-offset-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50',
  dialogContent: 'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-700 bg-slate-900 p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
  studioTitle: 'text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 hidden sm:block min-w-[6rem] truncate',
};

const TOKEN_CLASS = /(^|\s)([a-z-]+:)*(bg|text|border|ring|ring-offset|shadow|font|placeholder)-pl-/;

function Kit() {
  return (
    <div>
      <Card data-testid="card"><CardDescription data-testid="card-desc">d</CardDescription></Card>
      <Tabs defaultValue="a">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="a" data-testid="tabs-trigger">A</TabsTrigger>
        </TabsList>
        <TabsContent value="a">content</TabsContent>
      </Tabs>
      <Input data-testid="input" />
      <Textarea data-testid="textarea" />
      <Label data-testid="label">L</Label>
      <Button data-testid="button">Go</Button>
      <Button variant="outline" data-testid="button-outline">Go</Button>
      <Badge data-testid="badge">b</Badge>
      <Table>
        <TableHeader data-testid="thead"><TableRow data-testid="tr"><TableHead data-testid="th">h</TableHead></TableRow></TableHeader>
        <TableBody><TableRow><TableCell data-testid="td">c</TableCell></TableRow></TableBody>
      </Table>
      <Select><SelectTrigger data-testid="select-trigger"><SelectValue placeholder="pick" /></SelectTrigger></Select>
      <MemoryRouter><StudioHeader title="Studio" tabs={[{ value: 'a', label: 'A' }]} activeTab="a" /></MemoryRouter>
    </div>
  );
}

describe('outside a scope: legacy output, byte for byte', () => {
  beforeEach(() => render(<Kit />));
  const cases = [
    ['card', 'card'], ['card-desc', 'cardDescription'], ['tabs-list', 'tabsList'],
    ['tabs-trigger', 'tabsTrigger'], ['input', 'input'], ['textarea', 'textarea'],
    ['label', 'label'], ['button', 'button'], ['button-outline', 'buttonOutline'],
    ['badge', 'badge'], ['thead', 'tableHeader'], ['tr', 'tableRow'], ['th', 'tableHead'],
    ['td', 'tableCell'], ['select-trigger', 'selectTrigger'],
  ];
  it.each(cases)('%s keeps its legacy classes', (testId, key) => {
    expect(screen.getByTestId(testId).className).toBe(LEGACY[key]);
  });

  it('StudioHeader keeps its gradient title and shows no theme toggle', () => {
    expect(screen.getByRole('heading', { name: 'Studio' }).className).toBe(LEGACY.studioTitle);
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
  });

  it('nothing carries the scope attribute or a token class', () => {
    expect(document.querySelector('[data-pl-theme]')).toBeNull();
    document.querySelectorAll('[class]').forEach((el) => {
      expect(el.getAttribute('class')).not.toMatch(TOKEN_CLASS);
    });
  });

  it('an open dialog outside a scope has no scope attribute', () => {
    render(
      <Dialog open>
        <DialogContent data-testid="dlg"><DialogTitle>t</DialogTitle><DialogDescription>d</DialogDescription></DialogContent>
      </Dialog>,
    );
    const dlg = screen.getByTestId('dlg');
    expect(dlg).not.toHaveAttribute('data-pl-theme');
    expect(dlg.className).toBe(LEGACY.dialogContent);
  });
});

describe('a real non-pilot app is unchanged', () => {
  it('Voidage Replacement Monitor mounts on the dark console with no themed scope', async () => {
    const { container } = render(
      <MemoryRouter>
        <VoidageReplacementMonitor />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Voidage Replacement Monitor')).toBeInTheDocument();
    // StudioLayout root keeps the legacy dark console classes
    const root = container.firstElementChild;
    expect(root.className).toMatch(/\bbg-slate-950\b/);
    expect(root.className).toMatch(/\btext-slate-100\b/);
    expect(container.querySelector('[data-pl-theme]')).toBeNull();
    expect(container.querySelector('[data-pl-root]')).toBeNull();
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    container.querySelectorAll('[class]').forEach((el) => {
      expect(el.getAttribute('class')).not.toMatch(TOKEN_CLASS);
    });
    // its panels are still painted with the slate console colours
    const slatePanels = [...container.querySelectorAll('[class]')].filter((el) => /\bbg-slate-(800|900|950)\b/.test(el.getAttribute('class')));
    expect(slatePanels.length).toBeGreaterThan(5);
  });
});

describe('inside a scope: theme roles', () => {
  beforeEach(() => render(<ThemedApp userId="t"><Kit /></ThemedApp>));

  it('the ui pieces switch to token classes and drop the slate console colours', () => {
    for (const id of ['card', 'tabs-list', 'tabs-trigger', 'input', 'textarea', 'button', 'button-outline', 'badge', 'select-trigger']) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toMatch(TOKEN_CLASS);
      expect(cls).not.toMatch(/\b(bg|text|border)-slate-\d/);
    }
    expect(screen.getByTestId('card').className).toMatch(/\bbg-pl-surface\b/);
    expect(screen.getByTestId('label').className).toMatch(/\btext-pl-text\b/);
    expect(screen.getByTestId('thead').className).toMatch(/\bbg-pl-sunken\b/);
  });

  it('StudioHeader shows the theme toggle and a plain title', () => {
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Studio' }).className).toMatch(/\btext-pl-text\b/);
  });

  it('portal content carries the scope attribute so dialogs follow the theme', () => {
    render(
      <ThemedApp userId="t">
        <Dialog open>
          <DialogContent data-testid="dlg2"><DialogTitle>t</DialogTitle><DialogDescription>d</DialogDescription></DialogContent>
        </Dialog>
      </ThemedApp>,
    );
    const dlg = screen.getByTestId('dlg2');
    expect(dlg).toHaveAttribute('data-pl-theme', 'light');
    expect(dlg.className).toMatch(/\bbg-pl-raised\b/);
  });
});

describe('canvases', () => {
  it('ChartFrame marks itself as a chart canvas and stays white', () => {
    const { container } = render(<ChartFrame height={100}><div /></ChartFrame>);
    const frame = container.querySelector('[data-canvas="chart"]');
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/\bbg-white\b/);
  });
});
