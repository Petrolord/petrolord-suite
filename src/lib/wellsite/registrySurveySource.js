// Where a registry survey came from (Wellsite Studio U2-009, closes Well
// Data Manager U2-009). A live well that sends its rig survey to the
// registry leaves this in geo_wells.crs_provenance.deviation; any app that
// shows the survey can say so. Kept free of the Wellsite app's own imports
// so Well Data Manager does not pull the workstation in. Pure.

export const SURVEY_SOURCE = 'wellsite-studio';

/** One line on where a registry survey came from, or null when the registry does not say. */
export function registrySurveySourceText(crsProvenance) {
  const d = crsProvenance && crsProvenance.deviation;
  if (!d || d.source !== SURVEY_SOURCE) return null;
  const name = d.ws_well_name ? ` ${d.ws_well_name}` : '';
  return `Wellsite Studio live well${name}, survey ${d.survey_version}, ${d.stations} stations, sent ${String(d.published_at).slice(0, 10)}${d.published_by ? ` by ${d.published_by}` : ''}`;
}
