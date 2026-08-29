/**
 * Layout Mapper spacing adapter (Facilities F8).
 *
 * Translates what the mapper holds (layers with icon names and
 * Leaflet latlngs) into what the vendored spacing engine expects
 * (items with equipment types and coordinates), and back. No physics
 * lives here: the table, the geometry and the radiation setbacks are
 * all the engine's.
 */

import {
  SPACING_TABLE_M, requiredSpacingM, checkLayout, nearestNeighbours,
  flareSetbackM, poolFireSetbackM, RADIATION_LEVELS,
} from '@/utils/facilities/engine/spacing';

export { SPACING_TABLE_M, requiredSpacingM, flareSetbackM, poolFireSetbackM, RADIATION_LEVELS };

/** Mapper icon names to the engine's equipment classes. */
export const ICON_TO_TYPE = {
  Wellhead: 'wellhead',
  Manifold: 'manifold',
  Separator: 'separator',
  'Heater-Treater': 'heaterTreater',
  Tank: 'tank',
  Flare: 'flare',
  Pump: 'pump',
  Compressor: 'compressor',
  Valve: 'valve',
  PSV: 'psv',
};

export const typeOfLayer = (layer) => ICON_TO_TYPE[layer?.iconName] || null;

/**
 * Placed equipment as engine items. Pipelines and custom icons are
 * skipped: a drawn pipe run has no single position, and a custom icon
 * has no class the table knows, so judging either would be inventing
 * a rule the user never set.
 */
export const layersToItems = (layers = []) => layers
  .filter((l) => l?.type === 'icon' && !l.isCustom && l.latlng
    && Number.isFinite(l.latlng.lat) && Number.isFinite(l.latlng.lng))
  .map((l) => ({
    id: l.id,
    name: l.tag || l.iconName,
    type: typeOfLayer(l),
    lat: l.latlng.lat,
    lon: l.latlng.lng,
  }))
  .filter((it) => it.type !== null);

/** Items the check had to skip, so the panel can say so honestly. */
export const skippedLayers = (layers = []) => layers.filter((l) => {
  if (!l || l.type !== 'icon') return l?.type === 'pipeline';
  if (l.isCustom) return true;
  return typeOfLayer(l) === null;
});

const M_PER_FT = 0.3048;

/**
 * Run the full check for the mapper. Radiation sources are built from
 * the user's flare and tank settings, so the setbacks are computed
 * from a stated duty rather than assumed.
 */
export const runLayoutCheck = ({ layers, radiation }) => {
  const items = layersToItems(layers);
  if (items.length < 2) {
    return {
      error: 'place at least two pieces of standard equipment to check the spacing between them',
      items,
    };
  }
  const sources = [];
  if (radiation?.flareEnabled) {
    for (const it of items.filter((i) => i.type === 'flare')) {
      const f = flareSetbackM({
        reliefRateKgS: radiation.reliefRateKgS,
        lhvKjKg: radiation.lhvKjKg,
        allowableKwM2: radiation.allowableKwM2,
        fractionRadiated: radiation.fractionRadiated,
      });
      if (!f.error) {
        sources.push({
          id: it.id,
          setbackM: f.distanceM,
          allowableKwM2: radiation.allowableKwM2,
          label: `Flare radiation at ${radiation.allowableKwM2} kW/m2`,
          detail: f,
        });
      }
    }
  }
  if (radiation?.poolEnabled) {
    for (const it of items.filter((i) => i.type === 'tank')) {
      const p = poolFireSetbackM({
        poolDiameterM: radiation.poolDiameterM,
        allowableKwM2: radiation.allowableKwM2,
      });
      if (!p.error) {
        sources.push({
          id: it.id,
          setbackM: p.setbackFromEdgeM,
          allowableKwM2: radiation.allowableKwM2,
          label: `Pool fire from a ${radiation.poolDiameterM} m bund`,
          detail: p,
        });
      }
    }
  }
  const result = checkLayout({ items, radiationSources: sources });
  const neighbours = nearestNeighbours({ items });
  return {
    ...result,
    items,
    sources,
    neighbours: neighbours.error ? [] : neighbours.rows,
    skipped: skippedLayers(layers),
  };
};

/** Metres to feet, for the panel's secondary readout. */
export const toFeet = (m) => (Number.isFinite(m) ? m / M_PER_FT : NaN);
