/**
 * AppUpgrade WC-U1-010 (PL7): the exported section carries the header a
 * reviewer signs: field, analyst, wells, datum and flattening, depth
 * reference and unit, vertical scale, spacing, template, date and build.
 * Latin-1 only (the PNG header is canvas text; the same strings go to any
 * later PDF on jsPDF standard fonts).
 */
import { sectionCaption, verticalScale } from '../services/sectionReport';

const wells = [{ name: 'KETA-1' }, { name: 'KETA-2' }, { name: 'KETA-3' }];
const now = new Date('2026-09-29T10:00:00Z');

test('vertical scale: 350 m over 700 CSS px is 1:1,890 at 96 dpi', () => {
  // 0.5 m per px; one CSS px is 0.0254/96 m = 0.000264583 m; 0.5 / 0.000264583 = 1889.76
  expect(verticalScale(1400, 1750, 700)).toBe(1890);
  expect(verticalScale(1400, 1400, 700)).toBeNull();
  expect(verticalScale(0, 100, 0)).toBeNull();
});

test('a flattened section in feet names every item of the header', () => {
  const { title, caption } = sectionCaption({
    wells, datum: { mode: 'flatten', topName: 'Top Dome', datumM: 1500 }, depthRef: 'tvdss', depthUnit: 'ft',
    spacing: 'proportional', templateName: 'Raw quicklook', scale: 1890, report: { field: 'Keta Field', analyst: 'A. Analyst' },
    now, build: 'Petrolord Suite 4.0.0 (abc1234)',
  });
  expect(title).toBe('Well Correlation: Keta Field (3 wells)');
  const text = caption.join('\n');
  for (const s of ['Wells: KETA-1, KETA-2, KETA-3', 'Flattened on Top Dome at 4921.3 ft TVDSS', 'Depth TVDSS in ft', 'mean sea level',
    'Vertical scale 1:1,890', 'Spacing by distance', 'Template Raw quicklook', 'Field Keta Field', 'Analyst A. Analyst', '2026-09-29',
    'Petrolord Suite 4.0.0 (abc1234)']) {
    expect(text).toContain(s);
  }
  expect(/[^\x20-\xff\n]/.test(text + title)).toBe(false);
});

test('structural and stretched sections, and a header left blank, say so plainly', () => {
  const a = sectionCaption({ wells, datum: { mode: 'structural' }, depthRef: 'md', depthUnit: 'm', spacing: 'equal', templateName: 'T', scale: null, now, build: 'b' });
  expect(a.title).toBe('Well Correlation (3 wells)');
  expect(a.caption.join(' ')).toContain('Structural (true depth)');
  expect(a.caption.join(' ')).toContain('Field n/a · Analyst n/a');
  expect(a.caption.join(' ')).toContain('Vertical scale n/a');
  const b = sectionCaption({ wells, datum: { mode: 'stretch', upperName: 'Top Dome', lowerName: 'Base Sand' }, depthRef: 'md', depthUnit: 'm', spacing: 'equal', templateName: 'T', scale: 500, now, build: 'b' });
  expect(b.caption.join(' ')).toContain('Stretched between Top Dome and Base Sand');
});

// U2-002: a scrolled section exports the window on screen and says which wells
test('U2-002 a scrolled PNG names the wells in view and the total', () => {
  const wells = Array.from({ length: 30 }, (_, i) => ({ name: `F-${i + 1}` }));
  const { caption } = sectionCaption({ wells, datum: { mode: 'structural' }, depthRef: 'md', depthUnit: 'm', spacing: 'equal', templateName: 'Q', scale: 1000, window: { first: 4, last: 9, n: 30 } });
  expect(caption[0]).toBe('Wells 4 to 9 of 30 shown: F-4, F-5, F-6, F-7, F-8, F-9');
});
