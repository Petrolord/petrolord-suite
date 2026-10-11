// Prospects in a QI study (QI programme Q10, 2026-10-07; SOW section 11):
// each prospect's trap on a depth surface (Mapping & Surface Studio's
// closure engine: crest, spill point, closure, GRV), the amplitude anomaly
// from an attribute map and how it fits the structure, the evidence and
// its independence, the competing explanations, and the QI assessment
// (engines qi/prospectAssessment.js). QI never sets the geological chance:
// the assessment says what the seismic supports, for the risk team. Pure.
//
// The trap and anomaly maths lives in the engines (engines/qi/prospectTrap.js,
// QI course gate E2, 2026-10-11; goldens and an independent oracle there).
// This file keeps the competing-explanation lists and re-exports the rest.

export {
  nearestNode, climbToCrest, anomalyMaskOn, keepTouching, analyseProspect,
} from '../engine/prospectTrap';

export const COMPETING = Object.freeze([
  { key: 'tuning', name: 'Tuning (thin-bed interference)' },
  { key: 'lithology', name: 'Lithology (low-impedance shale, coal or tight streaks)' },
  { key: 'porosity', name: 'Porosity (a wet high-porosity sand)' },
  { key: 'fizz', name: 'Low-saturation gas (fizz water)' },
  { key: 'processing', name: 'Processing or acquisition artefact' },
]);
export const COMPETING_STATES = Object.freeze(['open', 'ruled-out', 'likely']);
