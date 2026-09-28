/**
 * The Studio kit is theme-aware and inert outside a theme scope
 * (design system pilot 5, docs/scope/DesignSystem.md).
 *
 * About 33 apps share StudioLayout and its pieces; only an app wrapped in
 * <ThemedApp> may change. So:
 *   1. outside a scope every kit class string is the legacy one, byte for
 *      byte (the strings below are copied from main before the kit became
 *      theme-aware), with no scope attribute and no pl-* token class;
 *   2. an app that has not opted in (the test-only LegacyAppFixture, built
 *      on the Studio kit like the unmigrated apps) mounts on the dark
 *      console exactly as before. It stood on Waterflood Design Studio and
 *      SCAL Studio until those migrated in rollout batch 1D;
 *   3. inside a scope the same pieces use theme roles, the help drawer
 *      (a portal) carries the scope attribute, and notifications use the
 *      status roles.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Droplets } from 'lucide-react';

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
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import LegacyAppFixture, { LEGACY_FIXTURE_TITLE } from '@/design/testing/LegacyAppFixture';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

// Legacy class strings as they were on main (7ac8b8213).
const LEGACY = {
  root: 'flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden',
  leftRail: 'flex-shrink-0 border-r border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20 w-80 translate-x-0',
  rightRail: 'flex-shrink-0 border-l border-slate-800 bg-slate-900/50 transition-all duration-300 ease-in-out flex flex-col z-20 w-96 translate-x-0',
  header: 'h-14 flex-shrink-0 border-b border-slate-800 bg-slate-900/80 flex items-center px-4 justify-between z-10',
  main: 'flex-1 flex flex-col min-w-0 bg-slate-950 overflow-y-auto',
  railToggle: 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-800 h-10 w-10 text-slate-400 hover:text-white shrink-0',
  helpTrigger: 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-800 h-8 w-8 text-slate-400 hover:text-white',
  sheet: 'fixed z-50 gap-4 p-6 transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500 inset-y-0 right-0 h-full data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm w-[500px] sm:w-[600px] bg-slate-950 border-l border-slate-800 text-slate-100 shadow-2xl',
  autoSave: 'inline-flex items-center justify-center font-medium ring-offset-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-800 rounded-md h-8 px-2 text-xs text-slate-400 hover:text-white gap-2',
  projectLabel: 'text-xs font-medium text-slate-400 uppercase',
  overlay: 'absolute inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-center justify-center',
  noteError: 'bg-red-950/90 border-red-800 text-red-200',
};

const TOKEN_CLASS = /(^|\s)([a-z-]+:)*(bg|text|border|ring|ring-offset|shadow|font|placeholder)-pl-/;
const CONSOLE_COLOUR = /(^|\s)([a-z-[\]=&>:]+:)*(bg|text|border|ring|ring-offset|from|to|shadow)-(slate|lime|sky|blue|cyan|emerald|amber|red)-\d/;

function Kit(props) {
  return (
    <MemoryRouter>
      <StudioLayout
        header={<StudioHeader icon={Droplets} title="Studio" tabs={[{ value: 'a', label: 'A' }]} activeTab="a" onTabChange={() => {}} />}
        headerActions={(
          <>
            <StudioAutoSave isSaving={false} saveError={null} lastSaveTime={null} onSave={() => {}} />
            <StudioHelp title="Guide" description="How to use it"><p>help body</p></StudioHelp>
          </>
        )}
        sidebarLeft={<StudioProjectManager projects={[{ id: 'p1', name: 'One' }]} currentProjectId="p1" onCreate={() => {}} onOpen={() => {}} onDelete={() => {}} />}
        sidebarRight={<div>right rail</div>}
        main={<div>main area</div>}
        notifications={[{ id: 1, type: 'error', message: 'Import failed' }]}
        onDismissNotification={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

const allClasses = (root) => [...root.querySelectorAll('[class]')].map((el) => el.getAttribute('class'));
const helpButton = () => screen.getByTitle('Documentation');

describe('outside a scope: the kit renders its legacy classes, byte for byte', () => {
  it('frame, rails, header, main, toggles and project manager', () => {
    const { container } = render(<Kit />);
    const root = container.firstElementChild;
    expect(root.className).toBe(LEGACY.root);
    const [left, wrapper] = [...root.children].filter((el) => el.tagName === 'DIV' && !el.className.includes('fixed'));
    expect(left.className).toBe(LEGACY.leftRail);
    expect(container.querySelector('header').className).toBe(LEGACY.header);
    expect(container.querySelector('main').className).toBe(LEGACY.main);
    expect(within(wrapper).getByText('right rail').closest('.w-96').className).toBe(LEGACY.rightRail);
    expect(container.querySelector('header button').className).toBe(LEGACY.railToggle);
    expect(container.querySelector('header button')).not.toHaveAttribute('aria-label');
    expect(helpButton().className).toBe(LEGACY.helpTrigger);
    expect(helpButton()).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('button', { name: /Save/ }).className).toBe(LEGACY.autoSave);
    expect(screen.getByText('Project').className).toBe(LEGACY.projectLabel);
    expect(screen.getByText('Import failed').parentElement.className).toContain(LEGACY.noteError);
  });

  it('busy overlay and the open help drawer keep the dark console', () => {
    render(<Kit busyMessage="Working" />);
    expect(screen.getByText('Working').closest('.absolute').className).toBe(LEGACY.overlay);
    fireEvent.click(helpButton());
    const sheet = screen.getByRole('dialog');
    expect(sheet.className).toBe(LEGACY.sheet);
    expect(sheet).not.toHaveAttribute('data-pl-theme');
  });

  it('nothing carries the scope attribute, a token class or the theme toggle', () => {
    const { container } = render(<Kit busyMessage="Working" />);
    expect(container.querySelector('[data-pl-theme]')).toBeNull();
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    allClasses(document.body).forEach((cls) => expect(cls).not.toMatch(TOKEN_CLASS));
  });
});

describe('a Studio-kit app that has not opted in is unchanged', () => {
  it.each([
    [LEGACY_FIXTURE_TITLE, LegacyAppFixture],
  ])('%s mounts on the dark console with no themed scope', async (title, App) => {
    const { container } = render(<MemoryRouter><App /></MemoryRouter>);
    expect(await screen.findByText(title)).toBeInTheDocument();
    const root = container.firstElementChild;
    expect(root.className).toBe(LEGACY.root);
    expect(container.querySelector('header').className).toBe(LEGACY.header);
    expect(container.querySelector('main').className).toBe(LEGACY.main);
    expect(document.querySelector('[data-pl-theme]')).toBeNull();
    expect(document.querySelector('[data-pl-root]')).toBeNull();
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    allClasses(document.body).forEach((cls) => expect(cls).not.toMatch(TOKEN_CLASS));
  });
});

describe('inside a scope: theme roles', () => {
  const themed = (props) => render(<ThemedApp userId="kit-test"><Kit {...props} /></ThemedApp>);

  it('the frame and its pieces drop the console colours for theme roles', () => {
    const { container } = themed({ busyMessage: 'Working' });
    const frame = container.querySelector('[data-pl-theme] > div');
    expect(frame.className).toMatch(/\bbg-pl-bg\b/);
    expect(container.querySelector('header').className).toMatch(/\bbg-pl-surface\b/);
    expect(container.querySelector('main').className).toMatch(/\bbg-pl-bg\b/);
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide left panel' })).toHaveAttribute('aria-expanded', 'true');
    allClasses(container).forEach((cls) => expect(cls).not.toMatch(CONSOLE_COLOUR));
  });

  it('notifications use the status roles', () => {
    themed();
    expect(screen.getByText('Import failed').parentElement.className).toMatch(/\bbg-pl-danger-bg\b/);
  });

  it('the help drawer is a portal that carries the scope and follows the theme', () => {
    themed();
    fireEvent.click(helpButton());
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveAttribute('data-pl-theme', 'light');
    expect(sheet.className).toMatch(/\bbg-pl-raised\b/);
    expect(sheet.className).not.toMatch(CONSOLE_COLOUR);
    fireEvent.keyDown(sheet, { key: 'Escape' });
  });

  it('the theme toggle switches the whole frame to dark and back', () => {
    const { container } = themed();
    const scope = container.querySelector('[data-pl-theme]');
    expect(scope).toHaveAttribute('data-pl-theme', 'light');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'dark');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(scope).toHaveAttribute('data-pl-theme', 'light');
  });
});
