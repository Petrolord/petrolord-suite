// Ekene demonstration dataset — the spine.
// ============================================================================
// Every constant the kit is generated from. Two kinds live here and they are
// NOT interchangeable:
//
//   LOCKED    copied from packages/engines/test-data/ekene-dynamic/field.json
//             and packages/engines/tools/ekene-dynamic/generate.mjs. Ten
//             NextGen courses and the engine test suite teach off these.
//             Changing one here is a lie, not a tweak.
//   DESIGN    new to this kit (the additive extension of DemoDataset-PLAN
//             §4). Free to change, as long as the gates in §6 still pass.
//
// Plan of record: docs/scope/DemoDataset-PLAN.md
// ============================================================================

// ---------------------------------------------------------------- LOCKED ---

export const LOCKED = {
  field: 'Ekene',
  owc_m: 1560,                       // MD below KB; wells 1-7 are vertical
  oil_cells: 169,                    // at 100 m cell, pad 2, maxExtrap 800
  cell_size_m: 100,
  max_oil_column_m: 20.2818603515625,
  stoiip_stb: 12139208.107496763,
  ntg: 0.8,
  phi: 0.2,
  swi: 0.35,
  boi_rb_stb: 1.2,
  // PVT / reservoir state
  pi_psia: 3200,
  pb_psia: 2000,
  temp_f: 180,
  api: 32,
  gas_sg: 0.75,
  salinity_ppm: 35000,
  rsi_scf_stb: 400,
  bw_rb_stb: 1.02,
  // SCAL
  kr: { Swc: 0.35, Sor: 0.25, krwMax: 0.3, kroMax: 0.9, nw: 2.5, no: 2.0 },
  jTrue: { type: 'power', a: 0.25, b: 1, Swirr: 0.25 },
  k_md: 250,
  sigma_dyncm: 26,
  thetaDeg: 30,
  gammaW: 1.03,
  // timeline
  production_start: '2020-01-01',
  flood_start: '2023-01-01',
  history_end: '2025-12-01',
};

// The six development wells. Coordinates and picks are LOCKED — they are the
// control points the NG5 volumetrics are gridded from.
export const LOCKED_WELLS = [
  { name: 'Ekene-1', x: 1000, y: 1000, top_sand: 1548, base_sand: 1580, role: 'producer' },
  { name: 'Ekene-2', x: 2200, y: 1150, top_sand: 1565, base_sand: 1601, role: 'injector' },
  { name: 'Ekene-3', x: 1400, y: 2300, top_sand: 1541, base_sand: 1570, role: 'producer' },
  { name: 'Ekene-4', x: 2600, y: 2500, top_sand: 1590, base_sand: 1615, role: 'injector' },
  { name: 'Ekene-5', x: 600,  y: 1900, top_sand: 1552, base_sand: 1583, role: 'producer' },
  { name: 'Ekene-6', x: 1900, y: 1800, top_sand: 1546, base_sand: 1580, role: 'producer' },
];

// The NG7 blind-test appraisal well: the six-well grid predicts 1543.3271484375
// at this location and the well actually found 1549. That 5.67 m residual is
// the lesson, so the value is locked too.
export const LOCKED_E7 = { name: 'Ekene-7', x: 1500, y: 1500, top_sand: 1549 };

export const GRID = { cell_m: 100, pad_cells: 2, max_extrapolation_m: 800 };

// ---------------------------------------------------------------- DESIGN ---

export const FRAME = {
  crs: 'EPSG:32632',
  crs_name: 'WGS 84 / UTM zone 32N',
  // Origin is a multiple of the 100 m cell, so the gridded surface is a pure
  // translation of the locked one and the volumetrics reproduce bit for bit.
  origin_e: 400000,
  origin_n: 520000,
  kb_m: 25,             // KB elevation above MSL (platform)
  water_depth_m: 35,
  seawater_sg: 1.03,
  get mudline_md() { return this.kb_m + this.water_depth_m; },   // 60 m MD
  td_md: 2250,
  sample_step_m: 0.1524, // 0.5 ft
  seabed_temp_f: 77,
  operator: 'Petrolord Demonstration Data',
  licence: 'Block EK-11 (fictional acreage)',
  country: 'Nigeria (fictional offshore)',
};

