import React from 'react';

const CasingVisualizer = ({ activeString }) => {
    // A simple SVG visualizer
    if (!activeString || !activeString.sections || activeString.sections.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-xs text-slate-600 bg-slate-950">
                No active string to visualize.
            </div>
        );
    }

    const sections = activeString.sections;
    const maxDepth = Math.max(...sections.map(s => s.bottomMdM)) * 1.1;
    const maxOD = Math.max(...sections.map(s => s.odIn)) * 1.5;

    // SVG Dimensions
    const width = 200;
    const height = 400; // Fixed viewbox height
    
    // Scales
    const scaleY = (depth) => (depth / maxDepth) * height;
    const scaleX = (od) => (od / maxOD) * width;

    return (
        <div className="w-full h-full flex items-center justify-center bg-slate-950 relative overflow-hidden">
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMin slice" className="max-h-full">
                {/* Background Grid */}
                <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5"/>
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Ground Line */}
                <line x1="0" y1="0" x2={width} y2="0" stroke="#94a3b8" strokeWidth="2" />

                {/* Center Line */}
                <line x1={width/2} y1="0" x2={width/2} y2={height} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />

                {/* Casing Sections */}
                {sections.map((sec, idx) => {
                    const topY = scaleY(sec.topMdM);
                    const bottomY = scaleY(sec.bottomMdM);
                    const sectionHeight = bottomY - topY;
                    const sectionWidth = scaleX(sec.odIn);
                    const startX = (width - sectionWidth) / 2;
                    
                    // Color based on index to differentiate
                    const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16'];
                    const color = colors[idx % colors.length];

                    return (
                        <g key={sec.id} className="group">
                            <rect 
                                x={startX} 
                                y={topY} 
                                width={sectionWidth} 
                                height={sectionHeight} 
                                fill={color} 
                                fillOpacity="0.2" 
                                stroke={color} 
                                strokeWidth="1.5"
                            />
                            {/* Hover info (simple title for now) */}
                            <title>{sec.name}: {Math.round(sec.topMdM)}-{Math.round(sec.bottomMdM)}m, {sec.odIn}"</title>
                        </g>
                    );
                })}

                {/* Depth Markers */}
                <text x="5" y="15" fill="#64748b" fontSize="8" fontFamily="monospace">0m</text>
                <text x="5" y={height - 5} fill="#64748b" fontSize="8" fontFamily="monospace">{Math.round(maxDepth)}m</text>
            </svg>
            
            {/* Legend / Overlay */}
            <div className="absolute bottom-2 right-2 bg-slate-900/80 p-2 rounded border border-slate-800 backdrop-blur-sm">
                <div className="text-[10px] text-slate-400 font-mono">
                    Scale: 1:{Math.round(maxDepth/height)}
                </div>
            </div>
        </div>
    );
};

export default CasingVisualizer;