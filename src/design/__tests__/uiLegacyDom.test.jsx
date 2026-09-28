/**
 * Design-system opt-in proof for the ui pieces adapted in the follow-up
 * (checkbox, switch, accordion, scroll-area, sheet, slider, progress, alert,
 * separator, context-menu, alert-dialog, skeleton, toggle, toggle-group,
 * badge, the sonner toaster, AccessDenied, ComingSoon and the cold-load
 * loaders). Outside a <ThemedApp> scope every element they render, open
 * portals included, must keep the tag, class string, aria-label and
 * data-pl-theme it had on main before the follow-up
 * (__fixtures__/uiLegacyDom.json, captured from 5940c04bd).
 *
 * To refresh the fixture after an intended legacy change, run this file with
 * UI_LEGACY_FIXTURE_WRITE=1.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import '@testing-library/jest-dom';
import { render, cleanup, act } from '@testing-library/react';

jest.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: {}, from: jest.fn() } }));
jest.mock('@/hooks/useHSEAccess', () => ({ useHSEAccess: () => ({ can: () => true }) }));
jest.mock('@/hooks/useSuiteAccess', () => ({ useSuiteAccess: () => ({ can: () => false }) }));

import { SCENES, AFTER } from './uiScenes';

const FIXTURE = path.join(__dirname, '__fixtures__', 'uiLegacyDom.json');

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

const dump = () => [...document.body.querySelectorAll('*')].map((el) => [
  el.tagName, el.getAttribute('class') || '', el.getAttribute('aria-label') || '',
  el.getAttribute('data-pl-theme') || '',
].join('|'));

async function capture() {
  const out = {};
  for (const [name, Scene] of Object.entries(SCENES)) {
    const utils = render(<Scene />);
    if (AFTER[name]) await act(async () => { await AFTER[name](utils); });
    out[name] = dump();
    cleanup();
  }
  return out;
}

describe('adapted ui pieces outside a scope match main byte for byte', () => {
  it('every scene keeps its legacy DOM (tag, class, aria-label, no scope attribute)', async () => {
    const now = await capture();
    if (process.env.UI_LEGACY_FIXTURE_WRITE === '1') {
      fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
      fs.writeFileSync(FIXTURE, `${JSON.stringify(now, null, 1)}\n`);
    }
    const pinned = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    expect(Object.keys(now).sort()).toEqual(Object.keys(pinned).sort());
    for (const name of Object.keys(pinned)) {
      expect({ scene: name, dom: now[name] }).toEqual({ scene: name, dom: pinned[name] });
    }
  });

  it('the fixture is not empty (every scene rendered something)', () => {
    const pinned = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    for (const [name, rows] of Object.entries(pinned)) {
      expect({ name, n: rows.length > 1 }).toEqual({ name, n: true });
      rows.forEach((r) => expect(r.split('|')[3]).toBe(''));
    }
  });
});
