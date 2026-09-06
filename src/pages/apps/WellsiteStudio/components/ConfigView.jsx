// Well configuration (spec sections 14, 46): the rig geometry and pump the
// lag engine reads (stored as a dated rig_config observation so it works
// offline and its history is kept), the well settings an administrator
// keeps (rig offset, tours, default depth entry, mandatory sample stages,
// overdue tolerance, approver roles) and the header fields.

import React, { useEffect, useMemo, useState } from 'react';
import RowGridEditor from '@/components/wells/RowGridEditor';
import { Button } from '@/components/ui/button';
import { displacementFromField } from '@/lib/wellsite/pumps';
import { SAMPLE_STAGE_NAMES, WS_ROLES } from '../services/vocab';

const IN = 0.0254;
const num = (v) => (v === '' || v == null ? NaN : Number(v));

function sectionsToRows(sections) {
  return (sections || []).map((s) => ({
    from_ft: (s.from_md_m / 0.3048).toFixed(0), to_ft: (s.to_md_m / 0.3048).toFixed(0),
    cased: s.cased ? 'yes' : 'no', id_in: ((s.cased ? s.casing_id_m : s.hole_id_m) / IN).toFixed(3), description: s.description || '',
  }));
}
function rowsToSections(rows) {
  return rows.map((r) => {
    const cased = r.cased === 'yes';
    const idM = num(r.id_in) * IN;
    return { from_md_m: num(r.from_ft) * 0.3048, to_md_m: num(r.to_ft) * 0.3048, cased, hole_id_m: cased ? null : idM, casing_id_m: cased ? idM : null, description: r.description || '' };
  });
}
function bhaToRows(bha) { return (bha || []).map((b) => ({ label: b.label || '', length_ft: (b.lengthM / 0.3048).toFixed(0), od_in: (b.odM / IN).toFixed(3), id_in: (b.idM / IN).toFixed(3) })); }
function rowsToBha(rows) { return rows.map((r) => ({ label: r.label || '', lengthM: num(r.length_ft) * 0.3048, odM: num(r.od_in) * IN, idM: num(r.id_in) * IN })); }