// Temperature gradient is solved, not assumed: it is whatever puts the LOCKED
// 180 degF at the LOCKED contact.
export const TEMP_GRAD_F_PER_M =
  (LOCKED.temp_f - FRAME.seabed_temp_f) / (LOCKED.owc_m - FRAME.kb_m);

// Stratigraphy, as depths at Ekene-1 (m MD below KB). Every other well gets
// these through the structural model in geology.mjs. `alpha` is how much of
// the Ekene Sand's structural relief this surface carries: a drape anticline
// over a deeper growth structure, so relief grows with depth.
export const HORIZONS = [
  { key: 'SEABED',   name: 'Seabed',              e1: 60,   alpha: 0,    age_ma: 0,    type: 'seabed' },
  { key: 'BENIN',    name: 'Benin Formation',     e1: 350,  alpha: 0.15, age_ma: 2.6,  type: 'formation' },
  { key: 'AGBADA',   name: 'Agbada Formation',    e1: 1150, alpha: 0.35, age_ma: 5.3,  type: 'formation' },
  { key: 'OGBIA',    name: 'Ogbia Shale',         e1: 1290, alpha: 0.55, age_ma: 12.5, type: 'mfs' },
  { key: 'TOP_SAND', name: 'Ekene Sand',          e1: 1548, alpha: 1,    age_ma: 14.8, type: 'sb' },
  { key: 'BASE_SAND',name: 'Ekene Sand Base',     e1: 1580, alpha: 1,    age_ma: 15.4, type: 'base' },
  { key: 'OBORO_U',  name: 'Oboro Unconformity',  e1: 1790, alpha: 1.35, age_ma: 16.4, type: 'unconformity', hiatus_end_ma: 20.5 },
  { key: 'OBORO',    name: 'Oboro Sand',          e1: 1845, alpha: 1.45, age_ma: 21.0, type: 'sb' },
  { key: 'OBORO_B',  name: 'Oboro Sand Base',     e1: 1912, alpha: 1.45, age_ma: 22.2, type: 'base' },
  { key: 'AKATA',    name: 'Akata Formation',     e1: 2080, alpha: 1.7,  age_ma: 28.0, type: 'formation' },
];

export const horizonByKey = Object.fromEntries(HORIZONS.map((h) => [h.key, h]));

// The deeper reservoir. Gas, which is what gives the Petrophysics episode a
// real density-neutron crossover and the field a second target.
export const OBORO = {
  gwc_m: 1935,          // MD below KB at Ekene-1; a contact, so it is flat in TVDSS
  gas_gravity: 0.68,
  temp_f_at_gwc: null,  // solved from the gradient
  phi: 0.19,
  ntg: 0.72,
  k_md: 180,
  swirr: 0.22,
};

// v3's growth fault: a vertical step on a straight trace (the DC22
// sealing-fault what-if sits at x = 1800). Since kit v4 it lives on only in
// the well-control model (geology.mjs makeWellControl), which gives every
// well its v3 tops bit for bit; the structure the seismic and the maps are
// built from is STRUCTURE below. Its east-side throw is the Ekene East Fault's.
export const FAULT = {
  name: 'Ekene Growth Fault',
  x_at_top_sand: 1800,
  strike_deg: 20,        // N20E, downthrown to the east (basinward)
  dip_deg: 65,
  // (depth m MD, throw m). Zero at and above the Ekene Sand base.
  throw_profile: [
    [1580, 0], [1700, 12], [1790, 28], [1845, 38], [2080, 72], [2250, 90],
  ],
};

