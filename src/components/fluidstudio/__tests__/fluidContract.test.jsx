/**
 * Fluid Systems Studio as the writer of the pvt-1 contract (FLUID-U1,
 * RL11; plan Step 0c), the Well Test intake that reads it (from router
 * state and from the saved project by id), the two CSV exports that carry
 * it, the P-T profile door (RL10, PL2) and the display units (PL3).
 *
 * The gate of the contract: every property in the handoff names its
 * method. The negative control drops one name and the gate fails.
 */
import fs from 'fs';
import path from 'path';

jest.mock('@/lib/customSupabaseClient', () => {
  const rows = [];
  return {
    __rows: rows,
    supabase: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn((col, id) => ({ maybeSingle: jest.fn().mockResolvedValue({ data: rows.find((r) => r[col] === id) ?? null, error: null }) })),
        })),
      })),
    },
  };
});

import {
  PVT1_PROPERTIES, PVT1_UNITS, validatePvtContract, pvtContractOf, pvtContractCsvHeader, pvtContractSourceText,
  validatePvtHandoff, pvtIntake, intakeSourceText,
} from '@/lib/inputProvenance';
import { readFluidProjectPvt, handoffFromContract } from '@/lib/pvtSource';
import { pvtIntakeFromBackbone, buildInputsTable, DEFAULT_COMPLETION } from '@/utils/welltest/reportModel';
import { buildReservoirInputs, DEFAULT_RESERVOIR } from '@/contexts/WellTestStudioContext';
import { pvtTableCsv, PVT_CSV_COLUMNS } from '@/utils/fluidstudio/csvExport';
import { eosPvtTableCsv } from '@/utils/fluidstudio/eosAnalysis';
import { readPtProfile, ATMOSPHERE_PSI } from '@/utils/fluidstudio/ptProfileImport';
import { analyzeFluidSystem, parsePtProfile } from '@/utils/fluidStudioCalculations';
import { fluidUnits, toDisplay, fromDisplay, inputText, inputValue, FLUID_KINDS } from '@/utils/fluidstudio/units';
import { screenWarnings } from '@/utils/fluidstudio/screenWarnings';
import { inputsFromPayload } from '@/components/fluidstudio/useFluidStudioProjects';
import { LEGACY_PRE_SHELL } from '@/components/fluidstudio/__fixtures__/savedProjects';
import { __rows as savedRows } from '@/lib/customSupabaseClient';
import {
  sampleWorkspace, identifiedBlackOil, eosWithLab, tune, run, AT, BUILD,
} from './fluidTestKit';

jest.setTimeout(120000);

const wtTable = (reservoirInputs, intake) => Object.fromEntries(buildInputsTable({
  reservoirInputs, reservoirSpec: buildReservoirInputs(reservoirInputs), completion: DEFAULT_COMPLETION, pvtIntake: intake,
}).map((r) => [r.key, r]));

