import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, Edit, FileCheck, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import {
  explainStatus,
  parseDateOnly,
  rollForward,
  toDateOnlyString,
} from '@/lib/complianceStatus';
import { useRegulatoryCompliance } from './hooks/useRegulatoryCompliance';
import {
  DetailField,
  ErrorState,
  Loading,
  StatusBadge,
} from './components/SharedComponents';

const BASE = '/dashboard/apps/assurance/regulatory-compliance';

const showDate = (value) => {
  const d = parseDateOnly(value);
  return d ? format(d, 'd MMM yyyy') : null;
};

/**
 * AS3 — the obligation detail page.
 *
 * It used to be a dashed box reading "Compliance detail view will be
 * implemented here". The `:id` route existed and the dashboard's
 * deadline list navigated to `register?id=...`, a query string nothing
 * read, so clicking a deadline landed on an unfiltered table.
 *
 * Recording a filing lives here rather than in a menu, because it is
 * the one action that changes what the register says about this row:
 * it writes the evidence and rolls the due date forward.
 */
export default function ComplianceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    obligations, authorities, loading, error, hasAs3Schema,
    deleteObligation, recordSubmission, refresh,
  } = useRegulatoryCompliance();

  const [filing, setFiling] = useState(null);
  const [saving, setSaving] = useState(false);

  if (loading) return <Loading label="Loading the obligation..." />;
  if (error) return <ErrorState error={error} onRetry={refresh} />;

  const obligation = obligations.find((o) => o.id === id);
  if (!obligation) {
    return (
      <div className="p-10 text-center text-[hsl(var(--muted-foreground))]">
        That obligation is not in this organization&apos;s register.
      </div>
    );
  }

  const authority = authorities.find((a) => a.id === obligation.authority_id);
  const { reason } = explainStatus(obligation, new Date());
  const nextDue = rollForward(obligation.due_date, obligation.frequency);

  const handleDelete = async () => {
    const result = await deleteObligation(obligation.id);
    if (result.success) {
      toast({ description: 'Obligation deleted.' });
      navigate(`${BASE}/register`);
    } else {
      toast({ title: 'Not deleted', description: result.error, variant: 'destructive' });
    }
  };

  const handleFiling = async (e) => {
    e.preventDefault();
    setSaving(true);
    const result = await recordSubmission(obligation, filing);
    setSaving(false);
    if (!result.success) {
      toast({ title: 'The filing was not recorded', description: result.error, variant: 'destructive' });
      return;
    }
    setFiling(null);
    toast({
      title: result.warning ? 'Recorded, with a caveat' : 'Filing recorded',
      description: result.warning
        || (result.nextDue
          ? `Next due ${showDate(result.nextDue)}.`
          : 'This obligation has no repeating schedule, so the due date was left as it is.'),
      variant: result.warning ? 'destructive' : undefined,
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto pb-24 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 text-[hsl(var(--muted-foreground))]"
            onClick={() => navigate(`${BASE}/register`)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to the register
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{obligation.title}</h1>
            <StatusBadge obligation={obligation} />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            {obligation.obligation_code ? `${obligation.obligation_code} · ` : ''}{reason}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]"
            onClick={() => navigate(`${BASE}/${obligation.id}/edit`)}>
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
          <Button variant="outline" className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--destructive))]"
            onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </Button>
        </div>
      </div>

      <Card className="panel-elevation">
        <CardHeader><CardTitle className="text-lg">The obligation</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <DetailField label="Regulator">
            {authority ? (authority.acronym ? `${authority.acronym} · ${authority.name}` : authority.name) : null}
          </DetailField>
          <DetailField label="Facility">{obligation.facility}</DetailField>
          <DetailField label="Jurisdiction">{obligation.jurisdiction}</DetailField>
          <DetailField label="Regime">{obligation.regime}</DetailField>
          <DetailField label="Type">{obligation.obligation_type}</DetailField>
          <DetailField label="Permit or licence number">{obligation.reference}</DetailField>
          <div className="md:col-span-3">
            <DetailField label="What it requires">{obligation.description}</DetailField>
          </div>
          <div className="md:col-span-3">
            <DetailField label="Consequence of breach">{obligation.consequence}</DetailField>
          </div>
        </CardContent>
      </Card>

      <Card className="panel-elevation">
        <CardHeader><CardTitle className="text-lg">Dates</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <DetailField label="Next due">{showDate(obligation.due_date)}</DetailField>
          <DetailField label="Permit expires">{showDate(obligation.expiry_date)}</DetailField>
          <DetailField label="In force from">{showDate(obligation.effective_date)}</DetailField>
          <DetailField label="Frequency">{obligation.frequency}</DetailField>
          <DetailField label="Warning lead time">
            {obligation.lead_time_days != null ? `${obligation.lead_time_days} days` : null}
          </DetailField>
          <DetailField label="Lifecycle">{obligation.lifecycle}</DetailField>
        </CardContent>
      </Card>

      <Card className="panel-elevation">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Evidence</CardTitle>
          {hasAs3Schema && !filing ? (
            <Button size="sm" className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0"
              onClick={() => setFiling({ submitted_date: toDateOnlyString(new Date()), reference: '', notes: '', period_label: '' })}>
              <FileCheck className="w-4 h-4 mr-2" /> Record a filing
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {filing ? (
            <form onSubmit={handleFiling} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/30">
              <div>
                <Label htmlFor="submitted_date">Date filed</Label>
                <Input id="submitted_date" type="date" value={filing.submitted_date}
                  onChange={(e) => setFiling({ ...filing, submitted_date: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="reference">Submission reference</Label>
                <Input id="reference" value={filing.reference}
                  onChange={(e) => setFiling({ ...filing, reference: e.target.value })}
                  placeholder="The receipt or reference the regulator gave you" />
              </div>
              <div>
                <Label htmlFor="period_label">Period covered</Label>
                <Input id="period_label" value={filing.period_label}
                  onChange={(e) => setFiling({ ...filing, period_label: e.target.value })}
                  placeholder="2026 H1" />
              </div>
              <div>
                <Label htmlFor="filing_notes">Notes</Label>
                <Textarea id="filing_notes" rows={1} value={filing.notes}
                  onChange={(e) => setFiling({ ...filing, notes: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {nextDue
                    ? `This will roll the next due date to ${showDate(nextDue)}, counted from the date that was due rather than from today.`
                    : 'This obligation has no repeating schedule, so the due date will be left as it is.'}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setFiling(null)}
                    className="bg-[hsl(var(--background))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}
                    className="bg-[hsl(var(--warning))] text-white hover:bg-[hsl(var(--warning))]/90 border-0">
                    {saving ? 'Recording...' : 'Record filing'}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}

          {obligation.evidence?.length ? (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {obligation.evidence.map((e) => (
                <li key={e.id} className="py-3 flex justify-between items-start gap-4">
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      {e.period_label || 'Filing'}{e.reference ? ` · ${e.reference}` : ''}
                    </p>
                    {e.notes ? (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{e.notes}</p>
                    ) : null}
                  </div>
                  <span className="text-sm text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                    {showDate(e.submitted_date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))] py-4">
              Nothing has been filed against this obligation yet. That is why it
              reads {hasAs3Schema ? 'On track rather than Compliant' : 'as it does'}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
