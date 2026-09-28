// Checks tab: run-in clearance vs the exposed casing program, through-bore
// (wireline access), volumes, PBR seal space-out, erosional limit, and the
// immutable run history. Every number is the engine's — recomputed by the
// e2e spec through cdRun.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash } from 'lucide-react';
import { depthDisp, depthLabel } from '../services/cdRun';

const IN = 0.0254;
const M3_TO_BBL = 6.2898107704;

const STATUS_CLASSES = {
  PASS: 'bg-pl-success-bg text-pl-success-text',
  WARN: 'bg-pl-warning-bg text-pl-warning-text',
  FAIL: 'bg-pl-danger-bg text-pl-danger-text',
  UNKNOWN: 'bg-pl-sunken text-pl-muted',
};

const Status = ({ s, testId }) => (
  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASSES[s] || STATUS_CLASSES.UNKNOWN}`} data-testid={testId}>{s}</span>
);

const Card = ({ title, children }) => (
  <div className="rounded border border-pl-border bg-pl-surface">
    <div className="border-b border-pl-border px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-pl-muted">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

export default function ChecksTab({
  caseDraft, onCaseChange, res, depthUnit, onSaveRun, savingRun, runs, onDeleteRun,
}) {
  const unit = depthLabel(depthUnit);
  if (!res) return <div className="p-6 text-sm text-pl-muted">Fix the case inputs to evaluate the checks.</div>;
  const pbr = caseDraft.params?.pbr || {};
  const ero = caseDraft.params?.erosional || {};

  const mm = (m) => (m == null ? '--' : (m * 1000).toFixed(1));
  const inch = (m) => (m == null ? '--' : (m / IN).toFixed(3));
  const bbl = (v) => `${(v * M3_TO_BBL).toFixed(1)} bbl`;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <Card title="Run-in clearance (component OD vs governing drift on its path)">
        <table className="w-full text-xs">
          <thead className="text-pl-muted">
            <tr>
              <th className="px-1 py-1 text-left">Component</th>
              <th className="px-1 py-1 text-right">OD (in)</th>
              <th className="px-1 py-1 text-right">To MD ({unit})</th>
              <th className="px-1 py-1 text-right">Drift (in)</th>
              <th className="px-1 py-1 text-left">Controlling</th>
              <th className="px-1 py-1 text-right" title="Drift diameter minus component OD">Diametral clearance (mm)</th>
              <th className="px-1 py-1" />
            </tr>
          </thead>
          <tbody data-testid="cd-clearance-rows">
            {res.clearance.rows.map((r, i) => (
              <tr key={i} className="border-t border-pl-border text-pl-text">
                <td className="px-1 py-1">{r.name}</td>
                <td className="px-1 py-1 text-right font-pl-mono">{(r.odM / IN).toFixed(3)}</td>
                <td className="px-1 py-1 text-right font-pl-mono">{Math.round(depthDisp(r.bottomMdM, depthUnit))}</td>
                <td className="px-1 py-1 text-right font-pl-mono">{inch(r.governingDriftM)}</td>
                <td className="px-1 py-1 text-[10px] text-pl-muted">{r.controlling || 'no coverage'}</td>
                <td className="px-1 py-1 text-right font-pl-mono">{mm(r.clearanceM)}</td>
                <td className="px-1 py-1 text-right"><Status s={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-pl-muted">
          <span>Worst:</span>
          <span className="font-pl-mono" data-testid="cd-clearance-worst">
            {res.clearance.worst ? `${res.clearance.worst.name} (${mm(res.clearance.worst.clearanceM)} mm)` : '--'}
          </span>
          {res.clearance.worst && <Status s={res.clearance.worst.status} testId="cd-clearance-worst-status" />}
          <span className="ml-auto">Warn below</span>
          <Input type="number" step="0.5" value={(caseDraft.params?.warnMarginM ?? 0.003) * 1000}
            onChange={(e) => onCaseChange((d) => { d.params.warnMarginM = num(e.target.value) / 1000; })}
            className="h-6 w-16 text-right font-pl-mono text-[11px]" />
          <span>mm</span>
        </div>
      </Card>

      <Card title="Through-bore (largest tool OD from surface)">
        <table className="w-full text-xs">
          <thead className="text-pl-muted">
            <tr>
              <th className="px-1 py-1 text-left">Component</th>
              <th className="px-1 py-1 text-right">ID (in)</th>
              <th className="px-1 py-1 text-right">Min bore above (in)</th>
              <th className="px-1 py-1 text-left">Restricted by</th>
            </tr>
          </thead>
          <tbody>
            {res.throughBore.rows.filter((r) => r.type !== 'tubing').map((r, i) => (
              <tr key={i} className="border-t border-pl-border text-pl-text">
                <td className="px-1 py-1">{r.name}</td>
                <td className="px-1 py-1 text-right font-pl-mono">{inch(r.idM)}</td>
                <td className="px-1 py-1 text-right font-pl-mono">{inch(r.cumMinIdM)}</td>
                <td className="px-1 py-1 text-[10px] text-pl-muted">{r.controlling}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[11px] text-pl-muted">
          String minimum bore <span className="font-pl-mono text-pl-text" data-testid="cd-throughbore-min">{inch(res.throughBore.minIdM)}&quot;</span>
          {' '}restricted by <span className="text-pl-text" data-testid="cd-throughbore-ctrl">{res.throughBore.controlling}</span>.
          Geometric access only; tool length and deviation drag are not modeled.
        </div>
      </Card>

      <Card title="Volumes (measured-depth capacities)">
        <div className="grid grid-cols-2 gap-2 text-xs text-pl-text">
          <div>String capacity</div>
          <div className="text-right font-pl-mono" data-testid="cd-vol-capacity">{res.volumes.stringCapacityM3.toFixed(2)} m³ ({bbl(res.volumes.stringCapacityM3)})</div>
          <div>Annulus above packer</div>
          <div className="text-right font-pl-mono" data-testid="cd-vol-annulus">{res.volumes.annulusAbovePackerM3.toFixed(2)} m³ ({bbl(res.volumes.annulusAbovePackerM3)})</div>
          <div>Below packer to TD</div>
          <div className="text-right font-pl-mono">{res.volumes.belowPackerM3.toFixed(2)} m³ ({bbl(res.volumes.belowPackerM3)})</div>
          <div>String displacement (closed end)</div>
          <div className="text-right font-pl-mono">{res.volumes.stringDisplacementM3.toFixed(2)} m³ ({bbl(res.volumes.stringDisplacementM3)})</div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-pl-muted">
          <span>TD ({unit})</span>
          <Input type="number" value={depthDisp(caseDraft.params?.tdMdM ?? 3000, depthUnit)}
            onChange={(e) => onCaseChange((d) => { d.params.tdMdM = num(e.target.value) / (depthUnit === 'ft' ? 3.280839895 : 1); })}
            className="h-6 w-24 text-right font-pl-mono text-[11px]" data-testid="cd-td-input" />
          <span>Packer at {Math.round(depthDisp(res.packerMdM, depthUnit))} {unit} (from the string)</span>
        </div>
        {res.volumes.warnings.map((w, i) => (
          <div key={i} className="mt-1 rounded bg-pl-warning-bg px-2 py-1 text-[10px] text-pl-warning-text">{w}</div>
        ))}
      </Card>

      <div className="space-y-3">
        <Card title="PBR seal space-out">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-pl-muted">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={pbr.enabled === true}
                onChange={(e) => onCaseChange((d) => { d.params.pbr.enabled = e.target.checked; })}
                data-testid="cd-pbr-enabled" />
              PBR fitted
            </label>
            {[['lengthM', 'Bore length (m)'], ['insertLengthM', 'Inserted (m)'], ['expectedDLM', 'Expected ΔL (m)'], ['marginM', 'Margin (m)']].map(([k, label]) => (
              <label key={k} className="flex items-center gap-1">
                {label}
                <Input type="number" step="0.1" value={pbr[k] ?? 0} disabled={!pbr.enabled}
                  onChange={(e) => onCaseChange((d) => { d.params.pbr[k] = parseFloat(e.target.value) || 0; })}
                  className="h-6 w-16 text-right font-pl-mono text-[11px]"
                  data-testid={`cd-pbr-${k}`} />
              </label>
            ))}
          </div>
          {res.spaceOut ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-pl-text">
              <span className="font-pl-mono" data-testid="cd-spaceout-remaining">{res.spaceOut.remainingM.toFixed(2)} m</span>
              <span className="text-pl-muted">stroke remaining ({res.spaceOut.availableM.toFixed(2)} m available for this ΔL direction)</span>
              <Status s={res.spaceOut.status} testId="cd-spaceout-status" />
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-pl-muted">No PBR: the string is packer-anchored. Take the expected ΔL from the Casing &amp; Tubing tubing analysis.</div>
          )}
        </Card>

        <Card title="Erosional velocity (API RP 14E)">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-pl-muted">
            <label className="flex items-center gap-1">
              Mixture density (kg/m³)
              <Input type="number" value={ero.mixtureKgM3 ?? 700}
                onChange={(e) => onCaseChange((d) => { d.params.erosional.mixtureKgM3 = num(e.target.value); })}
                className="h-6 w-20 text-right font-pl-mono text-[11px]" data-testid="cd-ero-density" />
            </label>
            <label className="flex items-center gap-1">
              C factor
              <Input type="number" value={ero.cFactor ?? 100}
                onChange={(e) => onCaseChange((d) => { d.params.erosional.cFactor = num(e.target.value); })}
                className="h-6 w-16 text-right font-pl-mono text-[11px]" />
            </label>
            <span className="ml-auto text-xs text-pl-text">
              Ve <span className="font-pl-mono" data-testid="cd-erosional-ve">{res.erosional.veMs.toFixed(2)} m/s</span>
            </span>
          </div>
          <p className="mt-1 text-[10px] text-pl-muted">Screening limit only; rate-based sizing lives on the Tubing Sizing tab.</p>
        </Card>

        <Card title="Run history">
          <div className="mb-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSaveRun} disabled={savingRun} data-testid="cd-save-run">
              {savingRun ? 'Saving…' : 'Save run snapshot'}
            </Button>
          </div>
          <div className="max-h-40 space-y-1 overflow-auto" data-testid="cd-runs">
            {(runs || []).map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded bg-pl-sunken px-2 py-1 text-[11px] text-pl-muted">
                <Status s={r.summary?.banner ?? 'UNKNOWN'} />
                <span>{new Date(r.created_at).toLocaleString()}</span>
                <span className="font-pl-mono">{r.engine_version}</span>
                <Button variant="ghost" size="icon" className="ml-auto h-5 w-5 text-pl-muted hover:text-pl-danger-text" onClick={() => onDeleteRun(r.id)}>
                  <Trash className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {(!runs || runs.length === 0) && <div className="text-[11px] italic text-pl-muted">No saved runs.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
