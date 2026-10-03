// Record sharing for an app whose projects live in a saved_<app>_projects
// table through createSavedProjectsService (DCA-U1-011, the pattern of
// Fluid Systems Studio's useFluidStudioProjects, generalised so Decline
// Curve Analysis and Forecast Scenario Hub share one implementation).
//
// With a sharing store: the picker lists the user's own projects, then those
// colleagues shared with the organisation; a project opens with its sharing
// state; a save goes through the store with the version the editor opened at
// (a newer save by someone else is refused with the reason) and happens only
// while the user may write (the owner, or the colleague holding the
// check-out). Without a store every save is a plain owner save, as before.
import { useCallback, useMemo, useState } from 'react';
import { useRecordSharing } from './useRecordSharing';
import { isRecordConflict, copyName } from './rules';

/**
 * @param {{table: string, service: object, sharingStore?: ?object}} a
 *   `service` is createSavedProjectsService(table)
 */
export function useSharedSavedProjects({ table, service, sharingStore = null }) {
  const [rows, setRows] = useState([]);
  const [projectRow, setProjectRow] = useState(null);
  const sharing = useRecordSharing({
    store: sharingStore,
    table,
    record: projectRow,
    onChange: (next) => setProjectRow((prev) => (prev ? { ...prev, ...next } : prev)),
  });
  const userId = sharing.userId;
  const own = useMemo(() => rows.filter((p) => !p.userId || !userId || p.userId === userId), [rows, userId]);
  const shared = useMemo(() => (sharingStore ? rows.filter((p) => p.userId && userId && p.userId !== userId) : []), [rows, userId, sharingStore]);
  const viewingShared = !!projectRow && !!userId && !!projectRow.user_id && projectRow.user_id !== userId;
  // no row known (no store, or not read yet): the owner path, as before
  const canWrite = !projectRow || !sharingStore ? true : sharing.canWrite;

  const refreshList = useCallback(async () => {
    const list = sharingStore && service.listRows ? await service.listRows() : await service.list();
    setRows(list);
    return list;
  }, [service, sharingStore]);

  /** Open one project: its payload, and its row for the sharing state. */
  const loadForOpen = useCallback(async (id) => {
    if (sharingStore && service.loadRow) {
      const got = await service.loadRow(id);
      if (got?.row) sharingStore.trackOpened(table, got.row);
      setProjectRow(got?.row ?? null);
      return got?.payload ?? null;
    }
    setProjectRow(null);
    return service.load(id);
  }, [service, sharingStore, table]);

  /** Read the row of a project just created, so its sharing state shows. */
  const adoptRow = useCallback(async (id) => {
    if (!sharingStore || !service.loadRow) { setProjectRow(null); return null; }
    const got = await service.loadRow(id).catch(() => null);
    if (got?.row) sharingStore.trackOpened(table, got.row);
    setProjectRow(got?.row ?? null);
    return got?.row ?? null;
  }, [service, sharingStore, table]);

  /**
   * Save the payload of the open project. Returns { ok, readOnly?, conflict?, message? }.
   */
  const write = useCallback(async (id, payload) => {
    if (sharingStore && projectRow && projectRow.id === id) {
      if (!sharing.canWrite) return { ok: false, readOnly: true, message: sharing.readOnlyReason || 'This project is open read-only.' };
      const { data, error } = await sharingStore.update(table, id, {
        project_name: payload?.name || 'Untitled project',
        inputs_data: payload,
        updated_at: new Date().toISOString(),
      });
      if (error) return { ok: false, conflict: isRecordConflict(error), message: error.message || 'Save failed' };
      if (data) {
        const { inputs_data: _p, ...row } = data;
        setProjectRow((prev) => ({ ...(prev || {}), ...row }));
      }
      return { ok: true };
    }
    await service.save(id, payload);
    return { ok: true };
  }, [sharingStore, projectRow, sharing.canWrite, sharing.readOnlyReason, table, service]);

  const close = useCallback(() => setProjectRow(null), []);

  return {
    projects: sharingStore ? own : rows,
    sharedProjects: shared,
    projectRow,
    sharing,
    viewingShared,
    canWrite,
    refreshList,
    loadForOpen,
    adoptRow,
    write,
    close,
    copyNameFor: (name) => copyName(name || 'Project', rows.map((p) => p.name)),
  };
}
