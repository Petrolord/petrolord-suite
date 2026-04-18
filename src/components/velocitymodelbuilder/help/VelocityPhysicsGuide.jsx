import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Atom } from 'lucide-react';

const VelocityPhysicsGuide = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <Atom className="w-6 h-6 text-blue-400"/> Velocity Physics Fundamentals
      </h2>
      
      <div className="grid gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Elastic Wave Propagation</h3>
            <p className="text-sm text-slate-400">
              Seismic velocity (Vp) depends on the bulk modulus (K), shear modulus (μ), and density (ρ) of the rock: 
              <code className="block bg-slate-950 p-2 mt-2 rounded text-emerald-400 font-mono">Vp = √((K + 4/3μ) / ρ)</code>
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 p-4 rounded border border-slate-800">
                <h4 className="text-white font-bold mb-2">Porosity Relationship</h4>
                <p className="text-xs text-slate-400">Wyllie's Time Average Equation relates velocity directly to porosity. As porosity decreases (compaction), velocity increases.</p>
            </div>
            <div className="bg-slate-900 p-4 rounded border border-slate-800">
                <h4 className="text-white font-bold mb-2">Pressure Effects</h4>
                <p className="text-xs text-slate-400">Effective stress controls velocity. High pore pressure reduces effective stress, slowing down acoustic waves (velocity reversal).</p>
            </div>
            <div className="bg-slate-900 p-4 rounded border border-slate-800">
                <h4 className="text-white font-bold mb-2">Lithology Effects</h4>
                <p className="text-xs text-slate-400">Carbonates generally have higher velocities than clastics due to stiffer mineral frames. Salt has a constant, high velocity.</p>
            </div>
            <div className="bg-slate-900 p-4 rounded border border-slate-800">
                <h4 className="text-white font-bold mb-2">Anisotropy</h4>
                <p className="text-xs text-slate-400">Layering (VTI) or fracturing (HTI) causes velocity to vary with direction. V_horizontal often {'>'} V_vertical in shales.</p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default VelocityPhysicsGuide;