// Added wells (DemoDataset-PLAN §4.3). TOP_SAND picks for 8, 9 and 10 are
// SAMPLED from the six-well grid at generation time, never typed here.
export const ADDED_WELLS = [
  {
    name: 'Ekene-7', x: 1500, y: 1500, kind: 'vertical',
    purpose: 'appraisal; the NG7 blind test',
    top_sand: LOCKED_E7.top_sand, curves: 'full', td: 1700,
  },
  {
    name: 'Ekene-8', x: 2050, y: 2150, kind: 'deviated',
    purpose: 'Oboro producer', curves: 'full', td: 2250,
  },
  {
    name: 'Ekene-9', x: 1150, y: 2050, kind: 'deviated',
    purpose: 'Oboro producer; no density, for the Gardner beat',
    curves: 'no_density', td: 2200,
  },
  {
    name: 'Ekene-10', x: 1750, y: 1150, kind: 'deviated',
    purpose: 'Oboro producer; carries the lithology log and core photographs',
    curves: 'full_plus_litho', td: 2250,
  },
  {
    name: 'Ekene-11', x: 2250, y: 1750, kind: 'planned',
    purpose: 'the well Episode 10 designs', curves: 'none', td: 2100,
  },
  {
    name: 'Ekene-12', x: 1300, y: 1250, kind: 'survey_only',
    purpose: 'second pad wellbore; the anti-collision neighbour',
    curves: 'none', td: 1900,
  },
];

// Surface location of the platform every deviated well is drilled from.
export const PLATFORM = { name: 'Ekene Alpha', x: 1700, y: 1600 };

// Log suite. Mnemonics follow the Petrophysics Studio pipeline inputs.
export const CURVES = {
  // v3: DTS (dipole shear) after DT wherever there is a sonic
  full:            ['CALI', 'GR', 'SP', 'RHOB', 'DRHO', 'NPHI', 'DT', 'DTS', 'RT', 'RXO', 'PEF'],
  full_plus_litho: ['CALI', 'GR', 'SP', 'RHOB', 'DRHO', 'NPHI', 'DT', 'DTS', 'RT', 'RXO', 'PEF', 'LITH'],
  no_density:      ['CALI', 'GR', 'DT', 'DTS', 'RT'],
  none:            [],
};

// Petrophysical model constants (DESIGN).
export const PETRO = {
  gr_clean: 18, gr_shale: 125,       // API; GR is LINEAR in Vsh, so the linear
                                     // Vsh model recovers the plant exactly
  rho_ma_sand: 2.65, rho_ma_shale_add: 0.08,
  rho_brine: 1.03, rho_oil: 0.75, rho_gas: 0.25,
  nphi_shale_excess: 0.30, nphi_gas_factor: 0.65,
  pef_sand: 1.81, pef_shale: 3.10,
  archie: { a: 1, m: 2, n: 2 },
  r_shale: 3.2,                      // ohm-m, the shale conductivity term
  dt_matrix_us_ft: 55.5,             // sand matrix; also the Eaton matrix value
  dt_mudline_us_ft: 200,
  compaction_c_per_m: 0.00042,       // normal compaction constant
  sxo_oil: 0.75, sxo_gas: 0.45,      // flushed-zone saturations
  rmf_ohm_m_at_75f: 1.2,
  bit_sizes: [[0, 150, 26], [150, 600, 26], [600, 1250, 17.5], [1250, 1700, 12.25], [1700, 3000, 8.5]],
};

// Pressure design. The prognosis has to land on the LOCKED Pi, so the target
// is solved from it rather than chosen.
export const PRESSURE = {
  datum_md: LOCKED.owc_m,            // the contact is the reservoir datum
  ramp_top_md: 1290,                 // Ogbia Shale: top of the pressure ramp
  emw_at_td_ppg: 14.6,
  poisson: 0.30,
  eaton_exponent: 3,
  casing: [
    { size_in: 30,     shoe_md: 150 },
    { size_in: 20,     shoe_md: 600 },
    // shoes placed so every open-hole section is drillable on the designed
    // pore and fracture profile (generate.mjs section 11 asserts it)
    { size_in: 13.375, shoe_md: 1450 },
    { size_in: 9.625,  shoe_md: 1800 },
    { size_in: 7,      shoe_md: 2250, liner: true },
  ],
};

