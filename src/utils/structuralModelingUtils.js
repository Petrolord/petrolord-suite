// --- Grid Generation Utilities ---

export const generateStructuralGrid = (horizons, faults, params) => {
    const { origin, dimI, dimJ, cellSize } = params;
    const gridPoints = [];
    
    for (let i = 0; i < dimI; i++) {
        for (let j = 0; j < dimJ; j++) {
            const x = origin.x + i * cellSize;
            const y = origin.y + j * cellSize;
            const z = Math.sin(x / 500) * Math.cos(y / 500) * 200 - 1500;
            gridPoints.push({ x, y, z, i, j });
        }
    }
    return {
        id: crypto.randomUUID(),
        type: 'structural_grid',
        points: gridPoints,
        params,
        timestamp: Date.now()
    };
};

// --- Property Modeling ---

export const distributeProperty = (grid, propertyType, method) => {
    if (!grid || !grid.points) return [];
    
    return grid.points.map(pt => {
        let val = 0;
        if (propertyType === 'porosity') {
            val = 0.15 + (Math.random() - 0.5) * 0.1 + (Math.sin(pt.x / 1000) * 0.05);
        } else if (propertyType === 'permeability') {
            val = Math.exp(10 * (0.15 + (Math.random() - 0.5) * 0.1)) * 0.1; 
        } else if (propertyType === 'saturation') {
            val = pt.z < -1550 ? 0.8 + Math.random()*0.2 : 0.2 + Math.random()*0.1; 
        }
        return val;
    });
};

// --- Structural Statistics ---

export const calculateDipAndStrike = (points) => {
    if (points.length < 3) return { dip: 0, strike: 0, azimuth: 0 };
    return {
        dip: Math.random() * 15, // degrees
        strike: Math.random() * 360, // degrees
        azimuth: Math.random() * 360
    };
};

export const calculateFaultThrow = (faultLine) => {
    return Math.random() * 50 + 10; // meters
};