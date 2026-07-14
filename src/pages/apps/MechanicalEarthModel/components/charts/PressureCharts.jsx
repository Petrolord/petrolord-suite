import React, { useMemo } from 'react';
import PlotlyChartFactory from './PlotlyChartFactory';

const generatePressureData = () => {
    const depths = [];
    const pp = []; // Pore Pressure
    const fg = []; // Fracture Gradient
    const obg = []; // Overburden
    
    for (let d = 0; d <= 4000; d += 20) {
        depths.push(d);
        // Hydrostatic + overpressure ramp
        let p = d * 0.44; // psi/ft roughly converted to psi
        if (d > 2500) p += (d - 2500) * 0.3; 
        pp.push(p);
        
        fg.push(p + (d * 0.2)); // Simple frac margin
        obg.push(d * 1.0); // ~1 psi/ft
    }
    return { depths, pp, fg, obg };
};

export const PlotlyMudWeightWindowChart = () => {
    const data = useMemo(() => generatePressureData(), []);

    const traces = [
        {
            x: data.pp,
            y: data.depths,
            type: 'scatter',
            mode: 'lines',
            name: 'Pore Pressure',
            line: { color: '#94a3b8', width: 2 },
            fill: 'none'
        },
        {
            x: data.fg,
            y: data.depths,
            type: 'scatter',
            mode: 'lines',
            name: 'Fracture Gradient',
            line: { color: '#ef4444', width: 2 },
            fill: 'tonextx', // Fills area between this trace and the previous one (PP)
            fillcolor: 'rgba(34, 197, 94, 0.2)' // Green safe window
        },
        // LOT/FIT Points
        {
            x: [1400, 2600, 3500],
            y: [1500, 2500, 3200],
            type: 'scatter',
            mode: 'markers',
            name: 'LOT Data',
            marker: { symbol: 'triangle-up', size: 10, color: '#f97316' }
        },
        {
            x: [1200, 2200],
            y: [1200, 2100],
            type: 'scatter',
            mode: 'markers',
            name: 'FIT Data',
            marker: { symbol: 'circle', size: 8, color: '#a855f7' }
        }
    ];

    const layout = {
        title: { text: 'Safe Mud Weight Window', font: { size: 14, color: '#e2e8f0' } },
        xaxis: { title: 'Equivalent Mud Weight (ppg)', side: 'top', range: [8, 20] },
        yaxis: { title: 'Depth (ft)', autorange: 'reversed' },
        legend: { orientation: 'h', y: -0.1 },
        hovermode: 'y unified'
    };

    // Normalize dummy data to PPG for visualization range
    const normalizedTraces = traces.map((t, i) => {
        if (t.mode.includes('lines')) {
            return { ...t, x: t.x.map((v, idx) => v / (data.depths[idx] || 1) * 19.25 || 9) }; // rough conversion
        }
        return t;
    });

    return <PlotlyChartFactory data={normalizedTraces} layout={layout} />;
};

export const PlotlyPpVsFgChart = () => {
    const data = useMemo(() => {
        const pts = [];
        for(let i=0; i<100; i++) {
            pts.push({
                pp: 8.5 + Math.random()*4,
                fg: 12 + Math.random()*5,
                depth: 1000 + Math.random()*3000
            });
        }
        return pts;
    }, []);

    const traces = [{
        x: data.map(d => d.pp),
        y: data.map(d => d.fg),
        mode: 'markers',
        type: 'scatter',
        marker: {
            size: 8,
            color: data.map(d => d.depth),
            colorscale: 'Viridis',
            showscale: true,
            colorbar: { title: 'Depth', thickness: 10 }
        },
        hovertemplate: 'Pp: %{x:.2f} ppg<br>Fg: %{y:.2f} ppg<br>Depth: %{marker.color:.0f} ft'
    }];

    const layout = {
        title: { text: 'Pore Pressure vs Fracture Gradient Crossplot', font: { size: 14, color: '#e2e8f0' } },
        xaxis: { title: 'Pore Pressure (ppg)' },
        yaxis: { title: 'Fracture Gradient (ppg)' },
        shapes: [
            { type: 'line', x0: 0, y0: 0, x1: 20, y1: 20, line: { color: '#334155', dash: 'dot' } } // 1:1 Line
        ]
    };

    return <PlotlyChartFactory data={traces} layout={layout} />;
};