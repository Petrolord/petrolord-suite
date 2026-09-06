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
