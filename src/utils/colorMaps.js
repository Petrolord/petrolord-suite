import React from 'react';

/**
 * Helper function for multi-point linear interpolation.
 * @param {number} t - The value to interpolate, from 0 to 1.
 * @param {Array<Array<number>>} points - An array of [position, [r, g, b]] points.
 *   e.g., [[0, [0, 0, 255]], [0.5, [255, 255, 255]], [1, [255, 0, 0]]]
 * @returns {Array<number>} The interpolated [r, g, b] value.
 */
function interpolate(t, points) {
    let p1, p2;
    for (let i = 0; i < points.length - 1; i++) {
        if (t >= points[i][0] && t <= points[i + 1][0]) {
            p1 = points[i];
            p2 = points[i + 1];
            break;
        }
    }

    if (!p1 || !p2) {
        return points[points.length - 1][1];
    }

    const tLocal = (t - p1[0]) / (p2[0] - p1[0]);
    const r = p1[1][0] + tLocal * (p2[1][0] - p1[1][0]);
    const g = p1[1][1] + tLocal * (p2[1][1] - p1[1][1]);
    const b = p1[1][2] + tLocal * (p2[1][2] - p1[1][2]);

    return [Math.round(r), Math.round(g), Math.round(b)];
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
        default: r = 0; g = 0; b = 0; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export const COLOR_MAPS = {
    'seismic_rwb': {
        name: 'Seismic (Red-White-Blue)',
        fn: (v) => interpolate(v, [[0, [255, 0, 0]], [0.5, [255, 255, 255]], [1, [0, 0, 255]]]),
    },
    'gray_wb': {
        name: 'Gray-White-Black',
        fn: (v) => {
            const c = Math.floor((1 - v) * 255);
            return [c, c, c];
        },
    },
    'grayscale': {
        name: 'Grayscale (Black-White)',
        fn: (v) => {
            const c = Math.floor(v * 255);
            return [c, c, c];
        },
    },
    'hot_iron': {
        name: 'Hot Iron (Black-Red-Yellow-White)',
        fn: (v) => interpolate(v, [[0, [0, 0, 0]], [0.33, [255, 0, 0]], [0.66, [255, 255, 0]], [1, [255, 255, 255]]]),
    },
    'viridis': {
        name: 'Viridis',
        fn: (v) => interpolate(v, [
            [0.0, [68, 1, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], 
            [0.75, [94, 201, 98]], [1.0, [253, 231, 37]]
        ]),
    },
    'plasma': {
        name: 'Plasma',
        fn: (v) => interpolate(v, [
            [0.0, [13, 8, 135]], [0.25, [126, 3, 168]], [0.5, [203, 79, 124]], 
            [0.75, [248, 149, 64]], [1.0, [240, 249, 33]]
        ]),
    },
    'jet': {
        name: 'Jet (Blue-Cyan-Green-Yellow-Red)',
        fn: (v) => interpolate(v, [
            [0, [0, 0, 255]], [0.25, [0, 255, 255]], [0.5, [0, 255, 0]], 
            [0.75, [255, 255, 0]], [1, [255, 0, 0]]
        ]),
    },
    'yellow_white_blue': {
        name: 'Yellow-White-Blue',
        fn: (v) => interpolate(v, [[0, [255, 255, 0]], [0.5, [255, 255, 255]], [1, [0, 0, 255]]]),
    },
    'green_white_red': {
        name: 'Green-White-Red',
        fn: (v) => interpolate(v, [[0, [0, 255, 0]], [0.5, [255, 255, 255]], [1, [255, 0, 0]]]),
    },
    'hsv_cycle': {
        name: 'HSV Cycle',
        fn: (v) => hsvToRgb(v, 1, 1),
    },
    'dip_azimuth': {
        name: 'Dip Azimuth',
        fn: (v) => interpolate(v, [
            [0, [255, 0, 0]], [0.25, [255, 255, 0]], [0.5, [0, 255, 0]], 
            [0.75, [0, 255, 255]], [1, [255, 0, 0]] // Loops back to red
        ]),
    },
    'normal_polarity': {
        name: 'Normal Polarity (Black-Positive, White-Negative)',
        fn: (v) => { // This is effectively inverted grayscale
            const c = Math.floor((1 - v) * 255);
            return [c, c, c];
        },
    },
    // Adding the original 'seismic' for backward compatibility, mapping to RWB
    'seismic': {
        name: 'Seismic (Blue-White-Red)',
        fn: (v) => interpolate(v, [[0, [0, 0, 255]], [0.5, [255, 255, 255]], [1, [255, 0, 0]]]),
    },
    'red_white_black': {
        name: 'Red-White-Black',
        fn: (v) => interpolate(v, [[0, [255, 0, 0]], [0.5, [255, 255, 255]], [1, [0, 0, 0]]]),
    },
    'cool_warm': {
        name: 'Cool-Warm (diverging)',
        fn: (v) => interpolate(v, [
            [0.0, [59, 76, 192]], [0.25, [124, 159, 249]], [0.5, [221, 221, 221]],
            [0.75, [245, 156, 125]], [1.0, [180, 4, 38]]
        ]),
    },
    'spectrum': {
        name: 'Spectrum (Violet-Red)',
        fn: (v) => interpolate(v, [
            [0.0, [148, 0, 211]], [0.17, [0, 0, 255]], [0.33, [0, 255, 255]],
            [0.5, [0, 255, 0]], [0.67, [255, 255, 0]], [0.83, [255, 127, 0]],
            [1.0, [255, 0, 0]]
        ]),
    },
    'magma': {
        name: 'Magma',
        fn: (v) => interpolate(v, [
            [0.0, [0, 0, 4]], [0.25, [81, 18, 124]], [0.5, [183, 55, 121]],
            [0.75, [252, 137, 97]], [1.0, [252, 253, 191]]
        ]),
    },
};