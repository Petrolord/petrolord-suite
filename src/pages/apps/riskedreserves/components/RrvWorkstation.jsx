// Risked Reserves Valuation workstation (T1 rebuild, 2026-09-26; saved
// valuations, handoff provenance, units and the report, upgrade U1,
// 2026-10-02). The geologist risks a prospect in ReservoirCalc Pro (Pg and
// success-case volumes); here the committee values it: commercial chance
// against the minimum economic field size, expected monetary value after
// the exploration well, break-even Pg and the expectation curves, one
// prospect at a time and as a portfolio of independent prospects. Every
// number comes from the engines prospect valuation module.
//
// A valuation is saved one row per prospect to the user's account
// (rrv_valuations) and can be shared with the organisation for viewing.
// Until that table exists on the database the valuations stay in this
// browser, and the page says so.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, HelpCircle, Plus, Download, Trash2, RefreshCw, Save, Users, Copy, Undo2,
} from 'lucide-react';
import ModuleHomeLink from '@/components/workstation/ModuleHomeLink';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { valuePortfolio } from '@/utils/prospectValuation';
import { RecordSharingBar, useRecordSharing, SharedRowNote, useSharingNames } from '@/components/recordSharing';
import { copyName } from '@/lib/recordSharing/rules';
import { useAppUnits } from '@/lib/units/useAppUnits';
import { buildLabel } from '@/lib/platformBuild';
import { EMPTY_VALUE } from '@/lib/emptyValue';
import ExpectationChart from './ExpectationChart';
import RrvReportPanel from './RrvReportPanel';
import RrvEconomicsPanel from './RrvEconomicsPanel';
import NumCell, { cell } from './NumCell';
import {
  fromRcpProspect, blankProspect, inputProblem, loadStored, storeLocal, mergeSaved, fromRow, valuationCsv, unitValueSource,
  engineInput, editedKeys, upstreamState, refreshFromRcp, ECON_KEYS, HANDOFF_KEYS,
  setInput, setValueBasis, setMefsBasis, setModelField, resolveEconomics,
} from '../services/rrvStore';
import { valueOrProblem, volumeCurves } from '../services/rrvMath';
import { rrvUnits, RRV_UNIT_SPEC, RRV_UNIT_FALLBACK } from '../services/rrvUnits';
import {
  buildRrvReportModel, F, SHORT_LABEL, handoffLine, upstreamSentence,
} from '../services/rrvReportModel';
import { exportRrvReport, reportFileName } from '../services/rrvReportExport';
import { RRV_TABLE } from '../services/rrvBackend';

const btn = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-40';
const fmt = (v, d = 1) => (d === 2 ? F.n2(v) : F.n1(v));
const pct = F.pct;

const fields = (u) => [
  ['pg', 'Pg', 'Geological chance of success (0 to 1), from the risking in ReservoirCalc Pro'],
  ['p90', 'P90', `Success-case volume, low case (exceeded with 90% probability), ${u.volumeLabel}`],
  ['p50', 'P50', `Success-case volume, best case, ${u.volumeLabel}`],
  ['p10', 'P10', `Success-case volume, high case (exceeded with 10% probability), ${u.volumeLabel}`],
  ['mefs', 'MEFS', `Minimum economic field size, ${u.volumeLabel}. Derived from the value of a discovery unless typed here`],
  ['unitValue', u.unitValueLabel, 'Value per barrel u of a developed discovery: value = u x volume - development cost. From the economic model of the Economics tab, sent with a prospect valued in ReservoirCalc Pro, or typed here'],
  ['devCost', 'Dev $MM', 'Development cost D of a commercial discovery, $MM. From the economic model of the Economics tab, sent with the prospect, or typed here'],
  ['wellCost', 'Well $MM', 'Exploration well cost, $MM (spent in every outcome)'],
];

const SOURCE_LABEL = { econModel: 'Economic model', pg: 'Chance of success Pg', p90: 'P90', p50: 'P50', p10: 'P10', mefs: 'MEFS', unitValue: 'Value per barrel', devCost: 'Development cost', wellCost: 'Exploration well cost' };

/** Is this economic input derived (and so not the user's own typing)? */
const derivedKey = (p, k) => (k === 'mefs' ? p.econ?.mefs === 'derived' : (k === 'unitValue' || k === 'devCost') ? p.econ?.value === 'model' : false);
const derivedWhy = (p, k) => (k === 'mefs'
  ? (p.econ?.value === 'model' ? 'the smallest size that pays under the economic model' : 'development cost over value per barrel, the size at which a discovery is worth zero')
  : 'read from the economic model of the Economics tab');

