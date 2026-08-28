// Keeping a studio's well description in step with the spine (P6.5).
//
// Every production design studio needs the same four things once a well
// is linked: know whether that well already has a model, load it, save
// the current one back, and say when the two have diverged. This hook
// is that, written once, so the shared well record does not arrive with
// its own triplicated wiring.
//
// It never syncs on its own. A design is entitled to try a different
// inflow without rewriting the field's record for everyone, so loading
// and saving are both deliberate acts and the divergence is reported
// rather than resolved.
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as spine from '@/lib/productionSpine';
import {
  wellInputsFrom, toWellModelPayload, fromWellModelPayload,
} from '@/utils/production/wellModel';

/**
 * @param {object}   inputs        the studio's full inputs
 * @param {Function} setInputs     React state setter for them
 * @param {string?}  wellId        linked spine well, or null
 * @param {string?}  wellName      for the messages
 * @param {Function} addNotification
 * @param {Function} [onLoaded]    called after a load, so a studio can
 *                                 clear runs that no longer apply
 */
export const useWellModelSync = ({
  inputs, setInputs, wellId, wellName, addNotification, onLoaded,
}) => {
  const [savedRow, setSavedRow] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!wellId) { setSavedRow(null); return; }
    try {
      const row = await spine.getWellModel(wellId);
      setSavedRow(row ? { ...row, inputs: fromWellModelPayload(row.model_data) } : null);
    } catch (e) {
      console.error(e);
      setSavedRow(null);
    }
  }, [wellId]);

  useEffect(() => { reload(); }, [reload]);

  /**
   * Whether what the studio holds differs from what the well has. The
   * comparison is on the typed strings, because that is what round
   * trips; comparing coerced numbers would call "2.441" and "2.4410"
   * different and a half-typed field a change.
   */
  const isDirty = useMemo(() => {
    if (!savedRow?.inputs) return false;
    return JSON.stringify(wellInputsFrom(inputs)) !== JSON.stringify(wellInputsFrom(savedRow.inputs));
  }, [inputs, savedRow]);

  const loadFromSpine = useCallback(() => {
    if (!savedRow?.inputs) {
      addNotification('That well has no model on the spine yet.', 'info');
      return;
    }
    setInputs((prev) => ({ ...prev, ...wellInputsFrom(savedRow.inputs) }));
    if (onLoaded) onLoaded();
    addNotification(
      `Loaded ${wellName || 'the well'}'s model: trajectory, fluid, inflow and completion. The duty this design runs at is unchanged.`,
      'success',
    );
  }, [savedRow, setInputs, onLoaded, wellName, addNotification]);

  const saveToSpine = useCallback(async () => {
    if (!wellId) {
      addNotification('Link a well on the spine first: a well model belongs to a well.', 'error');
      return;
    }
    setBusy(true);
    try {
      const row = await spine.upsertWellModel(wellId, toWellModelPayload(inputs));
      setSavedRow({ ...row, inputs: fromWellModelPayload(row.model_data) });
      addNotification(
        `Saved the well model to ${wellName || 'the well'}. Every production studio now designs against the same description.`,
        'success',
      );
    } catch (e) {
      console.error(e);
      addNotification(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [wellId, inputs, wellName, addNotification]);

  return { savedWellModel: savedRow, wellModelDirty: isDirty, loadFromSpine, saveToSpine, wellModelBusy: busy, reloadWellModel: reload };
};
