/**
 * PVT intake through the pvt-1 contract (MBAL-U1, RL11): the table of a
 * saved Fluid Systems Studio project becomes the PVT table of the case, and
 * the report states where it came from and by which methods.
 */
import {
  blockOf, checkPvtBlock, tableFromPvtBlock, describePvtOrigin, pvtOriginRows, originMethodsText,
  listFluidProjects, readFluidProjectBlock, PVT_ORIGIN_KIND,
} from '../pvtIntake';
import { describePvtSource, PVT_TABLE_ORIGIN_KEY } from '../pvtSource';
import { sampleFluidBlock, seedSampleStore, SAMPLE_FLUID_PROJECT_ID, SAMPLE_FLUID_LEGACY_ID } from '../../harness/sampleCases';

const block = sampleFluidBlock();

describe('finding the block', () => {
  test('in the block itself, a saved payload and a handoff', () => {
    expect(blockOf(block)).toBe(block);
    expect(blockOf({ name: 'x', pvt: block })).toBe(block);
    expect(blockOf({ contract: block })).toBe(block);
    expect(blockOf({ name: 'x', inputs: {} })).toBeNull();
    expect(blockOf({ pvt: { schema: 'pvt-9' } })).toBeNull();
    expect(blockOf(null)).toBeNull();
  });
});

describe('the table of the case', () => {
  const made = tableFromPvtBlock(block, { fluidSystem: 'oil', temperatureF: 175 });

  test('every pressure of the block, ascending, in the units of the lab table', () => {
    expect(made.ok).toBe(true);
    expect(made.rows).toHaveLength(block.table.length);
    expect(made.rows.map((r) => r.pressure_psia)).toEqual(block.table.map((r) => r.pressure).sort((a, b) => a - b));
    expect(made.warnings).toEqual([]);
  });

  test('the rows are ascending whatever the order of the block, and the block is the writer\'s own', () => {
    expect(block.table[0].pressure).toBeGreaterThan(block.table[1].pressure); // Fluid Systems writes it descending
    expect(made.rows[0].pressure_psia).toBe(15);
    expect(made.rows[made.rows.length - 1].pressure_psia).toBe(3500);
    expect(made.rows[0].bw_rb_stb).toBe(block.table[block.table.length - 1].Bw);
  });

  test('Bg goes from RB/scf to RB/Mscf: a known value', () => {
    const src = block.table.find((r) => r.pressure === 1500);
    const row = made.rows.find((r) => r.pressure_psia === 1500);
    expect(src.Bg).toBeGreaterThan(0.001); // RB/scf at 1,500 psia and 175 degF is near 0.0018
    expect(src.Bg).toBeLessThan(0.003);
    expect(row.bg_rb_mscf).toBeCloseTo(src.Bg * 1000, 9);
    expect(row.bo_rb_stb).toBe(src.Bo);
    expect(row.rs_scf_stb).toBe(src.Rs);
    expect(row.z_factor).toBe(src.Z);
    expect(row.oil_viscosity_cp).toBe(src.mu_o);
  });

  test('a block stated in metric units is converted by the registry, against known values', () => {
    const si = {
      ...block,
      units: { ...block.units, pressure: 'kPa', Rs: 'sm3/sm3', Bg: 'rm3/sm3' },
      table: [
        { pressure: 6894.757293168361, Rs: 178.10760667903525, Bo: 1.3, Bg: 0.005614583333333334, Z: 0.9 },
        { pressure: 13789.514586336722, Rs: 178.10760667903525, Bo: 1.28, Bg: 0.002807291666666667, Z: 0.88 },
      ],
    };
    const m = tableFromPvtBlock(si, { fluidSystem: 'oil' });
    expect(m.ok).toBe(true);
    expect(m.rows[0].pressure_psia).toBeCloseTo(1000, 6);
    expect(m.rows[1].pressure_psia).toBeCloseTo(2000, 6);
    expect(m.rows[0].rs_scf_stb).toBeCloseTo(1000, 6);
    expect(m.rows[0].bg_rb_mscf).toBeCloseTo(1, 6); // 0.005614583 rm3/sm3 = 1 RB/Mscf
  });

  test('a gas case takes the gas columns only', () => {
    const g = tableFromPvtBlock(block, { fluidSystem: 'gas' });
    expect(g.rows[0]).toHaveProperty('z_factor');
    expect(g.rows[0]).toHaveProperty('bg_rb_mscf');
    expect(g.rows[0]).not.toHaveProperty('bo_rb_stb');
    expect(g.rows[0]).not.toHaveProperty('rs_scf_stb');
  });

  test('a study at another temperature is taken and said so', () => {
    const m = tableFromPvtBlock(block, { fluidSystem: 'oil', temperatureF: 210 });
    expect(m.ok).toBe(true);
    expect(m.warnings.join(' ')).toMatch(/computed at 175\.0 degF and the case is at 210\.0 degF/);
  });

  test('pressures of the case outside the table are counted and said: the engine leaves the table there', () => {
    const m = tableFromPvtBlock(block, { fluidSystem: 'oil', temperatureF: 175, casePressures: [3685, 3680, 3400, 2400, NaN] });
    expect(m.ok).toBe(true);
    expect(m.warnings.join(' ')).toMatch(/runs from 15 to 3,500 psia and the case holds 2 above it \(up to 3,685 psia\)/);
    expect(m.warnings.join(' ')).toMatch(/Outside the table the engine uses the correlations chosen on this tab/);
    expect(m.origin.case_pressures_outside).toBe(2);
    expect(m.origin.pressure_range_psia).toEqual([15, 3500]);
    expect(describePvtOrigin(m.origin)).toMatch(/2 pressure\(s\) of the case lay outside the table when it was taken/);
    expect(tableFromPvtBlock(block, { casePressures: [3000, 2000] }).origin.case_pressures_outside).toBe(0);
  });

  test('refusals: the gate of the contract, no table, a unit nobody knows', () => {
    expect(tableFromPvtBlock({ ...block, table: [] }).error).toMatch(/table is empty/);
    expect(tableFromPvtBlock({ ...block, units: undefined }).error).toMatch(/units is missing/);
    expect(tableFromPvtBlock({ ...block, units: { ...block.units, Bg: 'gallons per furlong' } }).error).toMatch(/Bg in "gallons per furlong"/);
    expect(tableFromPvtBlock({ schema: 'other' }).error).toMatch(/no PVT block/);
    // a property with no method named is refused: the report could not say how it was computed
    const { z: _z, ...noZ } = block.methods;
    expect(tableFromPvtBlock({ ...block, methods: noZ }).error).toMatch(/z \(Gas deviation factor Z\) names no method/);
    expect(checkPvtBlock({ ...block, project_name: null }).warnings).toHaveLength(1);
  });
});

