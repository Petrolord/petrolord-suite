// Re-export shim — this engine lives in the central @petrolord/engines repo, vendored at packages/engines (git subtree). Never edit the vendored copy from the Suite; changes go to Petrolord/petrolord-engines and are subtree-pulled.
//
// Suite Projects P2: every lookup takes the chart edition as its last
// argument, defaulting in the engine to TIMESCALE_VERSION. Here the default is
// the current project's pinned edition (suite_projects.settings.timescale),
// else TIMESCALE_VERSION, so a project can stay on an earlier chart. Passing
// an edition explicitly still wins. Ages already stored keep the edition they
// were entered under (src/lib/stratigraphy/ageCharts.js); nothing is rewritten.
import * as engine from '../../../packages/engines/engines/stratigraphy/timescale';
import { projectTimescale } from '@/lib/projects/projectDefaults';

export {
  TIMESCALE_V2023, TIMESCALE_V2026, TIMESCALE_VERSION, TIMESCALE_VERSIONS, TIMESCALE_LICENCE,
  TIMESCALE_CITATION, TIMESCALE_ERRATA, RANKS, isTimescaleVersion, boundaryLabel,
} from '../../../packages/engines/engines/stratigraphy/timescale';

/** The chart edition in force: the project's pin, else the current edition. */
export function currentTimescale() {
  const pinned = projectTimescale();
  return pinned && engine.isTimescaleVersion(pinned) ? pinned : engine.TIMESCALE_VERSION;
}

export const timescaleUnits = (version = currentTimescale()) => engine.timescaleUnits(version);
export const unitsOfRank = (rank, version = currentTimescale()) => engine.unitsOfRank(rank, version);
export const timescaleUnit = (name, version = currentTimescale()) => engine.timescaleUnit(name, version);
export const ageBounds = (name, version = currentTimescale()) => engine.ageBounds(name, version);
export const unitsAt = (ma, version = currentTimescale()) => engine.unitsAt(ma, version);
export const unitAt = (ma, version = currentTimescale()) => engine.unitAt(ma, version);
export const unitsBetween = (topMa, baseMa, rank = 'age', version = currentTimescale()) => engine.unitsBetween(topMa, baseMa, rank, version);
export const lineage = (name, version = currentTimescale()) => engine.lineage(name, version);
export const boundaryChanges = (fromVersion, toVersion = currentTimescale()) => engine.boundaryChanges(fromVersion, toVersion);
export const ageOnChart = (ma, fromVersion, toVersion = currentTimescale(), opts) => engine.ageOnChart(ma, fromVersion, toVersion, opts);
