// The survey_meta a manifest v4 seismic_volumes row carries. Pure, no
// React or Supabase imports: the browser import job (importJobs.js) and the
// seismic worker's stack_to_v4 job both use it, so a server conversion
// writes exactly the row a browser one does.

/**
 * The survey_meta a v4 row carries once the display copy is up: the v1
 * fields (so every existing consumer reads it unchanged) plus the v4
 * copy sizes. storage_bytes is what is actually stored (compressed).
 */
export function v4SurveyMeta(manifest, record, ingestRec) {
  const g = manifest.geometry;
  const displayBytes = record.bricks.display.storedBytes;
  const f32Bytes = record.bricks.f32.storedBytes;
  return {
    il: g.il,
    xl: g.xl,
    ns: g.ns,
    dt_us: g.dt_us,
    corners: g.corners,
    ...(g.affine ? { affine: g.affine } : {}),
    ...(g.coord_scalar != null ? { coord_scalar: g.coord_scalar } : {}),
    ...(g.crs ? { crs: g.crs } : {}),
    sample_format: manifest.source.sample_format,
    il_byte: manifest.source.il_byte,
    xl_byte: manifest.source.xl_byte,
    brick: manifest.brick.grid,
    brick_size: manifest.brick.size,
    stats: manifest.stats,
    storage_bytes: displayBytes + f32Bytes,
    v4: {
      display_bytes: displayBytes,
      f32_bytes: f32Bytes,
      clip: manifest.display.clip,
      levels: manifest.display.levels.length,
    },
    ingest: ingestRec,
  };
}
