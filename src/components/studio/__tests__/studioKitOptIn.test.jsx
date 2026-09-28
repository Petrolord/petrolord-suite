/**
 * The Studio kit on theme roles (design system pilot 5; the legacy branch
 * went in batch 7B, docs/scope/DesignSystem-Rollout.md section 5.2): the
 * frame and its pieces use theme roles, the help drawer (a portal) carries
 * the scope attribute, notifications use the status roles, and the toggle
 * switches the frame.
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

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});

// Legacy class strings as they were on main (7ac8b8213).

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
