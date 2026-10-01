// Mixed lithologies and kinetics choices for a layer (AppUpgrade BF-U2-013).
// The mixing laws are the engine's (mixCompactionParams, mixThermalProps:
// arithmetic Athy porosity, coefficient and grain density; geometric-mean
// matrix conductivity; arithmetic radiogenic heat and heat capacity). A
// layer stores its properties explicitly, so a mixed layer's are written
// from its fractions here; the engine reads the same numbers either way.

import { getThermalProps, mixThermalProps } from './ThermalPropertiesLibrary';
import { getCompactionParams, mixCompactionParams, mixFractions } from './CompactionModelLibrary';
import { PepperCorvi1995, gaussianKinetics } from './KerogenLibrary';

export const MIX_LITHOLOGIES = Object.freeze(['sandstone', 'shale', 'limestone']);

/** Whole-percent fractions of a layer's mix, summing to 100 (or null). */
export function mixPercent(layer) {
  if (layer?.lithology !== 'mixed') return null;
  const f = mixFractions(layer.lithologyMix);
  if (!f.length) return null;
  return Object.fromEntries(f.map(([k, w]) => [k, Math.round(w * 1000) / 10]));
}

/** "60 % shale, 40 % sandstone", or the lithology name. */
export function lithologyLabel(layer) {
  const m = mixPercent(layer);
  if (!m) return layer?.lithology || 'unknown';
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, w]) => `${w} % ${k}`).join(', ');
}

/** The library (or mixture) properties of a layer. */
export function layerLibrary(layer) {
  const mixed = layer?.lithology === 'mixed' && mixFractions(layer.lithologyMix).length > 0;
  const t = mixed ? mixThermalProps(layer.lithologyMix) : getThermalProps(layer?.lithology);
  const c = mixed ? mixCompactionParams(layer.lithologyMix) : getCompactionParams(layer?.lithology);
  return {
    thermal: { conductivity: t.conductivity, radiogenic: t.radiogenic, heatCapacity: t.heatCapacity },
    compaction: { model: 'exponential', phi0: c.phi0, c: c.c, ...(mixed ? { grainDensity: c.grainDensity } : {}) },
  };
}

/** The select options for a source rock's kinetics. */
export const KINETICS_OPTIONS = Object.freeze([
  ['type1', 'Type I (lacustrine, oil prone)'],
  ['type2', 'Type II (marine)'],
  ['type3', 'Type III (terrestrial, gas prone)'],
  ...Object.entries(PepperCorvi1995).map(([k, v]) => [`pc-${k}`, `Pepper and Corvi ${v.label}`]),
  ['custom', 'Custom (A, mean E, spread)'],
]);

/** The select value of a stored kerogen (a key string or a kinetics object). */
export function kineticsKey(k) {
  if (k && typeof k === 'object') return 'custom';
  const raw = String(k || 'type2').trim();
  const pc = /^pc[-_ ]?(a|b|c|de|f)$/i.exec(raw);
  if (pc) return `pc-${pc[1].toUpperCase()}`;
  const c = raw.toLowerCase().replace(/\s+/g, '');
  if (c === 'type1' || c === 'typei') return 'type1';
  if (c === 'type3' || c === 'typeiii') return 'type3';
  return 'type2';
}

/**
 * A custom kinetics object for the engine from A (1/s), the mean activation
 * energy and its standard deviation (kJ/mol); the three numbers ride along
 * so the editor shows them again.
 */
export function customKinetics({ aFactor, eMeanKJ, sigmaKJ }) {
  const k = gaussianKinetics({ aFactor: Number(aFactor), eMeanKJ: Number(eMeanKJ), sigmaKJ: Number(sigmaKJ), label: 'Custom kinetics' });
  return { ...k, custom: { aFactor: Number(aFactor), eMeanKJ: Number(eMeanKJ), sigmaKJ: Number(sigmaKJ) } };
}

/** Words for a kerogen choice (report, cards). */
export function kineticsLabel(k) {
  if (k && typeof k === 'object') {
    return k.custom ? `custom kinetics (A ${Number(k.custom.aFactor).toExponential(2)} 1/s, E ${k.custom.eMeanKJ} kJ/mol, sd ${k.custom.sigmaKJ})` : 'custom kinetics';
  }
  const key = kineticsKey(k);
  return (KINETICS_OPTIONS.find(([v]) => v === key) || [null, String(k)])[1];
}
