// QI Studio panels (QI programme Q1 / A4, 2026-10-06): Setup, Data
// inventory, Usability matrix, Issue register and Feasibility. All state is
// the context's; these are views and edits on it.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQIStudio } from '../QIStudioContext';
import { STATES } from '../services/inventory';
import {
  ISSUE_STATES, SEVERITIES, FEASIBILITY_VERDICTS, DECISION_GATES, DECISION_OUTCOMES, decisionProblem, runChoices, gateLabel, outcomeLabel,
} from '../services/model';
import { timeOnlyReason } from '@/pages/apps/Seismolord/lib/verticalDomain';
import LocationBadge from '@/components/localWorkspace/LocationBadge';
import LocalWorkspacePanel from '@/components/localWorkspace/LocalWorkspacePanel';
import { useVolumePlacements } from '@/lib/localWorkspace/runtime';

const card = 'rounded-lg border border-pl-border bg-pl-surface p-4 space-y-3';
const h2 = 'text-sm font-semibold text-pl-text';
const muted = 'text-xs text-pl-muted';
const field = 'rounded border border-pl-border-strong bg-pl-surface px-1.5 py-0.5 text-xs text-pl-text';
const btn = 'px-2 py-0.5 rounded border text-xs border-pl-border text-pl-text hover:bg-pl-sunken disabled:opacity-50';
const th = 'text-left font-medium text-pl-muted pr-3 pb-1 align-bottom';
const td = 'pr-3 py-1 align-top text-pl-text';
const GRADE_CLS = {
  good: 'bg-pl-success-bg text-pl-success-text border-pl-success',
  limited: 'bg-pl-warning-bg text-pl-warning-text border-pl-warning',
  missing: 'bg-pl-danger-bg text-pl-danger-text border-pl-danger',
};
const GRADE_WORD = { good: 'Good', limited: 'Limited', missing: 'Missing' };
const SEV_CLS = { high: 'text-pl-danger-text', medium: 'text-pl-warning-text', low: 'text-pl-muted' };

