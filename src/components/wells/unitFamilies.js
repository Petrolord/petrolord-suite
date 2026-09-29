// Unit families for log inputs (AppUpgrade PETRO-U2-001, 2026-09-29).
//
// One table of the unit spellings vendors write for the measurements whose
// unit changes a petrophysical answer by a factor: neutron porosity (v/v or
// percent), bulk density (g/cc or kg/m3), compressional slowness (us/m or
// us/ft), and the fraction curves other apps read (PHIE, VSH, SW). Before
// this table the Studio's input normaliser (curveUnits.js) and Rock Physics
// (prep.js) each kept their own lists and regexes; they now read the same
// rows, so a spelling added here is recognised by both, and the Studio's
// "Input units" table shows the family, the factor and why.

const norm = (u) => String(u || '').trim().toUpperCase();

/** key -> {quantity, pipelineUnit, members: [{unit, factor, spellings}]}; factor converts TO the pipeline unit. */
export const UNIT_FAMILIES = Object.freeze({
  NPHI: {
    quantity: 'neutron porosity',
    pipelineUnit: 'V/V',
    members: [
      { unit: 'V/V', factor: 1, spellings: ['V/V', 'DEC', 'DECP', 'FRAC', 'FRACTION', 'M3/M3', 'CFCF', 'FT3/FT3', 'CF/CF', 'VOL/VOL', 'V/V_LS'] },
      { unit: 'PU', factor: 0.01, spellings: ['PU', 'P.U.', '%', 'PERCENT', 'PERC', 'PCT', 'PU_LS', 'LSPU', 'SSPU', 'DPU', 'NAPU', 'PU(LS)'] },
    ],
  },
  RHOB: {
    quantity: 'bulk density',
    pipelineUnit: 'G/C3',
    members: [
      { unit: 'G/C3', factor: 1, spellings: ['G/C3', 'G/CC', 'G/CM3', 'GM/CC', 'GR/CC', 'GRAM/CC', 'GCC', 'G/CM^3'] },
      { unit: 'KG/M3', factor: 0.001, spellings: ['K/M3', 'KG/M3', 'KGM3', 'KG/M^3'] },
    ],
  },
  DT: {
    quantity: 'compressional slowness',
    pipelineUnit: 'US/M',
    members: [
      { unit: 'US/M', factor: 1, spellings: ['US/M', 'USEC/M', 'MICROSEC/M', 'US/MTR'] },
      { unit: 'US/FT', factor: 1 / 0.3048, spellings: ['US/F', 'US/FT', 'USEC/F', 'USEC/FT', 'MICROSEC/FT'] },
    ],
  },
});

/** Fraction curves (porosity, Vsh, Sw) share the neutron family's spellings. */
export const FRACTION_KEYS = Object.freeze(['PHIE', 'PHIT', 'VSH', 'SW', 'NPHI']);

/** The family member a stored unit belongs to, or null when the table does not know it. */
export function familyMember(key, unit) {
  const fam = UNIT_FAMILIES[key];
  if (!fam) return null;
  const u = norm(unit);
  if (!u) return null;
  return fam.members.find((m) => m.spellings.includes(u)) || null;
}

/** Units the user may pick for a key (the family's canonical members). */
export const unitChoices = (key) => (UNIT_FAMILIES[key]?.members || []).map((m) => m.unit);

/** A percent spelling (PU, %, PERCENT, ...): fraction curves divide by 100. */
export const isPercentUnit = (unit) => familyMember('NPHI', unit)?.unit === 'PU';

/** A g/cc spelling (values near 2.x; x1000 to kg/m3). */
export const isGramsPerCc = (unit) => familyMember('RHOB', unit)?.unit === 'G/C3';

/** A per-foot slowness spelling. */
export const isPerFootSlowness = (unit) => familyMember('DT', unit)?.unit === 'US/FT';
