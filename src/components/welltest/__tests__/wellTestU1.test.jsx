/**
 * Well Test Analysis Studio, Reservoir round Step 1 (WTA-U1, 2026-10-04).
 * Findings and outcomes: docs/upgrade/WellTestAnalysis-UPGRADE.md.
 *
 * The real provider is mounted, the sample loaded, and the PDF built by the
 * function the Export button calls, then read back with poppler. Every test
 * here was written to fail on the code as it stood at origin/main f32577679
 * and pass after its fix.
 */
import '@testing-library/jest-dom';

jest.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ order: jest.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      delete: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}));

import { buildWellTestPdf, collectReportArgs } from '@/utils/wellTestReportExport';
import wtGoldens from '@/utils/welltest/__tests__/goldens.json';
import { mountStudio, chartLogo, readPdf } from './reportTestKit';

const AT = new Date('2026-10-04T09:00:00Z');
const logo = chartLogo();
const build = (ctx, opts = {}) => buildWellTestPdf(collectReportArgs(ctx), { logo, generatedAt: AT, ...opts });
const flat = (s) => s.replace(/\s+/g, ' ');
const n = (s) => Number(String(s).replace(/,/g, ''));

async function sample(setup = null) {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  if (setup) await studio.act(setup);
  return studio;
}

describe('WTA-U1-001: kh in the SI report and on the screens', () => {
  test('the SI report prints kh in md-m with h in metres; oilfield keeps md-ft', async () => {
    const studio = await sample((c) => c.setMatchField('k', '85'));
    const kh = studio.ctx.derivedKpis.kh; // oilfield state, md-ft
    expect(kh).toBeCloseTo(85 * 45, 6);
    const field = readPdf(build(studio.ctx).doc);
    expect(flat(field.text)).toMatch(/kh \(md-ft\) 3,830/);
    field.close?.();
    await studio.act((c) => c.setUnitSystem('si'));
    const si = readPdf(build(studio.ctx).doc);
    const t = flat(si.text);
    expect(t).not.toMatch(/md-ft/);
    const m = t.match(/kh \(md-m\) ([\d,.]+)/);
    expect(m).not.toBeNull();
    expect(n(m[1])).toBeCloseTo(85 * 45 * 0.3048, -1); // 1,166 md-m
    si.close?.();
    studio.unmount();
  }, 600000);
});

describe('WTA-U1-002: the RTA productivity index under SI', () => {
  test('J is converted with the SI unit it is printed with (oil)', async () => {
    const studio = await sample((c) => {
      c.setRtaRows(wtGoldens.fixtures.rtaOilDecline.rows.map((r) => ({ t: String(r.t), q: String(r.q), pwf: String(r.pwf) })));
    });
    const J = studio.ctx.rtaResult.fmb.J; // STB/D/psi
    expect(J).toBeGreaterThan(0);
    await studio.act((c) => c.setUnitSystem('si'));
    const pdf = readPdf(build(studio.ctx).doc);
    const t = flat(pdf.text);
    const m = t.match(/Productivity index J \(m3\/d per kPa\) ([\d.e+-]+)/);
    expect(m).not.toBeNull();
    // 1 STB/D/psi = 0.158987294928 / 6.894757293168 m3/d/kPa
    expect(Number(m[1]) / (J * 0.0230591576)).toBeCloseTo(1, 2);
    pdf.close?.();
    studio.unmount();
  }, 600000);
});
