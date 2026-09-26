/**
 * EC7 (engines 3.12.0): the Run Console, Results Viewer and Case Detail
 * surface of the PIA 2021 / NTA 2025 compliance repair. Every refusal the
 * helpers classify or predict is produced by CALLING the vendored engine, and
 * every one-click fix is proven by running the engine again after it.
 */
import fs from 'fs';
import path from 'path';
import { computeCashFlow } from '../../../../../packages/engines/engines/economics/cashflow.ts';
import {
  PIA_WORKED_EXAMPLE_DEFAULT_CFG, PIA_WORKED_EXAMPLE_PROD, PIA_WORKED_EXAMPLE_CAPEX, PIA_WORKED_EXAMPLE_OPEX,
} from '../../../../../tools/validation/fixtures/epe-pia-worked-example.ts';
import {
  LEGACY_NOTICE, LEGACY_TOGGLE_LABEL, PIA_2021_INPUT_DEFAULTS, PIA_INPUT_HELP, PIA_REFUSALS,
  piaRefusal, piaPreflight, piaCompliancePayload, frameworkLabel, frameworkBadge,
  piaRowColumnsPresent, piaCellValue,
} from '../epePiaCompliance';
import { cashFlowColumns, KPI_EXPORT_ROWS } from '../EpeResultsViewer';

// A saved Console config as the Console builds it (a 2027 PIA run), with the
// three uploads of the worked example moved to 2027.
const rows = {
  prodRows: PIA_WORKED_EXAMPLE_PROD.map((r) => ({ ...r, date: r.date.replace('2025', '2027') })),
  capexRows: PIA_WORKED_EXAMPLE_CAPEX.map((r) => ({ ...r, date: '2027-01-01' })),
  opexRows: PIA_WORKED_EXAMPLE_OPEX.map((r) => ({ ...r, date: '2027-01-01' })),
};
const console2027 = (over = {}) => ({
  ...PIA_WORKED_EXAMPLE_DEFAULT_CFG, base_year: 2027, pia_nddc_levy_fixed_usd: null, ...PIA_2021_INPUT_DEFAULTS, ...over,
});
const run = (cfg) => computeCashFlow({ cfg: { ...cfg, ...piaCompliancePayload(cfg) }, ...rows });
const engineMessage = (cfg) => {
  try { run(cfg); return null; } catch (e) { return e.message; }
};

// The five refusals of saved pre-audit configs (FINDINGS-pia2021.md section 6)
// plus the deep offshore reading (D5), each as a config the Console could hold.
const REFUSED = {
  marginal_terrain: { pia_terrain: 'marginal_field' },
  new_pml_hct_rate: { pia_lease_status: 'new' },
  recovery_life: { pia_capex_recovery_years: 7 },
  decom_escrow: { abandonment_cost_usd: 10_000_000, abandonment_year: 2027, abandonment_funding_mode: 'sinking_fund' },
  licence_type: { pia_license_type: 'OML' },
  deep_offshore_hct: { pia_terrain: 'deep_offshore', pia_deep_offshore_hct_interpretation: null },
};

describe('refusals: the engine refuses, the helpers name it, the fixes clear it', () => {
  test('a compliant 2027 Console config runs and needs no fix', () => {
    expect(engineMessage(console2027())).toBeNull();
    expect(piaPreflight(console2027())).toEqual({ certain: [], possible: [] });
  });

  test.each(Object.entries(REFUSED))('%s', (code, over) => {
    const cfg = console2027(over);
    const msg = engineMessage(cfg);
    expect(msg).not.toBeNull();                          // the engine refuses
    expect(piaRefusal(msg)?.code).toBe(code);            // classified from its own words
    expect(piaPreflight(cfg).certain.map((r) => r.code)).toContain(code);  // predicted before the run
    const spec = PIA_REFUSALS.find((r) => r.code === code);
    for (const fix of spec.fixes) {
      expect([fix.label, engineMessage({ ...cfg, ...fix.patch })]).toEqual([fix.label, null]);
    }
    // and "run as legacy" runs it too
    expect(engineMessage({ ...cfg, pia_legacy_pre_audit: true })).toBeNull();
  });

  test('negative control: other engine errors are not PIA refusals', () => {
    expect(piaRefusal('No production data found. Upload and process a CSV first.')).toBeNull();
    expect(piaRefusal('')).toBeNull();
  });

  test('the preflight stays silent where the engine does not refuse', () => {
    // an HCT override comes before the lease checks in the engine
    const cfg = console2027({ pia_lease_status: 'new', pia_hct_rate_override_pct: 20 });
    expect(engineMessage(cfg)).toBeNull();
    expect(piaPreflight(cfg).certain).toEqual([]);
    // a forced-PIA deep offshore run needs no NTA reading
    const pia = console2027({ pia_terrain: 'deep_offshore', pia_deep_offshore_hct_interpretation: null, pia_under_nta_2025_override: 'force_pia' });
    expect(engineMessage(pia)).toBeNull();
    expect(piaPreflight(pia)).toEqual({ certain: [], possible: [] });
    // legacy configs are never pre-checked
    expect(piaPreflight(console2027({ pia_terrain: 'marginal_field', pia_legacy_pre_audit: true })).certain).toEqual([]);
  });
});

