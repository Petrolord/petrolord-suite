// Velocity model editor (moved out of the ViewerPanel control rows into
// the Velocity dialog): single V(z) or layer-cake drafts, save-to-volume,
// and the well-tie calibration panel. Presentational — every piece of
// state lives in the workspace controller and arrives as props.

import React from 'react';
import { Loader2, Ruler, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { describeVelocity } from '../../engine/velocityModel';
import { surveyAffine } from '../../engine/surveyGeometry';
import WellTiePanel from '../WellTiePanel';

export default function VelocityModelEditor({
  velMode, setVelMode, velDraft, setVelDraft, velLayers, setVelLayers,
  velBusy, saveVelocity, velocityModel, velocityForDisplay, velBoundaries,
  calOpen, setCalOpen, horizons, wells, manifest, geom,
  loadGridById, applyCalibratedModel,
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-slate-400 text-xs">Velocity model</Label>
        <select
          className="rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
          value={velMode}
          onChange={(e) => {
            const mode = e.target.value;
            setVelMode(mode);
            if (mode === 'layercake' && velLayers.length === 0) {
              setVelLayers([
                { baseHorizonId: '', v0: '', k: '' },
                { baseHorizonId: '', v0: '', k: '' },
              ]);
            }
          }}
        >
          <option value="linear">Single V(z)</option>
          <option value="layercake">Layer cake</option>
        </select>
        {velMode === 'linear' && (
          <>
            <span className="text-xs text-slate-500">V0</span>
            <input
              type="number"
              className="w-24 rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
              value={velDraft.v0}
              onChange={(e) => setVelDraft((d) => ({ ...d, v0: e.target.value }))}
              placeholder="e.g. 2000"
              min="1"
              step="50"
            />
            <span className="text-xs text-slate-500">m/s · k</span>
            <input
              type="number"
              className="w-20 rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
              value={velDraft.k}
              onChange={(e) => setVelDraft((d) => ({ ...d, k: e.target.value }))}
              placeholder="0"
              step="0.05"
            />
            <span className="text-xs text-slate-500">1/s</span>
          </>
        )}
        <Button
          variant="outline" size="sm"
          onClick={saveVelocity}
          disabled={velBusy}
          title={velMode === 'linear'
            ? 'Persist V(z) = V0 + k·z on this volume (clear V0 to remove)'
            : 'Persist the layer cake on this volume (remove all layers to clear)'}
        >
          {velBusy
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />}
          Save to volume
        </Button>
        <span className="text-xs text-slate-500">
          {velocityModel
            ? `${describeVelocity(velocityModel)} — drives depth maps and depth exports`
            : 'not set — depth maps and model-based exports unavailable'}
        </span>
      </div>
      {velMode === 'layercake' && (
        <div className="space-y-1 pl-2 border-l border-slate-800">
          {velLayers.map((l, i) => {
            const last = i === velLayers.length - 1;
            const set = (patch) => setVelLayers((rows) =>
              rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
            return (
              // draft rows have no stable identity — index keys are
              // fine while the list is small and editable in place
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 w-16">Layer {i + 1}</span>
                {last ? (
                  <span className="text-xs text-slate-500 w-44">below the last horizon</span>
                ) : (
                  <select
                    className="w-44 rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                    value={l.baseHorizonId}
                    onChange={(e) => set({ baseHorizonId: e.target.value })}
                  >
                    <option value="">down to horizon…</option>
                    {horizons.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                )}
                <span className="text-xs text-slate-500">V0</span>
                <input
                  type="number"
                  className="w-24 rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                  value={l.v0}
                  onChange={(e) => set({ v0: e.target.value })}
                  placeholder="m/s at layer top"
                  min="1"
                  step="50"
                />
                <span className="text-xs text-slate-500">m/s · k</span>
                <input
                  type="number"
                  className="w-20 rounded-md bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-1 text-xs"
                  value={l.k}
                  onChange={(e) => set({ k: e.target.value })}
                  placeholder="0"
                  step="0.05"
                />
                <span className="text-xs text-slate-500">1/s</span>
                <Button
                  variant="ghost" size="sm"
                  className="h-6 px-1.5 text-slate-500 hover:text-red-400"
                  onClick={() => setVelLayers((rows) => rows.filter((_, j) => j !== i))}
                  title="Remove this layer"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline" size="sm"
            onClick={() => setVelLayers((rows) => [
              ...rows.slice(0, Math.max(rows.length - 1, 0)),
              { baseHorizonId: '', v0: '', k: '' },
              ...rows.slice(Math.max(rows.length - 1, 0)),
            ])}
          >
            Add layer
          </Button>
          <span className="text-xs text-slate-500 ml-2">
            layers save sorted by horizon time; where a boundary horizon has no
            pick, the layer above extends to the next one
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline" size="sm"
          className={calOpen ? 'border-cyan-500/60 text-cyan-300' : ''}
          onClick={() => setCalOpen((v) => !v)}
          disabled={!velocityForDisplay || !(wells || []).length || !horizons.length}
          title={!velocityForDisplay
            ? 'Save a velocity model first — calibration adjusts the current model'
            : !(wells || []).length
              ? 'Toggle wells with tops visible in the explorer first'
              : 'Fit the velocity model so converted horizon depths match the well tops'}
        >
          <Ruler className="w-4 h-4 mr-2" />
          Calibrate from wells
        </Button>
      </div>
      {calOpen && velocityForDisplay && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <WellTiePanel
            wells={wells || []}
            horizons={horizons}
            velocityModel={velocityForDisplay}
            boundaries={velBoundaries}
            dtUs={manifest.geometry.dt_us}
            geom={geom}
            affine={surveyAffine(manifest.geometry)}
            loadGrid={loadGridById}
            onApply={applyCalibratedModel}
          />
        </div>
      )}
    </div>
  );
}
