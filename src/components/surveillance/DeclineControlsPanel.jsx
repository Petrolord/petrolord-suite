// Decline overlay controls (left rail, Decline tab). The fit itself runs
// through the canonical Arps engine (packages/engines/engines/dca) via
// utils/production/surveillance.fitWellDecline; nothing here re-derives
// decline math. For full decline work (segments, type curves, Monte
// Carlo) the DCA Studio is the tool.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { FIT_STREAMS } from '@/utils/production/surveillance';
import { useSurveillance } from '@/contexts/ProductionSurveillanceContext';

const MODELS = ['Auto-Select', 'Exponential', 'Hyperbolic', 'Harmonic'];

const DeclineControlsPanel = () => {
  const { inputs, wellSeries, setDcaField } = useSurveillance();
  const { dca } = inputs;
  const unit = (FIT_STREAMS[dca.stream] || FIT_STREAMS.oil).unit;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-pl-muted">Well</Label>
        <Select value={dca.wellId || ''} onValueChange={(v) => setDcaField('wellId', v)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select well" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {wellSeries.length === 0 ? (
              <SelectItem value="none" disabled>No wells with ledger data</SelectItem>
            ) : wellSeries.map(({ well }) => (
              <SelectItem key={well.id} value={well.id}>{well.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-pl-muted">Stream</Label>
        <Select value={dca.stream} onValueChange={(v) => setDcaField('stream', v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(FIT_STREAMS).map(([key, s]) => (
              <SelectItem key={key} value={key}>{s.label} ({s.unit})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-pl-muted">Model</Label>
        <Select value={dca.modelType} onValueChange={(v) => setDcaField('modelType', v)}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs text-pl-muted">Fit producing-day rates</Label>
          <p className="text-[11px] text-pl-muted">Shut-in days drop out of the fit.</p>
        </div>
        <Switch
          checked={dca.basis === 'producing'}
          onCheckedChange={(c) => setDcaField('basis', c ? 'producing' : 'calendar')}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-pl-muted">Forecast horizon (days)</Label>
        <Input
          type="number"
          value={dca.forecastDays}
          onChange={(e) => setDcaField('forecastDays', e.target.value)}
          className="h-9"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-pl-muted">Economic limit ({unit})</Label>
        <Input
          type="number"
          placeholder="none"
          value={dca.economicLimit}
          onChange={(e) => setDcaField('economicLimit', e.target.value)}
          className="h-9"
        />
        <p className="text-[11px] text-pl-muted">
          Leave blank to run the full horizon. With a limit set, the forecast stops when the rate
          falls below it.
        </p>
      </div>
    </div>
  );
};

export default DeclineControlsPanel;
