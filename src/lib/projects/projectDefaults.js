// Suite Projects P2: the current project's defaults for code outside React
// (registries, engines' callers). Every function returns the built-in
// behaviour when projects are off or the project leaves the setting unset.
import { currentProjectSettings } from '@/lib/projects/projectScope';
import { normalizeProjectSettings } from '@/lib/projects/projectSettings';

const settings = () => normalizeProjectSettings(currentProjectSettings());

/** Depth reference for a new well entered with a bare elevation (built-in KB). */
export const projectDepthRefKind = () => settings().datum?.refKind || 'KB';

/** Vertical datum for new wells, or null (each app's own default). */
export const projectVerticalDatum = () => settings().datum?.verticalDatum || null;

/** Seismic reference datum (m above sea level) for new models, or null. */
export const projectSrdM = () => settings().datum?.srdM ?? null;

/** The ICS chart edition pinned by the project, or null (the current edition). */
export const projectTimescale = () => settings().timescale || null;

/** New pore pressure parameters: the project's seismic datum when it sets one. */
export function withProjectDatumDefaults(params) {
  const srd = projectSrdM();
  return srd === null ? params : { ...params, seismicDatumElevM: srd };
}
