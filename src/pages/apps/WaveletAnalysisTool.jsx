import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import Plot from 'react-plotly.js';

const WaveletAnalysisTool = () => {
  const generateRicker = () => {
    const t = Array.from({ length: 200 }, (_, i) => (i - 100) / 100);
    const f = 25;
    const pi2 = Math.PI ** 2;
    const w = t.map(x => (1 - 2 * pi2 * f * f * x * x) * Math.exp(-pi2 * f * f * x * x));
    return { t, w };
  };

  const { t, w } = generateRicker();

  return (
    <div className='p-6 space-y-6 text-white bg-slate-950 min-h-screen'>
      <h1 className='text-3xl font-bold flex items-center gap-3'>
        <Activity className='text-lime-400'/> Wavelet Analysis Tool
      </h1>
      <p className='text-slate-400 max-w-2xl'>Phase 1: Initial foundation for a world‑class seismic wavelet analysis engine, including synthetic wavelet visualization and UI shell.</p>

      <Card className='bg-slate-900 border-slate-800'>
        <CardHeader>
          <CardTitle>Demo: Synthetic Ricker Wavelet</CardTitle>
        </CardHeader>
        <CardContent>
          <Plot
            data={[{
              x: t,
              y: w,
              type: 'scatter',
              mode: 'lines',
              line: { color: '#4ade80', width: 3 }
            }]}
            layout={{
              paper_bgcolor: 'transparent',
              plot_bgcolor: 'transparent',
              font: { color: '#fff' },
              margin: { t: 20, r: 20, b: 40, l: 40 },
              xaxis: { title: 'Time (s)' },
              yaxis: { title: 'Amplitude' }
            }}
            useResizeHandler={true}
            className='w-full h-[350px]'
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default WaveletAnalysisTool;