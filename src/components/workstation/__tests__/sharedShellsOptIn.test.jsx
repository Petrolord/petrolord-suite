/**
 * The shared workstation pieces on theme roles (design system pilot 4; the
 * legacy branch and its snapshots went in batch 7B): WorkspaceShell,
 * ModuleHomeLink and the help guide layout use theme roles in a scope.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemedApp } from '@/design/ThemeProvider';
import WorkspaceShell from '@/components/workstation/WorkspaceShell';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import StratigraphyHelpGuide from '@/pages/apps/StratigraphyStudio/StratigraphyHelpGuide';

// Since batch 7A the Stratigraphy help guide has no scope of its own (the
// dashboard's one scope themes it), so rendered alone it is unscoped; its
// root element is a plain wrapper, and the snapshot pins what is inside it.

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
