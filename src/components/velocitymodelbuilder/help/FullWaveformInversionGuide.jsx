import React from 'react';
import { Waves } from 'lucide-react';

const FullWaveformInversionGuide = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <Waves className="w-6 h-6 text-blue-400"/> FWI Velocity Workflows
      </h2>
      <div className="bg-slate-900 p-6 rounded border border-slate-800 text-sm text-slate-300 space-y-4">
        <p>
            Full Waveform Inversion (FWI) updates the velocity model by minimizing the difference between observed and modeled seismic waveforms, not just travel times.
        </p>
        <div>
            <h4 className="text-white font-bold mb-1">Resolution Revolution</h4>
            <p>FWI can resolve high-frequency velocity details (gas pockets, channels) that traditional tomography misses.</p>
        </div>
        <div>
            <h4 className="text-white font-bold mb-1">Cycle Skipping Hazard</h4>
            <p>If the starting model is too far from truth ({'>'} half a cycle error), FWI converges to a local minimum (wrong solution). Good starting tomography is prerequisite.</p>
        </div>
      </div>
    </div>
  );
};

export default FullWaveformInversionGuide;