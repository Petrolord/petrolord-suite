import * as ss from 'simple-statistics';

export class DistributionManager {
    static DIST_TYPES = {
        NORMAL: 'normal',
        LOGNORMAL: 'lognormal',
        TRIANGULAR: 'triangular',
        UNIFORM: 'uniform',
        CONSTANT: 'constant'
    };

    /**
     * Creates a default distribution object
     */
    static createDistribution(type = 'triangular', params = {}) {
        const defaults = {
            type,
            min: 0, mode: 0.5, max: 1, // Triangular
            mean: 0.5, stdDev: 0.1,    // Normal/Lognormal
            value: 0                   // Constant
        };
        return { ...defaults, ...params };
    }

    /**
     * Samples a value from the given distribution
     */
    static sample(dist) {
        switch (dist.type) {
            case this.DIST_TYPES.NORMAL:
                return this.sampleNormal(dist.mean, dist.stdDev);
            case this.DIST_TYPES.LOGNORMAL:
                return this.sampleLognormal(dist.mean, dist.stdDev);
            case this.DIST_TYPES.TRIANGULAR:
                return this.sampleTriangular(dist.min, dist.mode, dist.max);
            case this.DIST_TYPES.UNIFORM:
                return this.sampleUniform(dist.min, dist.max);
            case this.DIST_TYPES.CONSTANT:
                return parseFloat(dist.value);
            default:
                return 0;
        }
    }

    /**
     * Returns statistical preview points for visualization (PDF)
     */
    static getPreviewData(dist, points = 50) {
        // Simplified preview generation for charts
        // Returns array of { x, y }
        const data = [];
        let min, max;

        // Determine range to plot
        if (dist.type === 'normal' || dist.type === 'lognormal') {
            const mean = dist.mean || 0;
            const std = dist.stdDev || 1;
            min = mean - 3 * std;
            max = mean + 3 * std;
            if (dist.type === 'lognormal') min = Math.max(0.001, min);
        } else if (dist.type === 'triangular' || dist.type === 'uniform') {
            min = dist.min;
            max = dist.max;
            const buffer = (max - min) * 0.1;
            min -= buffer;
            max += buffer;
        } else {
            return [{ x: dist.value, y: 1 }];
        }

        const step = (max - min) / (points - 1);
        for (let i = 0; i < points; i++) {
            const x = min + i * step;
            let y = 0;
            
            // Very basic PDF approximations for visualization shape
            if (dist.type === 'normal') {
                // Use standard normal PDF formula:
                y = (1 / (dist.stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - dist.mean) / dist.stdDev, 2));
            } else if (dist.type === 'triangular') {
                if (x >= dist.min && x <= dist.max) {
                    if (x <= dist.mode) y = (2 * (x - dist.min)) / ((dist.max - dist.min) * (dist.mode - dist.min));
                    else y = (2 * (dist.max - x)) / ((dist.max - dist.min) * (dist.max - dist.mode));
                }
            } else if (dist.type === 'uniform') {
                if (x >= dist.min && x <= dist.max) y = 1 / (dist.max - dist.min);
            } else if (dist.type === 'lognormal' && x > 0) {
                // Same arithmetic mean/stdDev → (mu, sigma) conversion as the sampler.
                const m2 = dist.mean * dist.mean;
                const s2 = dist.stdDev * dist.stdDev;
                const mu = Math.log(m2 / Math.sqrt(m2 + s2));
                const sigma = Math.sqrt(Math.log(1 + s2 / m2));
                y = (1 / (x * sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-Math.pow(Math.log(x) - mu, 2) / (2 * sigma * sigma));
            }
            
            if (!isNaN(y)) data.push({ x, y });
        }
        return data;
    }

    // --- Sampling Algorithms ---

    static sampleUniform(min, max) {
        return Math.random() * (max - min) + min;
    }

    static sampleNormal(mean, stdDev) {
        // Box-Muller transform
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * stdDev;
    }

    static sampleLognormal(mean, stdDev) {
        // For lognormal, mean/stdDev usually refer to the underlying normal distribution or the target data stats.
        // Assuming inputs are describing the target variable statistics:
        // We calculate mu and sigma for the underlying normal.
        const mean2 = mean * mean;
        const stdDev2 = stdDev * stdDev;
        const mu = Math.log(mean2 / Math.sqrt(mean2 + stdDev2));
        const sigma = Math.sqrt(Math.log(1 + (stdDev2 / mean2)));
        
        const z = this.sampleNormal(0, 1);
        return Math.exp(mu + z * sigma);
    }

    static sampleTriangular(min, mode, max) {
        const u = Math.random();
        const f = (mode - min) / (max - min);
        if (u < f) {
            return min + Math.sqrt(u * (max - min) * (mode - min));
        } else {
            return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
        }
    }
}