// Spacing and valve settings (left rail, Design tab). Two conventions
// are offered because the industry uses both: dropping the surface
// injection pressure a fixed amount per valve is what makes upper
// valves close as the point of injection moves down, while a constant
// surface pressure design leans on the transfer differential alone.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const NUMERIC = [
  { key: 'dpTransferPsi', label: 'Transfer differential (psi)', hint: 'Margin the injection pressure must keep over the tubing at each transfer.' },
  { key: 'killGradPsiPerFt', label: 'Kill fluid gradient (psi/ft)', step: '0.01' },
  { key: 'unloadGradPsiPerFt', label: 'Unloading gradient (psi/ft)', step: '0.01', hint: 'Gradient of the lifted column above the point of injection during unloading.' },
  { key: 'whUnloadPsig', label: 'Unloading wellhead pressure (psig)' },
  { key: 'packerDepthFt', label: 'Packer or perforation depth (ft TVD)' },
  { key: 'minSpacingFt', label: 'Minimum valve spacing (ft)' },
  { key: 'maxValves', label: 'Maximum valves' },
];

const DesignSettingsPanel = () => {
  const { inputs, setSection, valveFamilies } = useGasLift();
  const { design } = inputs;
  const family = valveFamilies.find((f) => f.id === design.valveFamilyId) || valveFamilies[0];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Spacing method</Label>
        <Select value={design.method} onValueChange={(v) => setSection('design', 'method', v)}>
          <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
            <SelectItem value="surfaceClose">Decreasing surface pressure</SelectItem>
            <SelectItem value="constantPressure">Constant surface pressure</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {design.method === 'surfaceClose' && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Pressure drop per valve (psi)</Label>
          <Input
            type="number"
            value={design.dpPerValvePsi ?? ''}
            onChange={(e) => setSection('design', 'dpPerValvePsi', e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
          <p className="text-[11px] text-slate-600">
            Must exceed the valve spread or the upper valves will not close. The Unloading tab
            checks this for every stage.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Valve size</Label>
          <Select
            value={design.valveFamilyId}
            onValueChange={(v) => setSection('design', 'valveFamilyId', v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {valveFamilies.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Valve type</Label>
          <Select value={design.valveType} onValueChange={(v) => setSection('design', 'valveType', v)}>
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="IPO">Injection operated (IPO)</SelectItem>
              <SelectItem value="PPO">Production operated (PPO)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-slate-600">
        Bellows area {family.bellowsAreaIn2} sq in. {family.mandrelNote}
      </p>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs text-slate-400">Orifice at the bottom</Label>
          <p className="text-[11px] text-slate-600">The operating point is normally an orifice, not a charged valve.</p>
        </div>
        <Switch
          checked={design.bottomOrifice !== false}
          onCheckedChange={(c) => setSection('design', 'bottomOrifice', c)}
        />
      </div>

      {design.bottomOrifice !== false && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Orifice size (in)</Label>
          <Select
            value={String(design.orificeIdIn)}
            onValueChange={(v) => setSection('design', 'orificeIdIn', v)}
          >
            <SelectTrigger className="h-9 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              {family.ports.map((p) => (
                <SelectItem key={p.label} value={String(p.idIn)}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <div>
          <Label className="text-xs text-slate-400">Space to the computed injection point</Label>
          <p className="text-[11px] text-slate-600">
            Off: space to the packer depth instead.
          </p>
        </div>
        <Switch
          checked={design.useComputedInjectionDepth !== false}
          onCheckedChange={(c) => setSection('design', 'useComputedInjectionDepth', c)}
        />
      </div>

      {NUMERIC.map(({ key, label, hint, step }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-400">{label}</Label>
          <Input
            type="number"
            step={step || 'any'}
            value={design[key] ?? ''}
            onChange={(e) => setSection('design', key, e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
          {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
        </div>
      ))}
    </div>
  );
};

export default DesignSettingsPanel;