describe('what the report says about it', () => {
  const { origin } = tableFromPvtBlock(block, { fluidSystem: 'oil', temperatureF: 175 });

  test('the origin keeps what the block says about itself and computes nothing', () => {
    expect(origin).toMatchObject({
      kind: PVT_ORIGIN_KIND, schema: 'pvt-1', source_app: 'Fluid Systems Studio', project_id: SAMPLE_FLUID_PROJECT_ID,
      project_name: 'Virginia Hills oil PVT', model: 'black-oil-correlations', pb_source: 'entered', tuning: 'none', edited: false,
    });
    expect(origin.methods.bo).toEqual({ method: 'Standing', kind: 'correlation', reference: 'Standing (1947)' });
    expect(origin.range_flags).toHaveLength(2);
    expect(origin.rows).toBe(block.table.length);
  });

  test('the methods are grouped by name', () => {
    expect(originMethodsText(origin)).toBe('Entered by the user (Pb); Standing, scaled to the entered bubble point (Rs); Standing (Bo); Beggs-Robinson (oil viscosity); Papay, with Sutton pseudo-critical properties (Z); Real gas law, Bg = 0.00504 Z T / p (Bg); Lee-Gonzalez-Eakin (gas viscosity); McCain (Bw)');
    expect(originMethodsText(origin, { isGas: true })).not.toMatch(/Standing/);
  });

  test('one sentence for the inputs table, through the source wording of the app', () => {
    const text = describePvtOrigin(origin);
    expect(text).toMatch(/^Table from Fluid Systems Studio, project "Virginia Hills oil PVT" \(2026-10-01 14:30 UTC\)\./);
    expect(text).toMatch(/black-oil correlations: Entered by the user \(Pb\); Standing, scaled to the entered bubble point \(Rs\); Standing \(Bo\)/);
    expect(text).toMatch(/surface separation \(flash\) basis/);
    expect(text).toMatch(/2 range flag\(s\) raised by the fluid study/);
    expect(text).not.toMatch(/\.\./);
    const cfg = { pvt_source: 'lab_table', pvt_lab_table: [{}, {}], pvt_correlations: { [PVT_TABLE_ORIGIN_KEY]: origin } };
    expect(describePvtSource(cfg)).toBe(text.replace(/\.$/, ''));
    expect(describePvtOrigin({ ...origin, edited: true })).toMatch(/rows were edited in this app after the table was taken/);
    expect(describePvtOrigin({ kind: 'correlation_prefill' })).toBeNull();
  });

  test('the provenance rows name a method for every property, or say the source did not', () => {
    const rows = Object.fromEntries(pvtOriginRows(origin));
    expect(rows['PVT contract']).toBe('pvt-1');
    expect(rows['Method, Bo']).toBe('Standing (Standing (1947))');
    expect(rows['Bubble point']).toBe('bubble point entered by the user');
    expect(rows['Lab tuning']).toBe('none');
    expect(rows['Pressure range of the table']).toBe('15 to 3,500 psia, 41 rows');
    expect(rows['Range flags of the fluid study']).toMatch(/Standing: 2 table rows/);
    const bare = Object.fromEntries(pvtOriginRows({ ...origin, methods: {} }));
    expect(bare['Method, Z']).toBe('not stated by the source');
    expect(pvtOriginRows(null)).toEqual([]);
  });
});