describe('the legacy switch through the Console payload', () => {
  const fixtureRows = { prodRows: PIA_WORKED_EXAMPLE_PROD, capexRows: PIA_WORKED_EXAMPLE_CAPEX, opexRows: PIA_WORKED_EXAMPLE_OPEX };
  test('a legacy run with a blank TET gets the pre-audit 2.5 and reproduces NPV 135,185,570.34', () => {
    const cfg = { ...PIA_WORKED_EXAMPLE_DEFAULT_CFG, pia_tet_rate_pct: null, pia_legacy_pre_audit: true };
    const payload = piaCompliancePayload(cfg);
    expect(payload.pia_tet_rate_pct).toBe(2.5);
    const { kpis } = computeCashFlow({ cfg: { ...cfg, ...payload }, ...fixtureRows });
    expect(kpis.npv).toBeCloseTo(135185570.34, 2);
    expect(kpis.pia_legacy_pre_audit).toBe(true);
  });
  test('the same inputs on the default path give the re-frozen NPV 141,236,909.83', () => {
    const cfg = { ...PIA_WORKED_EXAMPLE_DEFAULT_CFG, pia_tet_rate_pct: null, pia_legacy_pre_audit: false };
    const { kpis } = computeCashFlow({ cfg: { ...cfg, ...piaCompliancePayload(cfg), pia_nddc_levy_pct: null }, ...fixtureRows });
    expect(kpis.npv).toBeCloseTo(141236909.83, 2);
  });
});

describe('Results Viewer: framework per year, notes and the new row columns', () => {
  const cfg2025to2026 = console2027({ base_year: 2025, pia_nddc_levy_fixed_usd: 15_000_000 });
  const res = computeCashFlow({
    cfg: { ...cfg2025to2026, ...piaCompliancePayload(cfg2025to2026) },
    prodRows: [{ year: 2025, well1_oil_bbl: 3_000_000, well1_gas_mscf: 1_000_000 }, { year: 2026, well1_oil_bbl: 3_000_000 }],
    capexRows: [{ year: 2025, amount_usd: 50_000_000 }],
    opexRows: [{ year: 2025, total_opex_usd: 20_000_000 }, { year: 2026, total_opex_usd: 20_000_000 }],
  });

  test('the badge and label read pia_only_then_nta_2025 with the first NTA year', () => {
    expect(res.kpis.fiscal_framework).toBe('pia_only_then_nta_2025');
    expect(frameworkBadge(res.kpis)).toBe('Computed under PIA 2021 to 2025 and NTA 2025 from 2026');
    expect(frameworkLabel(res.kpis)).toBe('PIA 2021 to 2025, NTA 2025 from 2026');
    expect(frameworkBadge({ fiscal_framework: 'pia_only' })).toBe('Computed under PIA 2021 (pre-NTA)');
    expect(frameworkBadge({ fiscal_framework: 'nta_2025' })).toBe('Computed under NTA 2025');
    expect(KPI_EXPORT_ROWS.map(([k]) => k)).toEqual(expect.arrayContaining(['nta_first_year', 'pia_legacy_pre_audit']));
  });

  test('the export columns carry the royalty split and the rates, in percent', () => {
    const cols = cashFlowColumns(true, res.cashFlowData);
    const keys = cols.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['liquids_production_royalty', 'gas_royalty', 'price_royalty', 'royalty_rate_liquids', 'hct_rate', 'tet_rate_pct', 'fiscal_framework']));
    const rate = cols.find((c) => c.key === 'royalty_rate_liquids');
    expect(rate.value(res.cashFlowData[0])).toBeCloseTo(res.cashFlowData[0].royalty_rate_liquids * 100, 3);
    expect(piaRowColumnsPresent(res.cashFlowData).length).toBeGreaterThan(8);
    expect(piaCellValue({ kind: 'bool' }, true)).toBe('yes');
  });

  test('negative control: a legacy run keeps its old columns', () => {
    const legacy = computeCashFlow({ cfg: { ...cfg2025to2026, pia_legacy_pre_audit: true, pia_tet_rate_pct: 2.5 },
      prodRows: [{ year: 2025, well1_oil_bbl: 3_000_000 }], capexRows: [], opexRows: [{ year: 2025, total_opex_usd: 1 }] });
    expect(piaRowColumnsPresent(legacy.cashFlowData)).toEqual([]);
    expect(cashFlowColumns(true, legacy.cashFlowData).map((c) => c.key)).not.toContain('liquids_production_royalty');
    expect(legacy.kpis.pia_notes).toBeUndefined();
    expect(Array.isArray(res.kpis.pia_notes)).toBe(true);
  });
});