export default function ConfigView({ backend, well, rigConfig, onSaved, onStatus, canAdmin = true }) {
  const [sections, setSections] = useState(() => sectionsToRows(rigConfig?.hole_sections));
  const [bha, setBha] = useState(() => bhaToRows(rigConfig?.bha));
  const [dp, setDp] = useState(() => ({ od_in: rigConfig?.drillpipe ? (rigConfig.drillpipe.odM / IN).toFixed(3) : '5', id_in: rigConfig?.drillpipe ? (rigConfig.drillpipe.idM / IN).toFixed(3) : '4.276' }));
  const [pump, setPump] = useState(() => ({ type: 'triplex', linerIn: '6', strokeIn: '12', rodIn: '0', efficiency: '0.97', ...(rigConfig?.pump ? Object.fromEntries(Object.entries(rigConfig.pump).map(([k, v]) => [k, String(v)])) : {}) }));
  const [settings, setSettings] = useState(() => ({ ...(well.settings || {}) }));
  const [header, setHeader] = useState(() => ({ ...(well.header || {}) }));

  useEffect(() => { setSettings({ ...(well.settings || {}) }); setHeader({ ...(well.header || {}) }); }, [well]);
  useEffect(() => {
    if (!rigConfig) return;
    setSections(sectionsToRows(rigConfig.hole_sections)); setBha(bhaToRows(rigConfig.bha));
    if (rigConfig.drillpipe) setDp({ od_in: (rigConfig.drillpipe.odM / IN).toFixed(3), id_in: (rigConfig.drillpipe.idM / IN).toFixed(3) });
    if (rigConfig.pump) setPump(Object.fromEntries(Object.entries(rigConfig.pump).map(([k, v]) => [k, String(v)])));
  }, [rigConfig]);

  const disp = useMemo(() => {
    try {
      return displacementFromField({ type: pump.type, linerIn: num(pump.linerIn), strokeIn: num(pump.strokeIn), rodIn: num(pump.rodIn) || 0, efficiency: num(pump.efficiency) });
    } catch (e) { return { error: e.message }; }
  }, [pump]);

  const saveRig = async () => {
    try {
      const payload = {
        hole_sections: rowsToSections(sections), bha: rowsToBha(bha),
        drillpipe: { odM: num(dp.od_in) * IN, idM: num(dp.id_in) * IN, label: `${dp.od_in} in drillpipe` },
        pump: { type: pump.type, linerIn: num(pump.linerIn), strokeIn: num(pump.strokeIn), rodIn: num(pump.rodIn) || 0, efficiency: num(pump.efficiency) },
      };
      for (const s of payload.hole_sections) if (!(s.to_md_m > s.from_md_m) || !((s.cased ? s.casing_id_m : s.hole_id_m) > 0)) throw new Error('Every hole section needs a base below its top and a positive inside diameter.');
      if (disp.error) throw new Error(disp.error);
      await backend.addRecord(well.id, { kind: 'observation', subtype: 'rig_config', payload });
      onStatus?.('Rig configuration recorded.');
      onSaved?.();
    } catch (e) { onStatus?.(e.message); }
  };
  const saveSettings = async () => {
    try {
      const s = { ...settings, rig_offset_min: Number(settings.rig_offset_min) || 0, overdue_tolerance_min: Number(settings.overdue_tolerance_min) || 0 };
      await backend.updateWellSettings(well.id, s);
      await backend.updateWellHeader(well.id, { ...header, gl_elev_m: header.gl_elev_m === '' || header.gl_elev_m == null ? undefined : Number(header.gl_elev_m), rt_offset_m: Number(header.rt_offset_m) || 0 });
      onStatus?.('Well settings saved.');
      onSaved?.();
    } catch (e) { onStatus?.(e.message); }
  };

  const inp = 'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';
  const toggleStage = (name) => {
    const cur = settings.mandatory_sample_stages || [];
    setSettings({ ...settings, mandatory_sample_stages: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] });
  };
  const toggleRole = (name) => {
    const cur = settings.approver_roles || [];
    setSettings({ ...settings, approver_roles: cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name] });
  };

  return (
    <div className="p-4 space-y-6 max-w-4xl" data-testid="ws-config">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-100">Rig geometry and pump</h2>
        <p className="text-[11px] text-slate-400">Read by the lag engine. Saving records a dated configuration; earlier ones are kept.</p>
        <div className="text-xs text-slate-300">Hole sections (ft MD, inside diameter in inches; cased sections use the casing ID)</div>
        <RowGridEditor testIdPrefix="ws-config-section" rows={sections} onChange={setSections} columns={[
          { key: 'from_ft', label: 'From (ft)', type: 'number', width: 90 }, { key: 'to_ft', label: 'To (ft)', type: 'number', width: 90 },
          { key: 'cased', label: 'Cased', type: 'select', options: [{ value: 'no', label: 'open hole' }, { value: 'yes', label: 'cased' }], width: 100 },
          { key: 'id_in', label: 'ID (in)', type: 'number', width: 90 }, { key: 'description', label: 'Description', type: 'text' },
        ]} />
        <div className="text-xs text-slate-300">Bottom hole assembly (bit up)</div>
        <RowGridEditor testIdPrefix="ws-config-bha" rows={bha} onChange={setBha} columns={[
          { key: 'label', label: 'Component', type: 'text' }, { key: 'length_ft', label: 'Length (ft)', type: 'number', width: 90 },
          { key: 'od_in', label: 'OD (in)', type: 'number', width: 90 }, { key: 'id_in', label: 'ID (in)', type: 'number', width: 90 },
        ]} />
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-slate-300">Drillpipe OD (in)<br /><input className={inp} data-testid="ws-config-dp-od" value={dp.od_in} onChange={(e) => setDp({ ...dp, od_in: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Drillpipe ID (in)<br /><input className={inp} data-testid="ws-config-dp-id" value={dp.id_in} onChange={(e) => setDp({ ...dp, id_in: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Pump<br />
            <select className={inp} data-testid="ws-config-pump-type" value={pump.type} onChange={(e) => setPump({ ...pump, type: e.target.value })}>
              <option value="triplex">triplex</option><option value="duplex">duplex</option>
            </select>
          </label>
          <label className="text-xs text-slate-300">Liner (in)<br /><input className={inp} data-testid="ws-config-pump-liner" value={pump.linerIn} onChange={(e) => setPump({ ...pump, linerIn: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Stroke (in)<br /><input className={inp} data-testid="ws-config-pump-stroke" value={pump.strokeIn} onChange={(e) => setPump({ ...pump, strokeIn: e.target.value })} /></label>
          {pump.type === 'duplex' && <label className="text-xs text-slate-300">Rod (in)<br /><input className={inp} data-testid="ws-config-pump-rod" value={pump.rodIn} onChange={(e) => setPump({ ...pump, rodIn: e.target.value })} /></label>}
          <label className="text-xs text-slate-300">Efficiency<br /><input className={inp} data-testid="ws-config-pump-eff" value={pump.efficiency} onChange={(e) => setPump({ ...pump, efficiency: e.target.value })} /></label>
          <div className="text-xs text-cyan-300" data-testid="ws-config-pump-out">
            {disp.error ? disp.error : `${disp.bblPerStroke.toFixed(4)} bbl/stk (${(disp.m3PerStroke * 1000).toFixed(2)} L/stk)`}
          </div>
        </div>
        <Button size="sm" onClick={saveRig} data-testid="ws-config-save-rig">Record rig configuration</Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-100">Well settings</h2>
        {!canAdmin && <div className="text-[11px] text-amber-400">Only a well administrator changes these.</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-slate-300">Rig offset from UTC (min)<br /><input className={inp} type="number" data-testid="ws-config-offset" value={settings.rig_offset_min ?? 0} onChange={(e) => setSettings({ ...settings, rig_offset_min: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Tour starts (local, comma separated)<br /><input className={inp} data-testid="ws-config-tours" value={(settings.tour_starts_local || []).join(',')} onChange={(e) => setSettings({ ...settings, tour_starts_local: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></label>
          <label className="text-xs text-slate-300">Report day starts (local)<br /><input className={inp} data-testid="ws-config-report-start" value={settings.report_day_start_local || '06:00'} onChange={(e) => setSettings({ ...settings, report_day_start_local: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Overdue tolerance (min)<br /><input className={inp} type="number" data-testid="ws-config-tolerance" value={settings.overdue_tolerance_min ?? 15} onChange={(e) => setSettings({ ...settings, overdue_tolerance_min: e.target.value })} /></label>
          <label className="text-xs text-slate-300">Default depth entry<br />
            <span className="flex gap-1">
              <select className={inp} data-testid="ws-config-default-unit" value={settings.default_depth?.unit || 'ft'} onChange={(e) => setSettings({ ...settings, default_depth: { ...(settings.default_depth || {}), unit: e.target.value } })}><option value="ft">ft</option><option value="m">m</option></select>
              <select className={inp} data-testid="ws-config-default-ref" value={settings.default_depth?.reference || 'MD'} onChange={(e) => setSettings({ ...settings, default_depth: { ...(settings.default_depth || {}), reference: e.target.value } })}><option value="MD">MD</option><option value="TVD">TVD</option></select>
              <select className={inp} data-testid="ws-config-default-datum" value={settings.default_depth?.datum || 'RT'} onChange={(e) => setSettings({ ...settings, default_depth: { ...(settings.default_depth || {}), datum: e.target.value } })}>{['KB', 'RT', 'GL', 'MSL'].map((d) => <option key={d} value={d}>{d}</option>)}</select>
            </span>
          </label>
          <label className="text-xs text-slate-300">Keep original photos<br />
            <select className={inp} data-testid="ws-config-keep-originals" value={settings.keep_originals ? 'yes' : 'no'} onChange={(e) => setSettings({ ...settings, keep_originals: e.target.value === 'yes' })}><option value="no">no, working copies only</option><option value="yes">yes</option></select>
          </label>
        </div>
        <div className="text-xs text-slate-300">Mandatory sample stages</div>
        <div className="flex gap-2 flex-wrap">
          {SAMPLE_STAGE_NAMES.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" data-testid={`ws-config-stage-${s}`} checked={(settings.mandatory_sample_stages || []).includes(s)} onChange={() => toggleStage(s)} />{s}</label>
          ))}
        </div>
        <div className="text-xs text-slate-300">Roles that may approve (final tops, conflict resolution)</div>
        <div className="flex gap-2 flex-wrap">
          {WS_ROLES.map((r) => (
            <label key={r.code} className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" data-testid={`ws-config-approver-${r.code}`} checked={(settings.approver_roles || []).includes(r.code)} onChange={() => toggleRole(r.code)} />{r.name}</label>
          ))}
        </div>
        <h3 className="text-xs font-semibold text-slate-200 pt-2">Header</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[['field', 'Field'], ['operator', 'Operator'], ['rig', 'Rig'], ['country', 'Country']].map(([k, label]) => (
            <label key={k} className="text-xs text-slate-300">{label}<br /><input className={inp} data-testid={`ws-config-${k}`} value={header[k] || ''} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} /></label>
          ))}
          <label className="text-xs text-slate-300">KB above MSL (m, from the registry)<br /><input className={inp} disabled value={header.kb_elev_m ?? ''} data-testid="ws-config-kb" /></label>
          <label className="text-xs text-slate-300">Ground level above MSL (m)<br /><input className={inp} type="number" step="any" data-testid="ws-config-gl" value={header.gl_elev_m ?? ''} onChange={(e) => setHeader({ ...header, gl_elev_m: e.target.value })} /></label>
          <label className="text-xs text-slate-300">RT above KB (m)<br /><input className={inp} type="number" step="any" data-testid="ws-config-rt" value={header.rt_offset_m ?? 0} onChange={(e) => setHeader({ ...header, rt_offset_m: e.target.value })} /></label>
        </div>
        <Button size="sm" onClick={saveSettings} disabled={!canAdmin} data-testid="ws-config-save-settings">Save well settings</Button>
      </section>
    </div>
  );
}
