// Display units of Risked Reserves Valuation (upgrade U1, 2026-10-02).
// The valuations are held in ONE system: volumes in MMboe (million barrels
// of oil equivalent), value per barrel in $/boe, costs and values in $MM.
// The screen, the CSV and the report show volumes in the unit the Suite unit
// profile asks for: MMboe, or million cubic metres of oil equivalent with
// the value per cubic metre. Values convert at the door; nothing is
// relabelled. The factor comes from the Suite unit registry.

import { convert } from '@/lib/units/registry';

/** What the app offers for the profile's liquid volume family. */
export const RRV_UNIT_SPEC = Object.freeze({ volume: { family: 'liquidVolume', allowed: ['MMbbl', '10^6 m3'] } });
export const RRV_UNIT_FALLBACK = Object.freeze({ volume: 'MMbbl' });

/** Which inputs are volumes and which a value per volume; the rest ($MM, Pg) do not convert. */
export const UNIT_KIND = Object.freeze({ p90: 'volume', p50: 'volume', p10: 'volume', mefs: 'volume', unitValue: 'unitValue' });

/**
 * @param {'MMbbl'|'10^6 m3'} [volumeUnit]
 * @returns {{metric: boolean, system: string, volumeUnit: string, volumeLabel: string, unitValueLabel: string,
 *   volumeKey: string, unitValueKey: string, volume: function(number): number, volumeIn: function(number): number,
 *   unitValue: function(number): number, unitValueIn: function(number): number,
 *   show: function(string, number): number, read: function(string, number): number, label: function(string): string}}
 */
export function rrvUnits(volumeUnit = 'MMbbl') {
  const metric = volumeUnit === '10^6 m3';
  // million cubic metres in one million barrels (0.158987...)
  const k = convert('liquidVolume', 1, 'MMbbl', '10^6 m3');
  const u = {
    metric,
    system: metric ? 'metric' : 'oilfield',
    volumeUnit: metric ? '10^6 m3' : 'MMbbl',
    volumeLabel: metric ? '10^6 m3 oe' : 'MMboe',
    unitValueLabel: metric ? '$/m3 oe' : '$/boe',
    volumeKey: metric ? 'mm_m3_oe' : 'mmboe',
    unitValueKey: metric ? 'value_usd_per_m3_oe' : 'value_usd_per_boe',
    /** MMboe as the display volume */
    volume: (x) => (metric ? x * k : x),
    /** a display volume as MMboe */
    volumeIn: (x) => (metric ? x / k : x),
    /** $/boe as the display value per volume */
    unitValue: (x) => (metric ? x / k : x),
    unitValueIn: (x) => (metric ? x * k : x),
  };
  u.show = (key, x) => (UNIT_KIND[key] === 'volume' ? u.volume(x) : UNIT_KIND[key] === 'unitValue' ? u.unitValue(x) : x);
  u.read = (key, x) => (UNIT_KIND[key] === 'volume' ? u.volumeIn(x) : UNIT_KIND[key] === 'unitValue' ? u.unitValueIn(x) : x);
  u.label = (key) => (UNIT_KIND[key] === 'volume' ? u.volumeLabel : UNIT_KIND[key] === 'unitValue' ? u.unitValueLabel : (key === 'devCost' || key === 'wellCost' ? '$MM' : key === 'pg' ? 'fraction' : ''));
  return u;
}