export function SetupPanel() {
  const {
    wells, volumes, project, loaded, toggleWell, toggleVolume, toggleTarget, targetChoices, setSeismicAcquired, setFirstProduction, canWrite,
    setObjectivesText, setTargetObjective,
  } = useQIStudio();
  // Local Workspace: where each volume lives (jobs on a local volume run on this computer)
  const placements = useVolumePlacements(volumes);
  const objectives = project.objectives || { text: '', targets: {} };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4" data-testid="qi-setup">
      <section className={card}>
        <h2 className={h2}>Wells</h2>
        <p className={muted}>From the shared well registry (Well Data Manager). Tick the wells this study covers.</p>
        {wells === null ? <p className={muted}>Loading wells</p> : !wells.length ? <p className={muted}>No wells in the registry yet.</p> : (
          <div className="max-h-72 overflow-y-auto space-y-1 text-xs">
            {wells.map((w) => {
              const r = loaded[w.id];
              return (
                <label key={w.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={project.wellIds.includes(w.id)} onChange={() => toggleWell(w.id)} disabled={!canWrite} data-testid={`qi-well-${w.id}`} />
                  <span className="text-pl-text">{w.name}</span>
                  {project.wellIds.includes(w.id) && !r && <span className="text-pl-muted">loading</span>}
                  {r?.error && <span className="text-pl-danger-text">{r.error}</span>}
                </label>
              );
            })}
          </div>
        )}
      </section>
      <section className={card}>
        <h2 className={h2}>Target intervals</h2>
        <p className={muted}>The zones defined on the chosen wells. A target is matched by zone name on every well.</p>
        {!targetChoices.length ? <p className={muted}>Choose wells with zones first.</p> : (
          <div className="space-y-1 text-xs">
            {targetChoices.map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="checkbox" checked={project.targets.includes(t)} onChange={() => toggleTarget(t)} disabled={!canWrite} data-testid={`qi-target-${t}`} />
                <span className="text-pl-text">{t}</span>
              </label>
            ))}
          </div>
        )}
      </section>
      <section className={card}>
        <h2 className={h2}>Seismic and dates</h2>
        <p className={muted}>The volumes from Seismolord this study reads, and the dates that decide whether seismic may show depletion near a well.</p>
        <div className="space-y-1 text-xs">
          {volumes.length ? volumes.map((v) => {
            // P1.6: a depth volume is listed, but QI Studio works in two-way time
            const depthWhy = timeOnlyReason(v, 'QI Studio');
            return (
              <label key={v.id} className="flex items-center gap-2" title={depthWhy || undefined}>
                <input type="checkbox" checked={!depthWhy && project.volumeIds.includes(v.id)} onChange={() => toggleVolume(v.id)} disabled={!canWrite || Boolean(depthWhy)} data-testid={`qi-volume-${v.id}`} />
                <span className="text-pl-text">{v.name}</span>
                <LocationBadge placement={placements.get(v.id)} />
                {depthWhy && <span className="text-pl-muted" data-testid={`qi-volume-depth-${v.id}`}>(depth: QI Studio works in two-way time)</span>}
              </label>
            );
          }) : <p className={muted}>No seismic volumes in Seismolord yet.</p>}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-pl-muted w-40">Seismic acquired</span>
          <input type="date" className={field} value={project.dates.seismicAcquired} onChange={(e) => setSeismicAcquired(e.target.value)} disabled={!canWrite} data-testid="qi-seismic-date" />
        </label>
        {project.wellIds.map((id) => {
          const w = (wells || []).find((x) => x.id === id);
          if (!w) return null;
          return (
            <label key={id} className="flex items-center gap-2 text-xs">
              <span className="text-pl-muted w-40 truncate">{`${w.name} first production`}</span>
              <input type="date" className={field} value={project.dates.firstProduction[id] || ''} onChange={(e) => setFirstProduction(id, e.target.value)} disabled={!canWrite} />
            </label>
          );
        })}
      </section>
      <section className={card} data-testid="qi-local-workspace">
        <h2 className={h2}>Local workspace</h2>
        <p className={muted}>Volumes kept on this computer are processed here: QC, attributes, inversion, AVO, properties and zone maps run in this browser with the same code as the Petrolord servers. Nothing of the seismic is uploaded; results and summaries save to the cloud as usual.</p>
        <LocalWorkspacePanel compact />
      </section>
      {/* light governance (QI upgrade P1.1): added below the three setup cards */}
      <section className={`${card} xl:col-span-3`} data-testid="qi-objectives">
        <h2 className={h2}>Objectives and acceptance criteria</h2>
        <p className={muted}>What this study must deliver and how its results will be judged (for example the blind-well error a product must meet before it is used). Printed in the report.</p>
        <textarea
          className={`${field} w-full h-20`} value={objectives.text} onChange={(e) => setObjectivesText(e.target.value)} disabled={!canWrite}
          placeholder="For example: map porosity in the main sand with a blind-well error under 0.03; decide whether AVO can tell gas from brine at the prospect." data-testid="qi-objectives-text"
        />
        {project.targets.length > 0 && (
          <div className="space-y-1 text-xs">
            <p className="text-pl-muted">Per target (optional)</p>
            {project.targets.map((t) => (
              <label key={t} className="flex items-center gap-2">
                <span className="text-pl-muted w-40 truncate">{t}</span>
                <input className={`${field} flex-1`} value={objectives.targets?.[t] || ''} onChange={(e) => setTargetObjective(t, e.target.value)} disabled={!canWrite} data-testid={`qi-objective-target-${t}`} />
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function InventoryPanel() {
  const { inventory, setInventory, canWrite } = useQIStudio();
  let area = null;
  return (
    <section className={card} data-testid="qi-inventory">
      <h2 className={h2}>Data inventory</h2>
      <p className={muted}>Every data group the study asks for. Where the Suite already holds the data, the state is suggested from the registries; change it to what was actually delivered and usable.</p>
      <table className="text-xs w-full">
        <thead><tr><th className={th}>Data</th><th className={th}>State</th><th className={th}>Received on</th><th className={th}>Note</th><th className={th}>From the Suite</th></tr></thead>
        <tbody>
          {inventory.map((r) => {
            const head = r.area !== area;
            area = r.area;
            return (
              <React.Fragment key={r.key}>
                {head && <tr><td colSpan={5} className="pt-3 pb-1 font-semibold text-pl-text">{r.area}</td></tr>}
                <tr data-testid={`qi-inv-${r.key}`}>
                  <td className={td}>{r.label}</td>
                  <td className={td}>
                    <select className={field} value={r.state} onChange={(e) => setInventory(r.key, { state: e.target.value })} disabled={!canWrite}>
                      {STATES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className={td}><input type="date" className={field} value={r.date} onChange={(e) => setInventory(r.key, { date: e.target.value })} disabled={!canWrite} /></td>
                  <td className={td}><input className={`${field} w-56`} value={r.note} onChange={(e) => setInventory(r.key, { note: e.target.value })} disabled={!canWrite} /></td>
                  <td className={`${td} text-pl-muted`}>{r.suggested ? `${r.suggested.evidence}${r.fromSuggestion ? ' (suggested)' : ''}` : ''}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function UsabilityPanel() {
  const { matrix, project, loading } = useQIStudio();
  const [open, setOpen] = useState(null); // `${wellId}|${target}`
  if (!project.wellIds.length || !project.targets.length) {
    return <section className={card}><p className={muted}>Choose wells and target intervals on Setup to see the usability matrix.</p></section>;
  }
  const detail = open && (() => {
    const [wid, t] = open.split('|');
    const row = matrix.rows.find((r) => r.wellId === wid);
    const cell = row?.cells.find((c) => c.target === t);
    return cell ? { row, cell } : null;
  })();
  return (
    <section className={card} data-testid="qi-usability">
      <h2 className={h2}>Usability matrix</h2>
      <p className={muted}>
        {`Each well against each target, from the registry: the curves over the zone (by their recorded depth extent), checkshots, the depth reference and the survey. ${matrix.count.good} good, ${matrix.count.limited} limited, ${matrix.count.missing} missing.${loading ? ' Some wells are still loading.' : ''} Click a cell for the reasons.`}
      </p>
      <table className="text-xs">
        <thead><tr><th className={th}>Well</th>{matrix.targets.map((t) => <th key={t} className={th}>{t}</th>)}</tr></thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.wellId}>
              <td className={td}>{r.wellName}{r.depletion && <span className="ml-1 text-pl-warning-text" title={r.depletion}>depletion</span>}</td>
              {r.cells.map((c) => (
                <td key={c.target} className={td}>
                  <button type="button" onClick={() => setOpen(`${r.wellId}|${c.target}`)} className={`px-2 py-0.5 rounded border ${GRADE_CLS[c.grade]}`} data-testid={`qi-cell-${r.wellId}-${c.target}`}>
                    {GRADE_WORD[c.grade]}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {detail && (
        <div className="rounded border border-pl-border p-3 text-xs space-y-1" data-testid="qi-cell-detail">
          <p className="font-semibold text-pl-text">{`${detail.row.wellName}, ${detail.cell.target}`}</p>
          {detail.cell.items.map((it) => (
            <p key={it.key}><span className={`inline-block w-16 mr-2 px-1 rounded border text-center ${GRADE_CLS[it.grade]}`}>{GRADE_WORD[it.grade]}</span><span className="text-pl-muted">{it.label}:</span> <span className="text-pl-text">{it.text}</span></p>
          ))}
          {detail.row.depletion && <p className="text-pl-warning-text">{detail.row.depletion}</p>}
        </div>
      )}
    </section>
  );
}

const blankDecision = () => ({ gate: 'data_qc', gateOther: '', outcome: 'proceed', decision: '', by: '', date: new Date().toISOString().slice(0, 10), ref: '', refText: '', note: '' });

/** Decisions recorded in the register (QI upgrade P1.1): a record per gate, never an enforced sign-off. */
export function DecisionsSection() {
  const { project, decisions, saveDecision, removeDecision, canWrite } = useQIStudio();
  const [draft, setDraft] = useState(blankDecision);
  const runs = React.useMemo(() => runChoices(project), [project]);
  const problem = decisionProblem(draft);
  const add = () => {
    if (problem) return;
    const ref = runs.find((r) => r.key === draft.ref);
    saveDecision({
      gate: draft.gate, gateOther: draft.gate === 'other' ? draft.gateOther.trim() : '', outcome: draft.outcome,
      decision: draft.decision.trim(), by: draft.by.trim(), date: draft.date,
      ref: ref ? { key: ref.key, label: ref.label } : null, refText: draft.refText.trim(), note: draft.note.trim(),
    });
    setDraft(blankDecision());
  };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <section className={card} data-testid="qi-decisions">
      <h2 className={h2}>Decisions</h2>
      <p className={muted}>Record the decision taken at each gate of the study (data QC, feasibility, pilot or another), who took it, when, and the run or version it rests on. A record for the report: nothing is locked or enforced.</p>
      <table className="text-xs w-full">
        <thead><tr><th className={th}>Date</th><th className={th}>Gate</th><th className={th}>Decision</th><th className={th}>By</th><th className={th}>Refers to</th><th className={th} aria-label="Remove" /></tr></thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.key} data-testid="qi-decision-row">
              <td className={td}>{d.date}</td>
              <td className={td}>{gateLabel(d)}</td>
              <td className={td}>
                <p className="text-pl-text">{[outcomeLabel(d), d.decision].filter(Boolean).join(': ')}</p>
                {d.note && <p className="text-pl-muted">{d.note}</p>}
              </td>
              <td className={td}>{d.by}</td>
              <td className={`${td} text-pl-muted`}>{[d.ref?.label, d.refText].filter(Boolean).join('; ')}</td>
              <td className={td}>{canWrite && <button type="button" className={btn} onClick={() => removeDecision(d.key)} data-testid={`qi-decision-remove-${d.key}`}>Remove</button>}</td>
            </tr>
          ))}
          {!decisions.length && <tr><td colSpan={6} className={`${td} text-pl-muted`}>No decisions recorded yet.</td></tr>}
        </tbody>
      </table>
      {canWrite && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs" data-testid="qi-decision-add">
          <label className="flex items-center gap-2"><span className="text-pl-muted w-20">Gate</span>
            <select className={field} value={draft.gate} onChange={(e) => set({ gate: e.target.value })} data-testid="qi-decision-gate">
              {DECISION_GATES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
            {draft.gate === 'other' && <input className={`${field} flex-1`} placeholder="Gate name" value={draft.gateOther} onChange={(e) => set({ gateOther: e.target.value })} data-testid="qi-decision-gate-other" />}
          </label>
          <label className="flex items-center gap-2"><span className="text-pl-muted w-20">Outcome</span>
            <select className={field} value={draft.outcome} onChange={(e) => set({ outcome: e.target.value })} data-testid="qi-decision-outcome">
              {DECISION_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="text-pl-muted w-20">Date</span>
            <input type="date" className={field} value={draft.date} onChange={(e) => set({ date: e.target.value })} data-testid="qi-decision-date" />
          </label>
          <label className="flex items-center gap-2 md:col-span-2"><span className="text-pl-muted w-20">Decision</span>
            <input className={`${field} flex-1`} placeholder="For example: go to the pilot with the model-based inversion" value={draft.decision} onChange={(e) => set({ decision: e.target.value })} data-testid="qi-decision-text" />
          </label>
          <label className="flex items-center gap-2"><span className="text-pl-muted w-20">By</span>
            <input className={`${field} flex-1`} placeholder="Name or role" value={draft.by} onChange={(e) => set({ by: e.target.value })} data-testid="qi-decision-by" />
          </label>
          <label className="flex items-center gap-2 md:col-span-2"><span className="text-pl-muted w-20">Refers to</span>
            <select className={`${field} flex-1`} value={draft.ref} onChange={(e) => set({ ref: e.target.value })} data-testid="qi-decision-ref">
              <option value="">{runs.length ? 'Choose a run or check (optional)' : 'No runs in this study yet'}</option>
              {runs.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><span className="text-pl-muted w-20">Version</span>
            <input className={`${field} flex-1`} placeholder="Other run or version (optional)" value={draft.refText} onChange={(e) => set({ refText: e.target.value })} data-testid="qi-decision-ref-text" />
          </label>
          <label className="flex items-center gap-2 md:col-span-2"><span className="text-pl-muted w-20">Note</span>
            <input className={`${field} flex-1`} placeholder="Conditions or reasons (optional)" value={draft.note} onChange={(e) => set({ note: e.target.value })} data-testid="qi-decision-note" />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} onClick={add} disabled={!!problem} data-testid="qi-decision-add-btn">Record the decision</button>
            {problem && <span className="text-pl-muted" data-testid="qi-decision-problem">{problem}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

export function IssuesPanel() {
  const { issues, saveIssue, canWrite } = useQIStudio();
  const [draft, setDraft] = useState({ title: '', severity: 'medium', area: '', detail: '', remedy: '', owner: '', status: 'open' });
  const add = () => {
    if (!draft.title.trim()) return;
    saveIssue({ ...draft, title: draft.title.trim() });
    setDraft({ title: '', severity: 'medium', area: '', detail: '', remedy: '', owner: '', status: 'open' });
  };
  return (
    <section className={card} data-testid="qi-issues">
      <h2 className={h2}>Issue register</h2>
      <p className={muted}>The usability matrix suggests issues (marked suggested); keep, resolve or dismiss them, and add your own. Open issues with high severity come first.</p>
      <table className="text-xs w-full">
        <thead><tr><th className={th}>Severity</th><th className={th}>Issue</th><th className={th}>Remedy</th><th className={th}>Owner</th><th className={th}>Status</th></tr></thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.key} data-testid="qi-issue-row">
              <td className={`${td} ${SEV_CLS[i.severity] || ''}`}>{i.severity}</td>
              <td className={td}>
                <p className="text-pl-text">{i.title}{i.suggested && <span className="ml-1 text-pl-muted">(suggested)</span>}</p>
                {i.detail && <p className="text-pl-muted">{i.detail}</p>}
              </td>
              <td className={`${td} text-pl-muted`}>{i.remedy}</td>
              <td className={td}><input className={`${field} w-28`} value={i.owner || ''} onChange={(e) => saveIssue({ ...i, owner: e.target.value })} disabled={!canWrite} /></td>
              <td className={td}>
                <select className={field} value={i.status} onChange={(e) => saveIssue({ ...i, status: e.target.value })} disabled={!canWrite} data-testid={`qi-issue-status-${i.key}`}>
                  {ISSUE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {!issues.length && <tr><td colSpan={5} className={`${td} text-pl-muted`}>No issues yet.</td></tr>}
        </tbody>
      </table>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="qi-issue-add">
          <input className={`${field} w-56`} placeholder="New issue" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="qi-issue-title" />
          <select className={field} value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className={`${field} w-56`} placeholder="Remedy" value={draft.remedy} onChange={(e) => setDraft({ ...draft, remedy: e.target.value })} />
          <button type="button" className={btn} onClick={add} disabled={!draft.title.trim()} data-testid="qi-issue-add-btn">Add</button>
        </div>
      )}
    </section>
  );
}

export function FeasibilityPanel() {
  const { project, setFeasibility, canWrite } = useQIStudio();
  if (!project.targets.length) return <section className={card}><p className={muted}>Choose target intervals on Setup first.</p></section>;
  return (
    <section className={card} data-testid="qi-feasibility">
      <h2 className={h2}>Feasibility per target</h2>
      <p className={muted}>
        The verdict and reasoning for each target, from the rock physics work. Build the evidence in Rock Physics Studio (fluid substitution, the rock model lines, the multi-well crossplot) and record what it shows here.{' '}
        <Link className="underline" to="/dashboard/apps/geoscience/rock-physics-studio">Open Rock Physics Studio</Link>
      </p>
      {project.targets.map((t) => {
        const f = project.feasibility[t] || {};
        const set = (patch) => setFeasibility(t, patch);
        return (
          <div key={t} className="rounded border border-pl-border p-3 space-y-2 text-xs" data-testid={`qi-feas-${t}`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-pl-text">{t}</span>
              <select className={field} value={f.verdict || ''} onChange={(e) => set({ verdict: e.target.value })} disabled={!canWrite} data-testid={`qi-feas-verdict-${t}`}>
                {FEASIBILITY_VERDICTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </div>
            {[
              ['separability', 'Separability (which properties separate the fluid and rock cases, and how well)'],
              ['detectability', 'Detectability (tuning, noise, the expected amplitude change)'],
              ['route', 'Recommended route (for example post-stack inversion, AVO, or prestack inversion)'],
            ].map(([k, label]) => (
              <label key={k} className="block">
                <span className="text-pl-muted">{label}</span>
                <textarea className={`${field} w-full h-14 mt-0.5`} value={f[k] || ''} onChange={(e) => set({ [k]: e.target.value })} disabled={!canWrite} />
              </label>
            ))}
          </div>
        );
      })}
    </section>
  );
}
