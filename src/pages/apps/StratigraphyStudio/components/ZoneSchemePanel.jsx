// Biozone scheme import and dating (Stratigraphy T1 ST-T1-001): import the
// company's zone scheme as a CSV with its source, then date every biozone
// interval whose scheme and code match a zone.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileUp, CalendarClock, Share2 } from 'lucide-react';
import { buildLabel } from '@/lib/platformBuild';
import { parseZoneSchemeCsv, fillBiozoneAges, loadZoneSchemes, saveZoneSchemes, mergeZoneSchemes } from '../services/zoneSchemes';

const btnCls = 'flex items-center gap-1 px-2 py-1 rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';

// STRAT-U2-008: organisation schemes (strat_zone_schemes) as the scheme rows the dating reads
const orgZones = (rows) => rows.flatMap((r) => (r.zones || []).map((z) => ({ scheme: r.name, zone: z.zone, top_ma: Number(z.top_ma), base_ma: Number(z.base_ma), source: r.source })));
const creatorOf = (row, ctx) => (row.created_by && row.created_by === ctx?.userId ? 'you' : (/^Shared by (.+?)(?: from|$)/.exec(row.notes || '')?.[1] || 'a colleague'));

export default function ZoneSchemePanel({ intervals, canEdit, onReplace, onStatus, backend = null }) {
  const [browserZones, setZones] = useState(loadZoneSchemes);
  // ---- organisation schemes (STRAT-U2-008) ----
  const canOrg = !!backend && typeof backend.listOrgZoneSchemes === 'function';
  const [org, setOrg] = useState({ state: canOrg ? 'loading' : 'off', rows: [], ctx: null, message: null });
  const refreshOrg = useCallback(async () => {
    if (!canOrg) return;
    try {
      const ctx = backend.zoneSchemeContext ? await backend.zoneSchemeContext() : null;
      if (!ctx?.orgId) { setOrg({ state: 'none', rows: [], ctx, message: 'You are not in an organisation, so schemes stay in this browser.' }); return; }
      setOrg({ state: 'ok', rows: await backend.listOrgZoneSchemes(), ctx, message: null });
    } catch (e) {
      setOrg({ state: e?.name === 'ZoneSchemesUnavailable' ? 'unavailable' : 'error', rows: [], ctx: null, message: e.message });
    }
  }, [backend, canOrg]);
  useEffect(() => { refreshOrg(); }, [refreshOrg]);
  // the dating reads the organisation's schemes and this browser's; a browser scheme of the same name wins
  const zones = useMemo(() => mergeZoneSchemes(orgZones(org.rows), browserZones).zones, [org.rows, browserZones]);
  const orgNames = new Set(org.rows.map((r) => r.name.toLowerCase()));
  const isAdmin = ['admin', 'owner'].includes(org.ctx?.role);
  const share = async (name) => {
    const list = browserZones.filter((z) => z.scheme === name);
    const sources = [...new Set(list.map((z) => z.source).filter(Boolean))];
    try {
      const { replaced } = await backend.saveOrgZoneScheme({
        name, source: sources.join('; '), chart_version: null,
        zones: list.map((z) => ({ zone: z.zone, top_ma: z.top_ma, base_ma: z.base_ma })),
        notes: `Shared by ${org.ctx?.email || 'a member'} from Stratigraphy Studio`,
      }, { organizationId: org.ctx?.orgId, appBuild: buildLabel() });
      await refreshOrg();
      onStatus(`${replaced ? 'Updated' : 'Shared'} the ${name} scheme (${list.length} zone${list.length === 1 ? '' : 's'}) with your organisation; every member can date biozones from it.`);
    } catch (e) { onStatus(e.message); if (e?.name === 'ZoneSchemesUnavailable') await refreshOrg(); }
  };
  const unshare = async (row) => {
    try { await backend.deleteOrgZoneScheme(row.id); await refreshOrg(); onStatus(`Removed the ${row.name} scheme from your organisation.`); } catch (e) { onStatus(e.message); }
  };
  const biozones = (intervals || []).filter((r) => r.kind === 'biozone_interval');
  // STRAT-U1-007: what was read, per scheme (zones, age range, source), so a
  // file in the wrong unit shows at once; a scheme can be removed on its own
  const schemes = [...new Set(zones.map((z) => z.scheme))];
  const browserSchemes = [...new Set(browserZones.map((z) => z.scheme))];
  const summary = browserSchemes.map((name) => {
    const list = browserZones.filter((z) => z.scheme === name);
    return { name, n: list.length, top: Math.min(...list.map((z) => z.top_ma)), base: Math.max(...list.map((z) => z.base_ma)), sources: [...new Set(list.map((z) => z.source))] };
  });
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { zones: z, problems, notes } = parseZoneSchemeCsv(await f.text());
      if (!z.length) throw new Error(problems[0] || 'No zones in the file.');
      const { zones: merged, replaced } = mergeZoneSchemes(browserZones, z);
      setZones(merged); saveZoneSchemes(merged);
      const names = [...new Set(z.map((x) => x.scheme))];
      const rep = replaced.length ? `; replaced ${replaced.map((r) => `${r.scheme} (${r.before} zone${r.before === 1 ? '' : 's'} before)`).join(', ')}` : '';
      onStatus(`Loaded ${z.length} zone${z.length === 1 ? '' : 's'} (${names.join(', ')})${rep}${notes.length ? `; ${notes.join('; ')}` : ''}${problems.length ? `; ${problems.length} row${problems.length === 1 ? '' : 's'} not imported: ${problems[0]}` : ''}.`);
    } catch (err) { onStatus(err.message); }
  };
  const removeScheme = (name) => {
    const next = browserZones.filter((z) => z.scheme !== name);
    setZones(next); saveZoneSchemes(next);
    onStatus(`Removed the ${name} scheme from this browser.`);
  };
  const fill = async () => {
    const { rows, filled, unmatched } = fillBiozoneAges(biozones, zones);
    if (!filled) { onStatus(unmatched.length ? `No biozone matched the scheme (${unmatched.slice(0, 3).join(', ')}). Check the scheme and code columns.` : 'Every biozone interval already has ages.'); return; }
    await onReplace('biozone_interval', rows);
    onStatus(`Dated ${filled} biozone interval${filled === 1 ? '' : 's'} from the scheme${unmatched.length ? `; not in the scheme: ${unmatched.slice(0, 3).join(', ')}` : ''}.`);
  };
  return (
    <div className="mb-3 rounded border border-pl-border p-2 text-xs text-pl-text space-y-1" data-testid="strat-zone-scheme">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Biozone scheme</span>
        <span className="text-pl-muted" data-testid="strat-zone-scheme-summary">{zones.length ? `${zones.length} zones: ${schemes.join(', ')}` : 'none loaded'}</span>
        <label className={`${btnCls} cursor-pointer ml-auto`}>
          <FileUp className="w-3.5 h-3.5" /> Import scheme (CSV)
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} data-testid="strat-zone-scheme-file" />
        </label>
        <button type="button" className={btnCls} disabled={!canEdit || !zones.length || !biozones.length} onClick={fill} data-testid="strat-zone-fill">
          <CalendarClock className="w-3.5 h-3.5" /> Date biozones from the scheme
        </button>
      </div>
      {summary.length > 0 && (
        <table className="text-[11px]" data-testid="strat-zone-scheme-table">
          <tbody>
            {summary.map((r) => (
              <tr key={r.name} data-testid={`strat-zone-scheme-row-${r.name}`}>
                <td className="pr-3 font-medium">{r.name}</td>
                <td className="pr-3 text-pl-muted">{r.n} zone{r.n === 1 ? '' : 's'}</td>
                <td className="pr-3 font-mono">{r.top} to {r.base} Ma</td>
                <td className="pr-3 text-pl-muted truncate max-w-[18rem]" title={r.sources.join('; ')}>{r.sources.join('; ')}</td>
                <td className="pr-2"><button type="button" className="text-pl-muted hover:text-pl-danger-text" onClick={() => removeScheme(r.name)} data-testid={`strat-zone-scheme-remove-${r.name}`}>remove</button></td>
                <td>{org.state === 'ok' && (
                  <button type="button" className="flex items-center gap-0.5 text-pl-primary-text hover:underline" onClick={() => share(r.name)} data-testid={`strat-zone-scheme-share-${r.name}`}
                    title="Share this scheme with your organisation: every member can read it and date biozones from it; you (or an organisation admin) can change or remove it">
                    <Share2 className="w-3 h-3" /> {orgNames.has(r.name.toLowerCase()) ? 'Update in organisation' : 'Share with organisation'}
                  </button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canOrg && (
        <div className="pt-1 border-t border-pl-border" data-testid="strat-org-schemes" data-state={org.state}>
          <span className="font-medium">Organisation schemes</span>
          {org.state === 'loading' && <span className="ml-2 text-pl-muted">reading</span>}
          {(org.state === 'unavailable' || org.state === 'none' || org.state === 'error') && <p className="text-pl-muted" data-testid="strat-org-schemes-note">{org.state === 'unavailable' ? 'Organisation sharing becomes available once the strat_zone_schemes table is created on this database; until then schemes stay in this browser.' : org.message}</p>}
          {org.state === 'ok' && !org.rows.length && <p className="text-pl-muted" data-testid="strat-org-schemes-note">None shared yet. Share a scheme from this browser with the button beside it.</p>}
          {org.state === 'ok' && org.rows.length > 0 && (
            <table className="text-[11px]" data-testid="strat-org-schemes-table">
              <tbody>
                {org.rows.map((r) => {
                  const zs = r.zones || [];
                  const lo = zs.length ? Math.min(...zs.map((z) => Number(z.top_ma))) : null; const hi = zs.length ? Math.max(...zs.map((z) => Number(z.base_ma))) : null;
                  const mine = r.created_by && r.created_by === org.ctx?.userId;
                  return (
                    <tr key={r.id} data-testid={`strat-org-scheme-row-${r.name}`}>
                      <td className="pr-3 font-medium">{r.name}</td>
                      <td className="pr-3 text-pl-muted">{zs.length} zone{zs.length === 1 ? '' : 's'}</td>
                      <td className="pr-3 font-mono">{lo == null ? 'n/a' : `${lo} to ${hi} Ma`}</td>
                      <td className="pr-3 text-pl-muted truncate max-w-[14rem]" title={r.source}>{r.source}</td>
                      <td className="pr-3 text-pl-muted" data-testid={`strat-org-scheme-creator-${r.name}`}>shared by {creatorOf(r, org.ctx)}</td>
                      <td>{(mine || isAdmin) && <button type="button" className="text-pl-muted hover:text-pl-danger-text" onClick={() => unshare(r)} data-testid={`strat-org-scheme-remove-${r.name}`} title={mine ? 'Remove your scheme from the organisation' : 'Remove it (organisation admin)'}>remove</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      <p className="text-[10px] text-pl-muted">Columns: scheme, zone, top_ma, base_ma, source (Zonation, Top Age, Base Age and Reference are read too; ages in ka when the header says ka). A second file adds its schemes and replaces a scheme of the same name. Remembered in this browser; share one with your organisation to make it every member's. Dating reads the organisation's schemes and this browser's (a browser scheme of the same name wins). Use the calibration your company works to; each dated interval records the source.</p>
    </div>
  );
}