describe('the screens use the helpers, and the copy follows the rule', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  test('the Console defaults carry every compliance input with its migration default', () => {
    const text = src('EpeRunConsole.jsx');
    const block = text.slice(text.indexOf('const DEFAULT_CONFIG = {'), text.indexOf('\n};', text.indexOf('const DEFAULT_CONFIG = {')));
    for (const [k, v] of Object.entries(PIA_2021_INPUT_DEFAULTS)) {
      const m = block.match(new RegExp(`\\n\\s*${k}: ([^,\\n]+),`));
      expect([k, m && m[1]]).toEqual([k, v === null ? 'null' : typeof v === 'string' ? `'${v}'` : v === 4 ? '4.00' : String(v)]);
    }
    expect(block).toMatch(/\n\s*pia_tet_rate_pct: null,/);
    expect(block).toMatch(/\n\s*pia_deep_offshore_hct_interpretation: null,/);
    expect(text).toContain('...piaCompliancePayload(config)');
    expect(text).toContain('LEGACY_TOGGLE_LABEL');
  });

  test('the Results Viewer shows the legacy notice and the refusal panel', () => {
    const text = src('EpeResultsViewer.jsx');
    expect(text).toContain('{LEGACY_NOTICE}');
    expect(text).toContain('piaRefusal(runDetails.error_message)');
    expect(text).toContain('&legacy=1');
    expect(src('EpeCaseDetail.jsx')).toContain('piaRefusal(run.error_message)');
  });

  test('no em dashes and no "X, not Y" contrastives in the new copy', () => {
    const copy = [LEGACY_NOTICE, LEGACY_TOGGLE_LABEL, ...Object.values(PIA_INPUT_HELP),
      ...PIA_REFUSALS.flatMap((r) => [r.title, r.explain, ...r.fixes.map((f) => f.label)])];
    for (const line of copy) {
      expect([line, /—/.test(line)]).toEqual([line, false]);
      expect([line, /, not /.test(line)]).toEqual([line, false]);
    }
    expect(LEGACY_NOTICE).toBe('PIA figures were corrected on 26 September 2026 to follow the Act and the Royalty Regulations. This run uses the earlier engine.');
  });

  test('the migration defaults match the helper defaults', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260926150000_epe_pia_2021_inputs.sql'), 'utf8');
    expect(sql).toMatch(/pia_legacy_pre_audit boolean not null default false/);
    expect(sql).toMatch(/pia_gas_in_country_share_pct numeric not null default 0/);
    expect(sql).toMatch(/pia_price_royalty_base text not null default 'regulations_2021'/);
    expect(sql).toMatch(/pia_nddc_levy_base text not null default 'total_budget'/);
    expect(sql).toMatch(/pia_production_allowance_per_bbl_new_after_cap numeric not null default 4\.00/);
    expect(sql).toMatch(/pia_cit_company_gas_operations boolean not null default false/);
    expect(sql).toMatch(/set pia_legacy_pre_audit = true\s+where fiscal_regime = 'PIA'/);
    expect(sql).toMatch(/alter column pia_tet_rate_pct drop default/);
    expect(sql).toMatch(/alter column pia_deep_offshore_hct_interpretation drop default/);
  });
});
