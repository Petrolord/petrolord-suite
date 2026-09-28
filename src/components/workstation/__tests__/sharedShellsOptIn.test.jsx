/**
 * Design system pilot 4 (Seismolord) made three shared pieces theme aware:
 * the workstation shell (WorkspaceShell, used by about 20 geoscience and
 * drilling workstations), ModuleHomeLink (the ribbon's way back to the
 * module dashboard) and the help guide layout (23 app guides).
 *
 * Rule 5 of the pilot brief: shared layouts may follow the theme only when
 * that is inert outside a [data-pl-theme] scope. The snapshots below were
 * recorded on main (7ac8b8213) before the pilot touched these files, so
 * any change to what a non-pilot app renders fails here. Inside a scope
 * the same pieces switch to theme roles.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemedApp } from '@/design/ThemeProvider';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import StratigraphyHelpGuide from '@/pages/apps/StratigraphyStudio/StratigraphyHelpGuide';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
});

const shell = () => (
  <WorkspaceShell
    ribbon={<div>ribbon</div>}
    explorer={<div>explorer</div>}
    center={<div>center</div>}
    dock={<div>dock</div>}
    dockOpen
    statusBar={<div>status</div>}
    autoSaveId="test.shell"
  />
);

// The help footer prints the running build (sha and time), which differs
// between machines; mask it so the snapshot holds the markup only.
const stableHtml = (el) => el.innerHTML.replace(
  /(data-testid="helpguide-build">)[^<]*/, '$1BUILD',
);

describe('outside a scope the shared shells render exactly as on main', () => {
  test('WorkspaceShell', () => {
    const { container } = render(shell());
    expect(container.innerHTML).toMatchSnapshot();
    expect(container.innerHTML).not.toMatch(/-pl-|data-pl-theme/);
  });

  test('ModuleHomeLink', () => {
    const { container } = render(
      <MemoryRouter><ModuleHomeLink module="geoscience" /></MemoryRouter>,
    );
    expect(container.innerHTML).toMatchSnapshot();
    expect(container.innerHTML).not.toMatch(/-pl-/);
  });

  test('a real non-pilot help guide (Stratigraphy Studio)', () => {
    const { container } = render(<MemoryRouter><StratigraphyHelpGuide /></MemoryRouter>);
    expect(stableHtml(container)).toMatchSnapshot();
    expect(container.innerHTML).not.toMatch(/-pl-|data-pl-theme/);
  });
});

describe('inside a scope the shared shells follow the theme', () => {
  test('WorkspaceShell, ModuleHomeLink and the help layout use theme roles', () => {
    const { container } = render(
      <MemoryRouter>
        <ThemedApp userId="t1">
          {shell()}
          <ModuleHomeLink module="geoscience" />
          <StratigraphyHelpGuide />
        </ThemedApp>
      </MemoryRouter>,
    );
    const html = container.innerHTML;
    expect(html).toMatch(/bg-pl-bg/);
    expect(html).toMatch(/text-pl-muted/);
    expect(html).toMatch(/bg-pl-surface/);
    // no dark console colours left in the themed shells
    expect(html).not.toMatch(/bg-slate-|text-white|lime-|text-slate-/);
  });
});
