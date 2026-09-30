// Depth and temperature display-unit selectors (BF3), shown in the
// Expert header and the wizard. Every stored value stays SI.

import React from 'react';
import { useBasinFlow } from '../../contexts/BasinFlowContext';
import { DEPTH_UNITS, TEMP_UNITS } from '../../services/units';
import UnitProfileNote from '@/components/units/UnitProfileNote';

export default function UnitsBar({ className = '' }) {
  const { units, setUnit, unitsHook } = useBasinFlow();
  const sel = (key, options, title, render) => (
    <select
      data-testid={`bf-unit-${key}`}
      title={title}
      value={units[key]}
      onChange={(e) => setUnit(key, e.target.value)}
      className="bg-pl-surface border border-pl-border-strong rounded px-1 py-0.5 text-[11px] text-pl-text"
    >
      {options.map((o) => <option key={o} value={o}>{render(o)}</option>)}
    </select>
  );
  return (
    <div className={`flex items-center gap-1 ${className}`} title="Display units; the model, the saved well and the exports' SI columns stay in metres and degrees C">
      <span className="text-[11px] text-pl-muted">Units</span>
      {sel('depth', DEPTH_UNITS, 'Depth and thickness display unit; starts from your Suite units and changes this view for the session', (o) => o)}
      {sel('temp', TEMP_UNITS, 'Temperature display unit', (o) => `°${o}`)}
      <UnitProfileNote u={unitsHook} className="ml-1 hidden md:inline-flex" />
    </div>
  );
}
