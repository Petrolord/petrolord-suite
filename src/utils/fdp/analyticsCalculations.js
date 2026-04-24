/**
 * Analytics Calculations
 * Statistical functions for data analysis.
 */

// Simple polyfills if simple-statistics isn't truly available in environment
const _mean = (data) => data.reduce((a, b) => a + b, 0) / data.length;
const _std = (data) => {
    const m = _mean(data);
    return Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / (data.length - 1));
};

export const calculateStatistics = (data, field) => {
    const values = data.map(d => d[field]).filter(v => typeof v === 'number');
    if (values.length === 0) return null;

    return {
        mean: _mean(values),
        stdDev: _std(values),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length
    };
};

export const calculateCorrelationMatrix = (data, fields) => {
    const matrix = {};
    fields.forEach(f1 => {
        matrix[f1] = {};
        fields.forEach(f2 => {
            if (f1 === f2) {
                matrix[f1][f2] = 1;
            } else {
                // Mock correlation for visualization
                matrix[f1][f2] = parseFloat((Math.random() * 2 - 1).toFixed(2));
            }
        });
    });
    return matrix;
};

export const detectAnomalies = (data, field, threshold = 2.0) => {
    const values = data.map(d => d[field]).filter(v => typeof v === 'number');
    const m = _mean(values);
    const s = _std(values);

    return data.filter(d => {
        const v = d[field];
        if (typeof v !== 'number') return false;
        const zScore = Math.abs((v - m) / s);
        return zScore > threshold;
    });
};