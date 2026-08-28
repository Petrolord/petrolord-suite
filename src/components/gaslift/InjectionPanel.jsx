// Injection and duty inputs (left rail). These are the numbers that
// decide how deep the gas can be put and how much of it is bought:
// what the compressor can deliver, what the well is being designed to
// make, and what the target injection rate is.
//
// The wellhead pressure and the water cut moved here from the well
// model at P6.5. They look like well properties and are not: they are
// what the well is doing on the day, so they belong to the duty a
// design is run at rather than to the well record that gas lift, ESP
// and rod pump all share.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGasLift } from '@/contexts/GasLiftDesignContext';

const rows = [
  {
    key: 'kickoffPsig',
    label: 'Kickoff pressure (psig)',
    hint: 'Surface injection pressure available to unload the well.',
  },
  {
    key: 'operatingPsig',
    label: 'Operating pressure (psig)',
    hint: 'Once on the operating valve. Usually about 100 psi below kickoff.',
  },
  { key: 'injGasSg', label: 'Injection gas gravity', step: '0.01' },
  {
    key: 'targetQgiMscfd',
    label: 'Target injection rate (Mscf/d)',
    hint: 'Sizes every port and sets the gas used in the injection-point construction.',
  },
  {
    key: 'designRateStbd',
    label: 'Design oil rate (stb/d)',
    hint: 'The rate the flowing gradient is drawn at. Run the performance curve to see what the well actually makes, then bring that number back here.',
  },
  {
    key: 'wctPct',
    label: 'Water cut (%)',
    hint: 'What the well is making now, not a property of the well: it belongs to this design rather than to the shared well model.',
  },
  {
    key: 'whp',
    label: 'Wellhead pressure (psia)',
    hint: 'The pressure the flowing gradient is drawn down from.',
  },
];

const InjectionPanel = () => {
  const { inputs, setSection } = useGasLift();

  return (
    <div className="space-y-3">
      {rows.map(({ key, label, hint, step }) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs text-slate-400">{label}</Label>
          <Input
            type="number"
            step={step || 'any'}
            value={inputs.injection[key] ?? ''}
            onChange={(e) => setSection('injection', key, e.target.value)}
            className="h-9 bg-slate-800 border-slate-700"
          />
          {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
        </div>
      ))}
    </div>
  );
};

export default InjectionPanel;