// Seismic survey (DESIGN). Sized so the small volume decodes inside a take.
export const SEISMIC = {
  bin_m: 25,
  inline_azimuth_deg: 20,            // parallel to the fault strike
  // v4: the survey reaches 40 crosslines further landward (1960-1999), so the
  // growth fault's footwall is a third of every dip line; every line number
  // still sits where it did in v3 (the anchor below fixes the lattice)
  anchor: { il: 1000, xl: 2000, half_m: 1587.5 },
  full:  { nInline: 128, nXline: 168, il0: 1000, xl0: 1960, format: 1 },  // IBM float
  // the on-camera subset: the fault, its footwall and the crest
  small: { nInline: 32,  nXline: 64,  il0: 1038, xl0: 1992, format: 5 },  // IEEE float
  // v4: 3.5 s, so the main fault visibly soles into the Akata detachment
  // (about 2.4 s) inside the record; v3 was 2400 ms
  t_max_ms: 3500,
  dt_ms: 4,
  // the dominant frequency falls from 30 Hz at the seabed to 18 Hz at 2400 ms
  // and stays there (the v3 wavelet, unchanged over the v3 record)
  wavelet: { type: 'ricker', f_dom_hz: 30, f_dom_deep_hz: 18, ramp_ms: 2400 },
  // v4 file names carry the version, so v3 and v4 volumes can sit side by
  // side in one Seismolord project (an import skips a name already listed)
  file_prefix: 'EKENE3D-v4',
  // v4: band-limited random noise at this S/N (15 dB) against the signal rms over
  // the 800-2000 ms window at Ekene-1 (v3: 14 dB against the whole trace)
  noise_db: 15,
  replacement_velocity_m_s: 1600,
  // v3: elastic products. Angles in degrees; every stack is the mean exact
  // Zoeppritz coefficient over its range in 1 degree steps.
  qi: {
    full_deg: [0, 30],
    stacks: [['near', 5, 15], ['mid', 15, 25], ['far', 25, 35]],
    mute_deg: 40,
    // NMO-corrected offset gathers over the wells' part of the survey
    gathers: { il0: 1020, xl0: 2030, nInline: 64, nXline: 64, offset0_m: 100, offsetStep_m: 200, nOffset: 13, t_max_ms: 1900 },
  },
};

// Elastic design (v3, QI). The brine-filled shear trend of the Ekene field:
// Vs = a*Vp + b in km/s per end member, mixed on Vsh the Greenberg-Castagna
// way. The shale line is the published GC shale line; the sand line sits
// above GC sandstone (0.80416, -0.85588) by about 4.5% at 3 km/s, the
// difference a local calibration on a measured DTS finds.
export const ELASTIC = {
  trend: { sand: [0.835, -0.880], shale: [0.76969, -0.86735] },
};

