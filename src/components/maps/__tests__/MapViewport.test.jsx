// The viewport's DOM contract under jsdom (canvas and ResizeObserver
// stubbed): fit geometry exposed as data attributes, click-to-digitise
// only while drawing, drag pans, double-click refits unless drawing,
// readout under the cursor.
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import MapViewport from '../MapViewport';
import { FIT_PAD } from '../mapTransform';

const spec = { x0: 1000, y0: 2000, dx: 50, dy: 50, nx: 25, ny: 20 };
const grid = Float32Array.from({ length: spec.nx * spec.ny }, (_, i) => 1500 + (i % spec.nx) + Math.floor(i / spec.nx));
const W = 800;
const H = 480;

function stubCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get: (t, k) => {
      if (k === 'canvas') return { width: W, height: H };
      if (k === 'measureText') return () => ({ width: 10 });
      if (typeof k === 'string') return t[k] !== undefined ? t[k] : noop;
      return undefined;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

beforeAll(() => {
  // jsdom has no PointerEvent; without one fireEvent.pointer* carries no clientX/Y
  global.PointerEvent = class extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  };
  global.ResizeObserver = class { observe() {} disconnect() {} };
  global.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  HTMLCanvasElement.prototype.getContext = () => stubCtx();
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return W; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return H; } });
});

const fitScale = () => Math.min((W - 2 * FIT_PAD) / ((spec.nx - 1) * spec.dx), (H - 2 * FIT_PAD) / ((spec.ny - 1) * spec.dy));

test('exposes the fit as data attributes and fires onMapClick with the world point only while drawing', () => {
  const onMapClick = jest.fn();
  const { getByTestId, rerender } = render(<MapViewport testIdPrefix="t" spec={spec} grid={grid} height={H} onMapClick={onMapClick} />);
  const canvas = getByTestId('t-canvas');
  expect(Number(canvas.dataset.scale)).toBeCloseTo(fitScale(), 9);
  expect(canvas.dataset.fitPad).toBe(String(FIT_PAD));
  expect(canvas.dataset.vw).toBe(String(W));
  fireEvent.pointerDown(canvas, { clientX: 400, clientY: 240, button: 0, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 400, clientY: 240, pointerId: 1 });
  expect(onMapClick).not.toHaveBeenCalled();
  rerender(<MapViewport testIdPrefix="t" spec={spec} grid={grid} height={H} onMapClick={onMapClick} drawing />);
  fireEvent.pointerDown(canvas, { clientX: 400, clientY: 240, button: 0, pointerId: 2 });
  fireEvent.pointerUp(canvas, { clientX: 400, clientY: 240, pointerId: 2 });
  expect(onMapClick).toHaveBeenCalledTimes(1);
  const { x, y } = onMapClick.mock.calls[0][0];
  expect(x).toBeCloseTo((1000 + 2200) / 2, 6); // the viewport centre is the extent centre after a fit
  expect(y).toBeCloseTo((2000 + 2950) / 2, 6);
  expect(getByTestId('t-zrange').textContent).toContain('25×20 grid');
});

test('a drag beyond 3 px pans instead of clicking; double-click refits unless drawing', () => {
  const onMapClick = jest.fn();
  const { getByTestId, rerender } = render(<MapViewport testIdPrefix="t" spec={spec} grid={grid} height={H} onMapClick={onMapClick} drawing />);
  const canvas = getByTestId('t-canvas');
  const cx0 = Number(canvas.dataset.cx);
  act(() => {
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, button: 0, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 100, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 140, clientY: 100, pointerId: 3 });
  });
  expect(onMapClick).not.toHaveBeenCalled();
  expect(Number(canvas.dataset.cx)).toBeLessThan(cx0);
  act(() => { fireEvent.doubleClick(canvas); });
  expect(Number(canvas.dataset.cx)).toBeLessThan(cx0); // still panned: drawing blocks the refit
  rerender(<MapViewport testIdPrefix="t" spec={spec} grid={grid} height={H} onMapClick={onMapClick} />);
  act(() => { fireEvent.doubleClick(canvas); });
  expect(Number(canvas.dataset.cx)).toBeCloseTo(cx0, 9);
});

test('zoom buttons change the scale about the centre and the readout samples under the cursor', () => {
  const { getByTestId } = render(<MapViewport testIdPrefix="t" spec={spec} grid={grid} height={H} zFormat={(v) => v.toFixed(0)} zUnit="m" />);
  const canvas = getByTestId('t-canvas');
  const s0 = Number(canvas.dataset.scale);
  act(() => { fireEvent.click(getByTestId('t-zoom-in')); });
  expect(Number(canvas.dataset.scale)).toBeCloseTo(s0 * 1.25, 9);
  act(() => { fireEvent.click(getByTestId('t-fit')); });
  expect(Number(canvas.dataset.scale)).toBeCloseTo(s0, 9);
  act(() => { fireEvent.pointerMove(canvas, { clientX: W / 2, clientY: H / 2 }); });
  expect(getByTestId('t-readout').textContent).toMatch(/^X \d+ {2}Y \d+ {2}z \d+ m$/);
  act(() => { fireEvent.pointerMove(canvas, { clientX: 1, clientY: 1 }); });
  expect(getByTestId('t-readout').textContent).toContain('z —');
});
