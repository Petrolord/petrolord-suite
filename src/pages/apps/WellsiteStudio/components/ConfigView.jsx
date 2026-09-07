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
import { validateProfile, PETROLORD_PROFILE } from '@/lib/wellsite/abbreviations';
import { validateTemplate, DEFAULT_DAILY_TEMPLATE } from '@/lib/wellsite/reports';
import { RIG_TYPES, FLOATER_TYPES } from '../services/vocab';

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
  // Floating rigs (tester note 2026-09-07): the marine riser above the BOP and the booster pump into its base.
  const [rigType, setRigType] = useState(() => rigConfig?.rig_type || 'land');
  const [riser, setRiser] = useState(() => ({ bop_ft: rigConfig?.riser?.to_md_m > 0 ? (rigConfig.riser.to_md_m / 0.3048).toFixed(0) : '', id_in: rigConfig?.riser?.id_m > 0 ? (rigConfig.riser.id_m / IN).toFixed(3) : '19.5' }));
  const [booster, setBooster] = useState(() => ({ type: 'triplex', linerIn: '5', strokeIn: '12', rodIn: '0', efficiency: '0.97', ...(rigConfig?.booster ? Object.fromEntries(Object.entries(rigConfig.booster).map(([k, v]) => [k, String(v)])) : {}) }));
  const floater = FLOATER_TYPES.includes(rigType);
  const [settings, setSettings] = useState(() => ({ ...(well.settings || {}) }));
  const [header, setHeader] = useState(() => ({ ...(well.header || {}) }));
  const [profileText, setProfileText] = useState(() => (well.settings && well.settings.abbreviation_profile ? JSON.stringify(well.settings.abbreviation_profile, null, 2) : ''));
  const [profileErrors, setProfileErrors] = useState([]);
  const [templateText, setTemplateText] = useState(() => (well.settings && well.settings.daily_template ? JSON.stringify(well.settings.daily_template, null, 2) : ''));
  const [templateErrors, setTemplateErrors] = useState([]);

  // reset the editors only when the well's settings or header actually change (a refresh hands over a
  // new object with the same content, and must not wipe what the user is typing)
  const settingsKey = JSON.stringify(well.settings || {});
  const headerKey = JSON.stringify(well.header || {});
  useEffect(() => { setSettings(JSON.parse(settingsKey)); setHeader(JSON.parse(headerKey)); }, [settingsKey, headerKey]);
  useEffect(() => {
    if (!rigConfig) return;
    setSections(sectionsToRows(rigConfig.hole_sections)); setBha(bhaToRows(rigConfig.bha));
    if (rigConfig.drillpipe) setDp({ od_in: (rigConfig.drillpipe.odM / IN).toFixed(3), id_in: (rigConfig.drillpipe.idM / IN).toFixed(3) });
    if (rigConfig.pump) setPump(Object.fromEntries(Object.entries(rigConfig.pump).map(([k, v]) => [k, String(v)])));
    setRigType(rigConfig.rig_type || 'land');
    if (rigConfig.riser) setRiser({ bop_ft: rigConfig.riser.to_md_m > 0 ? (rigConfig.riser.to_md_m / 0.3048).toFixed(0) : '', id_in: rigConfig.riser.id_m > 0 ? (rigConfig.riser.id_m / IN).toFixed(3) : '19.5' });
    if (rigConfig.booster) setBooster(Object.fromEntries(Object.entries(rigConfig.booster).map(([k, v]) => [k, String(v)])));
  }, [rigConfig]);

  const disp = useMemo(() => {
    try {
      return displacementFromField({ type: pump.type, linerIn: num(pump.linerIn), strokeIn: num(pump.strokeIn), rodIn: num(pump.rodIn) || 0, efficiency: num(pump.efficiency) });
    } catch (e) { return { error: e.message }; }
  }, [pump]);
  const boosterDisp = useMemo(() => {
    try {
      return displacementFromField({ type: booster.type, linerIn: num(booster.linerIn), strokeIn: num(booster.strokeIn), rodIn: num(booster.rodIn) || 0, efficiency: num(booster.efficiency) });
    } catch (e) { return { error: e.message }; }
  }, [booster]);

  const saveRig = async () => {
    try {
      const payload = {
        rig_type: rigType,
        hole_sections: rowsToSections(sections), bha: rowsToBha(bha),
        drillpipe: { odM: num(dp.od_in) * IN, idM: num(dp.id_in) * IN, label: `${dp.od_in} in drillpipe` },
        pump: { type: pump.type, linerIn: num(pump.linerIn), strokeIn: num(pump.strokeIn), rodIn: num(pump.rodIn) || 0, efficiency: num(pump.efficiency) },
        riser: null,
        booster: null,
      };
      for (const s of payload.hole_sections) if (!(s.to_md_m > s.from_md_m) || !((s.cased ? s.casing_id_m : s.hole_id_m) > 0)) throw new Error('Every hole section needs a base below its top and a positive inside diameter.');
      if (disp.error) throw new Error(disp.error);
      if (floater) {
        const bopM = num(riser.bop_ft) * 0.3048;
        const idM = num(riser.id_in) * IN;
        if (!(bopM > 0) || !(idM > 0)) throw new Error('A floating rig needs the BOP depth below the rotary table and the riser inside diameter.');
        if (boosterDisp.error) throw new Error(boosterDisp.error);
        payload.riser = { to_md_m: bopM, id_m: idM };
        payload.booster = { type: booster.type, linerIn: num(booster.linerIn), strokeIn: num(booster.strokeIn), rodIn: num(booster.rodIn) || 0, efficiency: num(booster.efficiency) };
        const inside = payload.hole_sections.filter((x) => x.from_md_m < bopM - 1e-6);
        if (inside.length) throw new Error(`On a floating rig the hole sections start at the BOP (${riser.bop_ft} ft); the riser is entered above. Move the top of the first section to ${riser.bop_ft} ft.`);
      }
      await backend.addRecord(well.id, { kind: 'observation', subtype: 'rig_config', payload });
      onStatus?.('Rig configuration recorded.');
      onSaved?.();
    } catch (e) { onStatus?.(e.message); }
  };
  const saveSettings = async () => {
    try {
      const s = { ...settings, rig_offset_min: Number(settings.rig_offset_min) || 0, overdue_tolerance_min: Number(settings.overdue_tolerance_min) || 0 };
      if (profileText.trim()) {
        let parsed;
        try { parsed = JSON.parse(profileText); } catch { throw new Error('The abbreviation profile is not valid JSON.'); }
        const errs = validateProfile(parsed);
        setProfileErrors(errs);
        if (errs.length) throw new Error(errs[0]);
        s.abbreviation_profile = parsed;
      } else { s.abbreviation_profile = null; setProfileErrors([]); }
      if (templateText.trim()) {
        let parsed;
        try { parsed = JSON.parse(templateText); } catch { throw new Error('The daily report template is not valid JSON.'); }
        const errs = validateTemplate(parsed);
        setTemplateErrors(errs);
        if (errs.length) throw new Error(errs[0]);
        s.daily_template = parsed;
      } else { s.daily_template = null; setTemplateErrors([]); }
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
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-slate-300">Rig type<br />
            <select className={inp} data-testid="ws-config-rig-type" value={rigType} onChange={(e) => setRigType(e.target.value)}>
              {RIG_TYPES.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </label>
          {floater && (
            <>
              <label className="text-xs text-slate-300">BOP depth below RT (ft)<br /><input className={inp} data-testid="ws-config-riser-bop" value={riser.bop_ft} onChange={(e) => setRiser({ ...riser, bop_ft: e.target.value })} placeholder="air gap + water depth" /></label>
              <label className="text-xs text-slate-300">Riser ID (in)<br /><input className={inp} data-testid="ws-config-riser-id" value={riser.id_in} onChange={(e) => setRiser({ ...riser, id_in: e.target.value })} /></label>
            </>
          )}
        </div>
        {floater && (
          <p className="text-[11px] text-cyan-300/80" data-testid="ws-config-floater-note">Floating rig: returns travel up the marine riser above the BOP, and the booster pump adds flow at the riser base. Enter the hole sections from the BOP down; the riser is the row above them.</p>
        )}
        <div className="text-xs text-slate-300">Hole sections (ft MD, inside diameter in inches; cased sections use the casing ID{floater ? '; start at the BOP' : ''})</div>
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
        {floater && (
          <div className="flex items-end gap-3 flex-wrap" data-testid="ws-config-booster">
            <label className="text-xs text-slate-300">Booster pump<br />
              <select className={inp} data-testid="ws-config-booster-type" value={booster.type} onChange={(e) => setBooster({ ...booster, type: e.target.value })}>
                <option value="triplex">triplex</option><option value="duplex">duplex</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">Liner (in)<br /><input className={inp} data-testid="ws-config-booster-liner" value={booster.linerIn} onChange={(e) => setBooster({ ...booster, linerIn: e.target.value })} /></label>
            <label className="text-xs text-slate-300">Stroke (in)<br /><input className={inp} data-testid="ws-config-booster-stroke" value={booster.strokeIn} onChange={(e) => setBooster({ ...booster, strokeIn: e.target.value })} /></label>
            {booster.type === 'duplex' && <label className="text-xs text-slate-300">Rod (in)<br /><input className={inp} value={booster.rodIn} onChange={(e) => setBooster({ ...booster, rodIn: e.target.value })} /></label>}
            <label className="text-xs text-slate-300">Efficiency<br /><input className={inp} data-testid="ws-config-booster-eff" value={booster.efficiency} onChange={(e) => setBooster({ ...booster, efficiency: e.target.value })} /></label>
            <div className="text-xs text-cyan-300" data-testid="ws-config-booster-out">
              {boosterDisp.error ? boosterDisp.error : `${boosterDisp.bblPerStroke.toFixed(4)} bbl/stk (${(boosterDisp.m3PerStroke * 1000).toFixed(2)} L/stk) into the riser base`}
            </div>
          </div>
        )}
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
        <h3 className="text-xs font-semibold text-slate-200 pt-2">Abbreviation profile (operator house style)</h3>
        <p className="text-[11px] text-slate-400">JSON with `terms` per table over the Petrolord default ({PETROLORD_PROFILE.name}); any term it does not define falls back to the default and the Describe screen says so. Leave empty for the default.</p>
        <textarea value={profileText} onChange={(e) => setProfileText(e.target.value)} data-testid="ws-config-profile" rows={5} spellCheck={false}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-100" placeholder='{"id": "acme", "name": "Acme", "terms": {"colourHue": {"grey": "gry"}}, "format": {"percentStyle": "suffix"}}' />
        {profileErrors.length > 0 && <div className="text-[11px] text-amber-400" data-testid="ws-config-profile-error">{profileErrors[0]}</div>}
        <h3 className="text-xs font-semibold text-slate-200 pt-2">Daily report template (operator)</h3>
        <p className="text-[11px] text-slate-400">JSON with an id and a list of sections, each with an id, a title and a source ({DEFAULT_DAILY_TEMPLATE.sections.map((x) => x.source).filter((v, i, a) => a.indexOf(v) === i).join(', ')}; narrative sections name the text they edit). Leave empty for the generic template ({DEFAULT_DAILY_TEMPLATE.name}). A real operator report replaces this without code.</p>
        <textarea value={templateText} onChange={(e) => setTemplateText(e.target.value)} data-testid="ws-config-template" rows={5} spellCheck={false}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-100" placeholder='{"id": "acme-dgr", "name": "Acme DGR", "version": 1, "sections": [{"id": "status", "title": "Well status", "source": "status"}]}' />
        {templateErrors.length > 0 && <div className="text-[11px] text-amber-400" data-testid="ws-config-template-error">{templateErrors[0]}</div>}
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
