// Wave D8, wellsite domain: the DESIGN choices for Episode 37 (Wellsite
// Studio, one report day on Ekene-11). Everything a tester types that the
// rest of the kit does not already fix is chosen here, once, with its
// reason. The numbers the screens show are NOT here: wellsite.mjs derives
// them through the Wellsite engines and __tests__/domain.wellsite.test.js
// re-derives them through the app's own services.

export const DIR = '15-wellsite';

// The report day. Well Cost & Time (Episode 20) starts the Ekene-11 program
// at the spud date (d8spine EKENE11.spud); this generator reads that program
// back and asserts that its planned Ekene Sand crossing falls inside this
// report day. Rig local time is West Africa Time, UTC plus 60 minutes.
export const DAY = {
  date: '2027-01-23',          // rig local date the report day starts on
  startLocal: '06:00',         // report day and day tour start
  offsetMin: 60,
  tours: ['06:00', '18:00'],
  programStartLocal: '06:00',  // the Well Cost & Time program's hour zero, on the spud date
};

// Ekene Alpha is a fixed platform in 35 m of water (spine FRAME), so the rig
// is the Wellsite Studio "Platform rig": returns come up the casing to the
// flowline with no marine riser and no booster, the land-rig lag case.
export const RIG = {
  type: 'platform',
  typeName: 'Platform rig',
  name: 'Ekene Alpha platform rig',
  // Two identical triplex pumps (a 1600 hp class pair: 6-1/2in liners on a
  // 12in stroke, the app's default 97 percent efficiency). The pump log
  // records the combined rate of both pumps, so the lag engine counts one
  // pump's displacement against the total strokes.
  pump: { type: 'triplex', linerIn: 6.5, strokeIn: 12, rodIn: 0, efficiency: 0.97 },
  pumpsOnLine: 2,
  drillingSpm: 180,            // 90 each: about 900 gpm, the usual rate for 12-1/4in hole
  // Config takes lengths in whole feet and shows them back rounded to the
  // foot, so every length below is a whole number of feet (a re-saved
  // configuration then stores exactly what was typed).
  bhaFt: { collars: 492, hwdp: 492 },   // 150 m each, the drilling domain's lengths
};

// The sampling programme the operations geologist authorises at the start
// of the day: 5 m samples through the Ogbia Shale, then 3 m samples from
// 15 m above the prognosed Ekene Sand (the prognosis uncertainty) to TD.
export const PROGRAMME = {
  authorisedBy: 'Operations geologist',
  reason: 'Ekene-11 12-1/4in section: 3 m samples through the Ekene Sand',
  rows: [
    { fromMdM: 1575, toMdM: 1620, intervalM: 5 },
    { fromMdM: 1620, toMdM: null, intervalM: 3 },
  ],
};

// The day (design): at 06:00 the bit is at 1575.0 m in the Ogbia Shale. The
// overpressured shale drills at 12 m/hr and the Ekene Sand at 24 m/hr: the
// drilling break the top is called on. Top drive, 28 m stands, so the
// connections fall at 1587, 1615 and 1643 m; each takes 8 minutes with the
// pumps off. On the break the driller drills to the next sample depth,
// flow checks for 5 minutes and circulates it up, drilling on 5 minutes
// after the bottoms up sample is caught. The bit run ends at
// 1650 m (the Well Cost & Time program's bit trip): two bottoms up, a
// 10 minute flow check, then pull out of hole at the program's 300 m/hr.
export const PLAN = {
  startBitMdM: 1575.0,
  rop: { shale: 12, sand: 24 },
  connections: [1587, 1615, 1643],
  connectionMin: 8,
  breakStopMdM: 1638.0,
  breakFlowCheckMin: 5,
  lookMin: 5,                    // keep circulating 5 minutes while the break sample is looked at
  bitRunEndMdM: 1650.0,
  bottomsUpBeforeTrip: 2,
  tripFlowCheckMin: 10,
  tripMPerHr: 300,
  tourEndMin: 720,               // 18:00, the handover
};

// Cuttings description terms, typed exactly as a wellsite geologist types
// them on the Describe screen (every one resolves in the live vocabulary;
// the gate proves it). Lithology percentages are NOT here: they come from
// the kit's rock model over each sample interval.
export const DESCRIBE = {
  shale: { lithology: 'sh', colour: 'dk gy', hardness: 'frm', texture: 'fis, mic', accessories: 'tr pyr', fossils: 'rr foram' },
  siltstone: { lithology: 'sltst', colour: 'med gy', hardness: 'frm', texture: 'arg', accessories: 'tr mic' },
  // Ekene Sand: shoreface to distributary mouth bar (06-stratigraphy), fine
  // to medium, well sorted, unconsolidated Niger Delta sand. Oil stains it
  // light brown above the contact; the water leg is light grey.
  sandOil: { lithology: 'sst', colour: 'lt brn', hardness: 'fri', grainSize: 'f-m', sorting: 'w srt', rounding: 'sbang-sbrnd', cement: 'none', accessories: 'tr glauc, tr mic', porosity: 'gd', porosityTypes: 'intgran' },
  sandWater: { lithology: 'sst', colour: 'lt gy', hardness: 'fri', grainSize: 'f-m', sorting: 'w srt', rounding: 'sbang-sbrnd', cement: 'none', accessories: 'tr glauc, tr mic', porosity: 'gd', porosityTypes: 'intgran' },
};
// Rock model rows to cuttings: clay fraction under the kit's net sand cut
// (build.mjs VSH_CUT) is sandstone, up to SILT_MAX siltstone, above it shale.
export const SILT_MAX = 0.55;

// Show observation rule (design): what a 32 API oil at this saturation looks
// like under the UV box. The QUALITY is not chosen here: the shows engine
// derives it from these observations.
export function showFor({ oilFrac, so }) {
  if (!(oilFrac > 0) || !(so > 0)) return null;
  const snap = [0, 5, 10, 25, 50, 75, 100].filter((p) => p <= oilFrac * 100 + 1e-9).pop();
  const strong = so >= 0.3;
  return {
    fluorescence: { colour: 'yellow', intensity: so >= 0.5 ? 'bright' : strong ? 'moderate' : 'dull', distributionPct: snap },
    cut: { speed: so >= 0.5 ? 'fast' : strong ? 'moderate' : 'slow', colour: 'milky', type: strong ? 'streaming' : 'crush' },
    stain: so >= 0.5 ? 'even' : strong ? 'patchy' : 'spotty',
    odour: strong ? 'moderate' : 'faint',
    residue: strong ? 'light' : 'none',
    comment: '',
  };
}

// Gas (design): no gas data exists for the field, so total gas is a stated
// rule over the rock model. Background 0.4 percent in the shale, connection
// gas 0.5 percent over background (the Ogbia is overpressured and the mud
// holds it by 1.3 ppg, so the swab on each connection shows), and the
// oil-filled pore volume of the cuttings on top in the reservoir.
export const GAS = { backgroundPct: 0.4, connectionOverPct: 0.5, reservoirFactor: 25 };
export const totalGasPct = ({ oilFrac, so, phi }) => Number((GAS.backgroundPct + GAS.reservoirFactor * oilFrac * so * phi).toFixed(1));
