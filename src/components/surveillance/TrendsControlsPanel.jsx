// Trend controls (left rail, Trends tab). View, stream, rate basis and
// smoothing are analysis state and travel with the saved project.
import React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const STREAMS = [
  { value: 'rates', label: 'Oil, water and gas rates' },
  { value: 'ratios', label: 'Watercut and GOR' },
  { value: 'injection', label: 'Injection rates' },
];

const SMOOTHING = [
  { value: '0', label: 'None (raw)' },
  { value: '7', label: '7-day average' },
  { value: '30', label: '30-day average' },
  { value: '90', label: '90-day average' },
];

const TrendsControlsPanel = () => {
  const { inputs, wellSeries, setTrendsField } = useSurveillance();
  const { trends } = inputs;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">View</Label>
        <Select value={trends.view} onValueChange={(v) => setTrendsField('view', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="field">Field total</SelectItem>
            <SelectItem value="well">Single well</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {trends.view === 'well' && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Well</Label>
          <Select
            value={trends.wellId || ''}
            onValueChange={(v) => setTrendsField('wellId', v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700">
              <SelectValue placeholder="Select well" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100 max-h-72">
              {wellSeries.length === 0 ? (
                <SelectItem value="none" disabled>No wells with ledger data</SelectItem>
              ) : wellSeries.map(({ well }) => (
                <SelectItem key={well.id} value={well.id}>
                  {well.name}{well.well_type === 'injector' ? ' (injector)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Stream</Label>
        <Select value={trends.stream} onValueChange={(v) => setTrendsField('stream', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {STREAMS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Smoothing</Label>
        <Select
          value={String(trends.smoothDays ?? 0)}
          onValueChange={(v) => setTrendsField('smoothDays', parseInt(v, 10))}
        >
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            {SMOOTHING.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-slate-600">
          Averages run over real elapsed days, so daily and monthly ledgers smooth the same way.
        </p>
      </div>

      {trends.view === 'well' && (
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs text-slate-400">Producing-day rates</Label>
            <p className="text-[11px] text-slate-600">Volumes divided by hours on stream.</p>
          </div>
          <Switch
            checked={trends.basis === 'producing'}
            onCheckedChange={(c) => setTrendsField('basis', c ? 'producing' : 'calendar')}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Log rate axis</Label>
        <Switch
          checked={!!trends.logScale}
          onCheckedChange={(c) => setTrendsField('logScale', c)}
        />
      </div>
    </div>
  );
};

export default TrendsControlsPanel;
