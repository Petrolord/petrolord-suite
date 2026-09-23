// Process safety (Wave D8): episodes 34 to 36, kit folder 14-process-safety.
//
// One release source, the Ekene Alpha production separator of
// d8spine.mjs FACILITY_DESIGN (binding), followed through three apps:
//   34 Consequence Modelling Studio  how much comes out, how far the gas
//                                    cloud reaches, how hot the pool fire is
//   35 LOPA & SIL Studio             separator overpressure: the SIL the
//                                    high pressure trip needs, and its PFDavg
//   36 QRA Studio                    the event tree, the operator's IRPA,
//                                    PLL, F-N and one cost-benefit test
// The consequence results feed the QRA through the engine outputs, and the
// chain is asserted here and again in __tests__/domain.processsafety.test.js,
// which feeds each input sheet through the app's own evaluateStudy.
//
// A synthetic teaching case: Ekene Alpha is not a real facility.

import { D, consequence, qra, cba, lopa } from './processsafety/design.mjs';
import {
  CONSEQUENCE_FIELDS, LOPA_FIELDS, QRA_FIELDS, QRA_SCENARIOS, sheetRows, at, toCsv, csvCell,
} from './processsafety/sheets.mjs';

const DIR = '14-process-safety';
const SYNTHETIC = 'Synthetic teaching case: Ekene Alpha and every number here are invented for the tutorial series; no real facility is described.';

/** 6.5e-6 style, trailing zeros dropped. */
const sci = (x, n = 3) => {
  const [m, e] = Number(x).toExponential(n - 1).split('e');
  return `${String(Number(m))}e${Number(e)}`;
};
const f = (x, n = 3) => String(Number(Number(x).toPrecision(n)));
const fx = (x, d) => Number(x).toFixed(d);

