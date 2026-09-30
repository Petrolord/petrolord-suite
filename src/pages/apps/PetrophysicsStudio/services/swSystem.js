// Saturation names on the tracks (AppUpgrade PETRO-U2-012, PETRO-U1-020):
// with Waxman-Smits or dual water the model's saturation is total Swt on
// PHIT, and the track says so. A layout's own labels are left alone unless
// they are the default "Sw".
import { isTotalSwModel } from '../engine/pipeline';

/** 'total' when every zone and the base use a total model, 'mixed' when some do, else 'effective'. */
export function swSystemOf(params, zoneParams = {}) {
  const base = isTotalSwModel(params?.swMethod);
  const zoneModels = Object.values(zoneParams || {}).map((p) => p?.swMethod).filter(Boolean);
  const anyZoneTotal = zoneModels.some(isTotalSwModel);
  const anyZoneEff = zoneModels.some((m) => !isTotalSwModel(m));
  if (base && !anyZoneEff) return 'total';
  if (base || anyZoneTotal) return 'mixed';
  return 'effective';
}

const LABEL = { total: 'Swt', mixed: 'Sw / Swt' };

/** The template with default Sw labels and titles renamed for the system in play. */
export function labelSaturation(template, system) {
  if (!template || system === 'effective') return template;
  const name = LABEL[system];
  return {
    ...template,
    tracks: (template.tracks || []).map((t) => {
      const hasSw = (t.curves || []).some((c) => c.source === 'output:SW');
      if (!hasSw) return t;
      return {
        ...t,
        title: typeof t.title === 'string' ? t.title.replace(/^Sw\b/, name) : t.title,
        curves: t.curves.map((c) => (c.source === 'output:SW' && (!c.label || c.label === 'Sw') ? { ...c, label: name } : c)),
      };
    }),
  };
}
