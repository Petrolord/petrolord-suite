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
  return `${log.mnemonic} (${log.unit || '?'}), fluid substituted${what}`;
}
