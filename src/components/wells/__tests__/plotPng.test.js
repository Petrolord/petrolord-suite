// The shared PNG composer (components/wells/plotPng.js) against a recording
// canvas: jsdom has no canvas, so the assertions are on the draw calls and
// the geometry of the header band. PT8 (2026-09-05) added the caption line
// and the explicit scale an offscreen render has to pass.
import { trackPlotPng } from '../plotPng';

function makeCanvas(width, height, clientWidth) {
  const calls = [];
  const ctx = {
    calls,
    fillStyle: null, font: '', textAlign: '', globalAlpha: 1,
    fillRect: (...a) => calls.push(['fillRect', ...a]),
    fillText: (...a) => calls.push(['fillText', ...a, { font: ctx.font, fillStyle: ctx.fillStyle }]),
    drawImage: (...a) => calls.push(['drawImage', ...a]),
  };
  return {
    width,
    height,
    clientWidth,
    getContext: () => ctx,
    toBlob: (cb) => cb({ type: 'image/png', size: 1 }),
    ctx,
  };
}

// document.createElement('canvas') hands back the output canvas; Image
// never loads (no network in jsdom), which is the watermark's skip path.
const outputs = [];
beforeEach(() => {
  outputs.length = 0;
  jest.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') return {};
    const c = makeCanvas(0, 0, 0);
    outputs.push(c);
    return c;
  });
  global.Image = class {
    set src(_v) { setTimeout(() => this.onerror && this.onerror(), 0); }
  };
});
afterEach(() => { document.createElement.mockRestore(); });

const texts = (c) => c.ctx.calls.filter((k) => k[0] === 'fillText');

test('the header band carries the title, and the caption when one is given', async () => {
  const src = makeCanvas(800, 600, 800); // 1x on-screen canvas
  await trackPlotPng({ canvas: src, title: 'AKOMA-1 · Petrophysics Studio', caption: '2000.0 m to 2100.0 m MD · datum KB 31.2 m' });
  const out = outputs[0];
  expect(out.width).toBe(800);
  expect(out.height).toBe(600 + 48);          // the taller two-line band
  const t = texts(out);
  expect(t[0][1]).toBe('AKOMA-1 · Petrophysics Studio');
  expect(t[1][1]).toBe('2000.0 m to 2100.0 m MD · datum KB 31.2 m');
  // the caption sits below the title and is drawn smaller and lighter
  expect(t[1][3]).toBeGreaterThan(t[0][3]);
  expect(t[1].at(-1).fillStyle).not.toBe(t[0].at(-1).fillStyle);
  // the plot is composited below the band
  expect(out.ctx.calls.find((k) => k[0] === 'drawImage')).toEqual(['drawImage', src, 0, 48]);
});

test('without a caption the band keeps its original one-line height', async () => {
  const src = makeCanvas(800, 600, 800);
  await trackPlotPng({ canvas: src, title: 'Well Correlation · A · B' });
  const out = outputs[0];
  expect(out.height).toBe(600 + 34);
  expect(texts(out)).toHaveLength(1);
});

test('an offscreen render scales the band by the scale it passes, not by clientWidth', async () => {
  // an offscreen canvas reports clientWidth 0, so the derived ratio would
  // be 1 and a 2x image would get a 1x header — the reason scale is a param
  const src = makeCanvas(1600, 1200, 0);
  await trackPlotPng({ canvas: src, title: 'T', caption: 'C', scale: 2 });
  const out = outputs[0];
  expect(out.width).toBe(1600);
  expect(out.height).toBe(1200 + 96);         // 48 * 2
  const t = texts(out);
  expect(t[0].at(-1).font).toBe('bold 24px sans-serif');   // 12 * 2
  expect(t[1].at(-1).font).toBe('20px sans-serif');        // 10 * 2
  expect(out.ctx.calls.find((k) => k[0] === 'drawImage')).toEqual(['drawImage', src, 0, 96]);
});

test('a live 2x canvas still derives its own scale when none is passed', async () => {
  const src = makeCanvas(1600, 1200, 800);    // DPR 2 on-screen
  await trackPlotPng({ canvas: src, title: 'T' });
  expect(outputs[0].height).toBe(1200 + 68);  // 34 * 2
});

// AppUpgrade WC-U1-010: Well Correlation prints a three-line header (wells;
// datum, reference, unit, scale, spacing, template; field, analyst, date,
// build), each line fitted to the image width so nothing runs off the edge
test('several caption lines: one band row each, every line fitted to the width', async () => {
  const src = makeCanvas(600, 400, 600);
  await trackPlotPng({ canvas: src, title: 'Well Correlation: Keta (3 wells)', caption: ['Wells: A, B, C', 'Structural (true depth) · Depth MD in m', 'Field Keta · Analyst X'] });
  const out = outputs[0];
  expect(out.height).toBe(400 + 34 + 14 * 3);
  const t = texts(out);
  expect(t.map((k) => k[1])).toEqual(['Well Correlation: Keta (3 wells)', 'Wells: A, B, C', 'Structural (true depth) · Depth MD in m', 'Field Keta · Analyst X']);
  expect(t.map((k) => k[3])).toEqual([22, 38, 52, 66]);
  for (const k of t) expect(k[4]).toBe(600 - 20); // maxWidth
});
