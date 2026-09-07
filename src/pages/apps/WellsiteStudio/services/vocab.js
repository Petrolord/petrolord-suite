// Fixed lists the WS0 screens need before their engine modules land
// (sample stages arrive with sampleProgram.js in WS3; roles mirror the
// ws_role enum of migration 20260907090000).
export const SAMPLE_STAGE_NAMES = Object.freeze(['scheduled', 'due', 'caught', 'washed', 'dried', 'described', 'photographed', 'bagged']);
export const WS_ROLES = Object.freeze([
  { code: 'wellsite_geologist', name: 'Wellsite geologist' },
  { code: 'senior_wellsite_geologist', name: 'Senior wellsite geologist' },
  { code: 'operations_geologist', name: 'Operations geologist' },
  { code: 'well_geology_lead', name: 'Well geology lead' },
  { code: 'administrator', name: 'Administrator' },
]);
export const roleName = (code) => (WS_ROLES.find((r) => r.code === code) || { name: code }).name;
// Rig types (tester note 2026-09-07): floaters return through a marine riser and run a booster pump.
export const RIG_TYPES = Object.freeze([
  { code: 'land', name: 'Land rig' }, { code: 'jackup', name: 'Jack-up' }, { code: 'platform', name: 'Platform rig' },
  { code: 'semisub', name: 'Semi-submersible' }, { code: 'drillship', name: 'Drillship' },
]);
export const FLOATER_TYPES = Object.freeze(['semisub', 'drillship']);
