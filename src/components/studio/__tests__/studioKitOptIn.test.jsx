/**
 * Design-system opt-in proof for the Studio kit shell (~33 apps). The kit
 * gained theme-aware styling for the Decline Curve Analysis pilot, and that
 * styling must be inert outside a <ThemedApp> scope:
 *   1. outside a scope, every element of the kit (layout, header, autosave in
 *      each state, help drawer open, project manager with its create dialog
 *      open, notifications of every type, busy overlay) renders the same tag,
 *      class string and aria-label as on main before the pilot
 *      (__fixtures__/studioKitLegacyDom.json, captured from 7ac8b8213);
 *   2. inside a scope the same kit carries theme roles and no slate classes.
 * To refresh the fixture after an intended legacy change, run this file with
 * STUDIO_KIT_FIXTURE_WRITE=1.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudioLayout from '@/components/studio/StudioLayout';
import StudioHeader from '@/components/studio/StudioHeader';
import StudioAutoSave from '@/components/studio/StudioAutoSave';
import StudioHelp from '@/components/studio/StudioHelp';
import StudioProjectManager from '@/components/studio/StudioProjectManager';
import { ThemedApp } from '@/design/ThemeProvider';

const FIXTURE = path.join(__dirname, '__fixtures__', 'studioKitLegacyDom.json');

beforeAll(() => {
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || (() => {});
  window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture || (() => false);
});
afterEach(cleanup);

const dump = () => [...document.body.querySelectorAll('*')].map((el) => [
  el.tagName, el.getAttribute('class') || '', el.getAttribute('aria-label') || '',
].join('|'));

function Kit({ saveState }) {
  return (
    <MemoryRouter>
      <StudioLayout
        header={<StudioHeader title="Kit" tabs={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} activeTab="a" />}
        headerActions={<><StudioAutoSave {...saveState} onSave={() => {}} /><StudioHelp title="Help" description="desc"><p>body</p></StudioHelp></>}
        sidebarLeft={<StudioProjectManager projects={[{ id: 'p1', name: 'One' }]} currentProjectId="p1" onCreate={() => {}} onOpen={() => {}} onDelete={() => {}} />}
        sidebarRight={<div>right</div>}
        main={<div>main</div>}
        bottom={<div>bottom</div>}
        busyMessage="Busy"
        notifications={[
          { id: 1, type: 'error', message: 'e' },
          { id: 2, type: 'success', message: 's', action: { label: 'Undo', onClick() {} } },
          { id: 3, type: 'warning', message: 'w' },
          { id: 4, type: 'info', message: 'i' },
        ]}
        onDismissNotification={() => {}}
      />
    </MemoryRouter>
  );
}

const SAVE_STATES = {
  saving: { isSaving: true },
  error: { saveError: 'x' },
  saved: { lastSaveTime: new Date(0) },
  idle: {},
};

function captureLegacy() {
  const out = {};
  for (const [k, s] of Object.entries(SAVE_STATES)) {
    render(<Kit saveState={s} />);
    out[`kit-${k}`] = dump();
    cleanup();
  }
  render(<Kit saveState={{}} />);
  fireEvent.click(document.querySelector('[title="Documentation"]'));
  out['kit-help-open'] = dump();
  cleanup();
  render(<Kit saveState={{}} />);
  fireEvent.click(document.querySelector('[title="Create new project"]'));
  out['kit-create-open'] = dump();
  cleanup();
  return out;
}

describe('Studio kit outside a theme scope', () => {
  it('renders exactly the legacy DOM classes and labels (other Studio apps unchanged)', () => {
    const now = captureLegacy();
    if (process.env.STUDIO_KIT_FIXTURE_WRITE) fs.writeFileSync(FIXTURE, `${JSON.stringify(now, null, 1)}\n`);
    const legacy = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    expect(Object.keys(now)).toEqual(Object.keys(legacy));
    for (const k of Object.keys(legacy)) expect([k, now[k]]).toEqual([k, legacy[k]]);
    // and nothing opted in
    expect(JSON.stringify(now)).not.toMatch(/-pl-/);
  });
});

describe('Studio kit inside a theme scope', () => {
  it('uses theme roles and drops the legacy slate console classes', () => {
    render(<ThemedApp userId="kit-test"><Kit saveState={{ lastSaveTime: new Date(0) }} /></ThemedApp>);
    fireEvent.click(document.querySelector('[title="Documentation"]'));
    const classes = [...document.body.querySelectorAll('[class]')].map((el) => el.getAttribute('class'));
    // the kit's own pieces (the shared ui primitives are proven elsewhere)
    const kitSlate = classes.filter((c) => /(^|\s)(bg|text|border)-slate-/.test(c) && /pl-|flex h-screen|h-14|border-(l|r)/.test(c));
    expect(kitSlate).toEqual([]);
    expect(classes.some((c) => c.includes('bg-pl-bg'))).toBe(true);
    expect(classes.some((c) => c.includes('bg-pl-surface'))).toBe(true);
    expect(document.querySelector('[role="dialog"]').getAttribute('data-pl-theme')).toBe('light');
  });
});
