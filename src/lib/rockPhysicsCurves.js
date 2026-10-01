// Rock Physics Studio's published curves, as other apps read them
// (AppUpgrade RP-U1-009, 2026-10-01; Seismolord U2-020, first half).
//
// Rock Physics publishes the fluid-substituted case to the well registry as
// VP_SUB, VS_SUB, RHOB_SUB and, since RP-U1, DT_SUB (compressional
// slowness, us/m). The registry's curve-kind guess matches exact
// mnemonics (DT, RHOB, ...), so Seismolord's synthetics never offered these
// curves, while the Rock Physics help said it did. This module names the
// kind of a substituted curve by its provenance, so a reader can list it as
// a sonic or a density and label it as substituted. Pure, no I/O.

export const ROCK_PHYSICS_ENGINE = 'rock-physics-studio';

const base = (m) => String(m || '').toUpperCase().split(':')[0];
const SUB_KINDS = Object.freeze({ DT_SUB: 'sonic', RHOB_SUB: 'density' });

/** True for a curve Rock Physics Studio published. */
export const isRockPhysicsCurve = (log) => log?.provenance?.computed === true && log?.provenance?.engine === ROCK_PHYSICS_ENGINE;

/** 'sonic' | 'density' for a substituted curve a synthetic can use, else null. */
export function substitutedCurveKind(log) {
  if (!isRockPhysicsCurve(log)) return null;
  return SUB_KINDS[base(log.mnemonic)] || null;
}

/** A short label for a picker: "DT_SUB (US/M), fluid substituted: 100% brine to 100% gas in SAND". */
export function substitutedCurveLabel(log) {
  const p = log?.provenance || {};
  const zone = p.zone?.name ? ` in ${p.zone.name}` : '';
  const what = p.fluids ? `: ${p.fluids}${zone}` : zone;
  // RP-U2-007: a substituted curve built on a pseudo-sonic says so
  const est = p.vp_source === 'estimated' ? ', from an ESTIMATED sonic' : '';
  return `${log.mnemonic} (${log.unit || '?'}), fluid substituted${est}${what}`;
}

// RP-U2-007 (2026-10-01): for a well with no sonic log Rock Physics can
// publish its pseudo-sonic as DT_EST (us/m, provenance.estimated = true).
// A reader may list it as a sonic, but only under a label that says it is
// an estimate, and never as its default.
const EST_KINDS = Object.freeze({ DT_EST: 'sonic' });

/** 'sonic' for an estimated curve a synthetic may use, else null. */
export function estimatedCurveKind(log) {
  if (!isRockPhysicsCurve(log) || log.provenance.estimated !== true) return null;
  return EST_KINDS[base(log.mnemonic)] || null;
}

/** "DT_EST (US/M), ESTIMATED sonic: Gardner (1974) inverse from density, ..." */
export function estimatedCurveLabel(log) {
  const note = log?.provenance?.note ? `: ${log.provenance.note}` : '';
  return `${log.mnemonic} (${log.unit || '?'}), ESTIMATED sonic${note}`;
}
