// Depth and temperature display-unit selectors (BF3), shown in the
// Expert header and the wizard. Every stored value stays SI.

import React from 'react';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { DEPTH_UNITS, TEMP_UNITS } from '../../services/units';

export default function UnitsBar({ className = '' }) {
  const { units, setUnit } = useBasinFlow();
  const sel = (key, options, title, render) => (
    <select
      data-testid={`bf-unit-${key}`}
      title={title}
      value={units[key]}
      onChange={(e) => setUnit(key, e.target.value)}
      className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[11px] text-slate-200"
    >
      {options.map((o) => <option key={o} value={o}>{render(o)}</option>)}
    </select>
  );
  return (
    <div className={`flex items-center gap-1 ${className}`} title="Display units; the model, the saved well and the exports' SI columns stay in metres and degrees C">
      <span className="text-[11px] text-slate-500">Units</span>
      {sel('depth', DEPTH_UNITS, 'Depth and thickness display unit; defaults to your Geoscience depth setting', (o) => o)}
      {sel('temp', TEMP_UNITS, 'Temperature display unit', (o) => `°${o}`)}
    </div>
  );
}