const timeText = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC` : null;
};

/** The share control of one saved valuation: colleagues view it and save a copy. */
function ValuationSharing({ store, row, onChange }) {
  const sharing = useRecordSharing({ store, table: RRV_TABLE, record: row, onChange });
  return <RecordSharingBar sharing={sharing} label="valuation" allowEdit={false} fieldLabels={{ valuation: 'inputs and identification', name: 'name', prospect_key: 'source prospect', rcp_prospect_id: 'source prospect' }} />;
}

function RrvWorkstationContent({ backend }) {
  const au = useAppUnits('rrv', RRV_UNIT_SPEC, { fallback: RRV_UNIT_FALLBACK });
  const units = useMemo(() => rrvUnits(au.units.volume), [au.units.volume]);
  const FIELDS = useMemo(() => fields(units), [units]);

  const stored = useRef(null);
  if (stored.current === null) stored.current = loadStored();
  const [prospects, setProspects] = useState(stored.current.list);
  // table: null while the account is asked; false when valuations cannot be saved there
  const [storage, setStorage] = useState({ table: null, error: null });
  const [inventory, setInventory] = useState(null);
  const [sharedInventory, setSharedInventory] = useState([]);
  const [sharedValuations, setSharedValuations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('valuation');
  const [status, setStatus] = useState(stored.current.fromLegacy
    ? `Opened ${stored.current.fromLegacy} prospect${stored.current.fromLegacy === 1 ? '' : 's'} kept in this browser by the earlier version.`
    : 'Ready.');
  const [company, setCompany] = useState(null);
  const [me, setMe] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [removed, setRemoved] = useState(null);

  // the browser copy: the fallback store, and the draft of edits not yet saved
  const [browserOk, setBrowserOk] = useState(true);
  useEffect(() => { setBrowserOk(storeLocal(prospects)); }, [prospects]);

  useEffect(() => {
    let live = true;
    backend.listProspects()
      .then((rows) => { if (live) setInventory(rows); })
      .catch((e) => { if (live) { setInventory([]); setStatus(e.message); } });
    if (backend.listSharedProspects) backend.listSharedProspects().then((rows) => { if (live) setSharedInventory(rows || []); }).catch(() => {});
    if (backend.organisationName) backend.organisationName().then((n) => { if (live) setCompany(n || null); }).catch(() => {});
    if (backend.sharing) backend.sharing.context().then((c) => { if (live) setMe(c.userId); }).catch(() => {});
    (async () => {
      let table = false; let rows = []; let shared = []; let error = null;
      try {
        table = backend.capability ? !!(await backend.capability()).table : false;
        if (table) {
          rows = await backend.listValuations();
          shared = backend.listSharedValuations ? await backend.listSharedValuations() : [];
        }
      } catch (e) {
        table = false;
        if (e?.name !== 'RrvTableUnavailable') error = e.message;
      }
      if (!live) return;
      if (table) {
        setProspects((local) => {
          const merged = mergeSaved(local, rows);
          const waiting = merged.filter((p) => !p.row).length;
          if (waiting) setStatus(`${waiting} valuation${waiting === 1 ? '' : 's'} kept in this browser ${waiting === 1 ? 'is' : 'are'} not on your account yet. Save to move ${waiting === 1 ? 'it' : 'them'} there.`);
          return merged;
        });
        setSharedValuations(shared.map(fromRow));
      }
      setStorage({ table, error });
    })();
    return () => { live = false; };
  }, [backend]);

  const names = useSharingNames(backend.sharing, sharedValuations.map((s) => s.row));

  const value = useCallback((p) => {
    const problem = inputProblem(p);
    if (problem) return { p, v: null, problem };
    return { p, ...valueOrProblem(engineInput(p)) };
  }, []);
  const valued = useMemo(() => prospects.map(value), [prospects, value]);
  const sharedValued = useMemo(() => sharedValuations.map((p) => ({ ...value(p), shared: true })), [sharedValuations, value]);
  const good = useMemo(() => valued.filter((r) => r.v), [valued]);
  const portfolio = useMemo(() => valuePortfolio(good.map((r) => r.v)), [good]);
  const selected = valued.find((r) => r.p.id === selectedId) || sharedValued.find((r) => r.p.id === selectedId) || valued[0] || null;
  const readOnly = !!selected?.shared;

  // how each valuation stands against the ReservoirCalc Pro inventory as it is now
  const upstream = useMemo(() => {
    const rows = inventory ? [...inventory, ...sharedInventory] : null;
    return new Map([...prospects, ...sharedValuations].map((p) => [p.id, upstreamState(p, rows)]));
  }, [prospects, sharedValuations, inventory, sharedInventory]);

  const dirtyCount = prospects.filter((p) => p.dirty || !p.row).length;
  const savedWhere = useCallback((p) => {
    const at = timeText(p.row?.updated_at);
    if (p.row && !p.dirty) return `Petrolord account${at ? `, ${at}` : ''}`;
    if (p.row) return `Petrolord account${at ? `, ${at}` : ''}; later edits are in this browser only`;
    if (storage.table === false) return 'This browser only (saving to the account is not switched on for this database)';
    return 'This browser only (not yet saved to the account)';
  }, [storage.table]);

  const touch = (id, change) => setProspects((ps) => ps.map((p) => (p.id === id ? { ...change(p), dirty: true } : p)));
  const patch = (id, k, v) => touch(id, (p) => setInput(p, k, v));
  const setIdent = (id, k, v) => touch(id, (p) => ({ ...p, ident: { ...(p.ident || {}), [k]: v } }));
  const setMeta = (id, k, f, v) => touch(id, (p) => ({ ...p, inputMeta: { ...(p.inputMeta || {}), [k]: { ...(p.inputMeta?.[k] || {}), [f]: v } } }));

  const importInventory = () => {
    const rows = (inventory || []).map((r) => ({ ...fromRcpProspect(r), row: null, dirty: true }));
    const known = new Set(prospects.map((p) => p.id));
    const fresh = rows.filter((r) => !known.has(r.id));
    const moved = prospects.filter((p) => ['changed', 'replaced'].includes(upstream.get(p.id)?.state)).length;
    const movedText = moved ? ` ${moved} changed there since ${moved === 1 ? 'it was' : 'they were'} valued: use Refresh on ${moved === 1 ? 'its' : 'their'} row.` : '';
    if (!fresh.length) {
      setStatus(inventory?.length ? `Every ReservoirCalc Pro prospect is already here.${movedText}` : 'Your ReservoirCalc Pro inventory is empty: risk a prospect there first, or add one here.');
    } else {
      setProspects((ps) => [...ps, ...fresh]);
      setStatus(`Imported ${fresh.length} prospect${fresh.length === 1 ? '' : 's'} from ReservoirCalc Pro. Check the economics and the well cost of each: the MEFS and the value of a discovery start from the screening model on the Economics tab.${movedText}`);
    }
    // The inventory is also read again, so a prospect risked in ReservoirCalc
    // Pro in another tab since this page opened is found, and a change to
    // one already here shows on its row.
    backend.listProspects().then(async (inv) => {
      setInventory(inv);
      if (backend.listSharedProspects) setSharedInventory((await backend.listSharedProspects()) || []);
      setProspects((ps) => {
        const have = new Set(ps.map((p) => p.id));
        const late = inv.map((r) => ({ ...fromRcpProspect(r), row: null, dirty: true })).filter((r) => !have.has(r.id));
        if (!late.length) return ps;
        setStatus(`Imported ${late.length} prospect${late.length === 1 ? '' : 's'} risked in ReservoirCalc Pro since this page opened: ${late.map((l) => l.name).join(', ')}. Check the economics and the well cost of each.`);
        return [...ps, ...late];
      });
    }).catch(() => { /* the cached inventory stands */ });
  };
  const add = () => { const p = { ...blankProspect(prospects.length + 1), row: null, dirty: true }; setProspects((ps) => [...ps, p]); setSelectedId(p.id); };

  const refresh = (id) => {
    const p = prospects.find((x) => x.id === id);
    const up = upstream.get(id);
    if (!p || !up?.row) return;
    const next = refreshFromRcp(p, up.row);
    if (next.id !== p.id && prospects.some((x) => x.id === next.id)) {
      setStatus(`${up.row.name} as risked again is already in the list as its own row. Remove one of the two.`);
      return;
    }
    setProspects((ps) => ps.map((x) => (x.id === id ? { ...next, dirty: true } : x)));
    if (selectedId === id) setSelectedId(next.id);
    setStatus(`Refreshed ${next.name} from ReservoirCalc Pro: Pg and the volumes are as the source record has them now. Your economics, the well cost and any value you typed are kept; a derived MEFS follows the new volumes.`);
  };

  const remove = async (id) => {
    const p = prospects.find((x) => x.id === id);
    if (!p) return;
    try {
      if (p.row?.id && storage.table && backend.deleteValuation) await backend.deleteValuation(p);
      setProspects((ps) => ps.filter((x) => x.id !== id));
      setRemoved({ ...p, row: null, dirty: true });
      setStatus(`Removed ${p.name}${p.row ? ' from your account' : ''}.`);
    } catch (e) { setStatus(`${p.name} was not removed: ${e.message}`); }
  };
  const undoRemove = () => {
    if (!removed) return;
    setProspects((ps) => (ps.some((x) => x.id === removed.id) ? ps : [...ps, removed]));
    setStatus(`Restored ${removed.name}. It is not saved to your account until you save.`);
    setRemoved(null);
  };

  const save = async () => {
    if (!storage.table || !backend.saveValuation) return;
    setSaving(true);
    const todo = prospects.filter((p) => p.dirty || !p.row);
    let done = 0; const failed = [];
    for (const p of todo) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const row = await backend.saveValuation(p);
        const { valuation: _payload, ...rest } = row;
        done += 1;
        // an edit made while the save was on its way stays unsaved
        setProspects((ps) => ps.map((x) => (x.id === p.id ? { ...x, row: rest, dirty: x !== p } : x)));
      } catch (e) {
        if (e?.name === 'RrvTableUnavailable') { setStorage({ table: false, error: null }); failed.push(e.message); break; }
        failed.push(`${p.name}: ${e.message}`);
      }
    }
    setSaving(false);
    if (failed.length) setStatus(`${done ? `Saved ${done}. ` : ''}Not saved: ${failed.join(' ')}`);
    else setStatus(done ? `Saved ${done} valuation${done === 1 ? '' : 's'} to your account.` : 'Nothing to save: your account has every valuation as shown.');
  };

  const saveCopy = (s) => {
    const name = copyName(s.name, prospects.map((x) => x.name));
    const copy = { ...s, id: `copy-${Date.now()}`, name, row: null, dirty: true };
    setProspects((ps) => [...ps, copy]);
    setSelectedId(copy.id);
    setStatus(`Copied ${s.name} into your list as ${name}. Save to keep it on your account.`);
  };

  const sourceLine = (p) => {
    if (p.source !== 'rcp') return 'typed in this app';
    const ed = editedKeys(p);
    return `${handoffLine(p)}${p.handoff?.unitLabel ? `, sent in ${p.handoff.unitLabel}` : ''}, basis ${p.basis || 'not stated'}${ed.length ? `; edited here: ${ed.map((k) => SHORT_LABEL[k]).join(', ')}` : ''}`;
  };
  const exportCsv = () => {
    const text = valuationCsv(valued, { build: buildLabel(), generatedAt: new Date(), units, sourceLine, savedWhere: storage.table ? (dirtyCount ? `Petrolord account, with ${dirtyCount} valuation${dirtyCount === 1 ? '' : 's'} holding edits kept in this browser only` : 'Petrolord account') : 'this browser only' });
    const blob = new Blob([text], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'risked-valuation.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setStatus('Exported the valuation as risked-valuation.csv, with its units, conventions and sources in the header lines.');
  };

  const reportArgs = useMemo(() => (selected ? {
    p: selected.p, v: selected.v, problem: selected.problem, units, upstream: upstream.get(selected.p.id) || null,
    portfolio: selected.shared ? null : { rows: good, totals: portfolio, leftOut: valued.length - good.length },
    savedWhere: selected.shared ? `Shared from a colleague's Petrolord account${timeText(selected.p.row?.updated_at) ? `, ${timeText(selected.p.row.updated_at)}` : ''}` : savedWhere(selected.p),
    build: buildLabel(), company,
  } : null), [selected, units, upstream, good, portfolio, valued.length, savedWhere, company]);
  const model = useMemo(() => (reportArgs ? buildRrvReportModel(reportArgs) : null), [reportArgs]);

  const exportPdf = async () => {
    if (!reportArgs || !selected?.v) return;
    setExporting(true);
    try {
      const built = await exportRrvReport(reportArgs);
      built.doc.save(reportFileName(selected.p.name));
      setStatus(`Downloaded the report for ${selected.p.name}: ${built.pages} pages, ${built.figures.filter((f) => f.plotted).length} plots.`);
    } catch (e) { setStatus(`The report was not built: ${e.message}`); } finally { setExporting(false); }
  };

  const v = selected?.v;
  const curves = useMemo(() => (v ? volumeCurves(engineInput(selected.p)) : null), [v, selected]);
  const conv = (pts) => pts.map(([x, y]) => [units.volume(x), y]);
  const selUp = selected ? upstream.get(selected.p.id) : null;
  const ownSourceKeys = selected && !readOnly
    ? (selected.p.source === 'rcp' ? ECON_KEYS.filter((k) => !HANDOFF_KEYS.includes(k) || selected.p.handoff?.values?.[k] === undefined || Number(selected.p[k]) !== Number(selected.p.handoff.values[k])) : ['pg', 'p90', 'p50', 'p10', ...ECON_KEYS])
      .filter((k) => !derivedKey(selected.p, k))
      .concat(selected.p.econ?.value === 'model' ? ['econModel'] : [])
    : [];

  const saveState = storage.table === null ? 'Checking where valuations are saved'
    : storage.table === false ? 'Kept in this browser only'
      : dirtyCount ? `${dirtyCount} not saved to your account`
        : prospects.length ? 'Saved to your account' : 'Nothing to save yet';

  const noteOf = (p) => {
    if (p.source !== 'rcp') return 'typed here';
    const ed = editedKeys(p);
    return `from ReservoirCalc Pro${p.handoff?.recordUpdatedAt ? `, saved ${timeText(p.handoff.recordUpdatedAt)}` : ''}${p.volumeNote ? `, ${p.volumeNote}` : ''}${p.economicsNote ? `; ${p.economicsNote}` : ''}${p.chargeNote ? `; ${p.chargeNote}` : ''}${ed.length ? `; edited here: ${ed.map((k) => `${SHORT_LABEL[k]} (sent ${F.plain(k === 'pg' ? Number(p.handoff.values[k]) : units.show(k, Number(p.handoff.values[k])))})`).join(', ')}` : ''}`;
  };

  const rowOf = ({ p, v: pv, problem, shared = false }) => {
    const up = upstream.get(p.id);
    const ed = new Set(editedKeys(p));
    const upText = up && ['changed', 'replaced', 'missing', 'unrecorded'].includes(up.state) ? upstreamSentence(up, units) : null;
    return (
      <tr key={`${shared ? 's' : 'o'}-${p.id}`} className={`border-t border-pl-border ${selected?.p.id === p.id ? 'bg-pl-primary/10' : ''}`} onClick={() => setSelectedId(p.id)} data-testid={`rrv-row-${p.name}`} data-shared={shared ? 'true' : undefined}>
        <td className="px-2 py-1 min-w-[180px]">
          <input className={cell} value={p.name} disabled={shared} aria-label={`Name of ${p.name}`} onChange={(e) => patch(p.id, 'name', e.target.value)} data-testid={`rrv-name-${p.name}`} />
          <span className={`block text-[10px] ${p.source === 'rcp' && p.basis !== 'recoverable' ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid={`rrv-note-${p.name}`}>{noteOf(p)}</span>
          {shared && <SharedRowNote table={RRV_TABLE} row={p.row} userId={me} names={names} className="!text-[10px]" />}
          {upText && (
            <span className="block text-[10px] text-pl-warning-text" data-testid={`rrv-upstream-${p.name}`}>
              {upText}{' '}
              {!shared && up.row && (
                <button type="button" className="underline text-pl-primary-text" data-testid={`rrv-refresh-${p.name}`} onClick={(e) => { e.stopPropagation(); refresh(p.id); }}>
                  Refresh from ReservoirCalc Pro
                </button>
              )}
            </span>
          )}
          {!shared && <span className="block text-[10px] text-pl-muted" data-testid={`rrv-saved-${p.name}`}>{savedWhere(p)}</span>}
        </td>
        {FIELDS.map(([k, , title]) => (
          <td key={k} className="px-1 py-1 w-[76px]">
            <NumCell value={p[k]} title={derivedKey(p, k) ? `${title}. DERIVED: ${derivedWhy(p, k)}. Typing here takes it over` : ed.has(k) ? `${title}. Edited here: ReservoirCalc Pro sent ${F.plain(k === 'pg' ? Number(p.handoff.values[k]) : units.show(k, Number(p.handoff.values[k])))}` : title}
              disabled={shared} show={(x) => units.show(k, x)} read={(x) => units.read(k, x)} className={derivedKey(p, k) ? 'italic border-dashed' : ed.has(k) ? 'border-pl-warning-text' : ''}
              aria-label={`${SOURCE_LABEL[k]} of ${p.name}`} data-edited={ed.has(k) && !derivedKey(p, k) ? 'true' : undefined} data-basis={derivedKey(p, k) ? 'derived' : undefined}
              onCommit={(val) => patch(p.id, k, val)} data-testid={`rrv-${k}-${p.name}`} />
          </td>
        ))}
        <td className="px-2 py-1 text-right font-pl-mono tabular-nums" data-testid={`rrv-pc-${p.name}`}>{pv ? pct(pv.pc) : EMPTY_VALUE}</td>
        <td className={`px-2 py-1 text-right font-pl-mono font-semibold tabular-nums ${pv && pv.emv < 0 ? 'text-pl-danger-text' : 'text-pl-success-text'}`} data-testid={`rrv-emv-${p.name}`}>
          {pv ? fmt(pv.emv) : <span className="text-pl-warning-text font-normal" title={problem}>check inputs</span>}
        </td>
        <td className="px-1 whitespace-nowrap text-right">
          {shared
            ? <button type="button" title={`Save a copy of ${p.name} into your list`} className="inline-flex items-center gap-1 text-[11px] text-pl-primary-text" data-testid={`rrv-copy-${p.name}`} onClick={(e) => { e.stopPropagation(); saveCopy(p); }}><Copy className="w-3.5 h-3.5" /> Save a copy</button>
            : <button type="button" title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`} className="text-pl-muted hover:text-pl-danger-text" data-testid={`rrv-remove-${p.name}`} onClick={(e) => { e.stopPropagation(); remove(p.id); }}><Trash2 className="w-3.5 h-3.5" /></button>}
        </td>
      </tr>
    );
  };

  return (
    <div className="h-full flex flex-col bg-pl-bg text-pl-text" data-testid="rrv">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-pl-surface border-b border-pl-border">
        <ModuleHomeLink module="reservoir" />
        <PieChart className="w-4 h-4 text-pl-primary-text" />
        <span className="text-sm font-semibold">Risked Reserves Valuation</span>
        <span className="text-[11px] text-pl-muted">commercial chance, EMV and the expectation curve for risked prospects</span>
        <button type="button" className={`${btn} ml-auto`} onClick={importInventory} disabled={inventory === null} data-testid="rrv-import">
          <RefreshCw className="w-3.5 h-3.5" /> Import from ReservoirCalc Pro{inventory ? ` (${inventory.length})` : ''}
        </button>
        <button type="button" className={btn} onClick={add} data-testid="rrv-add"><Plus className="w-3.5 h-3.5" /> Add prospect</button>
        <button type="button" className={btn} onClick={save} disabled={!storage.table || saving || !dirtyCount} data-testid="rrv-save"
          title={storage.table === false ? 'Saving to your account is not switched on for this database yet. Valuations are kept in this browser as you type.' : storage.table === null ? 'Checking your account' : dirtyCount ? 'Save every valuation to your account' : 'Your account has every valuation as shown'}>
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving' : 'Save'}
        </button>
        <span className={`text-[11px] ${dirtyCount && storage.table ? 'text-pl-warning-text' : 'text-pl-muted'}`} data-testid="rrv-save-state">{saveState}</span>
        <button type="button" className={btn} onClick={exportCsv} disabled={!prospects.length} data-testid="rrv-csv"><Download className="w-3.5 h-3.5" /> CSV</button>
        <label className="flex items-center gap-1 text-[11px] text-pl-muted">Volumes in
          <select className={`${cell} !w-auto`} value={units.volumeUnit} data-testid="rrv-units" onChange={(e) => au.setUnit('volume', e.target.value)}>
            <option value="MMbbl">MMboe</option>
            <option value="10^6 m3">10^6 m3 oe</option>
          </select>
        </label>
        <Link to="/dashboard/apps/reservoir/risked-reserves-valuation/help" className={btn} data-testid="rrv-help"><HelpCircle className="w-3.5 h-3.5" /> Help</Link>
        <ThemeToggle className="h-7 w-7" />
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {storage.table === false && (
          <p className="rounded border border-pl-border bg-pl-surface px-3 py-2 text-xs text-pl-muted" data-testid="rrv-storage-note">
            {browserOk
              ? 'Valuations are kept in this browser only: saving to your account is not switched on for this database yet. They are not on your other devices and a colleague cannot open them. Once it is switched on, Save moves them to your account.'
              : 'Valuations cannot be kept: saving to your account is not switched on for this database yet, and this browser refuses storage (a private window). Export the CSV or the report before leaving the page.'}
            {storage.error ? ` (${storage.error})` : ''}
          </p>
        )}
        {au.differs.length > 0 && (
          <p className="text-[11px] text-pl-muted" data-testid="rrv-units-note">
            Showing volumes in {units.volumeLabel} for this session; your unit profile asks for {rrvUnits(au.profileUnits.volume).volumeLabel}.{' '}
            <button type="button" className="underline text-pl-primary-text" onClick={au.resetToProfile}>Use the profile unit</button>
          </p>
        )}
        {!prospects.length && !sharedValued.length ? (
          <div className="text-sm text-pl-muted p-6 text-center" data-testid="rrv-empty">
            Import the prospects you risked in ReservoirCalc Pro, or add one here, then set its minimum economic field size, value per barrel and costs.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-pl-border bg-pl-surface">
            <table className="w-full min-w-[1020px] text-xs">
              <thead className="text-pl-muted">
                <tr>
                  <th className="text-left px-2 py-1">Prospect</th>
                  {FIELDS.map(([k, label, title]) => <th key={k} className="text-right px-1 py-1 whitespace-nowrap" title={title}>{label}{['p90', 'p50', 'p10', 'mefs'].includes(k) ? <span className="block text-[9px] font-normal">{units.volumeLabel}</span> : null}</th>)}
                  <th className="text-right px-2 py-1" title="Commercial chance: Pg x P(volume >= MEFS)">Pc</th>
                  <th className="text-right px-2 py-1" title="Expected monetary value after the exploration well, $MM">EMV $MM</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {valued.map(rowOf)}
                {sharedValued.length > 0 && (
                  <tr className="border-t border-pl-border" data-testid="rrv-shared-head">
                    <td colSpan={FIELDS.length + 4} className="px-2 py-1 text-[10px] uppercase tracking-wider text-pl-muted">
                      Shared with me ({sharedValued.length}): read-only and left out of your portfolio. Save a copy to work on one.
                    </td>
                  </tr>
                )}
                {sharedValued.map(rowOf)}
              </tbody>
            </table>
          </div>
        )}
        {prospects.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded border border-pl-border bg-pl-surface px-3 py-1.5 text-xs" data-testid="rrv-portfolio">
            <span className="font-semibold">
              Portfolio of {portfolio.count} independent prospect{portfolio.count === 1 ? '' : 's'}: risked mean {fmt(units.volume(portfolio.riskedMean))} {units.volumeLabel},
              {' '}expected commercial discoveries {fmt(portfolio.expectedCommercial, 2)}, chance of at least one {pct(portfolio.pAtLeastOneCommercial)}
              {portfolio.count < valued.length && <span className="text-pl-warning-text font-normal"> ({valued.length - portfolio.count} left out until its inputs are fixed)</span>}
            </span>
            <span className="whitespace-nowrap">EMV <span className={`font-pl-mono font-semibold tabular-nums ${portfolio.emv < 0 ? 'text-pl-danger-text' : 'text-pl-success-text'}`} data-testid="rrv-portfolio-emv">{fmt(portfolio.emv)}</span> $MM</span>
          </div>
        )}

        {selected && selected.problem && (
          <p className="text-xs text-pl-warning-text" data-testid="rrv-problem">{selected.p.name}: {selected.problem}</p>
        )}

        {selected && (
          <div className="flex flex-wrap items-center gap-2" data-testid="rrv-tabs">
            <div className="inline-flex rounded border border-pl-border overflow-hidden" role="tablist" aria-label="Views of the selected prospect">
              {[['valuation', 'Valuation'], ['economics', 'Economics'], ['report', 'Report']].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`rrv-tab-${id}`}
                  className={`px-3 py-1 text-xs ${tab === id ? 'bg-pl-primary text-pl-primary-fg' : 'bg-pl-surface text-pl-text hover:bg-pl-sunken'}`} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            <span className="text-xs text-pl-muted">{selected.p.name}{readOnly ? ' (shared with you, read-only)' : ''}</span>
            {!readOnly && selected.p.row && storage.table && backend.sharing && (
              <button type="button" className={btn} aria-expanded={shareOpen} data-testid="rrv-share" onClick={() => setShareOpen((o) => !o)}
                title="Share this saved valuation with your organisation, for viewing">
                <Users className="w-3.5 h-3.5" /> {selected.p.row.visibility === 'organization' ? 'Shared' : 'Share'}
              </button>
            )}
          </div>
        )}
        {selected && shareOpen && !readOnly && selected.p.row && storage.table && backend.sharing && (
          <ValuationSharing store={backend.sharing} row={selected.p.row}
            onChange={(next) => setProspects((ps) => ps.map((x) => (x.id === selected.p.id ? { ...x, row: { ...x.row, ...next } } : x)))} />
        )}

        {selected && tab === 'report' && model && (
          <RrvReportPanel model={model} prospect={selected.p} readOnly={readOnly} ownSourceKeys={ownSourceKeys} labels={SOURCE_LABEL} companyDefault={company}
            onIdent={(k, val) => setIdent(selected.p.id, k, val)} onMeta={(k, f, val) => setMeta(selected.p.id, k, f, val)} onExport={exportPdf} exporting={exporting} />
        )}

        {selected && tab === 'economics' && (
          <RrvEconomicsPanel prospect={selected.p} model={model} resolved={resolveEconomics(selected.p)} units={units} readOnly={readOnly}
            onValueBasis={(b) => touch(selected.p.id, (p) => setValueBasis(p, b))}
            onMefsBasis={(b) => touch(selected.p.id, (p) => setMefsBasis(p, b))}
            onModel={(k, val) => touch(selected.p.id, (p) => setModelField(p, k, val))} />
        )}

        {v && tab === 'valuation' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-3">
            <ExpectationChart success={conv(curves.success)} risked={conv(curves.risked)} mefs={units.volume(Number(selected.p.mefs))} pg={v.pg} volumeLabel={units.volumeLabel}
              marks={{ p90: units.volume(v.successCase.p90), p50: units.volume(v.successCase.p50), p10: units.volume(v.successCase.p10) }} />
            <div className="rounded border border-pl-border bg-pl-surface p-2 text-xs space-y-1" data-testid="rrv-readout">
              <div className="text-pl-text font-medium">{selected.p.name}</div>
              {[
                ['Geological chance Pg', pct(v.pg)],
                ['Chance of at least the MEFS if it works', pct(v.pCommercialGivenSuccess)],
                ['Commercial chance Pc', pct(v.pc)],
                ['Success-case mean (lognormal)', `${fmt(units.volume(v.successCase.mean))} ${units.volumeLabel}`],
                ['Swanson mean (check)', v.successCase.swansonMean != null ? `${fmt(units.volume(v.successCase.swansonMean))} ${units.volumeLabel}` : EMPTY_VALUE],
                ['Risked mean (Pg x mean)', `${fmt(units.volume(v.riskedMean))} ${units.volumeLabel}`],
                ['Mean if commercial', v.meanIfCommercial != null ? `${fmt(units.volume(v.meanIfCommercial))} ${units.volumeLabel}` : EMPTY_VALUE],
                ['NPV if commercial', v.npvIfCommercial != null ? `${fmt(v.npvIfCommercial)} $MM` : EMPTY_VALUE],
                ['EMV after the well', `${fmt(v.emv)} $MM`],
                ['Break-even Pg', v.breakEvenPg != null ? pct(v.breakEvenPg) : 'not reachable'],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-2"><span className="text-pl-muted">{k}</span><span className="font-pl-mono tabular-nums" data-testid={`rrv-out-${k}`}>{val}</span></div>
              ))}
              <p className="text-[10px] text-pl-muted pt-1">
                Volumes are the success case in oil equivalent, the lognormal fitted to P90 and P10 (P90 is the low case). The risked mean
                averages the dry hole in; it is never a volume anyone will find.
              </p>
              {/* H8: say where the number came from. No app sends it here. */}
              <p className="text-[10px] text-pl-muted" data-testid="rrv-unit-value-source">
                Value per barrel for this prospect: {unitValueSource(selected.p)}. Nothing is received from the
                Petroleum Economics Studio. The Economics tab holds the model and the choice.
              </p>
              {selUp && selected.p.source === 'rcp' && (
                <p className="text-[10px] text-pl-muted" data-testid="rrv-handoff-line">
                  Volumes and Pg: {handoffLine(selected.p)}. {selUp.state === 'current' ? 'The source record is unchanged since.' : (upstreamSentence(selUp, units) || '')}
                </p>
              )}
              {model?.limits?.flags?.length > 0 && (
                <p className="text-[10px] text-pl-warning-text" data-testid="rrv-flag-count">
                  {model.limits.flags.length} flag{model.limits.flags.length === 1 ? '' : 's'} on this prospect: see the Report tab.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-1 bg-pl-surface border-t border-pl-border text-[11px] text-pl-muted">
        <span data-testid="rrv-status">{status}</span>
        {removed && <button type="button" className="inline-flex items-center gap-1 underline text-pl-primary-text" data-testid="rrv-undo" onClick={undoRemove}><Undo2 className="w-3 h-3" /> Undo</button>}
      </div>
    </div>
  );
}

// Design system rollout batch 3E: the workstation opens light and follows
// the user's theme choice from the toolbar toggle. The route page and the
// /dev harness both mount this component, so they share the one scope.
export default function RrvWorkstation(props) {
  return (
    <div className="h-full" data-testid="rrv-theme-scope">
      <RrvWorkstationContent {...props} />
    </div>
  );
}