// Kit v4 structure (DESIGN): the Niger Delta growth fault, its rollover and
// the faults around the crest. structure.mjs builds it; the gates in
// __tests__/structure.test.js hold it to the wells and to the trap.
export const STRUCTURE = {
  // the field frame rotated to the fault: a along strike, b down dip (basinward)
  frame: { cx: 1600, cy: 1750, strike_deg: 20 },
  main_fault: {
    name: 'Ekene Growth Fault',
    // trace at the tip: b0(a) = trace_b0 + trace_k (a - trace_a0)^2, arcuate
    // and concave to the basin, closest to the field's west edge mid-survey
    trace_b0: -1550, trace_k: 1.2e-4, trace_a0: 200,
    trace_wiggle_m: 18,             // so the trace is not a perfect parabola
    tip_md: 105,                    // about 100 ms TWT
    dip_top_deg: 78,                // listric: dip(z) = 78 / (1 + exp((z - 2200) / 300))
    flatten_mid_md: 2200,
    flatten_width_m: 300,
    sole_md: 2750,                  // the Akata detachment
    // heave (m) each horizon has moved, older horizons further: growth
    heave_m: { BENIN: 3, AGBADA: 10, OGBIA: 16, TOP_SAND: 26, BASE_SAND: 28, OBORO_U: 40, OBORO: 58, OBORO_B: 64, AKATA: 85 },
    heave_taper: 0.3,               // heave falls by 30% 1.6 km along strike from the centre
    // syn-depositional thickening toward the fault (m at the cutoff), older
    // packages more, fading over growth_decay_m down dip of the cutoff
    growth_m: { BENIN: 0, AGBADA: 6, OGBIA: 14, TOP_SAND: 26, BASE_SAND: 30, OBORO_U: 60, OBORO: 85, OBORO_B: 100, AKATA: 150 },
    growth_decay_m: 320,
    cutoff_ref_md: { BENIN: 350, AGBADA: 1150, OGBIA: 1290, TOP_SAND: 1550, BASE_SAND: 1580, OBORO_U: 1790, OBORO: 1845, OBORO_B: 1912, AKATA: 2080 },
  },
  // a buried synthetic growth fault in the hanging wall, dead since Ekene
  // Sand time: the throw the eastern wells' deep tops have carried since v1
  ekene_east: {
    name: 'Ekene East Fault',
    b_at_tip: 90, curve_k: -1e-4, a_mid: 0,
    listric_m: 900,                 // dip flattens with depth: z = tip + d tan(dip) / (1 + d / listric_m)
    full_half_length_m: 450, tip_half_length_m: 1750,
    tip_md: 1590, dip_deg: 75,
    throw_m: { OBORO_U: 28, OBORO: 38, OBORO_B: 47, AKATA: 72 },
  },
  // smaller faults around the rollover crest, placed between the wells (a
  // keystone graben NE of Ekene-3, A and B, and a second one SW of Ekene-1,
  // C and D): the
  // crestal collapse of the overburden, dying out downward above the Ogbia
  // Shale, so the Ekene Sand stays one unbroken tank (as the courses teach)
  crestal: [
    { name: 'Crestal Fault A', dips: 'west', a_mid: 1080, b_mid: -330, z_mid: 920, half_length_m: 430, half_height_m: 500, dip_deg: 62, max_throw_m: 40, drag_m: 240 },
    { name: 'Crestal Fault B', dips: 'east', a_mid: 1050, b_mid: -800, z_mid: 900, half_length_m: 380, half_height_m: 470, dip_deg: 64, max_throw_m: 30, drag_m: 220 },
    { name: 'Crestal Fault C', dips: 'west', a_mid: -1330, b_mid: -420, z_mid: 880, half_length_m: 330, half_height_m: 480, dip_deg: 60, max_throw_m: 30, drag_m: 220 },
    { name: 'Crestal Fault D', dips: 'east', a_mid: -1300, b_mid: -850, z_mid: 820, half_length_m: 300, half_height_m: 380, dip_deg: 64, max_throw_m: 22, drag_m: 200 },
  ],
  // relief every horizon shares, scaled by its alpha: a rounded plunge away
  // from the crest (elliptical distance R from (a_c, b_c), each direction
  // with its own stretch; nothing landward, where the rollover's back limb
  // does the work): q (R - r0)^2 beyond r0, plus gentle undulation
  shape: { a_c: -100, b_c: -300, r0: 700, q: 1.2e-4, stretch_sw: 1.1, stretch_ne: 1.19, stretch_sea: 1.4, undulation_m: 6, undulation_scale_m: 1100 },
  // landward of the fault zone the regional flattens into a gentle common
  // footwall dip (m/m, basinward), so footwall packages stay parallel
  footwall_regional: { b_hinge: -1350, width_m: 150, dip: 0.012 },
  residual_sigma_m: 450,
  // the seismic-only detachment layer under the main fault
  detachment: { name: 'Akata detachment', vp_factor: 0.97, vs_factor: 0.95, rho_factor: 0.99 },
};

export const KIT = {
  version: 'v4',  // v4 (2026-10-11): listric growth fault, rollover trap closing inside the survey, 3.5 s record, wells unchanged; v3 (2026-10-09): DTS, elastic seismic, angle stacks and gathers for QI; v2 (2026-10-08): LAS curves are tool measurements of the truth (measure.mjs)
  name: 'ekene-demo',
  out_dir: 'dist-demo',
};
