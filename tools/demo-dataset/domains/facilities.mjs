// Wave D8: the Facilities domain (episodes 30 to 33, kit folder 13-facilities).
//
// Ekene Alpha's process, sized to d8spine FACILITY_DESIGN (binding: the
// process safety domain takes its release conditions from the same basis)
// with fluid properties derived from the LOCKED spine. Every Facilities app
// is typed input only, so the kit carries one input sheet per app, written
// in the app's own on-screen labels and units, and the episode notes quote
// what the ENGINE returns for exactly those values. Nothing is quoted that
// was not computed here; the gate re-runs the same sheets through the apps'
// own context providers.
//
// Helpers live in ./facilities/ (the hook loads every *.mjs in this folder
// directly, so they cannot sit beside this file).

import { LOCKED } from '../spine.mjs';
import {
  FD, designValues, designBasisRows, streamRows, GAS_COMPOSITION,
} from './facilities/basis.mjs';
import {
  SEPARATOR, LINE, PWT, CORROSION, EMPTY, applyRows, toCsv, SHEET_HEADERS, sheetPath,
  evaluateSeparator, evaluateLine, evaluatePwt, evaluateCorrosion,
} from './facilities/apps.mjs';
import { headlines, NEGATIVE } from './facilities/headlines.mjs';

const FOLDER = '13-facilities';

