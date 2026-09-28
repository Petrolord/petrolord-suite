// What to do, and what NOT to do.
//
// The ruled-out treatments are shown as prominently as the candidates,
// with their reasons, because the value of this screening is mostly in
// the refusals. Anybody can produce a list of things that might help. A
// list of the things that will not, and why, is the part that saves
// money.
import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Ban } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIntervention } from '@/contexts/InterventionPlannerContext';
import { VERDICT_STYLE } from './fields';

const ICON = {
  candidate: CheckCircle2,
  consider: HelpCircle,
  marginal: AlertTriangle,
  blocked: Ban,
  unknown: HelpCircle,
  no: XCircle,
};

const ScreeningPanel = () => {
  const { plan } = useIntervention();
  if (!plan?.screening) return null;

  const candidates = plan.screening.filter((r) => r.verdict === 'candidate' || r.verdict === 'consider');
  const ruledOut = plan.screening.filter((r) => r.verdict === 'blocked');
  const rest = plan.screening.filter(
    (r) => !candidates.includes(r) && !ruledOut.includes(r),
  );

  const Card1 = ({ row }) => {
    const style = VERDICT_STYLE[row.verdict] || VERDICT_STYLE.no;
    const Icon = ICON[row.verdict] || HelpCircle;
    return (
      <div className={`rounded border p-3 space-y-2 ${
        row.blocked ? 'border-pl-danger/40 bg-pl-danger-bg' : 'border-pl-border bg-pl-sunken'
      }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-pl-text">{row.label}</p>
          <span className={`text-xs font-semibold flex items-center gap-1 ${style.className}`}>
            <Icon className="w-3.5 h-3.5" /> {style.label}
          </span>
        </div>
        {row.blockReason && (
          <p className="text-[12px] text-pl-danger-text">{row.blockReason}</p>
        )}
        <ul className="space-y-1">
          {row.reasons.map((r) => (
            <li key={r} className="text-[11px] text-pl-muted flex gap-1.5">
              <span className="text-pl-muted shrink-0">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What is worth doing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {candidates.length
            ? candidates.map((r) => <Card1 key={r.id} row={r} />)
            : <p className="text-sm text-pl-muted">Nothing on this well screens as a candidate.</p>}
        </CardContent>
      </Card>

      {ruledOut.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Ban className="w-4 h-4 text-pl-muted" /> What the diagnosis rules out
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[11px] text-pl-muted">
              These are shown as prominently as the candidates on purpose. Anybody can produce a
              list of things that might help; the list of things that will not, and why, is the part
              that saves money.
            </p>
            {ruledOut.map((r) => <Card1 key={r.id} row={r} />)}
          </CardContent>
        </Card>
      )}

      {rest.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Everything else considered</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rest.map((r) => <Card1 key={r.id} row={r} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ScreeningPanel;
