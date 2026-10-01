// Well configuration (spec sections 14, 46): the rig geometry and pump the
// lag engine reads (stored as a dated rig_config observation so it works
// offline and its history is kept), the well settings an administrator
// keeps (rig offset, tours, default depth entry, mandatory sample stages,
// overdue tolerance, approver roles) and the header fields.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import RowGridEditor from '@/components/wells/RowGridEditor';
import { Button } from '@/components/ui/button';
import { displacementFromField } from '@/lib/wellsite/pumps';
import { SAMPLE_STAGE_NAMES, WS_ROLES } from '../services/vocab';
import { validateProfile, PETROLORD_PROFILE } from '@/lib/wellsite/abbreviations';
import { validateTemplate, DEFAULT_DAILY_TEMPLATE } from '@/lib/wellsite/reports';
import { RIG_TYPES, FLOATER_TYPES } from '../services/vocab';
import { parseFieldNumber } from '../services/units';
import { kbStatus } from '../services/wellContext';

const IN = 0.0254;
// WS-U1-008: fractions and comma decimals as drillers type them ("12 1/4", "8-1/2", "12,25")
const num = (v) => (v === '' || v == null ? NaN : parseFieldNumber(v));

// Geometry is stored in metres and shown in feet and inches. The display keeps enough decimals to
// round-trip what was typed (3 in feet, 4 in inches, trailing zeros dropped), and a value whose text
// was not edited goes back as the exact stored metres, so saving the config again never moves the
// geometry (Ekene kit finding 2026-09-23: whole-foot display rounded it on every re-save).
const FT = 0.3048;
const shown = (m, f, dp) => (Number.isFinite(m) ? String(Number((m / f).toFixed(dp))) : '');
const kept = (text, m, f, dp) => (Number.isFinite(m) && String(text).trim() === shown(m, f, dp) ? m : num(text) * f);
// WS-U1-017: lengths along hole follow the display unit (ft or m); diameters stay in inches, as every rig quotes them
let LEN = FT;
const ftShown = (m) => shown(m, LEN, 3);
const inShown = (m) => shown(m, IN, 4);
const ftKept = (text, m) => kept(text, m, LEN, 3);
const inKept = (text, m) => kept(text, m, IN, 4);

/** WS-U1-005: Well Design's hole sections (loaded with the prognosis) as rig geometry; on a floater they start at the BOP. */
export function sectionsFromPrognosis(holeSections, { bopM = null } = {}) {
  const out = [];
  for (const h of holeSections || []) {
    const idM = h.cased ? h.casing_id_m : h.hole_id_m;
    if (!(h.to_md_m > h.from_md_m) || !(idM > 0)) continue;
    let from = h.from_md_m;
    if (bopM > 0) { if (h.to_md_m <= bopM) continue; from = Math.max(from, bopM); }
    out.push({ from_md_m: from, to_md_m: h.to_md_m, cased: !!h.cased, hole_id_m: h.hole_id_m ?? null, casing_id_m: h.cased ? h.casing_id_m : null, description: h.description || (h.cased ? 'cased (Well Design)' : 'open hole (Well Design)') });
  }
  return out;
}

