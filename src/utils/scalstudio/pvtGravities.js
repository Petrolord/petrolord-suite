/**
 * The saturation-height fluid inputs taken from a Fluid Systems Studio
 * project (SCAL-U2-005; RL11). The pvt-1 block of a saved Fluid project is
 * read by id (src/lib/pvtSource.js); at the reservoir pressure (the bubble
 * point unless a pressure is stated) its table gives Bo, Rs and Bw, its
 * inputs the stock-tank oil gravity, the gas gravity and the salinity, and
 * the engine's reservoirFluidGravities turns them into the oil and brine
 * densities and their gravities on the height formula's own gradient.
 *
 * What is stored with the SCAL project (`pvtIntake`): the Fluid project,
 * the time, the pressure, the values taken (gammaW, gammaHc), the
 * components (Bo, Rs, Bw, API, gas gravity, salinity, densities) and the
 * block without its table, so the shared PVT intake card can say "source
 * changed since" (content) and "edited after intake".
 *
 * The interfacial tension is not in the pvt-1 block, so it stays as entered.
 *
 * Pure.
 */
import { reservoirFluidGravities } from '@/utils/scalCalculations';
import { pvtContractOf, pvtContractSummary, pvtContractOrigin, PVT_PRODUCER } from '@/lib/inputProvenance/pvtContract';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The method words of the two values, for the intake card and the report. */
export const SCAL_PVT_METHOD = 'Mass balance on a stock-tank barrel (McCain): stock-tank oil plus dissolved gas over Bo; brine density at standard conditions from salinity (McCain 1991) over Bw; gravity = density / (144 x 0.4335)';
export const IFT_NOT_IN_PVT = 'The interfacial tension is not in the pvt-1 block, so it stays as entered.';

/** The fields of the shared PVT intake card in SCAL Studio. */
export const SCAL_PVT_FIELDS = Object.freeze([
  { key: 'gammaW', label: 'Water specific gravity at reservoir conditions', method: SCAL_PVT_METHOD },
  { key: 'gammaHc', label: 'Oil specific gravity at reservoir conditions', method: SCAL_PVT_METHOD },
]);

/** Linear interpolation of a table column at a pressure; null outside the table. */
function at(rows, key, p) {
  const pts = (rows || []).filter((r) => finite(r.pressure) && finite(r[key])).sort((a, b) => a.pressure - b.pressure);
  if (!pts.length || p < pts[0].pressure - 1e-9 || p > pts[pts.length - 1].pressure + 1e-9) return null;
  for (let i = 1; i < pts.length; i += 1) {
    if (p <= pts[i].pressure) {
      const a = pts[i - 1];
      const b = pts[i];
      return a[key] + ((b[key] - a[key]) * (p - a.pressure)) / (b.pressure - a.pressure);
    }
  }
  return pts[pts.length - 1][key];
}

/**
 * @param {object} contract the pvt-1 block
 * @param {{pressurePsia?: ?number}} [opts] blank: the bubble point (the block's saturation pressure)
 * @returns {{ok: boolean, errors: string[], pressure: ?number, pressureFrom: ?string, components: ?object, result: ?object}}
 */
