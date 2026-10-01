// Earth Modeling handoff, ReservoirCalc Pro side (Earth Modeling upgrade
// U2-009, 2026-10-01). ?emProspect=<id>&zone=<i> fills the simple-method
// inputs once from the payload Earth Modeling left (src/lib/
// earthModelProspect.js) in this project's unit system, and says where the
// numbers came from. Self-contained so ReservoirCalc Pro's own panels stay
// untouched apart from mounting it.
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReservoirCalc } from '../contexts/ReservoirCalcContext';
import { readProspectHandoff, prospectZoneToRcpInputs } from '@/lib/earthModelProspect';

export default function EarthModelProspectNote() {
  const { state, updateInputs, setInputMethod } = useReservoirCalc();
  const [params] = useSearchParams();
  const id = params.get('emProspect');
  const zone = Number(params.get('zone') || 0);
  const done = useRef(false);
  const [note, setNote] = useState(null);
  useEffect(() => {
    if (!id || done.current) return;
    done.current = true;
    const payload = readProspectHandoff(id);
    if (!payload) { setNote({ error: true, lines: ['The Earth Modeling prospect is no longer in this browser. Send it again from Earth Modeling.'] }); return; }
    try {
      const { inputs, notes } = prospectZoneToRcpInputs(payload, Number.isInteger(zone) ? zone : 0, state.unitSystem || 'field');
      if (state.inputMethod !== 'simple') setInputMethod('simple');
      // after the panel's own first-load defaults (its effect runs after this child's)
      setTimeout(() => updateInputs(inputs), 0);
      setNote({ error: false, lines: notes });
    } catch (e) { setNote({ error: true, lines: [e.message] }); }
  }, [id, zone, state.unitSystem, state.inputMethod, updateInputs, setInputMethod]);
  if (!note) return null;
  return (
    <div data-testid="rcp-em-prospect" className={`rounded border px-2 py-1.5 text-[11px] flex-shrink-0 ${note.error ? 'border-pl-warning-text/40 text-pl-warning-text' : 'border-pl-border text-pl-muted bg-pl-surface'}`}>
      {note.lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}
