// Replace a registry surface in place (Mapping): the row keeps its id and
// storage path, so Earth Modeling stacks and ReservoirCalc Pro imports keep
// pointing at it and see the change; the frame it replaced goes on
// provenance.history and the replaced grid is archived, so it can be
// restored. Used by Re-grid in place and by Replace grid from a file (a
// map re-made elsewhere after a new well, 2026-10-12).

/** The history entry that records the frame a replacement overwrites. */
export function replacementHistory(target, extra = {}) {
  const prev = target?.provenance || {};
  return [...(Array.isArray(prev.history) ? prev.history : []), {
    replaced_at: new Date().toISOString(),
    ...extra,
    previous: {
      nx: target.nx, ny: target.ny, dx: target.dx, dy: target.dy, origin_x: target.origin_x, origin_y: target.origin_y,
      rotation_deg: target.rotation_deg || 0, z_unit: target.z_unit ?? null, z_domain: target.z_domain, kind: target.kind,
      cell_m: prev.cell_m ?? null, depth_ref: prev.depth_ref ?? null, control_points: prev.control_points ?? null,
    },
  }];
}

const DOMAIN_WORD = { depth: 'depth', time: 'two-way time', attribute: 'an attribute' };

/**
 * Replace `target` with an import plan (planImport's result) read from a
 * file. A file whose values are another domain than the surface (TWT for a
 * depth surface, say) is refused: the consuming apps read the row as what
 * it was. Returns the updated row.
 */
export async function replaceFromFilePlan(backend, target, plan, { fileName = null } = {}) {
  if (!target?.id) throw new Error('Choose the surface to replace.');
  if (!target.is_own) throw new Error(`${target.name} is shared with you read-only, so only its owner can replace it.`);
  const was = target.z_domain || 'depth';
  if (plan.zDomain !== was) {
    throw new Error(`${target.name} holds ${DOMAIN_WORD[was] || was}, and this file was read as ${DOMAIN_WORD[plan.zDomain] || plan.zDomain}. Replace it with a file of the same kind, or import the file as a new surface.`);
  }
  // a file read with no CRS declared keeps the surface's placement (its CRS,
  // XY unit and CRS provenance), rather than blanking it
  const keepCrs = !plan.crs && !!target.crs;
  const history = replacementHistory(target, { replaced_by: 'file', file_name: fileName });
  return backend.replaceSurfaceGrid(target, {
    name: target.name,
    // an isochore stays an isochore
    kind: target.kind || plan.kind, spec: plan.spec, grid: plan.grid,
    zDomain: plan.zDomain, zUnit: plan.zUnit,
    ...(keepCrs ? {} : { crs: plan.crs, xyUnit: plan.xyUnit, crsProvenance: plan.crsProvenance }),
    provenance: { ...(target.provenance?.display ? { display: target.provenance.display } : {}), ...plan.provenance, history },
  });
}
