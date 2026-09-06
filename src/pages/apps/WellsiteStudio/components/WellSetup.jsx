// Create the live-well record from a registry well (spec section 9), an
// online step by an organisation member who becomes the well's first
// administrator. KB comes from the registry; GL, RT offset, field,
// operator and rig are entered here because the registry has no columns
// for them (plan section 3).

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function WellSetup({ backend, onCreated, onStatus }) {
  const [registry, setRegistry] = useState(null);
  const [geoId, setGeoId] = useState('');
  const [header, setHeader] = useState({ field: '', operator: '', rig: '', country: '', gl_elev_m: '', rt_offset_m: '0' });
  const [offset, setOffset] = useState('0');
  const [busy, setBusy] = useState(false);
  const online = backend.online();

  useEffect(() => {
    let alive = true;
    backend.listRegistryWells().then((w) => { if (alive) setRegistry(w); }).catch((e) => { if (alive) { setRegistry([]); onStatus?.(e.message); } });
    return () => { alive = false; };
  }, [backend, onStatus]);

  const create = async () => {
    const geo = (registry || []).find((w) => w.id === geoId);
    if (!geo) { onStatus?.('Choose a registry well first.'); return; }
    setBusy(true);
    try {
      const h = {
        field: header.field || null, operator: header.operator || null, rig: header.rig || null, country: header.country || null,
        rt_offset_m: Number(header.rt_offset_m) || 0,
      };
      if (header.gl_elev_m !== '') h.gl_elev_m = Number(header.gl_elev_m);
      const well = await backend.createWell({ geoWell: geo, name: geo.name, header: h, settings: { rig_offset_min: Number(offset) || 0 } });
      onStatus?.(`Live well ${well.name} created. You are its administrator.`);
      onCreated?.(well);
    } catch (e) { onStatus?.(e.message); } finally { setBusy(false); }
  };

  const inp = 'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 w-full';
  return (
    <div className="p-4 max-w-xl space-y-3" data-testid="ws-setup">
      <h2 className="text-sm font-semibold text-slate-100">Start a live well</h2>
      <p className="text-xs text-slate-400">Pick the registry well (Well Data Manager). The record created here is shared with everyone you add as a member, and works offline once it has been opened on this device.</p>
      {!online && <div className="text-xs text-amber-400" data-testid="ws-setup-offline">A connection is needed to start a well.</div>}
      <label className="block text-xs text-slate-300">Registry well
        <select value={geoId} onChange={(e) => setGeoId(e.target.value)} data-testid="ws-setup-well" className={inp}>
          <option value="">{registry ? 'choose a well' : 'loading wells'}</option>
          {(registry || []).map((w) => <option key={w.id} value={w.id}>{w.name}{Number.isFinite(w.kb_m) ? ` (KB ${w.kb_m} m)` : ''}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {[['field', 'Field'], ['operator', 'Operator'], ['rig', 'Rig'], ['country', 'Country']].map(([k, label]) => (
          <label key={k} className="block text-xs text-slate-300">{label}
            <input value={header[k]} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} data-testid={`ws-setup-${k}`} className={inp} />
          </label>
        ))}
        <label className="block text-xs text-slate-300">Ground level above MSL (m)
          <input type="number" step="any" value={header.gl_elev_m} onChange={(e) => setHeader({ ...header, gl_elev_m: e.target.value })} data-testid="ws-setup-gl" className={inp} />
        </label>
        <label className="block text-xs text-slate-300">RT above KB (m, 0 when RT is KB)
          <input type="number" step="any" value={header.rt_offset_m} onChange={(e) => setHeader({ ...header, rt_offset_m: e.target.value })} data-testid="ws-setup-rt" className={inp} />
        </label>
        <label className="block text-xs text-slate-300">Rig local offset from UTC (minutes)
          <input type="number" step="1" value={offset} onChange={(e) => setOffset(e.target.value)} data-testid="ws-setup-offset" className={inp} />
        </label>
      </div>
      <Button size="sm" disabled={!online || busy || !geoId} onClick={create} data-testid="ws-setup-create">Create live well</Button>
    </div>
  );
}
