import * as d3 from 'd3';

// --- Color Scales ---
const lerpColor = (c1, c2, t) => {
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return { r, g, b };
};

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

export const getCurveColor = (value, min, max, type) => {
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    
    if (type === 'GR') {
        return lerpColor(hexToRgb('#FCD34D'), hexToRgb('#064E3B'), normalized);
    } else if (type === 'PHIE' || type === 'NPHI') {
        return lerpColor(hexToRgb('#FFFFFF'), hexToRgb('#3B82F6'), normalized);
    } else if (type === 'SW') {
        return lerpColor(hexToRgb('#EF4444'), hexToRgb('#3B82F6'), normalized);
    } else if (type === 'RHOB') {
        return lerpColor(hexToRgb('#EF4444'), hexToRgb('#3B82F6'), normalized);
    } else {
        // Default rainbow (simplified)
        return { r: Math.round(255 * normalized), g: 0, b: Math.round(255 * (1 - normalized)) };
    }
};

// --- Geometry Generation ---

export const generateWellPath = (well, offset = { x: 0, y: 0 }) => {
    let x = offset.x;
    let y = offset.y;
    
    if (well.header?.X?.value && !isNaN(well.header.X.value)) x = parseFloat(well.header.X.value);
    if (well.header?.Y?.value && !isNaN(well.header.Y.value)) y = parseFloat(well.header.Y.value);

    const depthKey = well.curveMap?.DEPTH || 'DEPTH';
    if (!well.data || well.data.length === 0) return null;

    const pathPoints = well.data.map(row => {
        const depth = row[depthKey];
        return { x, y: -depth, z: y }; 
    });

    return pathPoints;
};

export const generateLogMesh = (well, pathPoints, curveKey, curveRange) => {
    if (!pathPoints || pathPoints.length < 2) return null;

    const vertices = [];
    const colors = [];
    
    const min = curveRange[0];
    const max = curveRange[1];

    for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[i + 1];
        const val1 = well.data[i][curveKey];
        const val2 = well.data[i+1][curveKey];

        if (val1 === null || val2 === null) continue;

        const c1 = getCurveColor(val1, min, max, curveKey);
        const c2 = getCurveColor(val2, min, max, curveKey);

        vertices.push(p1.x, p1.y, p1.z);
        vertices.push(p2.x, p2.y, p2.z);
        colors.push(c1.r/255, c1.g/255, c1.b/255);
        colors.push(c2.r/255, c2.g/255, c2.b/255);
    }

    return { vertices, colors };
};

export const generateStratigraphicSurface = (markerName, wells, wellPaths) => {
    const points = [];
    
    wells.forEach((well) => {
        const marker = well.markers?.find(m => m.name === markerName); 
        if (marker && wellPaths[well.id]) {
            const path = wellPaths[well.id];
            const depth = marker.depth;
            if (path.length > 0) {
                const wellX = path[0].x;
                const wellY = path[0].z; 
                points.push({x: wellX, y: -depth, z: wellY});
            }
        }
    });

    if (points.length < 3) return null;

    const points2D = points.map(p => [p.x, p.z]);
    const delaunay = d3.Delaunay.from(points2D);
    const triangles = delaunay.triangles; 

    const vertices = [];
    points.forEach(p => vertices.push(p.x, p.y, p.z));
    
    return { vertices, indices: Array.from(triangles) };
};