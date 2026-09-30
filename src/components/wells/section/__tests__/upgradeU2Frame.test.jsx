/**
 * AppUpgrade WC-U2 (2026-09-29): the shared section kit (Well Correlation and
 * Stratigraphy Studio draw it).
 *
 *  U2-002 30 wells gave 24 px columns (WC-U1-017): fixed-width columns on a
 *         band that scrolls under a pinned depth axis, painting only the
 *         columns in the window.
 * Negative control: on origin/main (2dd0bb63a) columnLayout ignores fixedW,
 * resolveColumnWidth/scrollWindow do not exist and the section has no
 * horizontal scroll.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  columnLayout, resolveColumnWidth, scrollWindow, AUTO_COL_PX,
} from '../sectionFrame';
import CrossSection from '../CrossSection';

const wellsN = (n) => Array.from({ length: n }, (_, i) => ({
  id: `w${i}`, name: `W-${i + 1}`, is_own: true, tops: [{ id: `t${i}`, well_id: `w${i}`, name: 'Top A', md_m: 1000 + i }],
  depth: Float64Array.from({ length: 50 }, (_, k) => 900 + k * 10), tracks: [], frame: null,
  surface_x: i * 1000, surface_y: 0, crs: 'EPSG:32632', xy_unit: 'm', kb_m: 20,
}));

describe('U2-002 column width and the scrolling band (pure)', () => {
  test('auto fits while columns stay 90 px or wider, then fixes them at 140 px', () => {
    expect(resolveColumnWidth('auto', 3, 900)).toBeNull();
    expect(resolveColumnWidth('auto', 30, 900)).toBe(AUTO_COL_PX);
    expect(resolveColumnWidth('fit', 30, 900)).toBeNull();
    expect(resolveColumnWidth(220, 3, 900)).toBe(220);
    expect(resolveColumnWidth('160', 3, 900)).toBe(160);
  });

  test('a fixed width lays 30 columns on a band wider than the window, gaps kept', () => {
    const boxes = columnLayout(wellsN(30), { mode: 'equal', plotLeft: 56, plotW: 900, fixedW: 140 });
    expect(boxes.every((b) => b.w === 140)).toBe(true);
    const gap = boxes[1].x0 - (boxes[0].x0 + 140);
    expect(gap).toBe(17); // 12% of 140
    expect(boxes[29].x0 + 140 - 56).toBe(30 * 140 + 29 * 17);
  });

  test('proportional spacing with a fixed width keeps the width and the order, never overlapping', () => {
    const boxes = columnLayout(wellsN(12), { mode: 'proportional', plotLeft: 0, plotW: 600, fixedW: 120 });
    expect(boxes.every((b) => b.w === 120)).toBe(true);
    for (let i = 0; i + 1 < boxes.length; i++) expect(boxes[i + 1].x0).toBeGreaterThanOrEqual(boxes[i].x0 + 120);
  });

  test('the window clamps the offset and marks only overlapping columns visible', () => {
    const boxes = columnLayout(wellsN(30), { mode: 'equal', plotLeft: 56, plotW: 900, fixedW: 140 });
    const w0 = scrollWindow(boxes, { scrollX: 0, plotLeft: 56, plotW: 900 });
    expect(w0.maxScroll).toBe(Math.ceil(w0.contentW - 900));
    expect(w0.visible.filter(Boolean)).toHaveLength(6); // 157 px per column over 900 px
    const end = scrollWindow(boxes, { scrollX: 1e9, plotLeft: 56, plotW: 900 });
    expect(end.scrollX).toBe(end.maxScroll);
    expect(end.visible[29]).toBe(true);
    expect(end.visible[0]).toBe(false);
    expect(end.boxes[29].x0 + 140).toBeLessThanOrEqual(56 + 900 + 1);
  });
});

describe('U2-002 the section scrolls a 30-well band (CrossSection)', () => {
  const noopCtx = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  beforeAll(() => {
    global.ResizeObserver = global.ResizeObserver || class { observe() {} disconnect() {} };
    jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockImplementation(noopCtx);
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 956; } });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 600; } });
  });
  afterAll(() => {
    delete window.HTMLElement.prototype.clientWidth;
    delete window.HTMLElement.prototype.clientHeight;
  });

  const draw = (props = {}) => render(
    <CrossSection wells={wellsN(30)} datum={{ mode: 'structural' }} shownTops={['Top A']} topNames={['Top A']} {...props} />,
  );

  test('fixed 140 px columns, a scrollbar, and only the visible columns painted', () => {
    draw();
    const sec = screen.getByTestId('corr-section');
    expect(sec.getAttribute('data-col-fixed-w')).toBe('140');
    expect(Number(sec.getAttribute('data-max-scroll'))).toBeGreaterThan(0);
    expect(Number(sec.getAttribute('data-painted-cols'))).toBeLessThan(10);
    const bar = screen.getByTestId('corr-hscroll');
    act(() => { bar.scrollLeft = 2000; fireEvent.scroll(bar); });
    expect(sec.getAttribute('data-scroll-x')).toBe('2000');
    expect(Number(sec.getAttribute('data-col-x').split(',')[0])).toBe(56 - 2000);
  });

  test('shift + wheel scrolls the wells instead of zooming the depth', () => {
    draw();
    const sec = screen.getByTestId('corr-section');
    const top = sec.getAttribute('data-view-top');
    fireEvent.wheel(screen.getByTestId('corr-section-canvas'), { deltaY: 300, shiftKey: true });
    expect(sec.getAttribute('data-scroll-x')).toBe('300');
    expect(sec.getAttribute('data-view-top')).toBe(top);
  });

  test('fit keeps every column in the window (the previous behaviour, still offered)', () => {
    draw({ columnWidth: 'fit' });
    const sec = screen.getByTestId('corr-section');
    expect(sec.getAttribute('data-max-scroll')).toBe('0');
    expect(screen.queryByTestId('corr-hscroll')).toBeNull();
    expect(sec.getAttribute('data-painted-cols')).toBe('30');
  });
});
