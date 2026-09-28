/**
 * The shared ui pieces after batch 7B (docs/scope/DesignSystem-Rollout.md
 * section 5.2): every page sits in a scope, so the legacy branches are gone.
 *   1. The pieces render theme roles only, with no slate console colours,
 *      whether or not a scope is above them (the classes are the same; only
 *      the CSS scope makes them resolve).
 *   2. ThemeToggle renders nothing without a scope, and nothing in a
 *      FixedTheme (the dark ink rail).
 *   3. Inside a scope, portal content (dialogs, menus) carries the scope
 *      attribute itself; inside a FixedTheme it carries the fixed theme.
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

import { ThemedApp, FixedTheme } from '@/design/ThemeProvider';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert } from '@/components/ui/alert';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});


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
      <Checkbox data-testid="checkbox" />
      <Switch data-testid="switch" />
      <Accordion type="single" collapsible><AccordionItem value="a" data-testid="accordion-item"><AccordionTrigger>t</AccordionTrigger><AccordionContent>c</AccordionContent></AccordionItem></Accordion>
      <Separator data-testid="separator" />
      <Skeleton data-testid="skeleton" />
      <Progress value={10} data-testid="progress" />
      <Alert data-testid="alert">a</Alert>
    </div>
  );
}

const ROLE_IDS = ['card', 'tabs-list', 'tabs-trigger', 'input', 'textarea', 'button', 'button-outline', 'badge', 'select-trigger', 'checkbox', 'switch', 'accordion-item', 'separator', 'skeleton', 'progress', 'alert'];

describe('without a scope: the same role classes, no legacy branch', () => {
  beforeEach(() => render(<Kit />));

  it('every piece renders token classes and no slate console colours', () => {
    for (const id of ROLE_IDS) {
      const cls = screen.getByTestId(id).className;
      expect(cls).toMatch(TOKEN_CLASS);
      expect(cls).not.toMatch(/\b(bg|text|border)-slate-\d/);
    }
  });

  it('shows no theme toggle and sets no scope attribute', () => {
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    expect(document.querySelector('[data-pl-theme]')).toBeNull();
  });
});

describe('a fixed theme (the ink rail)', () => {
  it('hides the toggle and gives portals the fixed theme', () => {
    render(
      <FixedTheme theme="dark">
        <MemoryRouter><StudioHeader title="Rail" tabs={[]} /></MemoryRouter>
        <Dialog open>
          <DialogContent data-testid="dlg-fixed"><DialogTitle>t</DialogTitle><DialogDescription>d</DialogDescription></DialogContent>
        </Dialog>
      </FixedTheme>,
    );
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('dlg-fixed')).toHaveAttribute('data-pl-theme', 'dark');
    expect(window.localStorage.length).toBe(0);
  });
});

describe('inside a scope: theme roles', () => {
  beforeEach(() => render(<ThemedApp userId="t"><Kit /></ThemedApp>));

  it('the ui pieces switch to token classes and drop the slate console colours', () => {
    for (const id of ROLE_IDS) {
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
