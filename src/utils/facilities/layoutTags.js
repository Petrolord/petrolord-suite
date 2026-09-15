/**
 * Sequential tags for the Facility Layout Mapper (Facilities F8, FC1-0).
 *
 * A tag is an identity a drawing and a datasheet share, so it is derived
 * from the tags already on the map: the lowest free number for that
 * prefix. The same layout always yields the same next tag, and a reloaded
 * layout cannot collide with a tag it already holds.
 */

/** Lowest free sequence number for tags of the form `${prefix}-NNN`. */
export const nextTagNumber = (layers, prefix) => {
  const used = new Set();
  const head = `${prefix}-`;
  for (const l of layers || []) {
    if (typeof l?.tag !== 'string' || !l.tag.startsWith(head)) continue;
    const rest = l.tag.slice(head.length);
    if (!/^\d+$/.test(rest)) continue;
    used.add(parseInt(rest, 10));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
};

const pad = (n) => String(n).padStart(3, '0');

/** Equipment tag, e.g. `Tank-001`. */
export const nextEquipmentTag = (layers, name) => `${name}-${pad(nextTagNumber(layers, name))}`;

export const PIPELINE_TAG_PREFIX = 'PL';

/** Pipeline tag, e.g. `PL-001`. */
export const nextPipelineTag = (layers) => `${PIPELINE_TAG_PREFIX}-${pad(nextTagNumber(layers, PIPELINE_TAG_PREFIX))}`;
