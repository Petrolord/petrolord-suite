/**
 * SCAL-U2-002: the gas-oil set leaves the studio. A CSV of the working
 * gas-oil Corey set with the kr-1 provenance lines, and the gas-oil set in
 * the kr-1 block that any consumer reads by id (the Simulation intake is
 * its own round, owner default 2026-10-03).
 *
 * The table rows are the engine's own (buildCoreyGasOil), not restated.
 */
import { buildGoKrCsv, buildKrCsv } from '../exports';
import { buildCoreyGasOil } from '@/utils/scalCalculations';
import { krContractCsvHeader, krContractSourceText } from '@/lib/inputProvenance/krContract';
import { krIntakeRecord, krIntakeCardModel } from '@/lib/inputProvenance/krIntakeCard';
import { stateOf, identifiedFitted, openingInputs } from './scalTestKit';

const GO = { Swc: 0.2, Sgc: 0.05, Sorg: 0.15, krgMax: 0.6, krogMax: 0.85, ng: 2.0, nog: 2.5 };

describe('the gas-oil CSV', () => {
  it('has the head Sg, krg, krog and the engine rows at the stated precision', () => {
    const csv = buildGoKrCsv(GO, 25);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Sg,krg,krog');
    expect(lines).toHaveLength(27);
    const engine = buildCoreyGasOil(GO, { n: 25 }).rows;
    lines.slice(1).forEach((l, i) => {
      expect(l).toBe([engine[i].Sg.toFixed(4), engine[i].krg.toFixed(5), engine[i].krog.toFixed(5)].join(','));
    });
    // the end points as the set states them: krog(Swc) at Sgc, krg end point at 1 - Swc - Sorg
    expect(lines[1]).toBe('0.0500,0.00000,0.85000');
    expect(lines[26]).toBe('0.6500,0.60000,0.00000');
  });

  it('negative control: the oil-water builder is not the gas-oil table', () => {
    expect(buildKrCsv({ Swc: 0.2, Sor: 0.25, krwMax: 0.35, kroMax: 0.9, nw: 2.5, no: 2 }, 25).split('\n')[0]).toBe('Sw,krw,kro');
    expect(buildGoKrCsv(null)).toBeNull();
  });

  it('opens with the provenance lines of the kr-1 block, the gas-oil set named', () => {
    const s = stateOf(identifiedFitted());
    const header = krContractCsvHeader(s.contract, { extra: ['File: gas-oil relative permeability'] });
    const csv = buildGoKrCsv(s.go.params, 25, { header });
    const head = csv.split('\n').filter((l) => l.startsWith('#'));
    expect(head.some((l) => /^# Gas-oil set: Corey, parameters entered by the user/.test(l))).toBe(true);
    expect(head.some((l) => /^# Source: SCAL Studio, project "Ekene E-2000 SCAL"/.test(l))).toBe(true);
    expect(head[head.length - 1]).toBe('# File: gas-oil relative permeability');
    expect(csv.split('\n')[head.length]).toBe('Sg,krg,krog');
  });
});

describe('the gas-oil set in the kr-1 block, as a consumer takes it', () => {
  it('the block carries the set, its table and its source words', () => {
    const c = stateOf(openingInputs()).contract;
    expect(c.gas_oil.params).toEqual(GO);
    expect(c.gas_oil.table[0]).toEqual({ Sg: 0.05, krg: 0, krog: 0.85 });
    expect(krContractSourceText(c, 'gas_oil')).toMatch(/^Corey, parameters entered by the user, from SCAL Studio/);
  });

  it('a consumer stores the gas-oil set with its source and sees a later change at the source', () => {
    const c = stateOf(identifiedFitted()).contract;
    const intake = krIntakeRecord({ contract: c, set: 'gas_oil', values: { ...c.gas_oil.params }, at: '2026-10-03T10:00:00Z' });
    expect(intake.set).toBe('gas_oil');
    expect(intake.sourceText).toMatch(/^Corey, parameters entered by the user/);
    const fields = Object.keys(GO).map((k) => ({ key: k, label: k }));
    const same = krIntakeCardModel({ intake, current: { ...c.gas_oil.params }, fields, latest: { ok: true, contract: { ...c, generated_at: '2026-10-04T10:00:00Z' } } });
    expect(same.status).toBe('As received');
    const moved = { ...c, generated_at: '2026-10-04T10:00:00Z', gas_oil: { ...c.gas_oil, params: { ...c.gas_oil.params, nog: 3.1 } } };
    const changed = krIntakeCardModel({ intake, current: { ...c.gas_oil.params }, fields, latest: { ok: true, contract: moved } });
    expect(changed.status).toBe('Source changed since');
    expect(changed.changedSince.text).toMatch(/nog 3\.1/);
  });
});
