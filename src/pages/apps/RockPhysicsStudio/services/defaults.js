// AVO and wedge defaults (G6.4; moved out of the workstation in RP2 so
// the help guide can quote them). Pure data.

// manual-halfspace defaults = the class-III gas-sand oracle fixture
// (shale over gas sand), so the AVO panel lands on a verifiable case
export const DEFAULT_AVO = {
  mode: 'top',
  topId: '',
  windowM: 10,
  maxTheta: 40,
  upper: { vp: 2900, vs: 1330, rho: 2290 },
  lower: { vp: 2540, vs: 1620, rho: 2090 },
};

// the oracle wedge golden's parameters (tuning thickness 16 ms)
// vpWedge (m/s, T1-E2): interval velocity inside the wedge, to state the
// tuning thickness in depth as well as time
export const DEFAULT_WEDGE = {
  rcTop: 0.1, rcBase: -0.1, freqHz: 25, dtMs: 1, maxThicknessMs: 60, vpWedge: 2500,
};

/** Tuning thickness in metres from two-way time (ms) and interval velocity (m/s). */
export const tuningDepthM = (tuningMs, vp) => (Number.isFinite(tuningMs) && vp > 0 ? (tuningMs / 1000) * vp / 2 : NaN);
