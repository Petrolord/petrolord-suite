/**
 * SEIS-U1-011 / -013 (PL1, PL7): pictures and plots name the real line
 * number, the vertical domain and datum, the polarity and display and the
 * build. Negative control on origin/main bf9cc1ebc: the plot's View row
 * and the PNG file name used the lattice index ("inline 12" for inline
 * 1012), the PNG had no caption, and depth read "TVD" in metres whatever
 * the display unit (the status bar said TVDSS).
 */
import fs from 'fs';
import path from 'path';
import {
  sectionLineLabel, sectionCaption, lineLabelSlug, verticalLabel, displayLabel,
} from '../lib/sectionCaption';
import { latin1 } from '../components/workspace/dialogs/PlotDialog';

const GEO = { il: { min: 1001, step: 1, count: 8 }, xl: { min: 2001, step: 2, count: 6 }, dt_us: 4000 };

describe('sectionLineLabel: the line number, never the index', () => {
  test('inline, crossline with a step, time slice, traverse', () => {
    expect(sectionLineLabel(GEO, 'inline', 11)).toBe('Inline 1012');
    expect(sectionLineLabel(GEO, 'xline', 3)).toBe('Crossline 2007');
    expect(sectionLineLabel(GEO, 'time', 350)).toBe('Time slice 1,400 ms');
    expect(sectionLineLabel(GEO, 'traverse', 0, 'A-A\'')).toBe('Traverse A-A\'');
    expect(lineLabelSlug('Inline 1012')).toBe('inline-1012');
  });
});

describe('sectionCaption: what a reviewer signs', () => {
  const display = { polarity: -1, colormap: 'red_white_blue', reverse: false, gain: 1.5, clip: 1234.5, agc: { halfWindow: 12 } };
  test('time section', () => {
    const lines = sectionCaption({
      volumeName: 'Claredon', lineLabel: 'Inline 1012', display, crsName: 'Minna / Nigeria West Belt', date: '2026-09-30', build: 'Petrolord Suite 4.0.0 (abc)',
    });
    expect(lines[0]).toBe('Seismolord  Claredon  Inline 1012');
    expect(lines[1]).toMatch(/two-way time \(TWT\) in ms below the seismic datum/);
    expect(lines[1]).toMatch(/polarity reversed on display, colour map red_white_blue, gain 1.5, clip 1.23e\+3, AGC on \(display only\)/);
    expect(lines[2]).toBe('CRS Minna / Nigeria West Belt  ·  2026-09-30  ·  Petrolord Suite 4.0.0 (abc)');
  });
  test('depth section says TVDSS in the display unit and the velocity model', () => {
    expect(verticalLabel({ depth: true, depthUnit: 'ft', velocityText: 'V(z) = 1800 + 0.5z' }))
      .toBe('Vertical: depth TVDSS in ft below the seismic datum, through V(z) = 1800 + 0.5z');
    expect(displayLabel({ polarity: 1, colormap: 'gray', gain: 1, clip: 2 })).toMatch(/^polarity as recorded in the file/);
  });
  test('plot rows are Latin-1 safe for the jsPDF standard fonts', () => {
    expect(latin1('a · b — c → d')).toBe('a - b - c  d');
  });
});

describe('the viewports read TVDSS in the display unit (source guard)', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'components', f), 'utf8');
  test('no metre-only TVD label is left in the section or 3D readouts', () => {
    for (const f of ['SliceView.jsx', 'CubeView.jsx']) {
      expect(src(f)).not.toMatch(/`TVD \$\{/);
      expect(src(f)).not.toMatch(/'m TVD'/);
      expect(src(f)).toMatch(/TVDSS/);
    }
  });
});