export async function build(ctx) {
  const { write, say, assertClose } = ctx;
  const fx = (v, d) => v.toFixed(d);
  const V = designValues({ assertClose });

  // ---- 1. design basis ---------------------------------------------------
  const basis = [
    ...designBasisRows(V, fx),
    ...streamRows(V).map(([id, desc, phase, rate, unit, p, t, src]) => [
      'stream table', `${id} ${desc} (${phase})`, String(rate), unit, src.startsWith('d8spine') ? 'd8spine' : src,
      [p !== '' ? `${p} psig` : '', t !== '' ? `${t} degF` : ''].filter(Boolean).join(', ') + (src.startsWith('d8spine;') || src.includes('designed') ? `; ${src}` : ''),
    ]),
  ];
  write(`${FOLDER}/ekene-alpha-design-basis.csv`, toCsv(['group', 'item', 'value', 'unit', 'source', 'note'], basis));

  // ---- 2. sheets, each run through the app's arithmetic -------------------
  const gas = { co2MolPct: GAS_COMPOSITION.CO2, h2sMolPct: GAS_COMPOSITION.H2S };
  const EVAL = {
    [SEPARATOR.slug]: evaluateSeparator, [LINE.slug]: evaluateLine,
    [PWT.slug]: evaluatePwt, [CORROSION.slug]: evaluateCorrosion,
  };
  const results = {};
  for (const app of [SEPARATOR, LINE, PWT, CORROSION]) {
    const rows = app.rows(V, gas);
    write(sheetPath(app), toCsv(SHEET_HEADERS, rows));
    const { inputs } = applyRows(app, rows, EMPTY[app.slug]);
    const r = EVAL[app.slug](inputs);
    if (r.error) throw new Error(`ASSERT ${app.app}: the Ekene sheet is refused: ${r.error}`);
    // Negative control: one wrong input moves the headline past tolerance.
    const neg = NEGATIVE[app.slug];
    const badRows = rows.map((row) => (`${row[0]}|${row[1]}` === neg.key ? [row[0], row[1], neg.value, row[3], row[4]] : row));
    const bad = EVAL[app.slug](applyRows(app, badRows, EMPTY[app.slug]).inputs);
    neg.check(r, bad);   // throws when the wrong input does NOT move the answer
    results[app.slug] = { rows, r, bad, h: headlines(app.slug, r, bad, V) };
  }

  // What the notes claim in words, asserted.
  {
    const r = results[SEPARATOR.slug].r;
    const inBand = r.sweep.rows.filter((row) => row.inRange);
    if (inBand.length !== 1) throw new Error(`ASSERT facilities: the separator family has ${inBand.length} rows in band; the note says one`);
    if (r.controlling !== 'liquid-retention') throw new Error(`ASSERT facilities: separator controlled by ${r.controlling}; the note says liquid retention`);
    const gasRows = results[SEPARATOR.slug].rows.map((row) => (row[1] === 'Gas (MMscfd)' ? [row[0], row[1], String(FD.gas_mmscfd * 2), row[3], row[4]] : row));
    const g2 = evaluateSeparator(applyRows(SEPARATOR, gasRows, EMPTY[SEPARATOR.slug]).inputs);
    assertClose('facilities: doubling the gas leaves the vessel diameter as it is', g2.diameterFt, r.diameterFt, 1e-12);
    assertClose('facilities: doubling the gas leaves the vessel length as it is', g2.lengthFt, r.lengthFt, 1e-9);
    const st = results[LINE.slug].r.profile.stations;
    if (!(st[1].pPsia > st[0].pPsia)) throw new Error('ASSERT facilities: the note says the pressure climbs down the riser');
    if (results[LINE.slug].r.sizing.regime !== 'laminar') throw new Error('ASSERT facilities: the note says the export flow is laminar');
    const w = results[LINE.slug].r.wall;
    if (!w.pass) throw new Error('ASSERT facilities: the note says schedule 80 passes');
    const c = results[CORROSION.slug].r;
    if (c.sour.sour !== false || c.rate.controlling !== 'mass transfer' || c.life.meetsDesignLife !== true) {
      throw new Error('ASSERT facilities: the corrosion note says sweet, mass transfer controlled and meeting the design life');
    }
    const t = results[PWT.slug].r.result;
    if (!(t.complete && t.meetsSpec && t.stages[0].outletOiwPpm < t.specPpm)) throw new Error('ASSERT facilities: the PWT note says the hydrocyclone alone is under the limit and the train meets it');
  }

  // Cross-application consistency, asserted: the same water in three apps.
  const sepRows = results[SEPARATOR.slug].rows;
  const corRows = results[CORROSION.slug].rows;
  const cell = (rows, field) => Number(rows.find((r) => r[1] === field)[2]);
  assertClose('facilities: separator water SG is the PWT brine density (to the typed 3 decimals)', cell(sepRows, 'Water SG') * 62.4 * 16.0185, results[PWT.slug].r.fluid.rhoWater, 0.0005 * 62.4 * 16.0185);
  assertClose('facilities: corrosion density is the PWT brine density (to the typed 2 decimals)', cell(corRows, 'Density (lb/ft3)') * 16.0185, results[PWT.slug].r.fluid.rhoWater, 0.005 * 16.0185);
  assertClose('facilities: profile arrival equals inlet less the single-line drop',
    results[LINE.slug].r.profile.p2Psia, 114.7 - results[LINE.slug].r.sizing.dpTotalPsi, 0.05);

  const H = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.h]));

  // ---- 3. README ------------------------------------------------------------
  const sep = H[SEPARATOR.slug];
  const line = H[LINE.slug];
  const pwt = H[PWT.slug];
  const cor = H[CORROSION.slug];
  write(`${FOLDER}/README.md`, `${[
    '# 13-facilities: Ekene Alpha process design basis', '',
    `Ekene Alpha separates, exports and treats the Ekene field's production. The design rates are the Wave D8 facilities basis: ${FD.oil_bopd} bopd oil, ${FD.water_bwpd} bwpd produced water, ${FD.gas_mmscfd} MMscfd gas and ${FD.water_injection_bwpd} bwpd water injection, with the separator at ${FD.separator_pressure_psig} psig and ${FD.separator_temperature_f} degF. The Process Safety episodes take their release conditions from the same basis.`, '',
    `The fluids are the field's own: ${LOCKED.api} API oil, gas gravity ${LOCKED.gas_sg}, ${LOCKED.rsi_scf_stb} scf/stb, ${LOCKED.salinity_ppm.toLocaleString('en-US')} ppm brine. Every value in \`ekene-alpha-design-basis.csv\` says where it came from: \`spine\` (the locked field), \`d8spine\` (the shared facilities basis) or \`designed\` (new here, with the reason in the note column).`, '',
    '## Files', '',
    '| File | Application | Episode |',
    '|---|---|---|',
    '| `ekene-alpha-design-basis.csv` | the stream table and every design value | all four |',
    `| \`${SEPARATOR.slug}-inputs.csv\` | ${SEPARATOR.app} | 30 |`,
    `| \`${LINE.slug}-inputs.csv\` | ${LINE.app} | 31 |`,
    `| \`${PWT.slug}-inputs.csv\` | ${PWT.app} | 32 |`,
    `| \`${CORROSION.slug}-inputs.csv\` | ${CORROSION.app} | 33 |`, '',
    'Each input sheet has the columns `section, field, value, unit, source`. `field` is the label on screen and `section` is where it sits. Type the rows top to bottom. A blank value means leave the box empty.', '',
    '## What the applications return for these sheets', '',
    `- Separator: a ${sep.diameter} ft by ${sep.length} ft horizontal three-phase vessel (L/D ${sep.ld}), set by ${sep.controlling}.`,
    `- Export line: ${line.dpFriction} psi of friction over ${FD.export_line_length_km} km, ${line.dpTotal} psi in all, arrival at ${line.arrival} psia; required wall ${line.tReq} in against 0.337 in.`,
    `- Produced water: ${pwt.outlet} ppm oil in water overboard against a ${pwt.spec} ppm limit.`,
    `- Water line corrosion: ${cor.rate} mm/yr inhibited, a remaining life of ${cor.life} years on the 3 mm allowance.`, '',
    'The gas composition was designed for this kit: its molar mass gives the field gas gravity of 0.75 within 0.1 percent, and the generator refuses to write the kit if it does not.',
  ].join('\n')}\n`);

  // ---- 4. episodes --------------------------------------------------------
  const basisFile = [`${FOLDER}/ekene-alpha-design-basis.csv`, 'the design basis: rates, conditions, fluid properties and where each one came from'];
  const episodes = [
    { n: 30, app: SEPARATOR.app, files: [
      [sheetPath(SEPARATOR), 'every box on the Separator tab, top to bottom'],
      basisFile,
    ], note: 'Separator tab. Set Vessel type to Horizontal, three phase FIRST: that is what shows the water retention, viscosity and droplet boxes. '
      + `Then type the sheet. The conditions card reads z ${sep.z} and a derated K of ${sep.k} ft/s. `
      + `The studio selects ${sep.diameter} ft by ${sep.length} ft, L/D ${sep.ld}, the only row of the family inside the 3 to 5 band. `
      + `The length is set by ${sep.controlling}: five minutes of oil and water needs ${sep.lengthLiquid} ft, while the gas needs only ${sep.lengthGas} ft. `
      + `That is the beat of this episode: at this gas to liquid ratio the gas rate barely matters, and doubling it to ${fx(FD.gas_mmscfd * 2, 2)} MMscfd leaves the vessel exactly as it is. `
      + `The liquid rate is what sizes it. Type the injection rate by mistake (Water ${FD.water_injection_bwpd} bpd) and the selection moves to ${sep.negDiameter} ft by ${sep.negLength} ft. `
      + `The droplet checks pass with room: a 500 um water drop falls through the oil in ${sep.waterFall} s and a 200 um oil drop rises through the water in ${sep.oilRise} s, against ${sep.residence} s of residence.` },
    { n: 31, app: LINE.app, files: [
      [sheetPath(LINE), 'the Line Sizing, Profile and Wall Thickness boxes, section by section'],
      basisFile,
    ], note: 'Set Line service to Liquid (single phase) FIRST, then Pipe source, NPS 4 and Schedule 80; the bore reads 3.826 in. '
      + `The export crude is dead oil at the seabed, ${fx(V.muExport, 2)} cp. At ${FD.oil_bopd} bopd the velocity is ${line.v} ft/s and the Reynolds number ${line.re}, so the flow is laminar and the friction drop over ${FD.export_line_length_km} km is ${line.dpFriction} psi. `
      + `The line ends 15 m lower than it starts, which gives back ${line.dpElevGain} psi, so the total is ${line.dpTotal} psi. `
      + `On the Profile tab, type the three segments (riser, seabed run, landfall) and the 100 psig pump discharge: the pressure rises on the way down the riser, and the crude arrives at the terminal at ${line.arrival} psia. `
      + `Type the total liquid by mistake (${line.negRate} bpd, oil and water together) and the friction drop goes to ${line.negFriction} psi. `
      + `Wall Thickness tab: B31.4, X52, 1440 psig and a 0.118 in allowance need ${line.tReq} in of wall (${line.tPressure} in for pressure). The schedule 80 wall of 0.337 in passes, and its MAOP is ${line.maop} psig.` },
    { n: 32, app: PWT.app, files: [
      [sheetPath(PWT), 'the water, the train and the two devices in use'],
      basisFile,
    ], note: `A new study opens with the conventional example; overwrite it with the sheet. The Flow box takes barrels a day and the equipment boxes are metric (${fx(FD.water_bwpd * 0.158987294928 / 24, 2)} m3/h through the liners). `
      + `Set the train FIRST: Primary None, Secondary De-oiling hydrocyclone, Tertiary Walnut shell filter. `
      + `The limit is ${V.specMgL} mg/l, which is ${pwt.spec} ppm against this brine at ${fx(V.water.rhoKgM3, 1)} kg/m3; the studio wants ppm, so type ${pwt.spec}. `
      + `Five liners carry the water at ${pwt.turndown} of their design flow and cut at ${pwt.hcCut} um, leaving ${pwt.afterHc} ppm: under the limit by only ${pwt.hcMargin} ppm. `
      + `The walnut shell filter polishes it to ${pwt.outlet} ppm (${pwt.removal} percent removed overall), a margin of ${pwt.margin} ppm. `
      + `Then drop the inlet d50 to 10 um, the shear a throttled level valve can do, and the train leaves ${pwt.negOutlet} ppm and fails. The droplet size matters more than the equipment list.` },
    { n: 33, app: CORROSION.app, files: [
      [sheetPath(CORROSION), 'the Corrosion Rate, Sour Service and Integrity boxes'],
      basisFile,
    ], note: 'The line is the produced water line from the separator to the treatment train, at separator pressure and temperature. '
      + `The CO2 and H2S come from the separator gas composition in the design basis (${GAS_COMPOSITION.CO2} mol % CO2, ${GAS_COMPOSITION.H2S} mol % H2S). `
      + `The predicted rate is ${cor.rate} mm/yr (${cor.category}), from ${cor.uninhibited} mm/yr uninhibited. Mass transfer controls: ${cor.vm} mm/yr against a reaction rate of ${cor.vr} mm/yr, so line size and velocity are the levers on this line. `
      + `Sour Service: H2S partial pressure ${cor.ph2sPsia} psia, below the screening threshold. `
      + `Integrity tab: the 0.118 in (3 mm) allowance lasts ${cor.life} years against a 25 year design life, which needs only ${cor.needMm} mm. `
      + `Now set the inhibitor Efficiency to 0: the rate becomes ${cor.negRate} mm/yr, the allowance lasts ${cor.negLife} years and the line is short by ${cor.negShort} mm. The inhibitor is what makes carbon steel work here.` },
  ];
  say(`  facilities: separator ${sep.diameter} x ${sep.length} ft (${sep.controlling}), export drop ${line.dpTotal} psi, overboard ${pwt.outlet} ppm, corrosion ${cor.rate} mm/yr`);
  return {
    episodes,
    folders: [[FOLDER, 'Ekene Alpha facilities: design basis and the input sheets for the Separator, Pipeline, Produced Water and Corrosion studios (episodes 30 to 33)']],
  };
}