export function gravitiesFromPvt(contract, { pressurePsia = null } = {}) {
  const b = pvtContractOf(contract);
  const fail = (e) => ({ ok: false, errors: [e], pressure: null, pressureFrom: null, components: null, result: null });
  if (!b) return fail('No pvt-1 block: the Fluid Systems Studio project carries no PVT.');
  if (b.model !== 'black-oil-correlations' && b.model !== 'eos' && b.model !== 'lab') return fail(`The fluid model "${b.model}" is not one SCAL Studio reads.`);
  const sat = b.at_saturation || {};
  const stated = finite(pressurePsia);
  const pressure = stated ? pressurePsia : sat.pressure;
  if (!finite(pressure)) return fail('The block states no bubble point; state the reservoir pressure.');
  const table = b.table || [];
  const atSat = !stated || Math.abs(pressure - sat.pressure) < 1e-6;
  const Bo = atSat && finite(sat.Bo) ? sat.Bo : at(table, 'Bo', pressure);
  const Rs = atSat && finite(sat.Rs) ? sat.Rs : at(table, 'Rs', pressure);
  const Bw = atSat && finite(sat.Bw) ? sat.Bw : at(table, 'Bw', pressure);
  if (![Bo, Rs, Bw].every(finite)) {
    const ps = table.map((r) => r.pressure).filter(finite);
    return fail(`The pressure ${pressure} psia is outside the PVT table of the project (${ps.length ? `${Math.min(...ps)} to ${Math.max(...ps)} psia` : 'no table'}), or the table lacks Bo, Rs or Bw there. The densities are not extrapolated.`);
  }
  const inp = b.inputs || {};
  const components = {
    Bo, Rs, Bw, api: inp.oil_gravity ?? null, gasGravity: inp.gas_gravity ?? null, salinity: finite(inp.salinity) ? inp.salinity : 0, temperature: inp.temperature ?? null,
  };
  const result = reservoirFluidGravities({ api: components.api, gasGravity: components.gasGravity, Rs_scf_stb: Rs, Bo, Bw, salinity_ppm: components.salinity });
  if (!result.ok) return { ok: false, errors: result.errors, pressure, pressureFrom: null, components, result: null };
  return { ok: true, errors: [], pressure, pressureFrom: stated ? 'stated' : 'the bubble point of the block', components, result };
}

const g4 = (v) => String(parseFloat(Number(v).toPrecision(4)));

/**
 * The patch to the height inputs and the record kept with the SCAL project.
 * @param {object} contract the pvt-1 block (with project_id and project_name)
 * @param {{pressurePsia?: ?number, at?: string}} [opts]
 * @returns {{ok: boolean, errors: string[], patch?: object, intake?: object}}
 */
export function scalPvtIntake(contract, { pressurePsia = null, at: takenAt = new Date().toISOString() } = {}) {
  const r = gravitiesFromPvt(contract, { pressurePsia });
  if (!r.ok) return { ok: false, errors: r.errors };
  const b = pvtContractOf(contract);
  const values = { gammaW: g4(r.result.gammaWater), gammaHc: g4(r.result.gammaOil) };
  return {
    ok: true,
    errors: [],
    patch: { ...values },
    intake: {
      from: {
        app: b.source_app || PVT_PRODUCER, recordId: b.project_id ?? null, recordName: b.project_name ?? null,
        at: b.generated_at ?? null, takenAt, build: b.app_build ?? null, schema: b.schema,
      },
      pressure_psia: r.pressure,
      pressure_from: r.pressureFrom,
      values,
      components: {
        ...r.components,
        rhoOil_lbft3: r.result.rhoOil_lbft3,
        rhoWater_lbft3: r.result.rhoWater_lbft3,
        stockTankGammaOil: r.result.stockTankGammaOil,
      },
      method: SCAL_PVT_METHOD,
      ift: IFT_NOT_IN_PVT,
      contract: pvtContractSummary(b),
    },
  };
}

/**
 * The Source column words of gammaW or gammaHc taken from a pvt-1 block, or
 * null when the project took none.
 */
export function scalPvtSourceText(intake, key) {
  if (!intake?.values?.[key] || !intake.contract) return null;
  const c = intake.components || {};
  const p = `${intake.pressure_psia} psia (${intake.pressure_from})`;
  const what = key === 'gammaHc'
    ? `oil density ${Number(c.rhoOil_lbft3).toFixed(2)} lb/ft3 from Bo ${g4(c.Bo)}, Rs ${g4(c.Rs)} scf/STB, ${g4(c.api)} degAPI, gas gravity ${g4(c.gasGravity)}`
    : `brine density ${Number(c.rhoWater_lbft3).toFixed(2)} lb/ft3 from Bw ${g4(c.Bw)} and salinity ${c.salinity} ppm`;
  return `Computed at ${p}: ${what}${pvtContractOrigin(intake.contract)}`;
}
