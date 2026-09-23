// Start here (discoverability programme, 2026-09-23): what exists for the
// open volume, what the upload made on its own, and the next useful steps
// with the reason any of them is not available yet. Pure: the panel draws
// it and ViewerPanel maps each step's action key to a callback.
//
// Copy rule: no em dashes.

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The attribute key a derived volume row was computed with, or null. */
export function attributeOf(row) {
  return row?.kind === 'attribute' ? row.attribute_params?.name ?? null : null;
}

/**
 * @param {Object} p
 * @param {Object|null} p.volume the open volume row (null = nothing open)
 * @param {Object|null} p.manifest its effective manifest
 * @param {Array<Object>} p.allVolumes every volume row the explorer lists
 * @param {Array<Object>} p.horizons horizon heads of the open volume
 * @param {Array<Object>} p.faults faults of the open volume
 * @param {Array<Object>} p.wells visible wells (with tops arrays)
 * @param {Array<Object>} p.surfaces surfaces made from this volume
 * @param {Object|null} p.velocityModel the volume's velocity model
 * @param {number|null} [p.registryWellCount] wells in the registry (null = unknown)
 * @returns {{made: string[], inventory: Array<{key: string, label: string, value: string}>,
 *   steps: Array<{key: string, title: string, detail: string, status: 'done'|'todo'|'blocked', why?: string, action?: string}>}}
 */
export function buildStartHere({
  volume = null, manifest = null, allVolumes = [], horizons = [], faults = [], wells = [],
  surfaces = [], velocityModel = null, registryWellCount = null,
} = {}) {
  if (!volume) {
    const openable = allVolumes.filter((v) => v.status === 'ready' || v.status === 'display_ready');
    return {
      made: [],
      inventory: [],
      steps: [
        {
          key: 'import',
          title: 'Import a SEG-Y volume',
          detail: 'Check the survey the scan reports, declare the CRS, and view the file while it converts.',
          status: 'todo',
          action: 'import',
        },
        {
          key: 'open',
          title: 'Open a volume',
          detail: 'Choose a volume in the explorer or in Home.',
          status: openable.length ? 'todo' : 'blocked',
          why: openable.length ? undefined : 'No volume has finished converting yet.',
        },
      ],
    };
  }

  const local = Boolean(volume.local);
  const displayOnly = volume.status === 'display_ready';
  const dtype = manifest?.brick?.dtype ?? 'float32le';
  const fullPrecision = !local && !displayOnly && dtype === 'float32le';

  const made = [];
  if (local) {
    made.push('Nothing yet: you are viewing the SEG-Y straight from your computer. Start the import to convert it.');
  } else if (displayOnly) {
    made.push('A display copy for fast viewing (the full-precision copy is still uploading).');
  } else {
    made.push(dtype === 'float32le'
      ? 'The volume, stored at full precision.'
      : 'The volume, stored with 16-bit compression.');
  }
  made.push('Everything else is made when you ask for it, and every automatic result waits for your review.');

  const children = allVolumes.filter((v) => v.parent_volume_id === volume.id && v.kind === 'attribute');
  const attrs = new Set(children.map(attributeOf).filter(Boolean));
  const fromTops = horizons.filter((h) => h.params?.source === 'well_tops');
  const autoFaults = faults.filter((f) => f.params?.source === 'auto');
  const wellsWithTops = wells.filter((w) => (w.tops || []).length > 0);

  const inventory = [
    {
      key: 'attributes',
      label: 'Attribute volumes',
      value: children.length ? `${children.length}: ${children.map((c) => c.name).join(', ')}` : 'none yet',
    },
    {
      key: 'horizons',
      label: 'Horizons',
      value: horizons.length
        ? `${horizons.length}${fromTops.length ? ` (${fromTops.length} from well tops)` : ''}`
        : 'none yet',
    },
    {
      key: 'faults',
      label: 'Faults',
      value: faults.length
        ? `${faults.length}${autoFaults.length ? ` (${autoFaults.length} picked automatically)` : ''}`
        : 'none yet',
    },
    {
      key: 'wells',
      label: 'Wells shown',
      value: wells.length ? `${wells.length}, ${count(wellsWithTops.length, 'with tops', 'with tops')}` : 'none shown',
    },
    { key: 'surfaces', label: 'Surfaces', value: surfaces.length ? String(surfaces.length) : 'none yet' },
    { key: 'velocity', label: 'Velocity model', value: velocityModel ? 'set' : 'not set' },
  ];

  const needsUpload = local ? 'Start the import first: this works on the uploaded volume.' : null;
  const attrWhy = needsUpload
    || (displayOnly ? 'Waits for the full-precision copy to finish uploading.' : null)
    || (!fullPrecision ? 'This volume was imported with 16-bit storage; re-import it without compression.' : null);

  const steps = [
    {
      key: 'variance',
      title: 'Compute a variance volume',
      detail: 'Faults and channel edges light up. Blend it over the seismic in Home, Co-render, with Multiply.',
      status: attrs.has('variance') ? 'done' : attrWhy ? 'blocked' : 'todo',
      why: attrs.has('variance') ? undefined : attrWhy ?? undefined,
      action: 'variance',
    },
    {
      key: 'faults',
      title: 'Detect faults automatically',
      detail: 'Proposes fault sticks over an area you choose; keep the ones you want, then edit them like any fault.',
      status: autoFaults.length ? 'done' : needsUpload ? 'blocked' : 'todo',
      why: autoFaults.length ? undefined : needsUpload ?? undefined,
      action: 'detectFaults',
    },
    {
      key: 'wells',
      title: 'Show wells with tops',
      detail: 'Wells come from the shared registry; a well needs checkshots, a tie or a velocity model to draw in time.',
      status: wellsWithTops.length ? 'done' : registryWellCount === 0 ? 'blocked' : 'todo',
      why: !wellsWithTops.length && registryWellCount === 0
        ? 'No wells yet: import one in Wells, or in Well Data Manager.' : undefined,
      action: 'showWells',
    },
    {
      key: 'framework',
      title: 'Build horizons from the well tops',
      detail: 'Tops to horizons ties the wells, matches each top to its event and tracks one named horizon per top.',
      status: fromTops.length ? 'done'
        : needsUpload ? 'blocked'
          : !wellsWithTops.length ? 'blocked' : 'todo',
      why: fromTops.length ? undefined
        : needsUpload ?? (!wellsWithTops.length ? 'Show wells that carry tops first.' : undefined),
      action: 'topsToHorizons',
    },
    {
      key: 'velocity',
      title: 'Set a velocity model',
      detail: 'Needed for depth sections, depth maps and wells without checkshots.',
      status: velocityModel ? 'done' : needsUpload ? 'blocked' : 'todo',
      why: velocityModel ? undefined : needsUpload ?? undefined,
      action: 'velocity',
    },
    {
      key: 'surface',
      title: 'Make a surface',
      detail: 'Grid a horizon for the Map window, or publish it for Mapping & Surface Studio.',
      status: surfaces.length ? 'done' : horizons.length ? 'todo' : 'blocked',
      why: surfaces.length || horizons.length ? undefined : 'Pick, track or import a horizon first.',
      action: 'makeSurface',
    },
    {
      key: 'more',
      title: 'More attributes',
      detail: 'Fault likelihood (compute it once, then Detect faults starts from it and runs fastest), envelope, instantaneous phase and frequency, sweetness, RMS and AGC.',
      status: attrWhy ? 'blocked' : 'todo',
      why: attrWhy ?? undefined,
      action: 'attributes',
    },
  ];

  return { made, inventory, steps };
}
