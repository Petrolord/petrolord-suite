/**
 * W1.4 plot composer math: paper layouts, the classic scale series,
 * true-scale crop windows (a plotted millimetre must equal exactly
 * scale/1000 ground metres), and scale-bar picks.
 */
import {
  PAPER_SIZES, MARGIN_MM, TITLE_BLOCK_MM, paperLayout, niceScale,
  suggestScale, mmPerMeter, cropForScale, plotScaleBar, titleBlockRows,
} from '@/pages/apps/Seismolord/lib/plotComposer';

describe('paperLayout', () => {
  test('landscape A4 frame and boxes tile exactly', () => {
    const l = paperLayout('a4', 'landscape');
    expect([l.wMm, l.hMm]).toEqual([297, 210]);
    expect(l.frame).toEqual({ x: 12, y: 12, w: 273, h: 186 });
    expect(l.imageBox.h + l.titleBlock.h).toBe(l.frame.h);
    expect(l.titleBlock.y).toBe(l.frame.y + l.frame.h - TITLE_BLOCK_MM);
  });

  test('portrait flips, unknown paper throws', () => {
    const p = paperLayout('a3', 'portrait');
    expect([p.wMm, p.hMm]).toEqual([297, 420]);
    expect(() => paperLayout('b5')).toThrow(/Unknown paper/);
    expect(PAPER_SIZES.letter.w).toBe(216);
    expect(MARGIN_MM).toBe(12);
  });
});

describe('scale arithmetic', () => {
  test('niceScale rounds up the 1/2/2.5/5 series', () => {
    expect(niceScale(900)).toBe(1000);
    expect(niceScale(1000)).toBe(1000);
    expect(niceScale(1100)).toBe(2000);
    expect(niceScale(2400)).toBe(2500);
    expect(niceScale(26000)).toBe(50000);
  });

  test('suggestScale fits the whole snapshot', () => {
    // 1000x500 px at 10 m/px = 10 km x 5 km; box 200x100 mm ->
    // raw 50,000 both ways -> exactly 1:50,000
    const s = suggestScale(
      { widthPx: 1000, heightPx: 500, metersPerPx: 10 },
      { w: 200, h: 100 },
    );
    expect(s).toBe(50000);
    expect(mmPerMeter(50000)).toBeCloseTo(0.02, 12);
  });

  test('cropForScale: map fills the box exactly at scale, centered crop', () => {
    const img = { widthPx: 1000, heightPx: 500, metersPerPx: 10 };
    // 1:25,000 -> pxPerMm = 25000 / (1000*10) = 2.5; box 200mm -> 500px of 1000
    const c = cropForScale(img, { scale: 25000 }, { w: 200, h: 100 });
    expect(c.sw).toBe(500);
    expect(c.sx).toBe(250);
    expect(c.sh).toBe(250);
    expect(c.sy).toBe(125);
    expect(c.wMm).toBeCloseTo(200, 9);
    expect(c.hMm).toBeCloseTo(100, 9);
    // 1 plotted mm = 25 ground metres: 2.5 px * 10 m/px
  });

  test('cropForScale: whole image smaller than the box keeps true size', () => {
    const img = { widthPx: 100, heightPx: 80, metersPerPx: 10 };
    const c = cropForScale(img, { scale: 50000 }, { w: 200, h: 150 });
    expect(c.sw).toBe(100);
    expect(c.sh).toBe(80);
    // 100 px * 10 m/px = 1 km -> at 1:50,000 = 20 mm
    expect(c.wMm).toBeCloseTo(20, 9);
    expect(c.hMm).toBeCloseTo(16, 9);
  });

  test('cropForScale: section vertical follows ms per cm', () => {
    const img = {
      widthPx: 400, heightPx: 300, metersPerPx: 25, msPerPx: 4,
    };
    // vertical: 100 ms/cm -> pxPerMmY = 100 / (10*4) = 2.5 -> 300px = 120mm
    const c = cropForScale(img, { scale: 10000, msPerCm: 100 }, { w: 500, h: 500 });
    expect(c.sh).toBe(300);
    expect(c.hMm).toBeCloseTo(120, 9);
    // horizontal: pxPerMmX = 10000/(1000*25) = 0.4 -> 400 px = 1000mm > box
    expect(c.sw).toBe(200);
    expect(c.wMm).toBeCloseTo(500, 9);
    expect(() => cropForScale(img, { scale: 0 }, { w: 10, h: 10 })).toThrow(/positive/);
  });
});

describe('plotScaleBar', () => {
  test('picks the largest nice ground length within the budget', () => {
    // 1:25,000, 60mm budget -> 1500 m max -> 1000 m bar, 40 mm
    expect(plotScaleBar(25000, 60)).toEqual({ meters: 1000, mm: 40, label: '1 km' });
    expect(plotScaleBar(1000, 60)).toEqual({ meters: 50, mm: 50, label: '50 m' });
  });
});

describe('titleBlockRows', () => {
  test('rows assemble and empty values drop', () => {
    const rows = titleBlockRows({
      title: 'Top Dome', volumeName: 'dome_ieee', crsName: 'EPSG:32631',
      scaleText: '1:25,000', author: 'ayo', dateStr: '2026-08-20',
    });
    expect(rows[0]).toEqual(['Title', 'Top Dome']);
    expect(rows.find(([k]) => k === 'By')[1]).toBe('ayo · 2026-08-20');
    const noVol = titleBlockRows({ scaleText: '1:1000' });
    expect(noVol.find(([k]) => k === 'Volume')).toBeUndefined();
  });
});