function sectionsToRows(sections) {
  return (sections || []).map((s) => {
    const idM = s.cased ? s.casing_id_m : s.hole_id_m;
    return { from_ft: ftShown(s.from_md_m), to_ft: ftShown(s.to_md_m), cased: s.cased ? 'yes' : 'no', id_in: inShown(idM), description: s.description || '', _m: { from: s.from_md_m, to: s.to_md_m, id: idM } };
  });
}
function rowsToSections(rows) {
  return rows.map((r) => {
    const cased = r.cased === 'yes';
    const o = r._m || {};
    const idM = inKept(r.id_in, o.id);
    return { from_md_m: ftKept(r.from_ft, o.from), to_md_m: ftKept(r.to_ft, o.to), cased, hole_id_m: cased ? null : idM, casing_id_m: cased ? idM : null, description: r.description || '' };
  });
}
function bhaToRows(bha) { return (bha || []).map((b) => ({ label: b.label || '', length_ft: ftShown(b.lengthM), od_in: inShown(b.odM), id_in: inShown(b.idM), _m: { length: b.lengthM, od: b.odM, id: b.idM } })); }
function rowsToBha(rows) { return rows.map((r) => { const o = r._m || {}; return { label: r.label || '', lengthM: ftKept(r.length_ft, o.length), odM: inKept(r.od_in, o.od), idM: inKept(r.id_in, o.id) }; }); }
const dpToState = (d) => ({ od_in: inShown(d.odM), id_in: inShown(d.idM), _m: { od: d.odM, id: d.idM } });
const riserToState = (r) => ({ bop_ft: r.to_md_m > 0 ? ftShown(r.to_md_m) : '', id_in: r.id_m > 0 ? inShown(r.id_m) : '19.5', _m: { bop: r.to_md_m, id: r.id_m } });

