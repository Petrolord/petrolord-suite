import React, { useMemo } from 'react';
import PlotlyChartFactory from './PlotlyChartFactory';

// Mock data generator for visualization
const generateDepthData = (start, end, step) => {
    const depths = [];
    const values = {
        Sv: [], SHmax: [], Shmin: [], Pp: [], Fg: []
    };
    for (let d = start; d <= end; d += step) {
        depths.push(d);
        // Simple gradients with some noise
        values.Sv.push(d * 0.023); // ~1 psi/ft converted to MPa approx
        values.Pp.push(d * 0.010 + Math.sin(d/100)*0.5); 
        values.Shmin.push(d * 0.016 + Math.random()*0.2);
        values.SHmax.push(d * 0.019 + Math.random()*0.3);
        values.Fg.push(d * 0.018 + Math.cos(d/200)*0.2);
    }
    return { depths, ...values };
};

export const PlotlyStressProfileChart = () => {
    const data = useMemo(() => generateDepthData(1000, 3000, 10), []);

    const traces = [
        {
            x: data.Sv,
            y: data.depths,
            type: 'scatter',
            mode: 'lines',
            name: 'Sv (Overburden)',
            line: { color: '#94a3b8', width: 2, dash: 'dash' },
            hovertemplate: 'Sv: %{x:.2f} MPa<br>Depth: %{y} m'
        },
        {
            x: data.SHmax,
            y: data.depths,
            type: 'scatter',
            mode: 'lines',
            name: 'SHmax',
            line: { color: '#ef4444', width: 2 },
            hovertemplate: 'SHmax: %{x:.2f} MPa<br>Depth: %{y} m'
        },
        {
            x: data.Shmin,
            y: data.depths,
            type: 'scatter',
            mode: 'lines',
            name: 'Shmin',
            line: { color: '#22c55e', width: 2 },
            hovertemplate: 'Shmin: %{x:.2f} MPa<br>Depth: %{y} m'
        },
        {
            x: data.Pp,
            y: data.depths,
            type: 'scatter',
            mode: 'lines',
            name: 'Pore Pressure',
            line: { color: '#3b82f6', width: 1 },
            visible: 'legendonly' // Hidden by default to focus on stress
        }
    ];

    const layout = {
        title: { text: '1D Stress Profile', font: { size: 14, color: '#e2e8f0' } },
        xaxis: { title: 'Stress (MPa)', side: 'top' },
        yaxis: { title: 'Depth (m)', autorange: 'reversed' }, // Depth goes down
        legend: { x: 0.7, y: 0.1 }
    };

    return <PlotlyChartFactory data={traces} layout={layout} />;
};

export const Plotly3DStressTensorChart = () => {
    // Generate 3D ellipsoids or vectors to represent stress tensor at specific depths
    const depths = [1500, 2000, 2500];
    
    const traces = depths.map((depth, i) => {
        // Simplified representation: Lines for Principal Stresses
        return {
            type: 'scatter3d',
            mode: 'lines+markers',
            name: `Tensor @ ${depth}m`,
            x: [0, 10 + i*2, 0, 0, 0, 0], // Sv
            y: [0, 0, 0, 8 + i, 0, 0], // SHmax
            z: [0, 0, 0, 0, 0, 5 + i], // Shmin (mapped to Z for viz)
            line: { width: 5 },
            marker: { size: 4 }
        };
    });

    // Add a surface/mesh for visualization flair (e.g. failure envelope)
    // This is complex to mock perfectly without math libraries, so we stick to principal axes
    
    const layout = {
        title: { text: 'Stress Tensor Visualization', font: { size: 14, color: '#e2e8f0' } },
        scene: {
            xaxis: { title: 'Sv (Vertical)' },
            yaxis: { title: 'SHmax' },
            zaxis: { title: 'Shmin' },
            bgcolor: 'rgba(0,0,0,0)'
        },
        margin: { l: 0, r: 0, b: 0, t: 30 }
    };

    return <PlotlyChartFactory data={traces} layout={layout} />;
};