describe('pvt-1: the block Fluid Systems Studio writes', () => {
  test('black oil: schema, origin, units, conditions, basis, bubble point source, tuning, flags and the table', () => {
    const ws = run(identifiedBlackOil());
    const c = ws.contract;
    expect(validatePvtContract(c)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(c).toMatchObject({
      schema: 'pvt-1', source_app: 'Fluid Systems Studio', project_id: 'fluid-project-1', project_name: 'Ekene E-2000 PVT',
      generated_at: AT.toISOString(), app_build: BUILD, model: 'black-oil-correlations', pb_source: 'solved',
      standard_conditions: { pressure_psia: 14.7, temperature_degF: 60 },
      separator_conditions: [{ pressure_psia: 450, temperature_degF: 120 }, { pressure_psia: 200, temperature_degF: 100 }],
      tuning: { status: 'none' },
    });
    expect(c.basis.text).toMatch(/surface separation \(flash\) basis/);
    // every column of the table has a unit, and Bg says RB/scf
    expect(c.columns).toEqual(['pressure', 'Rs', 'Bo', 'Bg', 'Z', 'mu_o', 'mu_g', 'co', 'Bw', 'mu_w']);
    for (const col of c.columns) expect(c.units[col]).toBeTruthy();
    expect(c.units.Bg).toBe('RB/scf');
    expect(c.units).toEqual(PVT1_UNITS);
    // the table is the engine's table, untouched
    expect(c.table).toBe(ws.results.pvt.table);
    expect(c.at_saturation).toMatchObject({ pressure: 2998, Rs: 650, Bo: 1.3718, mu_o: 0.5613 });
    expect(c.inputs).toEqual({ oil_gravity: 32, gas_gravity: 0.75, rsb: 650, temperature: 200, salinity: 35000 });
    expect(c.identification.field).toBe('Ekene');
    // range flags are the engine's own
    expect(c.range_flags.map((f) => f.text)).toEqual(ws.results.meta.rangeFlags.map((f) => f.text));
  });

  test('THE GATE: every property names its method, read from the engine call', () => {
    for (const ws of [run(identifiedBlackOil()), run(eosWithLab())]) {
      const c = ws.contract;
      expect(Object.keys(c.methods)).toEqual(Object.keys(PVT1_PROPERTIES));
      for (const key of Object.keys(PVT1_PROPERTIES)) expect(c.methods[key].method.trim().length).toBeGreaterThan(3);
      expect(validatePvtContract(c).ok).toBe(true);
    }
    // the names are the engine's: change the correlation and the block follows
    const glaso = identifiedBlackOil();
    glaso.correlations = { pb_rs_bo: 'glaso', viscosity: 'beal_cook_spillman' };
    const g = run(glaso).contract;
    expect(g.methods.rs.method).toBe('Glaso');
    expect(g.methods.bo.method).toBe('Glaso');
    expect(g.methods.pb.method).toBe('Glaso Rs(p) solved for the solution GOR');
    expect(g.methods.mu_o.method).toBe('Beal-Cook-Spillman');
    expect(g.methods.mu_od.method).toBe('Beal-Cook-Spillman');
    expect(g.methods.z.method).toBe('Papay, with Sutton pseudo-critical properties');
    expect(g.methods.bw.method).toBe('McCain');
  });

  test('NEGATIVE CONTROL: drop one name and the gate fails, naming the property', () => {
    const c = run(identifiedBlackOil()).contract;
    for (const key of Object.keys(PVT1_PROPERTIES)) {
      const { [key]: _dropped, ...rest } = c.methods;
      const out = validatePvtContract({ ...c, methods: rest });
      expect(out.ok).toBe(false);
      expect(out.errors).toEqual([`${key} (${PVT1_PROPERTIES[key].label}) names no method.`]);
    }
    expect(validatePvtContract({ ...c, methods: { ...c.methods, bg: { method: '  ' } } }).errors[0]).toMatch(/^bg /);
    // and the other duties of the block
    expect(validatePvtContract({ ...c, units: { ...c.units, Bg: '' } }).errors).toEqual(['column Bg has no unit.']);
    expect(validatePvtContract({ ...c, pb_source: 'guess' }).ok).toBe(false);
    expect(validatePvtContract({ ...c, basis: null }).errors).toEqual(['basis is missing.']);
    expect(validatePvtContract({ ...c, table: [] }).errors).toEqual(['table is empty.']);
    expect(validatePvtContract({ ...c, generated_at: undefined }).ok).toBe(false);
    expect(validatePvtContract({ ...c, project_id: null })).toMatchObject({ ok: true, warnings: ['project_id is missing: the receiver cannot re-open the source project.'] });
  });

  test('an entered bubble point and the Standing fallback are said in the block', () => {
    const typed = identifiedBlackOil();
    typed.streamA.blackOil.pb = 2400;
    const c = run(typed).contract;
    expect(c.pb_source).toBe('entered');
    expect(c.methods.pb.method).toBe('Entered by the user');
    expect(c.methods.rs.method).toBe('Standing, scaled to the entered bubble point');
    expect(c.model_detail.rs_scale).toBeGreaterThan(1);
    const heavy = identifiedBlackOil();
    heavy.streamA.blackOil = { ...heavy.streamA.blackOil, api: 12, gor: 6000, gasSg: 0.6, temp: 300 };
    heavy.correlations = { pb_rs_bo: 'vasquez_beggs', viscosity: 'beggs_robinson' };
    expect(run(heavy).contract.pb_source).toBe('standing-explicit');
  });

  test('compositional: the equation of state, the C7+ scheme, the viscosity model and the tuning', async () => {
    const untuned = run(eosWithLab()).contract;
    expect(untuned.model).toBe('eos');
    expect(untuned.pb_source).toBe('eos');
    expect(untuned.model_detail).toMatchObject({
      eos: 'Peng-Robinson (1978) with Peneloux volume translation',
      viscosity: 'Lohrenz-Bray-Clark (untuned)',
      plus_fraction: { molecular_weight: 190, specific_gravity: 0.84 },
    });
    expect(untuned.model_detail.c7plus).toMatch(/^Single pseudo-component: Soreide boiling point, Kesler-Lee Tc and Pc, Lee-Kesler acentric factor/);
    expect(untuned.model_detail.components.map((x) => x.component)).toEqual(['CO2', 'C1', 'C2', 'C3', 'nC4', 'nC6', 'C7+']);
    expect(untuned.basis.kind).toBe('differential-adjusted-to-separator');
    expect(untuned.standard_conditions).toEqual({ pressure_psia: 14.696, temperature_degF: 60 });
    expect(untuned.tuning).toEqual({ status: 'none' });
    expect(untuned.methods.co.kind).toBe('not-computed');
    expect(untuned.methods.rs.method).not.toMatch(/tuned/);

    const tuned = run(await tune(eosWithLab())).contract;
    expect(tuned.tuning.status).toBe('tuned');
    expect(tuned.tuning.matched.map((m) => [m.target, m.error_unit])).toEqual([['psat', 'percent'], ['totalGor', 'percent'], ['bo', 'percent']]);
    expect(Math.abs(tuned.tuning.matched[0].error_after)).toBeLessThan(0.5);
    expect(tuned.tuning.parameters).toEqual(expect.objectContaining({ fTc: expect.any(Number), fPc: expect.any(Number), kC1: expect.any(Number), sPlus: expect.any(Number) }));
    expect(tuned.methods.rs.method).toMatch(/C7\+ tuned to lab data/);
    expect(validatePvtContract(tuned).ok).toBe(true);
  });

  test('the version-1 backbone keys are where they were, so older consumers still read it', () => {
    const ws = run(identifiedBlackOil());
    const { contract, ...v1 } = ws.handoff;
    expect(v1).toEqual(ws.results.backbone);
    expect(validatePvtHandoff(ws.handoff)).toEqual({ ok: true, errors: [], warnings: [] });
    expect(pvtContractOf(ws.handoff)).toBe(contract);
    // the Pipeline Sizer keys
    for (const k of ['oil_gravity', 'gas_gravity', 'gor', 'inlet_temperature', 'wat']) expect(k in ws.handoff).toBe(true);
  });
});

describe('Well Test Analysis Studio reads the fuller contract', () => {
  test('each property is printed with the method that produced it, the project and the time', () => {
    const ws = run(identifiedBlackOil());
    const got = pvtIntakeFromBackbone(ws.handoff);
    expect(got.patch).toEqual({ B: '1.3718', mu: '0.5613', apiGravity: '32', gor: '650', solutionGasGravity: '0.75', reservoirTempF: '200' });
    const rows = wtTable({ ...DEFAULT_RESERVOIR, ...got.patch }, got.intake);
    const origin = ', from Fluid Systems Studio project "Ekene E-2000 PVT" (2026-10-02 09:00 UTC)';
    expect(rows.B.source).toBe(`Correlation: Standing, at the bubble point${origin}`);
    expect(rows.mu.source).toBe(`Correlation: Beggs-Robinson, at the bubble point${origin}`);
    expect(rows.apiGravity.source).toBe(`Input of the Fluid Systems Studio fluid model${origin}`);
    // what the receiver stores with its own project
    expect(got.intake.from).toEqual({ app: 'Fluid Systems Studio', recordId: 'fluid-project-1', recordName: 'Ekene E-2000 PVT', at: AT.toISOString(), build: BUILD, schema: 'pvt-1' });
    expect(got.intake.contract.schema).toBe('pvt-1');
    expect(got.intake.contract.table).toBeUndefined();
    expect(got.intake.contract.table_rows).toBe(41);
    expect(got.intake.contract.methods.bo.method).toBe('Standing');
  });

  test('the two properties name DIFFERENT methods: the old handoff printed one sentence for both', () => {
    const glaso = identifiedBlackOil();
    glaso.correlations = { pb_rs_bo: 'glaso', viscosity: 'beal_cook_spillman' };
    const got = pvtIntakeFromBackbone(run(glaso).handoff);
    expect(intakeSourceText(got.intake, 'B')).toMatch(/^Correlation: Glaso, at the bubble point/);
    expect(intakeSourceText(got.intake, 'mu')).toMatch(/^Correlation: Beal-Cook-Spillman, at the bubble point/);
    // negative control: the same backbone without the block gives the version-1 sentence for both
    const { contract: _c, ...bare } = run(glaso).handoff;
    const old = pvtIntakeFromBackbone(bare);
    expect(intakeSourceText(old.intake, 'B')).toBe(intakeSourceText(old.intake, 'mu'));
  });

  test('a tuned equation of state and an out-of-range input travel into the receiver\'s source column', async () => {
    const tuned = pvtIntakeFromBackbone(run(await tune(eosWithLab())).handoff);
    expect(intakeSourceText(tuned.intake, 'B')).toMatch(/Peng-Robinson \(1978\).*C7\+ tuned to lab data.*, at the bubble point, from Fluid Systems Studio project/);
    const far = identifiedBlackOil();
    far.streamA.blackOil.gor = 1600;
    const c = run(far).contract;
    expect(pvtContractSourceText(c, 'bo')).toMatch(/outside the published range: rs 1600 scf\/STB/);
    expect(pvtContractSourceText(c, 'mu_w')).not.toMatch(/outside the published range/);
  });

  test('a value edited in Well Test after the handoff is marked as edited (RL11)', () => {
    const got = pvtIntakeFromBackbone(run(identifiedBlackOil()).handoff);
    const edited = wtTable({ ...DEFAULT_RESERVOIR, ...got.patch, B: '1.45' }, got.intake);
    expect(edited.B.source).toMatch(/^Edited in this app after the handoff \(received 1\.3718\)\. The handoff said: Correlation: Standing/);
    expect(edited.mu.source).toMatch(/^Correlation: Beggs-Robinson/);
    // typing the same number in another form is not an edit
    expect(wtTable({ ...DEFAULT_RESERVOIR, ...got.patch, B: '1.37180' }, got.intake).B.source).toMatch(/^Correlation: Standing/);
  });

  test('delivery survives a refresh: the block is read from the saved project by id', async () => {
    const ws = run(identifiedBlackOil());
    // the row as the project hook saves it (payload under inputs_data)
    savedRows.length = 0;
    savedRows.push({ id: 'fluid-project-1', project_name: 'Ekene E-2000 PVT', updated_at: '2026-10-02T09:01:00Z', inputs_data: JSON.parse(JSON.stringify({ id: 'fluid-project-1', name: 'Ekene E-2000 PVT', schema: 2, inputs: ws.inputs, pvt: ws.contract })) });
    const read = await readFluidProjectPvt('fluid-project-1');
    expect(read).toMatchObject({ ok: true, projectName: 'Ekene E-2000 PVT', reason: null });
    expect(read.contract).toEqual(JSON.parse(JSON.stringify(ws.contract)));
    // the same intake as the live handoff gave
    const fromState = pvtIntakeFromBackbone(ws.handoff);
    const fromSaved = pvtIntakeFromBackbone(handoffFromContract(read.contract));
    expect(fromSaved.patch).toEqual(fromState.patch);
    expect(fromSaved.intake.fieldText).toEqual(fromState.intake.fieldText);
    expect(fromSaved.intake.from).toEqual(fromState.intake.from);
  });

  test('a project with no block, a missing project and a broken block are refused with the reason', async () => {
    savedRows.length = 0;
    savedRows.push({ id: 'old', project_name: 'Old', inputs_data: { name: 'Old', schema: 1, inputs: sampleWorkspace() } });
    savedRows.push({ id: 'legacy', project_name: 'Legacy', inputs_data: LEGACY_PRE_SHELL });
    const c = run(identifiedBlackOil()).contract;
    const { rs: _rs, ...methods } = c.methods;
    savedRows.push({ id: 'broken', project_name: 'Broken', inputs_data: { pvt: JSON.parse(JSON.stringify({ ...c, methods })) } });
    expect((await readFluidProjectPvt('old')).reason).toMatch(/saved before it carried its PVT block\. Open it in Fluid Systems Studio and save it once\./);
    expect((await readFluidProjectPvt('legacy')).ok).toBe(false);
    expect((await readFluidProjectPvt('nope')).reason).toMatch(/was not found/);
    expect((await readFluidProjectPvt('')).reason).toMatch(/No Fluid Systems Studio project was named/);
    expect((await readFluidProjectPvt('broken')).reason).toMatch(/incomplete: rs \(Solution GOR Rs\) names no method\./);
  });

  test('a consumer that maps other properties gets the method of each', () => {
    const c = run(identifiedBlackOil()).handoff;
    const out = pvtIntake(c, [{ property: 'pb', key: 'pb', label: 'bubble point' }, { property: 'rsb', key: 'rs', label: 'GOR' }]);
    expect(out.sources.pb).toMatch(/^Correlation: Standing Rs\(p\) solved for the solution GOR, solved from the solution GOR, at the bubble point, from Fluid Systems Studio project/);
    expect(out.sources.rs).toMatch(/^Input of the Fluid Systems Studio fluid model, from Fluid Systems Studio project/);
  });
});

describe('both CSV exports carry the same provenance header', () => {
  test('the PVT CSV and the Material Balance schema CSV open with the same lines', async () => {
    const ws = run(await tune(eosWithLab()));
    const pvt = pvtTableCsv({ rows: ws.report.model.pvtRows, contract: ws.contract, system: 'oilfield' }).split('\n');
    const mb = eosPvtTableCsv(ws.eos.pvtTable.table, { contract: ws.contract }).split('\n');
    const shared = pvtContractCsvHeader(ws.contract);
    expect(shared.length).toBeGreaterThan(20);
    expect(pvt.slice(0, shared.length)).toEqual(shared);
    expect(mb.slice(0, shared.length)).toEqual(shared);
    const head = shared.join('\n');
    expect(head).toMatch(/^# PVT contract: pvt-1/);
    expect(head).toMatch(/# Source: Fluid Systems Studio, project "Ekene E-2000 PVT"/);
    expect(head).toMatch(/# Generated: 2026-10-02 09:00 UTC/);
    expect(head).toMatch(/# Fluid model: Equation of state/);
    expect(head).toMatch(/# Lab tuning: C7\+ tuned to lab data/);
    expect(head).toMatch(/# Separator stages: 450 psia \/ 120 degF; 200 psia \/ 100 degF/);
    for (const def of Object.values(PVT1_PROPERTIES)) expect(head).toContain(`# Method, ${def.label}: `);
    // every header line is a comment; the first data line after it is the column head
    expect(pvt.filter((l) => l.startsWith('#')).length).toBe(shared.length + 2);
    expect(mb.filter((l) => l.startsWith('#')).length).toBe(shared.length + 1);
  });

  test('one Bg basis, stated: RB/Mscf in both files, with the unit in the column name', () => {
    const ws = run(identifiedBlackOil());
    const lines = pvtTableCsv({ rows: ws.results.pvt.table, contract: ws.contract, system: 'oilfield' }).split('\n');
    const headAt = lines.findIndex((l) => !l.startsWith('#'));
    expect(lines[headAt]).toBe('Pressure (psia),Rs (scf/STB),Bo (RB/STB),Bg (RB/Mscf),Z,Oil viscosity (cP),Gas viscosity (cP),co (1/psi),Bw (RB/STB),Water viscosity (cP),Region');
    const first = lines[headAt + 1].split(',');
    const row = ws.results.pvt.table[0];
    expect(Number(first[0])).toBe(row.pressure);
    expect(Number(first[3])).toBeCloseTo(row.Bg * 1000, 6);
    expect(lines.length - headAt - 1).toBe(ws.results.pvt.table.length);
    expect(lines.join('\n')).toMatch(/# Display units of this file: pressure psia; temperature degF; GOR scf\/STB; oil and water FVF RB\/STB; gas FVF RB\/Mscf/);
    expect(PVT_CSV_COLUMNS.map((c) => c[0])).toEqual(ws.contract.columns);
    // the Material Balance schema keeps its own column names, Bg in RB/Mscf
    const eos = run(eosWithLab());
    const mb = eosPvtTableCsv(eos.eos.pvtTable.table, { contract: eos.contract }).split('\n').filter((l) => !l.startsWith('#'));
    expect(mb[0]).toBe('pressure_psia,bo_rb_stb,rs_scf_stb,oil_viscosity_cp,z_factor,bg_rb_mscf,gas_viscosity_cp');
    // without the block the schema file is exactly what it was (the existing consumer contract)
    expect(eosPvtTableCsv(eos.eos.pvtTable.table).split('\n')).toEqual(mb);
  });

  test('SI: the PVT CSV converts and says so', () => {
    const ws = run(identifiedBlackOil());
    const lines = pvtTableCsv({ rows: ws.results.pvt.table, contract: ws.contract, system: 'si' }).split('\n');
    const headAt = lines.findIndex((l) => !l.startsWith('#'));
    expect(lines[headAt]).toBe('Pressure (kPa (abs)),Rs (m3/m3),Bo (m3/m3),Bg (m3/m3),Z,Oil viscosity (mPa.s),Gas viscosity (mPa.s),co (1/kPa),Bw (m3/m3),Water viscosity (mPa.s),Region');
    const first = lines[headAt + 1].split(',').map(Number);
    const row = ws.results.pvt.table[0];
    expect(first[0]).toBeCloseTo(row.pressure * 6.894757293168361, 0);
    expect(first[1]).toBeCloseTo(row.Rs * 0.028316846592 / 0.158987294928, 3);
    expect(first[7]).toBeCloseTo(row.co / 6.894757293168361, 9);
  });
});

describe('RL10 and PL2: the P-T profile door', () => {
  const DIR = path.join(process.cwd(), 'e2e', 'fixtures', 'fluid-systems', 'hostile');
  const file = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');

  test('the plain paste every saved project holds reads as before', () => {
    const r = readPtProfile('3000, 180\n2500, 165\n2000, 140');
    expect(r.points).toEqual([{ pressure: 3000, temp: 180 }, { pressure: 2500, temp: 165 }, { pressure: 2000, temp: 140 }]);
    expect(r.skipped).toEqual([]);
    expect(r.summary).toBe('3 points read. Pressure in psia (as chosen); temperature in degF (as chosen). Column 1 is pressure and column 2 is temperature (no header).');
    expect(parsePtProfile('3000, 180\n2500, 165')).toEqual([{ pressure: 3000, temp: 180 }, { pressure: 2500, temp: 165 }]);
  });

  test.each([
    ['tabs-header-bar-degC.txt', 6, { pressure: 'bar', temperature: 'degC', pressureFromHeader: true, temperatureFromHeader: true }],
    ['semicolon-comma-decimals.csv', 6, { pressure: 'psia', temperature: 'degF', pressureFromHeader: false, temperatureFromHeader: false }],
    ['swapped-columns-kpa.csv', 6, { pressure: 'kPa', temperature: 'degC', pressureFromHeader: true, temperatureFromHeader: true }],
    ['spaces-psig.txt', 6, { pressure: 'psig', temperature: 'degF', pressureFromHeader: true, temperatureFromHeader: true }],
  ])('%s: read, in the unit of its header, equal to its psia and degF twin', (name, count, units) => {
    const r = readPtProfile(file(name));
    expect(r.read).toBe(count);
    expect(r.units).toEqual(units);
    const twin = readPtProfile(file('twin-psia-degF.csv'));
    expect(twin.read).toBe(count);
    r.points.forEach((p, i) => {
      expect(p.pressure).toBeCloseTo(twin.points[i].pressure, 1);
      expect(p.temp).toBeCloseTo(twin.points[i].temp, 1);
    });
  });

  test('the unit chosen at the door is used when the header is silent, and the engine sees the same points', () => {
    const raw = file('no-header-bar-degC.txt');
    const asBar = readPtProfile(raw, { pressure: 'bar', temperature: 'degC' });
    const twin = readPtProfile(file('twin-psia-degF.csv'));
    asBar.points.forEach((p, i) => expect(p.pressure).toBeCloseTo(twin.points[i].pressure, 1));
    // negative control: read as psia and degF, as the app did before, the profile is 14.5 times too low in pressure
    const asPsia = readPtProfile(raw);
    expect(twin.points[0].pressure / asPsia.points[0].pressure).toBeCloseTo(14.5038, 3);
    // the engine uses the door's units
    const inputs = sampleWorkspace();
    inputs.ptProfile = { raw, units: { pressure: 'bar', temperature: 'degC' } };
    const fa = analyzeFluidSystem(inputs).flowAssurance;
    expect(fa.pt_profile.map((p) => Math.round(p.pressure))).toEqual(twin.points.map((p) => Math.round(p.pressure)));
    const wrong = analyzeFluidSystem({ ...inputs, ptProfile: { raw } }).flowAssurance;
    expect(fa.pt_profile[0].pressure / wrong.pt_profile[0].pressure).toBeCloseTo(14.5038, 3);
    expect(wrong.hydrate_risk.max_subcooling).not.toBe(fa.hydrate_risk.max_subcooling);
  });

  test('gauge pressures are brought to absolute with the atmosphere stated', () => {
    const r = readPtProfile('P (psig), T (F)\n1000, 80');
    expect(r.points[0].pressure).toBeCloseTo(1000 + ATMOSPHERE_PSI, 6);
    expect(r.summary).toMatch(/Pressure in psig \(read from the header\), brought to absolute with 14\.696 psi/);
  });

  test('what is not read is listed with its line and the reason; nothing is dropped silently', () => {
    const r = readPtProfile(file('hostile-mixed.txt'));
    expect(r.read).toBe(3);
    expect(r.skipped.map((s) => [s.line, s.reason])).toEqual([
      [1, 'A header line that does not name a pressure and a temperature column'],
      [3, 'Not two numbers'],
      [5, 'One value only: a pressure and a temperature are needed'],
      [6, 'Four comma-separated values: comma decimals need a semicolon or tab between the columns'],
      [7, 'Pressure is not above zero absolute'],
    ]);
    expect(r.summary).toMatch(/^3 points read, 5 lines not read\./);
    // before: the old door kept "3000 psia, 180" as nothing and read "1500,5,80,2" as 1500 psia and 5 degF
    expect(r.points.map((p) => p.temp)).not.toContain(5);
  });
});

describe('PL3: display units convert at the door and never relabel', () => {
  test('round trips are exact to the digits a field shows', () => {
    for (const [kind, value] of [['pressure', 2998], ['temperature', 200], ['gor', 650], ['fvfOil', 1.3718], ['fvfGas', 0.000985], ['viscosity', 0.5613], ['compressibility', 1.593e-5], ['liquidRate', 1000]]) {
      const shown = toDisplay(kind, value, 'si');
      expect(fromDisplay(kind, shown, 'si')).toBeCloseTo(value, 10);
      expect(toDisplay(kind, value, 'oilfield')).toBe(kind === 'fvfGas' ? value * 1000 : value);
    }
    expect(toDisplay('pressure', 2998, 'si')).toBeCloseTo(20670.48, 1);
    expect(toDisplay('temperature', 200, 'si')).toBeCloseTo(93.333, 3);
    expect(toDisplay('fvfGas', 0.000985, 'oilfield')).toBeCloseTo(0.985, 12);
    expect(toDisplay('fvfGas', 0.000985, 'si')).toBeCloseTo(0.000985 * 0.158987294928 / 0.028316846592, 9);
    expect(Object.keys(FLUID_KINDS)).toEqual(expect.arrayContaining(['pressure', 'temperature', 'gor', 'fvfOil', 'fvfGas', 'viscosity', 'compressibility']));
  });

  test('a field shows the stored value in the display unit and stores what is typed in oilfield', () => {
    expect(inputText('temperature', 200, 'oilfield')).toBe('200');
    expect(inputText('temperature', 200, 'si')).toBe('93.33333');
    expect(inputValue('temperature', '93.33333', 'si')).toBeCloseTo(200, 4);
    expect(inputValue('temperature', '95', 'si')).toBeCloseTo(203, 9);
    expect(inputValue('pressure', '', 'si')).toBeNull();
    expect(inputValue('pressure', '-', 'si')).toBeNull();
    expect(inputText('pressure', null, 'si')).toBe('');
    expect(fluidUnits('si').label('pressure')).toBe('kPa (abs)');
    expect(fluidUnits('oilfield').label('pressure')).toBe('psia');
  });

  test('the warning banner speaks the display unit and now names the fixed correlations too', () => {
    const inputs = sampleWorkspace();
    inputs.streamA.blackOil = { ...inputs.streamA.blackOil, gor: 2000, temp: 360 };
    const res = analyzeFluidSystem(inputs);
    const oil = screenWarnings(res, fluidUnits('oilfield'));
    expect(oil).toContain('Standing: solution GOR 2000 scf/STB is outside its data range (20 to 1425 scf/STB); the result is extrapolated.');
    expect(oil.join(' ')).toMatch(/Beggs-Robinson: temperature 360\.0 degF is outside its published range \(70\.0 to 295\.0 degF\)/);
    expect(oil.join(' ')).toMatch(/Lee-Gonzalez-Eakin: temperature 360\.0 degF/);
    const si = screenWarnings(res, fluidUnits('si'));
    expect(si.join(' ')).toMatch(/Standing: solution GOR 356\.22 m3\/m3 is outside its published range \(3\.56 to 253\.80 m3\/m3\)/);
    expect(si.join(' ')).not.toMatch(/scf\/STB|degF|psia/);
    // negative control: the sample raises none
    expect(screenWarnings(analyzeFluidSystem(sampleWorkspace()), fluidUnits('si')).join(' ')).not.toMatch(/outside its/);
  });

  test('an old project opens in oilfield units, as it was written', () => {
    const inputs = inputsFromPayload(LEGACY_PRE_SHELL);
    expect(inputs.unitSystem).toBeUndefined();
    expect(run(inputs).system).toBe('oilfield');
    expect(run({ ...inputs, unitSystem: 'si' }).system).toBe('si');
  });
});
