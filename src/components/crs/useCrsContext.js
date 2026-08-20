// Project CRS context for import doors: fetches once per mount and
// exposes {projectTag, projectName, customDefs}, plus a helper that
// commits the Petrel first-import rule (a placed import with no
// Project CRS set defines it). Failures degrade to null so forms stay
// usable without auth (dev harnesses) and store UNKNOWN placements.

import { useEffect, useState, useCallback } from 'react';
import { getProjectCrs, setProjectCrs } from '@/lib/crs/settingsService';
import { crsDisplayName, crsUnit } from '@/lib/crs';
import { UNKNOWN } from '@/lib/crs/tags';

export default function useCrsContext() {
  const [ctx, setCtx] = useState(null);

  const refresh = useCallback(() => {
    getProjectCrs()
      .then((p) => setCtx({
        projectTag: p.tag === UNKNOWN ? null : p.tag,
        projectName: p.name,
        customDefs: p.customDefs || {},
      }))
      .catch(() => setCtx(null));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /** Act on a draft's autoSetProject flag after a successful save. */
  const commitAutoSetProject = useCallback(async (tag) => {
    if (!tag) return;
    try {
      await setProjectCrs({
        tag,
        name: crsDisplayName(tag, ctx?.customDefs || {}),
        xyUnit: crsUnit(tag, ctx?.customDefs || {}),
        allowWithData: true,
      });
      refresh();
    } catch {
      // The lock can race a concurrent import; the placed data is
      // stored with its tag either way, so losing the race is harmless.
    }
  }, [ctx, refresh]);

  return { crsContext: ctx, refreshCrsContext: refresh, commitAutoSetProject };
}
