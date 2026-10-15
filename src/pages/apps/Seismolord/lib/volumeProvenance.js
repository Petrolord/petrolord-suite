// Where a volume came from, in words (crop before upload, 2026-10-14): the
// source file, its original geometry and the crop, read from the record the
// import keeps (survey_meta.ingest.crop, manifest source.crop), and the
// pilot sub-volume a QI run was limited to (survey_meta.pilot). Shown in
// Seismolord's Seismic Explorer and in QI Studio's report data section.

const n = (v) => (v == null ? '?' : Number(v).toLocaleString('en-US'));
const MODE = { browser: 'cropped in the browser', upload: 'cropped before upload', server: 'cropped on the server' };

/** The crop record of a volume row, or null. */
export const cropOf = (row) => row?.survey_meta?.ingest?.crop || row?.crop || null;

/** Plain lines describing a crop record; [] when the volume was not cropped. */
export function cropLines(crop) {
  if (!crop) return [];
  const s = crop.source || {};
  const dt = s.dt_us ? s.dt_us / 1000 : null;
  // a depth import's window and interval read in its depth unit (P1.6)
  const u = crop.vertical?.domain === 'depth' ? (crop.vertical.unit === 'ft' ? 'ft' : 'm') : 'ms';
  const lines = [];
  lines.push(`Source file ${s.file_name || 'unknown'}: ${n(s.traces)} traces, inlines ${s.il?.min} to ${s.il?.max}, `
    + `crosslines ${s.xl?.min} to ${s.xl?.max}, ${n(s.ns)} samples${dt ? ` at ${dt} ${u}` : ''}.`);
  lines.push(`${crop.name ? `Crop "${crop.name}"` : 'Crop'} (${MODE[crop.mode] || 'cropped'}): inlines ${crop.il?.from} to ${crop.il?.to}`
    + `${crop.il?.step > (s.il?.step || 1) ? ` every ${crop.il.step}` : ''}, crosslines ${crop.xl?.from} to ${crop.xl?.to}`
    + `${crop.xl?.step > (s.xl?.step || 1) ? ` every ${crop.xl.step}` : ''}${crop.polygon ? ' inside a polygon' : ''}, `
    + `${crop.window?.from} to ${crop.window?.to} ${u} (samples ${crop.samples?.first} to ${crop.samples?.last}), ${n(crop.kept_traces)} traces kept.`);
  return lines;
}

/** One line for a pilot sub-volume, or null. */
export function pilotLine(meta) {
  const p = meta?.pilot;
  if (!p) return null;
  return `Pilot sub-volume${p.crop_name ? ` "${p.crop_name}"` : ''}: inlines ${p.il?.from} to ${p.il?.to}, crosslines ${p.xl?.from} to ${p.xl?.to}, `
    + `${p.t_ms?.from} to ${p.t_ms?.to} ms. Outside it the volume is empty.`;
}

/** Everything about a volume row's origin, as lines. */
export function provenanceLines(row) {
  const out = cropLines(cropOf(row));
  const pl = pilotLine(row?.survey_meta);
  if (pl) out.push(pl);
  return out;
}