describe('reading a saved project', () => {
  const db = seedSampleStore();
  const client = {
    from: (table) => ({ select: () => ({ order: () => Promise.resolve({ data: db[table] ?? [], error: null }) }) }),
  };
  // the shared reader's answers (src/lib/pvtSource.js readFluidProjectPvt), over the same rows
  const read = async (id) => {
    const row = db.saved_fluid_studio_projects.find((r) => r.id === id);
    if (!row) return { ok: false, contract: null, projectName: null, reason: 'The Fluid Systems Studio project was not found, or it is not yours to read.' };
    if (!blockOf(row.inputs_data)) return { ok: false, contract: null, projectName: row.project_name, reason: 'This Fluid Systems Studio project was saved before it carried its PVT block. Open it in Fluid Systems Studio and save it once.' };
    return { ok: true, contract: blockOf(row.inputs_data), projectName: row.project_name, reason: null };
  };

  test('the list', async () => {
    const { data, error } = await listFluidProjects(client);
    expect(error).toBeNull();
    expect(data.map((p) => p.id)).toEqual([SAMPLE_FLUID_PROJECT_ID, SAMPLE_FLUID_LEGACY_ID]);
    const broken = { from: () => ({ select: () => ({ order: () => Promise.reject(new Error('offline')) }) }) };
    expect((await listFluidProjects(broken)).error.message).toBe('offline');
  });

  test('a project with its block', async () => {
    const got = await readFluidProjectBlock(read, SAMPLE_FLUID_PROJECT_ID);
    expect(got.ok).toBe(true);
    expect(got.block.schema).toBe('pvt-1');
    expect(got.projectName).toBe('Virginia Hills oil PVT');
  });

  test('a project saved before the block existed, one that is not there, and no id: each says why', async () => {
    const legacy = await readFluidProjectBlock(read, SAMPLE_FLUID_LEGACY_ID);
    expect(legacy.ok).toBe(false);
    expect(legacy.reason).toMatch(/Open it in Fluid Systems Studio and save it once/);
    expect(legacy.projectName).toBe('Older fluid project');
    expect((await readFluidProjectBlock(read, 'nope')).reason).toMatch(/not found, or it is not yours to read/);
    expect((await readFluidProjectBlock(read, '')).reason).toMatch(/Choose a Fluid Systems Studio project/);
  });
});
