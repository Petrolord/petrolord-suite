// What a section or map picture says about itself (SEIS-U1-011, -013;
// practitioner lens PL1 and PL7). A reviewer signing a seismic section
// needs the survey, the real line number (never the lattice index), the
// vertical domain and datum, the polarity and display, the CRS, who and
// when, and the build. Pure; SliceView paints the lines, PlotDialog
// prints them in its title block.

import { EMPTY_VALUE } from '@/lib/emptyValue';

/** "Inline 1012", "Crossline 2005", "Time slice 1,400 ms", "Traverse". */
export function sectionLineLabel(geometry, orientation, index, traverseName = null) {
  if (orientation === 'traverse') return traverseName ? `Traverse ${traverseName}` : 'Traverse';
  if (!geometry || !Number.isFinite(index)) return EMPTY_VALUE;
  if (orientation === 'inline') return `Inline ${geometry.il.min + index * geometry.il.step}`;
  if (orientation === 'xline') return `Crossline ${geometry.xl.min + index * geometry.xl.step}`;
  const ms = (index * geometry.dt_us) / 1000;
  return `Time slice ${ms.toLocaleString('en-US', { maximumFractionDigits: 3 })} ms`;
}

/** A file-name-safe form of the line label. */
export const lineLabelSlug = (label) => String(label || 'section').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The vertical axis the picture shows. */
export function verticalLabel({ depth = false, depthUnit = 'm', velocityText = null } = {}) {
  if (!depth) return 'Vertical: two-way time (TWT) in ms below the seismic datum';
  return `Vertical: depth TVDSS in ${depthUnit === 'ft' ? 'ft' : 'm'} below the seismic datum`
    + `${velocityText ? `, through ${velocityText}` : ''}`;
}

/** Polarity and display in one line. */
export function displayLabel(display) {
  if (!display) return null;
  const parts = [
    display.polarity === -1 ? 'polarity reversed on display' : 'polarity as recorded in the file',
    `colour map ${display.colormap}${display.reverse ? ' (reversed)' : ''}`,
    `gain ${Number(display.gain).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    `clip ${Number(display.clip).toPrecision(3)}`,
  ];
  if (display.agc) parts.push('AGC on (display only)');
  if (display.traceBalance) parts.push('trace balance on');
  if (display.wiggle && display.wiggle !== 'off') parts.push(`wiggle ${display.wiggle}`);
  return parts.join(', ');
}

/**
 * Caption lines for an exported picture.
 * @returns {string[]}
 */
export function sectionCaption({
  volumeName, lineLabel, depth = false, depthUnit = 'm', velocityText = null, display = null,
  crsName = null, author = null, date = null, build = null,
}) {
  return [
    `Seismolord  ${volumeName || EMPTY_VALUE}  ${lineLabel || ''}`.trim(),
    [verticalLabel({ depth, depthUnit, velocityText }), displayLabel(display)].filter(Boolean).join('. '),
    [
      `CRS ${crsName || 'not set'}`,
      author ? `by ${author}` : null,
      date || new Date().toISOString().slice(0, 10),
      build,
    ].filter(Boolean).join('  ·  '),
  ];
}