export default function ConfigView({ backend, well, rigConfig, onSaved, onStatus, canAdmin = true, membersSlot = null, unit = 'ft', prognosis = null }) {
  LEN = unit === 'm' ? 1 : FT;
  const LU = unit === 'm' ? 'm' : 'ft';
  const kb = kbStatus(well && well.header ? Number(well.header.kb_elev_m) : NaN);
  const wdSections = (prognosis && prognosis.hole_sections) || [];
  const [sections, setSections] = useState(() => sectionsToRows(rigConfig?.hole_sections));
  const [bha, setBha] = useState(() => bhaToRows(rigConfig?.bha));
  const [dp, setDp] = useState(() => (rigConfig?.drillpipe ? dpToState(rigConfig.drillpipe) : { od_in: '5', id_in: '4.276' }));
  const [pump, setPump] = useState(() => ({ type: 'triplex', linerIn: '6', strokeIn: '12', rodIn: '0', efficiency: '0.97', ...(rigConfig?.pump ? Object.fromEntries(Object.entries(rigConfig.pump).map(([k, v]) => [k, String(v)])) : {}) }));
  // Floating rigs (tester note 2026-09-07): the marine riser above the BOP and the booster pump into its base.
  const [rigType, setRigType] = useState(() => rigConfig?.rig_type || 'land');
  const [riser, setRiser] = useState(() => (rigConfig?.riser ? riserToState(rigConfig.riser) : { bop_ft: '', id_in: '19.5' }));
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
  // same rule for the rig: a reload after saving hands over an equal payload and must not overwrite a
  // value being typed; only a configuration with different content resets the editors
  const rigKey = JSON.stringify(rigConfig || null);
  // the configuration this screen just recorded is already what the editors show: when it comes back
  // from the store it must not reset them, or a value typed right after Record is wiped by the reload
  const savedKey = useRef(null);
  const shownUnit = useRef(unit);
  useEffect(() => {
    const rigConfig = JSON.parse(rigKey);
    if (!rigConfig) return;
    // (a change of the depth unit still redraws every length in the new unit)
    if (savedKey.current === rigKey && shownUnit.current === unit) return;
    shownUnit.current = unit;
    setSections(sectionsToRows(rigConfig.hole_sections)); setBha(bhaToRows(rigConfig.bha));
    if (rigConfig.drillpipe) setDp(dpToState(rigConfig.drillpipe));
    if (rigConfig.pump) setPump(Object.fromEntries(Object.entries(rigConfig.pump).map(([k, v]) => [k, String(v)])));
    setRigType(rigConfig.rig_type || 'land');
    if (rigConfig.riser) setRiser(riserToState(rigConfig.riser));
    if (rigConfig.booster) setBooster(Object.fromEntries(Object.entries(rigConfig.booster).map(([k, v]) => [k, String(v)])));
  }, [rigKey, unit]);

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
        drillpipe: { odM: inKept(dp.od_in, dp._m && dp._m.od), idM: inKept(dp.id_in, dp._m && dp._m.id), label: `${dp.od_in} in drillpipe` },
        pump: { type: pump.type, linerIn: num(pump.linerIn), strokeIn: num(pump.strokeIn), rodIn: num(pump.rodIn) || 0, efficiency: num(pump.efficiency) },
        riser: null,
        booster: null,
      };
      for (const s of payload.hole_sections) if (!(s.to_md_m > s.from_md_m) || !((s.cased ? s.casing_id_m : s.hole_id_m) > 0)) throw new Error('Every hole section needs a base below its top and a positive inside diameter.');
      if (disp.error) throw new Error(disp.error);
      if (floater) {
        const bopM = ftKept(riser.bop_ft, riser._m && riser._m.bop);
        const idM = inKept(riser.id_in, riser._m && riser._m.id);
        if (!(bopM > 0) || !(idM > 0)) throw new Error('A floating rig needs the BOP depth below the rotary table and the riser inside diameter.');
        if (boosterDisp.error) throw new Error(boosterDisp.error);
        payload.riser = { to_md_m: bopM, id_m: idM };
        payload.booster = { type: booster.type, linerIn: num(booster.linerIn), strokeIn: num(booster.strokeIn), rodIn: num(booster.rodIn) || 0, efficiency: num(booster.efficiency) };
        const inside = payload.hole_sections.filter((x) => x.from_md_m < bopM - 1e-6);
        if (inside.length) throw new Error(`On a floating rig the hole sections start at the BOP (${riser.bop_ft} ${LU}); the riser is entered above. Move the top of the first section to ${riser.bop_ft} ${LU}.`);
      }
      savedKey.current = JSON.stringify(payload);
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

  const inp = 'bg-pl-surface border border-pl-border-strong rounded px-2 py-1 text-xs text-pl-text';
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
        <h2 className="text-sm font-semibold text-pl-text">Rig geometry and pump</h2>
        <p className="text-[11px] text-pl-muted">Read by the lag engine. Saving records a dated configuration; earlier ones are kept.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-pl-text">Rig type<br />
            <select className={inp} data-testid="ws-config-rig-type" value={rigType} onChange={(e) => setRigType(e.target.value)}>
              {RIG_TYPES.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          </label>
          {floater && (
            <>
              <label className="text-xs text-pl-text">BOP depth below RT ({LU})<br /><input className={inp} data-testid="ws-config-riser-bop" value={riser.bop_ft} onChange={(e) => setRiser({ ...riser, bop_ft: e.target.value })} placeholder="air gap + water depth" /></label>
              <label className="text-xs text-pl-text">Riser ID (in)<br /><input className={inp} data-testid="ws-config-riser-id" value={riser.id_in} onChange={(e) => setRiser({ ...riser, id_in: e.target.value })} /></label>
            </>
          )}
        </div>
        {floater && (
          <p className="text-[11px] text-pl-info-text" data-testid="ws-config-floater-note">Floating rig: returns travel up the marine riser above the BOP, and the booster pump adds flow at the riser base. Enter the hole sections from the BOP down; the riser is the row above them.</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-pl-text">Hole sections ({LU} MD, inside diameter in inches, fractions such as 12 1/4 accepted; cased sections use the casing ID{floater ? '; start at the BOP' : ''})</div>
          {wdSections.length > 0 && (
            <Button size="sm" variant="outline" data-testid="ws-config-from-prognosis" title="Fill the hole sections from Well Design's casing programme, loaded with the prognosis"
              onClick={() => {
                const bopM = floater ? ftKept(riser.bop_ft, riser._m && riser._m.bop) : null;
                const rows = sectionsFromPrognosis(wdSections, { bopM: bopM > 0 ? bopM : null });
                setSections(sectionsToRows(rows));
                onStatus?.(`${rows.length} hole section(s) filled from Well Design (prognosis version ${prognosis.version}). Check them, then record the rig configuration.`);
              }}>Fill from Well Design ({wdSections.length})</Button>
          )}
        </div>
        <RowGridEditor testIdPrefix="ws-config-section" rows={sections} onChange={setSections} columns={[
          { key: 'from_ft', label: `From (${LU})`, type: 'number', width: 90 }, { key: 'to_ft', label: `To (${LU})`, type: 'number', width: 90 },
          { key: 'cased', label: 'Cased', type: 'select', options: [{ value: 'no', label: 'open hole' }, { value: 'yes', label: 'cased' }], width: 100 },
          { key: 'id_in', label: 'ID (in)', type: 'text', width: 90 }, { key: 'description', label: 'Description', type: 'text' },
        ]} />
        <div className="text-xs text-pl-text">Bottom hole assembly (bit up)</div>
        <RowGridEditor testIdPrefix="ws-config-bha" rows={bha} onChange={setBha} columns={[
          { key: 'label', label: 'Component', type: 'text' }, { key: 'length_ft', label: `Length (${LU})`, type: 'number', width: 90 },
          { key: 'od_in', label: 'OD (in)', type: 'text', width: 90 }, { key: 'id_in', label: 'ID (in)', type: 'text', width: 90 },
        ]} />
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs text-pl-text">Drillpipe OD (in)<br /><input className={inp} data-testid="ws-config-dp-od" value={dp.od_in} onChange={(e) => setDp({ ...dp, od_in: e.target.value })} /></label>
          <label className="text-xs text-pl-text">Drillpipe ID (in)<br /><input className={inp} data-testid="ws-config-dp-id" value={dp.id_in} onChange={(e) => setDp({ ...dp, id_in: e.target.value })} /></label>
          <label className="text-xs text-pl-text">Pump<br />
            <select className={inp} data-testid="ws-config-pump-type" value={pump.type} onChange={(e) => setPump({ ...pump, type: e.target.value })}>
              <option value="triplex">triplex</option><option value="duplex">duplex</option>
            </select>
          </label>
          <label className="text-xs text-pl-text">Liner (in)<br /><input className={inp} data-testid="ws-config-pump-liner" value={pump.linerIn} onChange={(e) => setPump({ ...pump, linerIn: e.target.value })} /></label>
          <label className="text-xs text-pl-text">Stroke (in)<br /><input className={inp} data-testid="ws-config-pump-stroke" value={pump.strokeIn} onChange={(e) => setPump({ ...pump, strokeIn: e.target.value })} /></label>
          {pump.type === 'duplex' && <label className="text-xs text-pl-text">Rod (in)<br /><input className={inp} data-testid="ws-config-pump-rod" value={pump.rodIn} onChange={(e) => setPump({ ...pump, rodIn: e.target.value })} /></label>}
          <label className="text-xs text-pl-text">Efficiency<br /><input className={inp} data-testid="ws-config-pump-eff" value={pump.efficiency} onChange={(e) => setPump({ ...pump, efficiency: e.target.value })} /></label>
          <div className="text-xs text-pl-text" data-testid="ws-config-pump-out">
            {disp.error ? disp.error : `${disp.bblPerStroke.toFixed(4)} bbl/stk (${(disp.m3PerStroke * 1000).toFixed(2)} L/stk)`}
          </div>
        </div>
        {floater && (
          <div className="flex items-end gap-3 flex-wrap" data-testid="ws-config-booster">
            <label className="text-xs text-pl-text">Booster pump<br />
              <select className={inp} data-testid="ws-config-booster-type" value={booster.type} onChange={(e) => setBooster({ ...booster, type: e.target.value })}>
                <option value="triplex">triplex</option><option value="duplex">duplex</option>
              </select>
            </label>
            <label className="text-xs text-pl-text">Liner (in)<br /><input className={inp} data-testid="ws-config-booster-liner" value={booster.linerIn} onChange={(e) => setBooster({ ...booster, linerIn: e.target.value })} /></label>
            <label className="text-xs text-pl-text">Stroke (in)<br /><input className={inp} data-testid="ws-config-booster-stroke" value={booster.strokeIn} onChange={(e) => setBooster({ ...booster, strokeIn: e.target.value })} /></label>
            {booster.type === 'duplex' && <label className="text-xs text-pl-text">Rod (in)<br /><input className={inp} value={booster.rodIn} onChange={(e) => setBooster({ ...booster, rodIn: e.target.value })} /></label>}
            <label className="text-xs text-pl-text">Efficiency<br /><input className={inp} data-testid="ws-config-booster-eff" value={booster.efficiency} onChange={(e) => setBooster({ ...booster, efficiency: e.target.value })} /></label>
            <div className="text-xs text-pl-text" data-testid="ws-config-booster-out">
              {boosterDisp.error ? boosterDisp.error : `${boosterDisp.bblPerStroke.toFixed(4)} bbl/stk (${(boosterDisp.m3PerStroke * 1000).toFixed(2)} L/stk) into the riser base`}
            </div>
          </div>
        )}
        <Button size="sm" onClick={saveRig} data-testid="ws-config-save-rig">Record rig configuration</Button>
      </section>

      {membersSlot}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-pl-text">Well settings</h2>
        {!canAdmin && <div className="text-[11px] text-pl-warning-text">Only a well administrator changes these.</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-pl-text">Rig offset from UTC (min)<br /><input className={inp} type="number" data-testid="ws-config-offset" value={settings.rig_offset_min ?? 0} onChange={(e) => setSettings({ ...settings, rig_offset_min: e.target.value })} /></label>
          <label className="text-xs text-pl-text">Tour starts (local, comma separated)<br /><input className={inp} data-testid="ws-config-tours" value={(settings.tour_starts_local || []).join(',')} onChange={(e) => setSettings({ ...settings, tour_starts_local: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></label>
          <label className="text-xs text-pl-text">Report day starts (local)<br /><input className={inp} data-testid="ws-config-report-start" value={settings.report_day_start_local || '06:00'} onChange={(e) => setSettings({ ...settings, report_day_start_local: e.target.value })} /></label>
          <label className="text-xs text-pl-text">Overdue tolerance (min)<br /><input className={inp} type="number" data-testid="ws-config-tolerance" value={settings.overdue_tolerance_min ?? 15} onChange={(e) => setSettings({ ...settings, overdue_tolerance_min: e.target.value })} /></label>
          <label className="text-xs text-pl-text">Default depth entry<br />
            <span className="flex gap-1">
              <select className={inp} data-testid="ws-config-default-unit" value={settings.default_depth?.unit || 'ft'} onChange={(e) => setSettings({ ...settings, default_depth: { ...(settings.default_depth || {}), unit: e.target.value } })}><option value="ft">ft</option><option value="m">m</option></select>
              <select className={inp} data-testid="ws-config-default-ref" value={settings.default_depth?.reference || 'MD'} onChange={(e) => setSettings({ ...settings, default_depth: { ...(settings.default_depth || {}), reference: e.target.value } })}><option value="MD">MD</option><option value="TVD">TVD</option></select>
              <select className={inp} data-testid="ws-config-default-datum" value={settings.default_depth?.datum || 'RT'} onChange={(e) => setSettings({ ...settings, default_depth: { ...(settings.default_depth || {}), datum: e.target.value } })}>{['KB', 'RT', 'GL', 'MSL'].map((d) => <option key={d} value={d}>{d}</option>)}</select>
            </span>
          </label>
          <label className="text-xs text-pl-text">Keep original photos<br />
            <select className={inp} data-testid="ws-config-keep-originals" value={settings.keep_originals ? 'yes' : 'no'} onChange={(e) => setSettings({ ...settings, keep_originals: e.target.value === 'yes' })}><option value="no">no, working copies only</option><option value="yes">yes</option></select>
          </label>
        </div>
        <div className="text-xs text-pl-text">Mandatory sample stages</div>
        <div className="flex gap-2 flex-wrap">
          {SAMPLE_STAGE_NAMES.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs text-pl-text"><input type="checkbox" data-testid={`ws-config-stage-${s}`} checked={(settings.mandatory_sample_stages || []).includes(s)} onChange={() => toggleStage(s)} />{s}</label>
          ))}
        </div>
        <div className="text-xs text-pl-text">Roles that may approve (final tops, conflict resolution)</div>
        <div className="flex gap-2 flex-wrap">
          {WS_ROLES.map((r) => (
            <label key={r.code} className="flex items-center gap-1 text-xs text-pl-text"><input type="checkbox" data-testid={`ws-config-approver-${r.code}`} checked={(settings.approver_roles || []).includes(r.code)} onChange={() => toggleRole(r.code)} />{r.name}</label>
          ))}
        </div>
        <h3 className="text-xs font-semibold text-pl-text pt-2">Abbreviation profile (operator house style)</h3>
        <p className="text-[11px] text-pl-muted">JSON with `terms` per table over the Petrolord default ({PETROLORD_PROFILE.name}); any term it does not define falls back to the default and the Describe screen says so. Leave empty for the default.</p>
        <textarea value={profileText} onChange={(e) => setProfileText(e.target.value)} data-testid="ws-config-profile" rows={5} spellCheck={false}
          className="w-full bg-pl-surface border border-pl-border-strong rounded px-2 py-1 text-[11px] font-mono text-pl-text" placeholder='{"id": "acme", "name": "Acme", "terms": {"colourHue": {"grey": "gry"}}, "format": {"percentStyle": "suffix"}}' />
        {profileErrors.length > 0 && <div className="text-[11px] text-pl-warning-text" data-testid="ws-config-profile-error">{profileErrors[0]}</div>}
        <h3 className="text-xs font-semibold text-pl-text pt-2">Daily report template (operator)</h3>
        <p className="text-[11px] text-pl-muted">JSON with an id and a list of sections, each with an id, a title and a source ({DEFAULT_DAILY_TEMPLATE.sections.map((x) => x.source).filter((v, i, a) => a.indexOf(v) === i).join(', ')}; narrative sections name the text they edit). Leave empty for the generic template ({DEFAULT_DAILY_TEMPLATE.name}). A real operator report replaces this without code.</p>
        <textarea value={templateText} onChange={(e) => setTemplateText(e.target.value)} data-testid="ws-config-template" rows={5} spellCheck={false}
          className="w-full bg-pl-surface border border-pl-border-strong rounded px-2 py-1 text-[11px] font-mono text-pl-text" placeholder='{"id": "acme-dgr", "name": "Acme DGR", "version": 1, "sections": [{"id": "status", "title": "Well status", "source": "status"}]}' />
        {templateErrors.length > 0 && <div className="text-[11px] text-pl-warning-text" data-testid="ws-config-template-error">{templateErrors[0]}</div>}
        <h3 className="text-xs font-semibold text-pl-text pt-2">Header</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[['field', 'Field'], ['operator', 'Operator'], ['rig', 'Rig'], ['country', 'Country']].map(([k, label]) => (
            <label key={k} className="text-xs text-pl-text">{label}<br /><input className={inp} data-testid={`ws-config-${k}`} value={header[k] || ''} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} /></label>
          ))}
          <label className="text-xs text-pl-text">KB above MSL (m, from the registry)<br /><input className={inp} disabled value={header.kb_elev_m ?? ''} data-testid="ws-config-kb" />
            {!kb.ok && <span className="block text-[11px] text-pl-warning-text" data-testid="ws-config-kb-note">{kb.note}</span>}</label>
          <label className="text-xs text-pl-text">Ground level above MSL (m)<br /><input className={inp} type="number" step="any" data-testid="ws-config-gl" value={header.gl_elev_m ?? ''} onChange={(e) => setHeader({ ...header, gl_elev_m: e.target.value })} /></label>
          <label className="text-xs text-pl-text">RT above KB (m)<br /><input className={inp} type="number" step="any" data-testid="ws-config-rt" value={header.rt_offset_m ?? 0} onChange={(e) => setHeader({ ...header, rt_offset_m: e.target.value })} /></label>
        </div>
        <Button size="sm" onClick={saveSettings} disabled={!canAdmin} data-testid="ws-config-save-settings">Save well settings</Button>
      </section>
    </div>
  );
}
