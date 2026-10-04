/**
 * Well Test Analysis Studio, Reservoir round Step 2 (WTA-U2, 2026-10-04).
 * Items and outcomes: docs/upgrade/WellTestAnalysis-UPGRADE.md, "Step 2
 * build log". The real provider is mounted and the PDF built by the
 * function the Export button calls, then read back with poppler.
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
import { sampleFluidStudioData } from '@/utils/fluidStudioCalculations';
import { runFluidWorkspace } from '@/utils/fluidstudio/workspace';
import { pvtIntakeCardModel } from '@/lib/inputProvenance/pvtIntakeCard';
import { wellTestPvtCardFields } from '@/utils/welltest/reportModel';
import { mountStudio, chartLogo, readPdf } from './reportTestKit';

const AT = new Date('2026-10-04T09:00:00Z');
const logo = chartLogo();
const build = (ctx, opts = {}) => buildWellTestPdf(collectReportArgs(ctx), { logo, generatedAt: AT, ...opts });
const flat = (s) => s.replace(/\s+/g, ' ');

async function sample(setup = null) {
  const studio = mountStudio();
  await studio.act((c) => c.loadSampleTest());
  if (setup) await studio.act(setup);
  return studio;
}
const gasSample = async () => sample((c) => {
  c.setReservoirField('fluid', 'gas');
  c.setReservoirField('ct', '');
  c.setReservoirField('q', '5000');
});

// a real Fluid Systems Studio project: the app's own workspace builds the pvt-1 handoff
const fluidHandoff = ({ temp } = {}) => {
  const base = sampleFluidStudioData();
  if (temp) base.streamA.blackOil.temp = temp;
  const inputs = { ...base, tableRange: { pMax: 7000, from: 'consumer', requestedBy: 'Well Test Analysis Studio' } };
  return runFluidWorkspace(inputs, { projectId: 'fluid-1', projectName: 'Gas sample', generatedAt: AT, build: 'test' }).handoff;
};

// independent of the studio: linear interpolation and the trapezoid m(p) on the block's own rows
const blockRows = (h) => h.contract.table.map((r) => ({ p: r.pressure, z: r.Z, mu: r.mu_g })).sort((a, b) => a.p - b.p);
const lerp = (rows, key, p) => {
  for (let i = 1; i < rows.length; i += 1) {
    if (p <= rows[i].p) return rows[i - 1][key] + ((rows[i][key] - rows[i - 1][key]) * (p - rows[i - 1].p)) / (rows[i].p - rows[i - 1].p);
  }
  return NaN;
};
const mOf = (rows, p) => {
  const all = [{ ...rows[0], p: 0 }, ...rows];
  let m = 0;
  for (let i = 1; i < all.length; i += 1) {
    const a = all[i - 1]; const b = all[i];
    const fa = (2 * a.p) / (a.mu * a.z); const fb = (2 * b.p) / (b.mu * b.z);
    if (p <= b.p) { const fp = fa + ((fb - fa) * (p - a.p)) / (b.p - a.p); return m + ((fa + fp) / 2) * (p - a.p); }
    m += ((fa + fb) / 2) * (b.p - a.p);
  }
  return NaN;
};

describe('WTA-U2-001: a gas test takes the Fluid Systems Studio pvt-1 table', () => {
  test('z, viscosity and m(p) come from the table rows, by interpolation; the report names the table and its project', async () => {
    const h = fluidHandoff();
    const rows = blockRows(h);
    const studio = await gasSample();
    const before = studio.ctx.reservoirSpec.reservoir; // the correlation path
    await studio.act((c) => c.takeFluidPvt(h));
    expect(studio.ctx.reservoirInputs.gasPvtSource).toBe('fluid-table');
    const r = studio.ctx.reservoirSpec.reservoir;
    expect(r.pvtSource.kind).toBe('fluid-table');
    expect(r.mu).toBeCloseTo(lerp(rows, 'mu', 4800), 12);
    expect(r.pvt.zOf(4800)).toBeCloseTo(lerp(rows, 'z', 4800), 12);
    // m(p) at the table's own nodes is the trapezoid sum of 2p/(mu z) (the engine interpolates m between them)
    for (const node of rows.filter((x) => x.p > 1000).slice(0, 5)) expect(r.mOfP(node.p) / mOf(rows, node.p)).toBeCloseTo(1, 10);
    // negative control: the correlation path the project ran on before differs
    expect(Math.abs(before.mu - r.mu) / r.mu).toBeGreaterThan(1e-3);
    const t = flat(readPdf(build(studio.ctx).doc).text);
    expect(t).toMatch(/Fluid Systems Studio table: z by Dranchuk-Abou-Kassem/);
    expect(t).toMatch(/project "Gas sample"/);
    expect(t).toMatch(/Gas PVT table range/);
    expect(t).toMatch(/inside the table/);
    studio.unmount();
  }, 600000);

  test('a project without an intake stays on the correlations; switching back is one choice', async () => {
    const studio = await gasSample();
    expect(studio.ctx.reservoirInputs.gasPvtSource).toBe('correlation');
    expect(studio.ctx.reservoirSpec.reservoir.pvtSource.kind).toBe('correlation');
    await studio.act((c) => c.takeFluidPvt(fluidHandoff()));
    const table = studio.ctx.reservoirSpec.reservoir.mu;
    await studio.act((c) => c.setReservoirField('gasPvtSource', 'correlation'));
    expect(studio.ctx.reservoirSpec.reservoir.pvtSource.kind).toBe('correlation');
    expect(studio.ctx.reservoirSpec.reservoir.mu).not.toBe(table);
    // a payload of the earlier release (no gasPvtSource) opens on the correlations
    const saved = studio.ctx.serializeInputs();
    const old = { ...saved, reservoirInputs: { ...saved.reservoirInputs } };
    delete old.reservoirInputs.gasPvtSource;
    await studio.act((c) => c.importProjectPayload(old));
    expect(studio.ctx.reservoirSpec.reservoir.pvtSource.kind).toBe('correlation');
    studio.unmount();
  }, 600000);

  test('a table that stops below the initial pressure is refused, with the range request', async () => {
    const studio = await gasSample();
    await studio.act((c) => c.takeFluidPvt(fluidHandoff()));
    const top = studio.ctx.pvtIntake.gasTable.pMax;
    await studio.act((c) => c.setReservoirField('pi', String(top + 500)));
    expect(studio.ctx.reservoirSpec.reservoir).toBeNull();
    expect(studio.ctx.reservoirSpec.error).toMatch(/stops at/);
    expect(studio.ctx.reservoirSpec.tableTooShort.need).toBe(top + 500);
    studio.unmount();
  }, 600000);

  test('the shared card shows the table with its methods and says "source changed since"', async () => {
    const studio = await gasSample();
    await studio.act((c) => c.takeFluidPvt(fluidHandoff()));
    const intake = studio.ctx.pvtIntake;
    const fields = wellTestPvtCardFields(intake);
    const current = { ...studio.ctx.reservoirInputs, gasTableRows: String(intake.gasTable.n) };
    const same = pvtIntakeCardModel({ intake, current, fields, latest: { ok: true, contract: fluidHandoff().contract } });
    expect(same.status).toBe('As received');
    expect(same.rows.find((x) => x.key === 'gasTableRows').method).toMatch(/Z: Dranchuk-Abou-Kassem.*; viscosity: Lee-Gonzalez-Eakin/);
    const changed = fluidHandoff({ temp: 230 });
    const later = pvtIntakeCardModel({ intake, current, fields, latest: { ok: true, contract: { ...changed.contract, generated_at: '2026-10-05T10:00:00Z' } } });
    expect(later.status).toBe('Source changed since');
    // "Read it again" takes the new block
    await studio.act((c) => c.takeFluidPvt(changed, 'read again'));
    expect(studio.ctx.pvtIntake.gasTable.temperatureF).toBe(230);
    studio.unmount();
  }, 600000);
});