export async function build(ctx) {
  const { write, say, assertClose } = ctx;
  const num = Number;

  // ---------------------------------------------------------------- compute
  const c = consequence();
  const c50 = consequence({ holeMm: '50' });
  const q = qra(c);
  const b = cba(q, c);
  const L = lopa();
  const Lalarm = lopa({ alarmIndependent: true });
  const Lstretch = lopa({ finalT1: D.lopa.stretchedT1 });
  const qHot = qra(c, { gasDelayed: '0.3' });

  // ---------------------------------------------------------------- assert
  if (!c.gas.choked) throw new Error('ASSERT process safety: the 25 mm gas release should be choked at 11.4 bara');
  // the negative control: doubling the hole quadruples both rates (area, d^2)
  assertClose('gas rate, 50 mm / 25 mm', c50.gas.massRateKgS / c.gas.massRateKgS, 4, 1e-12);
  assertClose('liquid rate, 50 mm / 25 mm', c50.liquid.massRateKgS / c.liquid.massRateKgS, 4, 1e-12);
  // both holes outrun the separator's throughput: the releases are inventory fed
  if (!(c.gas.massRateKgS > 4 * c.gasThroughputKgS)) throw new Error('ASSERT process safety: the gas release should exceed four times the gas throughput');
  if (!(c.liquid.massRateKgS > 4 * c.oilThroughputKgS)) throw new Error('ASSERT process safety: the oil release should exceed four times the oil throughput');
  // the spill stays in the drip tray
  if (!(c.pool.depthM < num(D.dripTray.coamingM))) throw new Error('ASSERT process safety: the spill overtops the drip tray');
  // the fixed transmissivity is Bagster's at a 20 m path, rounded
  assertClose('transmissivity, Bagster at 20 m', c.bagster.transmissivity, num(D.fire.tau), 0.005);
  // the operator's place on the deck is inside the LFL cloud and under the tilted flame
  if (!(D.places[0].distanceM < c.lfl.farDistanceM)) throw new Error('ASSERT process safety: the process deck should lie inside the LFL distance');
  if (!(D.places[1].distanceM > c.lfl.farDistanceM * 1.5)) throw new Error('ASSERT process safety: the control room should lie well outside the LFL distance');
  if (!c.flame[0].underFlame || c.flame[1].underFlame) throw new Error('ASSERT process safety: only the process deck should lie under the tilted pool fire');
  if (c.toEquipment.state !== 'NOT_REACHED') throw new Error('ASSERT process safety: 37.5 kW/m2 should not be reached outside this pool fire');
  // the typed cloud mass is Q x distance to LFL / wind, rounded to 3 figures
  assertClose('fuel mass in the cloud', num(c.cloudKg), c.cloudKgExact, 0.005);
  // the QRA takes the consequence engine's numbers, rounded as typed
  assertClose('QRA release rate', num(q.rateTyped), c.gas.massRateKgS, 5e-4 * c.gas.massRateKgS);
  for (const p of c.flame.filter((x) => !x.underFlame)) assertClose(`QRA heat flux at ${p.name}`, num(q.fluxKW[p.id]) * 1000, p.fire.heatFluxWM2, 5e-4 * p.fire.heatFluxWM2);
  for (const p of c.blast) assertClose(`QRA overpressure at ${p.name}`, num(q.opKPa[p.id]) * 1000, p.op.overpressurePa, 5e-4 * p.op.overpressurePa);
  // LOPA presence is the QRA's manning: the process deck is occupied through the day shift
  assertClose('LOPA presence = deck occupied fraction', num(D.lopa.presence), D.deckOccupiedFraction, 0);
  if (q.band.band !== 'TOLERABLE') throw new Error(`ASSERT process safety: IRPA band ${q.band.band}`);
  if (L.without.outcome !== 'SIL1' || !L.withSif.meetsTmel || L.sif.sil !== 1) throw new Error('ASSERT process safety: the SIF should be required at SIL 1 and meet the TMEL');
  if (Lalarm.without.outcome !== 'RISK_REDUCTION_BELOW_SIL1') throw new Error('ASSERT process safety: crediting the alarm should drop the requirement below SIL 1');
  if (Lstretch.withSif.meetsTmel) throw new Error('ASSERT process safety: an 8 year valve proof test should fail the TMEL');
  if (!(qHot.irpa.irpaPerYr > 2 * q.irpa.irpaPerYr)) throw new Error('ASSERT process safety: tripling delayed ignition should more than double the IRPA');
  if (b.r.verdict !== 'GROSSLY_DISPROPORTIONATE') throw new Error(`ASSERT process safety: cost-benefit verdict ${b.r.verdict}`);

  // ---------------------------------------------------------------- scenario basis
  const S = D.separator;
  const basis = [
    ['B00', 'about', 'Synthetic teaching case', 'yes', '', SYNTHETIC],
    ['B01', 'source', 'Release source', 'Ekene Alpha production separator', '', 'BINDING: d8spine.mjs FACILITY_DESIGN (the facilities domain sizes this vessel)'],
    ['B02', 'source', 'Separator pressure', S.pressurePsig, 'psig', 'BINDING: FACILITY_DESIGN.separator_pressure_psig'],
    ['B03', 'source', 'Separator pressure', S.pressureBarA, 'bar absolute', 'the same, plus 14.696 psi atmosphere, in the studios\' unit'],
    ['B04', 'source', 'Separator temperature', S.temperatureF, 'degF', 'BINDING: FACILITY_DESIGN.separator_temperature_f'],
    ['B05', 'source', 'Separator temperature', S.temperatureC, 'C', 'the same in C'],
    ['B06', 'source', 'Throughput', `${S.oilBopd} bopd; ${S.waterBwpd} bwpd; ${S.gasMmscfd} MMscfd`, '', 'BINDING: FACILITY_DESIGN'],
    ['B07', 'fluid', 'Gas molar mass', D.gas.molarMassGMol, 'g/mol', 'spine.mjs gas gravity 0.75 x 28.9647 g/mol (air)'],
    ['B08', 'fluid', 'Gas heat capacity ratio', D.gas.gamma, 'Cp/Cv', 'design: a 0.75 gravity natural gas near 60 C'],
    ['B09', 'fluid', 'Gas lower flammable limit', D.gas.lflPpm, 'ppm', 'design: methane 4.4 percent by volume (IEC 60079-20-1); heavier components would lower it a little'],
    ['B10', 'fluid', 'Gas heat of combustion', D.gas.heatOfCombustionMJKg, 'MJ/kg', 'design: lower heating value of a methane-rich associated gas'],
    ['B11', 'fluid', 'Oil density', D.oil.densityKgM3, 'kg/m3', 'spine.mjs 32 API: 141.5 / (131.5 + 32) x 999.016 kg/m3; dissolved gas flashing is outside the studio (no two-phase discharge)'],
    ['B12', 'release', 'Hole diameter, gas and oil', D.hole.diameterMm, 'mm', 'design: the representative size of the 10 to 50 mm band of generic process release data (IOGP Report 434-01 hole classes)'],
    ['B13', 'release', 'Discharge coefficient', D.hole.cd, '-', 'TNO Yellow Book CPR 14E: 0.62 for a sharp orifice'],
    ['B14', 'release', 'Liquid height above the oil outlet', D.oil.headM, 'm', 'design: normal liquid level above the oil outlet nozzle'],
    ['B15', 'release', 'Time to isolate the oil release', D.isolationS, 's', 'design: gas and fire detection, ESD valve closure'],
    ['B16', 'release', 'Drip tray under the separator', `${D.dripTray.areaM2} m2, coaming ${D.dripTray.coamingM} m`, '', 'design: a 6 m by 12 m skid drip tray'],
    ['B17', 'weather', 'Wind speed at 10 m', D.weather.windMS, 'm/s', 'design: typical offshore wind'],
    ['B18', 'weather', 'Pasquill-Gifford stability class', D.weather.stability, '', 'design: neutral, the usual offshore class'],
    ['B19', 'weather', 'Air temperature', D.weather.airC, 'C', 'design: tropical offshore'],
    ['B20', 'weather', 'Relative humidity', String(D.weather.rh * 100), 'percent', `design; water vapour pressure ${fx(c.pw, 0)} Pa (saturation ${D.weather.pSatPa} Pa at 27 C)`],
    ['B21', 'weather', 'Air density', D.weather.airDensity, 'kg/m3', 'ideal gas air at 27 C and 1 atm'],
    ['B22', 'weather', 'Air kinematic viscosity', D.weather.airNu, 'm2/s', 'standard air tables at 300 K'],
    ['B23', 'fire', 'Crude oil burning flux m"inf and k beta', `${D.fire.mInf} kg/(m2 s); ${D.fire.kBeta} 1/m`, '', 'Babrauskas large pool data for crude oil (0.022 to 0.045 kg/(m2 s), k beta 2.8); mid range'],
    ['B24', 'fire', 'Crude oil heat of combustion', D.fire.dHcMJKg, 'MJ/kg', 'Babrauskas large pool data for crude oil (42.5 to 42.7)'],
    ['B25', 'fire', 'Radiative fraction and soot fraction', `${D.fire.fs}; ${D.fire.soot}`, '', 'Yellow Book: Fs 0.1 to 0.4; soot 0.8 for oil products'],
    ['B26', 'fire', 'Transmissivity (fixed)', D.fire.tau, '-', `Bagster (Yellow Book 6.29) over a 20 m path gives ${fx(c.bagster.transmissivity, 4)}; rounded and held fixed so the distance search is allowed`],
    ['B27', 'harm', 'Heat flux thresholds', `${D.thresholdsKW.personnel}; ${D.thresholdsKW.escape}; ${D.thresholdsKW.equipment}`, 'kW/m2', 'design screening levels: short escape in work clothes; escape route impairment; process equipment damage'],
    ['B28', 'harm', 'Fire exposure time', D.exposureS, 's', 'Purple Book section 5.2.3: exposure to a fire is limited to 20 s'],
    ['B29', 'explosion', 'TNT yield factor', D.explosion.yield, '-', 'Yellow Book: 0.02 to 0.2 in use; 0.1 for a congested separator module'],
    ['B30', 'explosion', 'TNT blast energy', D.explosion.eTntMJKg, 'MJ/kg', 'the Consequence Modelling Studio default'],
    ['B31', 'explosion', 'Fuel mass in the cloud', c.cloudKg, 'kg', 'our arithmetic: gas release rate x (distance to LFL / wind speed)'],
    ...D.places.map((p, i) => [`B${32 + i}`, 'people', `${p.name}: distance from the separator`, String(p.distanceM), 'm', 'design layout of Ekene Alpha']),
    ['B35', 'people', 'Persons on board', String(D.pob), '', 'design: a small normally manned platform'],
    ...D.places.map((p, i) => [`B${36 + i}`, 'people', `${p.name}: average people present`, String(p.people), 'persons', 'design: two people on the process deck through the 12 h day shift; the rest in the control room and accommodation']),
    ['B39', 'people', 'Process deck occupied', String(D.deckOccupiedFraction), 'fraction of time', 'design: occupied through the 12 h day shift; the LOPA presence modifier'],
    ...D.places.map((p, i) => [`B${40 + i}`, 'people', `Most exposed operator: hours at ${p.name}`, String(p.hours), 'h/yr', 'design: two weeks on, two weeks off (182.5 days); 6 h deck and 6 h control room each day shift, 12 h off shift']),
    ['B43', 'frequency', 'Gas release, 25 mm, separator gas outlet', D.frequencies.gasPerYr, 'per year', 'design assumption, set at the order of the IOGP Report 434-01 generic process release frequencies for a separator and its outlet piping, 10 to 50 mm; the figure itself is ours'],
    ['B44', 'frequency', 'Oil release, 25 mm, separator oil outlet', D.frequencies.oilPerYr, 'per year', 'design assumption, the same basis as B43'],
    ['B45', 'ignition', 'Immediate ignition, gas', f(q.ign.probability), '-', 'Purple Book Table 4.5, low reactivity gas, continuous under 10 kg/s (the studio looks it up)'],
    ['B46', 'ignition', 'Delayed ignition, gas', D.ignition.gasDelayed, '-', 'design: an open module with ignition source control'],
    ['B47', 'ignition', 'Immediate ignition, oil', f(q.oilIgn.probability), '-', 'Purple Book Table 4.5, K1 liquid (crude flash point below 21 C)'],
    ['B48', 'ignition', 'Delayed ignition, oil', String(D.ignition.oilDelayed), '-', 'design: the drip tray drains to the closed drains, so an unignited pool is taken as gone'],
    ['B49', 'ignition', 'Flash fire and explosion split', '0.6; 0.4', '', 'Purple Book section 4.8'],
    ['B50', 'harm', 'Jet fire probability of death', `${D.jetPd.l1} deck; 0 elsewhere`, '-', 'design judgement: the studio has no jet fire model; half the release directions point across the deck; the control room and accommodation sit behind a fire wall'],
    ['B51', 'criteria', 'Individual risk', 'R2P2 workers', 'per year', 'UK HSE R2P2 (2001): 1e-3 upper, 1e-6 broadly acceptable'],
    ['B52', 'criteria', 'Societal risk', 'R2P2 para 136', '', '50 or more deaths more often than 1 in 5000 per year is intolerable'],
    ['B53', 'criteria', 'TMEL, one fatality', D.criteria.tmelPerYr, 'per year', 'design corporate criterion: one hundredth of the R2P2 worker limit, leaving room for every other scenario on the platform'],
    ['B54', 'lopa', 'Initiating event frequency', D.lopa.iefPerYr, 'per year', 'CCPS (2001) LOPA: a basic process control loop failure, here the gas outlet pressure control valve closing'],
    ['B55', 'lopa', 'Fatal injury given presence', D.lopa.fatalInjury, '-', 'design judgement for a vessel failure on an open deck'],
    ['B56', 'lopa', 'PSV PFD', D.lopa.psvPfd, '-', 'CCPS (2001) LOPA: a relief valve sized for the case'],
    ['B57', 'lopa', 'Alarm and operator response PFD', D.lopa.alarmPfd, '-', 'CCPS (2001) LOPA; counted as dependent here because the alarm runs in the same control system as the failed loop'],
    ['B58', 'lopa', 'SIF failure rates', 'see the LOPA input sheet', 'per hour', 'design assumption: generic rates of the order quoted in public SIL literature, chosen for teaching'],
    ['B59', 'cost-benefit', 'Value of preventing a fatality', D.cba.vpfUsd, 'USD', 'design: of the order of the UK HSE figure (GBP 1,336,800 at 2003 prices), converted and rounded; it carries no regulatory standing'],
    ['B60', 'cost-benefit', 'Measure, cost, life and DF', `${D.cba.capitalUsd} USD; ${D.cba.lifeYears} years; DF ${D.cba.df}`, '', 'design: a second gas detector halving delayed ignition; DF 3 for a low risk to workers (HSE: DFs from upwards of 1)'],
  ];
  write(`${DIR}/ekene-alpha-scenario-basis.csv`,
    `${[['id', 'group', 'parameter', 'value', 'unit', 'basis'], ...basis].map((r) => r.map(csvCell).join(',')).join('\n')}\n`);

  // ---------------------------------------------------------------- 34 consequence sheet
  const bin = 'BINDING: FACILITY_DESIGN separator';
  const cv = [
    [at('Source term: Liquid through a hole (Bernoulli)', 'Discharge coefficient Cd'), [D.hole.cd, 'basis B13']],
    [at('Source term: Liquid through a hole (Bernoulli)', 'Hole diameter'), [D.hole.diameterMm, 'basis B12']],
    [at('Source term: Liquid through a hole (Bernoulli)', 'Liquid density'), [D.oil.densityKgM3, 'basis B11 (32 API)']],
    [at('Source term: Liquid through a hole (Bernoulli)', 'Liquid height above the hole'), [D.oil.headM, 'basis B14']],
    [at('Source term: Liquid through a hole (Bernoulli)', 'Pressure above the liquid'), [S.pressureBarA, `${bin} 150 psig (basis B03)`]],
    [at('Source term: Liquid through a hole (Bernoulli)', 'Ambient pressure'), [D.ambientBarA, '1 atm']],
    [at('Source term: Gas through a hole (ideal gas, choked or subsonic)', 'Discharge coefficient Cd'), [D.hole.cd, 'basis B13']],
    [at('Source term: Gas through a hole (ideal gas, choked or subsonic)', 'Hole diameter'), [D.hole.diameterMm, 'basis B12']],
    [at('Source term: Gas through a hole (ideal gas, choked or subsonic)', 'Upstream pressure'), [S.pressureBarA, `${bin} 150 psig (basis B03)`]],
    [at('Source term: Gas through a hole (ideal gas, choked or subsonic)', 'Upstream temperature'), [S.temperatureC, `${bin} 140 degF (basis B05)`]],
    [at('Source term: Gas through a hole (ideal gas, choked or subsonic)', 'Molar mass'), [D.gas.molarMassGMol, 'basis B07 (gas gravity 0.75)']],
    [at('Source term: Gas through a hole (ideal gas, choked or subsonic)', 'Heat capacity ratio gamma'), [D.gas.gamma, 'basis B08']],
    [at('Source term: Gas through a hole (ideal gas, choked or subsonic)', 'Ambient pressure'), [D.ambientBarA, '1 atm']],
    [at('Source term: Pool from a spill', 'Spill volume'), ['The liquid release held for a duration', 'the oil release runs until it is isolated']],
    [at('Source term: Pool from a spill', 'Release duration'), [D.isolationS, 'basis B15']],
    [at('Source term: Pool from a spill', 'Containment'), ['Confined by a bund', 'the drip tray (basis B16)']],
    [at('Source term: Pool from a spill', 'Bund floor area'), [D.dripTray.areaM2, 'basis B16']],
    [at('Source term: Pool from a spill', 'Bund wall height (blank: not checked)'), [D.dripTray.coamingM, 'basis B16 (the coaming)']],
    [at('Dispersion: Release and weather', 'Release rate from'), ['Gas release rate (Source term)', 'the 25 mm gas release']],
    [at('Dispersion: Release and weather', 'Wind speed'), [D.weather.windMS, 'basis B17']],
    [at('Dispersion: Release and weather', 'Dispersion coefficients'), ['Briggs rural, Pasquill-Gifford class', 'open sea: the rural set']],
    [at('Dispersion: Release and weather', 'Pasquill-Gifford stability class'), [D.weather.stability, 'basis B18']],
    [at('Dispersion: Release and weather', 'Release height h'), ['0', 'a release on the deck, measured from the deck']],
    [at('Dispersion: Receptor', 'Downwind distance x'), [String(D.places[0].distanceM), 'the process deck (basis B32)']],
    [at('Dispersion: Receptor', 'Crosswind offset y'), ['0', 'on the centreline']],
    [at('Dispersion: Receptor', 'Receptor height z'), ['0', 'deck level']],
    [at('Dispersion: Receptor', 'Molar mass, for ppm (blank: mg/m3 only)'), [D.gas.molarMassGMol, 'basis B07']],
    [at('Dispersion: Receptor', 'Air temperature, for ppm'), [D.weather.airC, 'basis B19']],
    [at('Dispersion: Receptor', 'Air pressure, for ppm'), [D.ambientBarA, '1 atm']],
    [at('Dispersion: Distance to a concentration', 'Target concentration'), [D.gas.lflPpm, 'the LFL (basis B09)']],
    [at('Dispersion: Distance to a concentration', 'Target unit'), ['ppm', '']],
    [at('Fire: Pool and burning rate', 'Pool diameter from'), ['Pool from spill (Source term)', 'the drip tray pool']],
    [at('Fire: Pool and burning rate', 'Burning rate method'), ['Babrauskas (YB 6.66, Table 6.5)', 'crude oil is not in Table 6.5, so give its coefficients']],
    [at('Fire: Pool and burning rate', 'Heat of combustion'), [D.fire.dHcMJKg, 'basis B24']],
    [at('Fire: Pool and burning rate', 'Give the two coefficients myself instead of a Table 6.5 fuel'), ['yes', 'crude oil']],
    [at('Fire: Pool and burning rate', 'm"inf'), [D.fire.mInf, 'basis B23']],
    [at('Fire: Pool and burning rate', 'k beta (none: independent of D)'), [D.fire.kBeta, 'basis B23']],
    [at('Fire: Flame, emissive power and target', 'Flame length'), ['Thomas with wind (YB 6.12 to 6.14)', 'the wind tilts the flame']],
    [at('Fire: Flame, emissive power and target', 'Air density'), [D.weather.airDensity, 'basis B21']],
    [at('Fire: Flame, emissive power and target', 'Wind speed at 10 m (0: no tilt)'), [D.weather.windMS, 'basis B17']],
    [at('Fire: Flame, emissive power and target', 'Air kinematic viscosity (for tilt)'), [D.weather.airNu, 'basis B22']],
    [at('Fire: Flame, emissive power and target', 'Surface emissive power'), ['Radiative fraction with soot (YB 6.20, 6.71)', 'a smoky crude oil fire']],
    [at('Fire: Flame, emissive power and target', 'Radiative fraction Fs (YB: 0.1 to 0.4)'), [D.fire.fs, 'basis B25']],
    [at('Fire: Flame, emissive power and target', 'Soot fraction (YB: 0.8 for oil products)'), [D.fire.soot, 'basis B25']],
    [at('Fire: Flame, emissive power and target', 'Soot emissive power (blank: 20)'), [D.fire.sootKW, 'Yellow Book']],
    [at('Fire: Flame, emissive power and target', 'Target distance from the pool centre X'), [String(D.fireTargetM), 'the edge of the process deck']],
    [at('Fire: Flame, emissive power and target', 'Transmissivity'), ['A value I give', 'basis B26']],
    [at('Fire: Flame, emissive power and target', 'Transmissivity tau'), [D.fire.tau, 'basis B26']],
    [at('Fire: Distance to a heat flux', 'Target heat flux'), [D.thresholdsKW.escape, 'basis B27; then try 4.7 and 37.5']],
    [at('Explosion: Charge', 'Charge'), ['TNT equivalent of a fuel mass', '']],
    [at('Explosion: Charge', 'Fuel mass in the cloud'), [c.cloudKg, 'basis B31: gas rate x distance to LFL / wind speed']],
    [at('Explosion: Charge', 'Heat of combustion'), [D.gas.heatOfCombustionMJKg, 'basis B10']],
    [at('Explosion: Charge', 'Yield factor (YB: 0.02 to 0.2 in use)'), [D.explosion.yield, 'basis B29']],
    [at('Explosion: Charge', 'TNT blast energy'), [D.explosion.eTntMJKg, 'basis B30']],
    [at('Explosion: Overpressure at a distance (free-air burst)', 'Distance R'), [String(D.places[0].distanceM), 'the process deck']],
    [at('Explosion: Overpressure at a distance (free-air burst)', 'Ambient pressure'), [D.ambientBarA, '1 atm']],
    [at('Explosion: Distance to an overpressure', 'Target overpressure'), ['10', 'Purple Book Figure 5.5: 0.1 barg, harm indoors']],
    [at('Harm: Thermal radiation', 'Preset'), ['purple-book: Y = -36.38 + 2.56 ln(t I^(4/3)), I in W/m2', 'the probit the QRA Studio uses (Purple Book 5.4)']],
    [at('Harm: Thermal radiation', 'Heat flux from'), ['Heat flux at the Fire tab target', 'the edge of the process deck']],
    [at('Harm: Thermal radiation', 'Exposure time t'), [D.exposureS, 'basis B28']],
    [at('Harm: Blast overpressure', 'Preset'), ['hsc: Y = 1.47 + 1.37 ln(P), P in psig', 'the studio default']],
    [at('Harm: Blast overpressure', 'Overpressure from'), ['Overpressure at the Explosion tab distance', 'the process deck']],
  ];
  write(`${DIR}/consequence-studio-inputs.csv`, toCsv(sheetRows(CONSEQUENCE_FIELDS, cv), SYNTHETIC));

  // ---------------------------------------------------------------- 35 LOPA sheet
  const Lp = D.lopa;
  const WS = 'LOPA worksheet';
  const CM = (k) => `LOPA worksheet: Conditional modifiers, row ${k}`;
  const IP = (k) => `LOPA worksheet: Independent protection layers, row ${k}`;
  const SB = (r) => `SIF verification: ${r}`;
  const lv = [
    [at(WS, 'Scenario'), ['Ekene Alpha separator overpressure', '']],
    [at(WS, 'Initiating event'), ['Gas outlet pressure control valve fails closed', 'a blocked gas outlet']],
    [at(WS, 'Consequence'), ['Separator overpressure and rupture on the process deck', '']],
    [at(WS, 'Initiating event frequency (IEF)'), [Lp.iefPerYr, 'basis B54']],
    [at(WS, 'Tolerable mitigated event likelihood (TMEL)'), [D.criteria.tmelPerYr, 'basis B53']],
    [at(CM(1), 'Description'), ['Someone on the process deck', '']],
    [at(CM(1), 'Probability'), [Lp.presence, 'basis B39: the deck is occupied through the day shift']],
    [at(CM(2), 'Description'), ['Fatal injury, given someone is there', '']],
    [at(CM(2), 'Probability'), [Lp.fatalInjury, 'basis B55']],
    [at(IP(1), 'Layer'), ['Separator PSV sized for a blocked gas outlet', '']],
    [at(IP(1), 'PFD'), [Lp.psvPfd, 'basis B56']],
    [at(IP(1), 'Independent'), ['yes', '']],
    [at(IP(1), 'Auditable'), ['yes', '']],
    [at(IP(2), 'Layer'), ['High pressure alarm and operator response', '']],
    [at(IP(2), 'PFD'), [Lp.alarmPfd, 'basis B57']],
    [at(IP(2), 'Independent'), ['no', 'basis B57: same control system as the failed loop']],
    [at(IP(2), 'Auditable'), ['yes', '']],
    [at('SIF verification', 'Attach a SIF to this scenario'), ['yes', '']],
    [at('SIF verification', 'SIF'), ['High pressure trip closing the separator inlet', '']],
  ];
  const subRows = (role, name, s) => [
    [at(SB(role), 'Name'), [name, '']],
    [at(SB(role), 'Architecture'), [s.architecture, '']],
    [at(SB(role), 'lambda DU'), [s.lDU, 'basis B58']],
    ...(s.lDD ? [[at(SB(role), 'lambda DD'), [s.lDD, 'basis B58']]] : []),
    ...(s.mttr ? [[at(SB(role), 'MTTR'), [s.mttr, 'design']]] : []),
    [at(SB(role), 'MRT'), [s.mrt, 'design']],
    ...(s.beta ? [[at(SB(role), 'beta (DU common cause)'), [s.beta, 'design']]] : []),
    ...(s.betaD ? [[at(SB(role), 'beta D (DD common cause)'), [s.betaD, 'design']]] : []),
    [at(SB(role), 'Proof test interval T1'), [s.t1, 'yearly proof test']],
    [at(SB(role), 'Proof test coverage'), ['1', 'a perfect proof test']],
  ];
  lv.push(
    ...subRows('Sensors', 'Separator pressure transmitters', Lp.sensors),
    ...subRows('Logic solver', 'Safety PLC', Lp.logic),
    ...subRows('Final elements', 'Separator inlet shutdown valve', Lp.final),
  );
  write(`${DIR}/lopa-sil-studio-inputs.csv`, toCsv(sheetRows(LOPA_FIELDS, lv), SYNTHETIC));

  // ---------------------------------------------------------------- 36 QRA sheet
  const ET = 'Event tree: Release and ignition';
  const SC = 'Register: Scenarios';
  const LO = 'Register: Locations';
  const PD = 'Register: Probability of death at each location';
  const CB = 'ALARP and cost-benefit: Cost-benefit and gross disproportion';
  const qv = [
    [at(ET, 'Initiating frequency f0'), [D.frequencies.gasPerYr, 'basis B43']],
    [at(ET, 'Immediate ignition from'), ['Purple Book Table 4.5', 'basis B45']],
    [at(ET, 'Release type'), ['Continuous (kg/s)', '']],
    [at(ET, 'Release rate'), [q.rateTyped, 'Episode 34: the gas release rate']],
    [at(ET, 'Substance (PB Table 4.7 reactivity)'), [D.ignition.gasSubstance, 'basis B45']],
    [at(ET, 'Delayed ignition, given no immediate ignition'), [D.ignition.gasDelayed, 'basis B46']],
    [at(ET, 'Ignited cloud split'), ['Purple Book 4.8: flash fire 0.6, explosion 0.4', 'basis B49']],
  ];
  const OUT = { s1: 'jet or pool fire', s2: 'flash fire', s3: 'explosion' };
  const EFFECT = { s1: 'Fire (pool, jet or BLEVE): heat flux', s2: 'Flash fire: inside the flame envelope or not', s3: 'Vapour cloud explosion: peak overpressure', s4: 'Fire (pool, jet or BLEVE): heat flux' };
  QRA_SCENARIOS.forEach((s, i) => {
    const n = i + 1;
    const qs = q.scen[i];
    qv.push([at(SC, `Scenario ${n} name`), [s.name, '']]);
    if (OUT[s.id]) {
      qv.push([at(SC, `Scenario ${n} frequency from`), ['An event tree outcome', '']]);
      qv.push([at(SC, `Scenario ${n} event tree outcome`), [OUT[s.id], '']]);
    } else {
      qv.push([at(SC, `Scenario ${n} frequency from`), ['A frequency I type', '']]);
      qv.push([at(SC, `Scenario ${n} frequency`), [sci(num(qs.frequency), 3), `basis B44 x B47 (the engine's event tree for the oil release)`]]);
    }
    qv.push([at(SC, `Scenario ${n} expected deaths`), [qs.fatalities, 'people present x probability of death, summed over the locations']]);
    qv.push([at(SC, `Scenario ${n} effect`), [EFFECT[s.id], s.id === 's1' ? 'probabilities typed: basis B50' : '']]);
    if (qs.fireDurationS) qv.push([at(SC, `Scenario ${n} fire duration`), [qs.fireDurationS, 'Episode 34: the spill burns out (mass / burning flux / pool area)']]);
  });
  D.places.forEach((p, j) => {
    const n = j + 1;
    qv.push([at(LO, `Location ${n} name`), [p.name, `basis B${32 + j}: ${p.distanceM} m from the separator`]]);
    qv.push([at(LO, `Location ${n} criterion`), ['R2P2, workers (1e-3 and 1e-6 per year)', 'basis B51']]);
    qv.push([at(LO, `Location ${n} period`), [p.period === 'day' ? 'Day (0.93 indoors)' : 'Night (0.99 indoors)', p.period === 'day' ? 'worked through the day shift' : 'off shift']]);
    qv.push([at(LO, `Location ${n} hours per year`), [String(p.hours), `basis B${40 + j}`]]);
  });
  QRA_SCENARIOS.forEach((s) => {
    D.places.forEach((p) => {
      const label = `${s.name} at ${p.name}`;
      const cell = q.cells[s.id][p.id];
      if (cell.typed) {
        qv.push([at(PD, `${label}, probability from`), ['A probability I type', '']]);
        qv.push([at(PD, `${label}, probability of death`), [cell.pd, 'basis B50']]);
        return;
      }
      qv.push([at(PD, `${label}, probability from`), ['Purple Book rule from a dose', '']]);
      if (s.id === 's2') {
        qv.push([at(PD, `${label}, flame envelope`), [q.inside[p.id] ? 'Inside the envelope' : 'Outside the envelope', `Episode 34: LFL reached at ${fx(c.lfl.farDistanceM, 1)} m; this place is at ${p.distanceM} m`]]);
      } else if (s.id === 's3') {
        qv.push([at(PD, `${label}, Peak overpressure (kPa)`), [q.opKPa[p.id], `Episode 34: Kinney and Graham at ${p.distanceM} m`]]);
      } else if (q.underFlame[p.id]) {
        qv.push([at(PD, `${label}, in the flame envelope`), ['yes', `Episode 34: the tilted flame reaches over ${p.distanceM} m`]]);
      } else {
        qv.push([at(PD, `${label}, Heat flux (kW/m2)`), [q.fluxKW[p.id], `Episode 34: solid flame at ${p.distanceM} m`]]);
      }
    });
  });
  qv.push(
    [at('Individual risk: IRPA of the most exposed person', 'Judged against'), ['R2P2, workers (1e-3 and 1e-6 per year)', 'basis B51']],
    [at('Societal risk', 'Exposed hours of the workforce'), [String(q.exposedHours), `${D.pob} on board all year`]],
    [at('Societal risk', 'Criterion'), ['R2P2 para 136: 50 or more deaths, 1 in 5000 per year', 'basis B52']],
    [at(CB, 'Measure'), [D.cba.measure, 'basis B60']],
    [at(CB, 'PLL reduction from'), ['The register PLL less the PLL after the measure', '']],
    [at(CB, 'PLL after the measure'), [sci(num(b.pllAfter), 4), `the same register with delayed ignition ${D.cba.delayedAfter}`]],
    [at(CB, 'Value of preventing a fatality (VPF)'), [D.cba.vpfUsd, 'basis B59 (USD)']],
    [at(CB, 'Life of the measure'), [D.cba.lifeYears, 'basis B60']],
    [at(CB, 'Capital cost at year 0'), [D.cba.capitalUsd, 'basis B60 (USD)']],
    [at(CB, 'Annual cost, net of savings (blank is 0)'), ['0', '']],
    [at(CB, 'Disproportion factor (DF)'), [D.cba.df, 'basis B60']],
    [at(CB, 'Other harms'), ['none', 'remove the three example harms']],
  );
  write(`${DIR}/qra-studio-inputs.csv`, toCsv(sheetRows(QRA_FIELDS, qv), SYNTHETIC));

  // ---------------------------------------------------------------- the quoted numbers
  const Q = {
    gasRate: fx(c.gas.massRateKgS, 3),
    gasRate50: fx(c50.gas.massRateKgS, 2),
    gasTimes: fx(c.gas.massRateKgS / c.gasThroughputKgS, 1),
    liqRate: fx(c.liquid.massRateKgS, 1),
    spill: fx(c.spillM3, 2),
    poolD: fx(c.pool.equivalentDiameterM, 2),
    lfl: fx(c.lfl.farDistanceM, 1),
    deckPpm: f(c.atDeck.concentrationPpm, 2),
    flameL: fx(c.target.flameLengthM, 1),
    tilt: fx(c.target.tiltDeg, 1),
    reach: fx(c.pool.equivalentDiameterM / 2 + c.target.flameLengthM * Math.sin((c.target.tiltDeg * Math.PI) / 180), 1),
    fluxX: fx(c.target.heatFluxWM2 / 1000, 2),
    dEscape: fx(c.toEscape.distanceFromCentreM, 1),
    dPersonnel: fx(c.toPersonnel.distanceFromCentreM, 1),
    thermalP: sci(c.thermal.probability, 2),
    tnt: fx(c.tnt.tntMassKg, 2),
    op10: fx(c.blast[0].op.overpressurePa / 1000, 1),
    d10kPa: fx(c.to10kPa.distanceM, 1),
    burnOut: fx(c.burnOutS / 60, 1),
    lopaF: sci(L.without.mitigatedFrequencyWithoutSifPerYr, 2),
    rrf: f(L.without.requiredRrf, 3),
    reqPfd: f(L.without.requiredSifPfdAvg, 2),
    sifPfd: sci(L.sif.pfdAvg, 3),
    sifRrf: f(L.sif.rrf, 3),
    valvePfd: sci(L.parts[2].pfdAvg, 3),
    fWithSif: sci(L.withSif.mitigatedFrequencyPerYr, 3),
    alarmRrf: f(Lalarm.without.requiredRrf, 3),
    stretchPfd: sci(Lstretch.sif.pfdAvg, 3),
    jet: sci(q.tree.outcomeTotalsPerYr['jet or pool fire'], 2),
    flash: sci(q.tree.outcomeTotalsPerYr['flash fire'], 3),
    expl: sci(q.tree.outcomeTotalsPerYr.explosion, 3),
    noIgn: sci(q.tree.outcomeTotalsPerYr['no ignition'], 4),
    poolFreq: sci(num(q.poolFireFreq), 2),
    lsirDeck: sci(q.lsir[0].r.lsirPerYr, 4),
    irpa: sci(q.irpa.irpaPerYr, 3),
    pll: sci(q.pll.pllPerYr, 4),
    far: f(q.far.far, 3),
    irpaHot: sci(qHot.irpa.irpaPerYr, 3),
    pllAfter: sci(num(b.pllAfter), 4),
    pvBenefit: fx(b.r.presentValueBenefit, 0),
    cbRatio: f(b.r.costToBenefitRatio, 3),
    maxCost: fx(b.r.maximumReasonablyPracticableCost, 0),
  };
  const fnText = q.fn.points.map((p) => `N ${f(p.fatalities, 3)} at ${sci(p.cumulativeFrequencyPerYr, 3)} per year`).join(' and ');

  // ---------------------------------------------------------------- README
  write(`${DIR}/README.md`, [
    '# 14 Process safety: Ekene Alpha separator releases', '',
    `${SYNTHETIC}`, '',
    'One release source, followed through three apps. The source is BINDING on the',
    'facilities design basis: the Ekene Alpha production separator at 150 psig and',
    '140 degF, handling 1000 bopd, 1500 bwpd and 0.45 MMscfd of the field\'s 32 API',
    'oil and 0.75 gravity gas. Every other number is designed for this case and',
    'written, with its source or reason, in `ekene-alpha-scenario-basis.csv`.', '',
    '| File | App | Episode |', '|---|---|---|',
    '| `consequence-studio-inputs.csv` | Consequence Modelling Studio | 34 |',
    '| `lopa-sil-studio-inputs.csv` | LOPA & SIL Studio | 35 |',
    '| `qra-studio-inputs.csv` | QRA Studio | 36 |',
    '| `ekene-alpha-scenario-basis.csv` | every value and its basis | all three |', '',
    'Each input sheet has one row per input: `section` is the tab and panel, `field`',
    'the label the app shows (for the QRA register cells, the label a screen reader',
    'reads), `unit` the unit printed beside it. Type the values in the order given.', '',
    '## The releases', '',
    `- **Gas, 25 mm, separator gas outlet**: ${Q.gasRate} kg/s, choked. That is ${Q.gasTimes} times the`,
    '  separator\'s gas throughput, so the release is fed by the vessel\'s inventory',
    '  and the steady initial rate is the conservative one.',
    `- **Oil, 25 mm, separator oil outlet**: ${Q.liqRate} kg/s for ${D.isolationS} s until isolation,`,
    `  ${Q.spill} m3 into the ${D.dripTray.areaM2} m2 drip tray: a ${Q.poolD} m pool.`, '',
    '## The chain', '',
    'The QRA takes the consequence results as the engine gives them: the gas rate',
    'sets the Purple Book ignition band, the distance to the LFL decides who is',
    'inside the flash fire, the solid-flame model gives the heat flux at each',
    'place, and the TNT charge from the cloud mass gives the overpressure. The',
    'LOPA presence modifier is the QRA manning (the deck is occupied through the',
    'day shift). The gate `tools/demo-dataset/__tests__/domain.processsafety.test.js`',
    'feeds each sheet through the app\'s own study code into the engines and checks',
    'every number the episode notes quote.', '',
    '## What the studios do not model', '',
    '- Jet fires: the Consequence Modelling Studio has no jet fire model, so the jet',
    '  fire\'s probability of death is typed from a stated judgement (basis B50).',
    '- Two-phase (flashing) discharge: the oil is released as a liquid at the',
    '  stock-tank density.',
    '- Dense gas and near-field jet momentum: the Gaussian plume is quoted for',
    '  100 m and beyond, and the cloud here ends inside 15 m, so the distance is an',
    '  extrapolation. It is used because it is what the studio offers.',
    '- Wind direction: every place is taken downwind of the release (conservative).',
    '',
  ].join('\n'));

  // ---------------------------------------------------------------- episodes
  const episodes = [
    {
      n: 34,
      app: 'Consequence Modelling Studio',
      files: [
        [`${DIR}/consequence-studio-inputs.csv`, 'every input, tab by tab, in the app\'s own labels and units'],
        [`${DIR}/ekene-alpha-scenario-basis.csv`, 'where each value comes from'],
        [`${DIR}/README.md`, 'the releases and what the studio does not model'],
      ],
      note: `${SYNTHETIC} `
        + `Set the Source term tab first: both releases start from the separator at ${S.pressureBarA} bar absolute and ${S.temperatureC} C. `
        + `The 25 mm gas hole gives ${Q.gasRate} kg/s, CHOKED, which is ${Q.gasTimes} times the separator's gas throughput. `
        + `Type 50 mm and it becomes ${Q.gasRate50} kg/s, four times as much, because a choked rate follows the hole area; set it back. `
        + `The oil hole gives ${Q.liqRate} kg/s, and held for ${D.isolationS} s it fills the drip tray with ${Q.spill} m3, a ${Q.poolD} m pool. `
        + 'On the Dispersion tab pick the gas release as the rate: the cloud reaches the LFL of 44,000 ppm at '
        + `${Q.lfl} m, so the operator 10 m away stands in ${Q.deckPpm} ppm. `
        + 'Leave the evaporation panel and the toxic harm panel as they open: this gas is sweet and the plume is fed by the gas release. '
        + `On the Fire tab tick the box to give the coefficients yourself (crude oil is not in Table 6.5). The flame is ${Q.flameL} m long and leans ${Q.tilt} degrees, `
        + `so it reaches ${Q.reach} m from the pool centre: type 10 m as the target and the studio refuses, because the target is under the flame. `
        + `At the 15 m target the flux is ${Q.fluxX} kW/m2. 12.5 kW/m2 is reached ${Q.dEscape} m from the pool centre, 4.7 kW/m2 at ${Q.dPersonnel} m, and 37.5 kW/m2 nowhere outside the flame. `
        + `The cloud's ${c.cloudKg} kg at a yield of 0.1 is ${Q.tnt} kg of TNT, ${Q.op10} kPa at 10 m and 10 kPa at ${Q.d10kPa} m. `
        + `On the Harm tab the Purple Book probit gives a ${Q.thermalP} chance of death for 20 s at the 15 m target. `
        + 'Episode 36 takes these numbers as they are.',
    },
    {
      n: 35,
      app: 'LOPA & SIL Studio',
      files: [
        [`${DIR}/lopa-sil-studio-inputs.csv`, 'the separator overpressure scenario and its high pressure trip'],
        [`${DIR}/ekene-alpha-scenario-basis.csv`, 'where each value comes from (rows B53 to B58)'],
      ],
      note: `${SYNTHETIC} `
        + 'Add a scenario, then set the IEF and TMEL first: a pressure control valve failing closed at 0.1 per year, against a TMEL of 1e-5 per year for one fatality. '
        + 'The presence modifier of 0.5 is the QRA manning: someone is on the process deck through the 12 hour day shift. '
        + `Enter both layers. The PSV is credited; the high pressure alarm is left unticked as independent, because it runs in the same control system as the valve that failed. The worksheet then reads ${Q.lopaF} per year without a SIF, a required RRF of ${Q.rrf}, SIL 1, and a required SIF PFDavg of ${Q.reqPfd}. `
        + `Tick the alarm as independent to show why it matters: the required RRF falls to ${Q.alarmRrf} and the studio says the risk reduction is below SIL 1. Untick it again. `
        + `On SIF verification the trip reads a PFDavg of ${Q.sifPfd} (RRF ${Q.sifRrf}, SIL 1). The shutdown valve alone contributes ${Q.valvePfd}, so the valve decides the answer. `
        + `With the SIF the scenario reaches ${Q.fWithSif} per year and meets the TMEL. `
        + `For the proof test beat, stretch the valve's interval to 70080 h (8 years): the SIF reads ${Q.stretchPfd}, above the required ${Q.reqPfd}, and the scenario no longer meets the TMEL.`,
    },
    {
      n: 36,
      app: 'QRA Studio',
      files: [
        [`${DIR}/qra-studio-inputs.csv`, 'the event tree, the register, the criteria and one cost-benefit test'],
        [`${DIR}/ekene-alpha-scenario-basis.csv`, 'frequencies, ignition, manning and criteria with their basis'],
        [`${DIR}/consequence-studio-inputs.csv`, 'Episode 34, where every dose in the register comes from'],
      ],
      note: `${SYNTHETIC} `
        + 'Remove the opening register\'s scenarios and locations, then set the Event tree tab first, because three of the four scenarios take their frequency from it. '
        + `The gas release rate is Episode 34's ${q.rateTyped} kg/s, which puts it in the smallest Purple Book band: immediate ignition 0.02. `
        + `From 2e-4 per year the tree gives a jet fire at ${Q.jet}, a flash fire at ${Q.flash}, an explosion at ${Q.expl} and no ignition at ${Q.noIgn} per year. `
        + `The oil pool fire is typed at ${Q.poolFreq} per year (1e-4 x 0.065). `
        + `Every dose in the register is Episode 34's: the process deck is inside the ${Q.lfl} m flash fire and under the pool fire's flame; the explosion reaches ${Q.op10} kPa there, below the Purple Book's 30 kPa, so it kills nobody outdoors. `
        + `The process deck's LSIR is ${Q.lsirDeck} per year. The operator's IRPA is ${Q.irpa} per year: TOLERABLE against R2P2 for workers, so ALARP must be shown. `
        + `PLL is ${Q.pll} deaths per year and the FAR ${Q.far}. The F-N curve is two points, ${fnText}, far below the R2P2 point of 50 deaths at 1 in 5000. `
        + `For a wrong-input check, type 0.3 for delayed ignition: the IRPA rises to ${Q.irpaHot}; set it back. `
        + `Last, the cost-benefit: a second gas detector halving delayed ignition leaves a PLL of ${Q.pllAfter}. Over 20 years at a VPF of USD 2 million the benefit is USD ${Q.pvBenefit}, `
        + `the cost to benefit ratio ${Q.cbRatio}, and the most the measure could reasonably cost at a DF of 3 is USD ${Q.maxCost}: GROSSLY_DISPROPORTIONATE, so the USD 150,000 detector is not required on risk grounds.`,
    },
  ];

  say(`  process safety: gas ${Q.gasRate} kg/s choked, oil ${Q.liqRate} kg/s, LFL at ${Q.lfl} m, 12.5 kW/m2 at ${Q.dEscape} m`);
  say(`  process safety: LOPA SIL 1 (RRF ${Q.rrf}), SIF PFDavg ${Q.sifPfd}; QRA IRPA ${Q.irpa} per year, PLL ${Q.pll}`);

  return {
    episodes,
    folders: [[DIR, 'process safety: the Ekene Alpha separator releases through consequence modelling, LOPA and QRA (synthetic)']],
    quoted: Q,
  };
}
