// Waterflood Design Studio, Surveillance tab helpers (Waterflood U1). Pure.

/** Every alert of every group of an analyzeWaterflood result (WF-U1-001: the rail read `.length` of the object). */
export function countAlerts(alerts) {
  if (!alerts || typeof alerts !== 'object') return 0;
  return Object.values(alerts).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
}
