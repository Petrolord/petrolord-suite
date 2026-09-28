// Comparison tab: the screening matrix and the real designs, side by
// side, with the disagreements named.
//
// This is the studio. Screening is a rules matrix; the design pass ran
// four validated chains against one shared well record. Where they
// disagree, the design is the one that solved the well, and saying so
// out loud is more useful than quietly showing whichever answer came
// last.
import React from 'react';
import {
  Play, RefreshCw, ExternalLink, CheckCircle2, XCircle, AlertTriangle, Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLiftAdvisor } from '@/contexts/LiftAdvisorContext';
import { fmt } from './fields';

const VERDICT = {
  agreeYes: { label: 'Works', className: 'text-pl-success-text', Icon: CheckCircle2 },
  designYes: { label: 'Works (screening was lukewarm)', className: 'text-pl-success-text', Icon: CheckCircle2 },
  designNo: { label: 'Refused by the design', className: 'text-pl-danger-text', Icon: XCircle },
  agreeNo: { label: 'Not suited', className: 'text-pl-muted', Icon: XCircle },
  noEngine: { label: 'Screened only', className: 'text-pl-muted', Icon: Info },
  notRun: { label: 'Not designed yet', className: 'text-pl-muted', Icon: Info },
  screened: { label: 'Screened', className: 'text-pl-muted', Icon: Info },
};

const StaleNote = ({ onRerun }) => (
  <div className="flex items-center gap-2 text-[11px] text-pl-warning-text mb-2">
    <RefreshCw className="w-3 h-3" />
    Inputs changed since the designs ran.
    <button type="button" className="underline hover:opacity-80" onClick={onRerun}>
      Run again
    </button>
  </div>
);

const MethodCard = ({ row, studioLink }) => {
  const v = VERDICT[row.verdict] || VERDICT.screened;
  const { Icon } = v;
  const d = row.design;
  const href = studioLink(row.id);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${v.className}`} />
              {row.label}
            </span>
            <span className="text-xs font-normal text-pl-muted whitespace-nowrap">
              screening {row.score}
            </span>
          </span>
          <span className={`block text-xs font-normal mt-0.5 ${v.className}`}>{v.label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {row.note && (
          <p className={`text-[11px] ${row.verdict === 'designNo' || row.verdict === 'designYes' ? 'text-pl-warning-text' : 'text-pl-muted'}`}>
            {row.note}
          </p>
        )}

        {d?.ok && (
          <>
            <p className="text-[11px] text-pl-muted">
              <span className="text-pl-muted">Designed with:</span> {d.equipment}
            </p>
            {/* One column below 2xl: two columns ran values such as "the
                available injection pressure" and "74.3 % of Goodman" into
                the next cell at 1366 wide (AL-T1-002). */}
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-x-4 gap-y-1" data-testid="al-figures">
              {d.figures.map((f) => (
                <div key={f.label} className="flex min-w-0 items-baseline justify-between gap-3">
                  <span className="shrink-0 text-[11px] text-pl-muted">{f.label}</span>
                  <span className="min-w-0 text-right text-sm text-pl-text font-pl-mono tabular-nums">{f.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {d && !d.ok && d.reason && (
          <p className="text-[11px] text-pl-muted">
            <span className="text-pl-danger-text">Refused:</span> {d.reason}
          </p>
        )}

        <details className="group">
          <summary className="text-[11px] text-pl-muted cursor-pointer hover:text-pl-text">
            {row.reasons.length} screening point{row.reasons.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1">
            {row.reasons.map((r, i) => (
              <li key={`${r.type}-${i}`} className="text-[11px] flex gap-2">
                <span className={
                  r.type === 'pro' ? 'text-pl-success-text' : (r.type === 'con' ? 'text-pl-danger-text' : 'text-pl-warning-text')
                }
                >
                  {r.type === 'pro' ? '+' : (r.type === 'con' ? '-' : '~')}
                </span>
                <span className="text-pl-muted">{r.text}</span>
              </li>
            ))}
          </ul>
        </details>

        {d?.warnings?.length > 0 && (
          <ul className="space-y-1 border-t border-pl-border pt-2">
            {d.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`} className="text-[11px] text-pl-warning-text flex gap-2">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-pl-warning-text" />
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}

        {href && (
          <Button asChild size="sm" variant="outline" className="h-8 w-full">
            <Link to={href}>
              <ExternalLink className="w-3 h-3 mr-1" /> Design this properly
            </Link>
          </Button>
        )}
        {!row.hasEngine && (
          <p className="text-[11px] text-pl-muted">
            This Suite has no validated engine for {row.label.toLowerCase()}, so there is nothing
            here but the screening. It is listed because leaving a real option out would be worse
            than saying plainly what is known about it.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const ComparisonPanel = () => {
  const {
    comparison, designPass, designStale, runDesigns, isRunning, studioLink, model,
    screeningRefusal,
  } = useLiftAdvisor();

  return (
    <div className="space-y-4">
      {screeningRefusal && (
        <Card className="border-pl-warning/40">
          <CardContent className="pt-4">
            <p className="text-xs text-pl-warning-text leading-relaxed">
              {screeningRefusal.error}
            </p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Every method, on this one well
            <span className="block text-xs font-normal text-pl-muted mt-0.5">
              Screening is a rules matrix and runs as you type. The design pass runs four validated
              design chains, a wave equation among them, against the same shared well record, so
              it runs when you ask for it.
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={runDesigns} disabled={isRunning || !model} className="h-9">
              <Play className="w-3.5 h-3.5 mr-1" /> Design them all
            </Button>
            {designPass?.ok && (
              <p className="text-[11px] text-pl-muted">
                {comparison.workable.length} of {designPass.results.length} engine-backed methods
                design on this well
                {comparison.disagreements.length > 0
                  ? `, and ${comparison.disagreements.length} disagree with the screening.`
                  : '.'}
              </p>
            )}
          </div>
          {designStale && <StaleNote onRerun={runDesigns} />}
          {designPass && !designPass.ok && (
            <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-3">
              <p className="text-[11px] text-pl-warning-text flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {designPass.errors[0]}
              </p>
            </div>
          )}
          {!designPass && (
            <p className="text-sm text-pl-muted py-4 text-center">
              Until the designs run, the ordering below is the screening matrix alone: rules of
              thumb, not a solved well.
            </p>
          )}

          {comparison.disagreements.length > 0 && (
            <div className="rounded-md border border-pl-warning/40 bg-pl-warning-bg p-3 space-y-1">
              <p className="text-xs font-semibold text-pl-warning-text">
                Where the screening and the design disagree
              </p>
              {comparison.disagreements.map((r) => (
                <p key={r.id} className="text-[11px] text-pl-warning-text">
                  <span className="text-pl-text">{r.label}:</span> {r.note}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {comparison.ranked.map((row) => (
          <MethodCard key={row.id} row={row} studioLink={studioLink} />
        ))}
      </div>
    </div>
  );
};

export default ComparisonPanel;
