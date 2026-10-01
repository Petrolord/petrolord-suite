/**
 * ValidationEngine
 * Centralized validation logic for BasinFlow Genesis
 */
export class ValidationEngine {

    static validateStep(stepId, data) {
        switch(stepId) {
            case 1: return this.validateTemplate(data);
            case 2: return this.validateStratigraphy(data.layers);
            case 3: return this.validatePetroleumSystem(data.layers);
            case 4: return this.validateHeatFlow(data.heatFlowId || data.heatFlow);
            case 5: return this.validateErosion(data);
            case 6: return this.validateProject({ stratigraphy: data.layers, heatFlow: data.heatFlow });
            default: return { isValid: true, errors: [], warnings: [] };
        }
    }

    static validateTemplate(data) {
        const errors = [];
        if (!data.selectedTemplateId) errors.push("A basin template must be selected.");
        return { isValid: errors.length === 0, errors, warnings: [] };
    }

    static validateStratigraphy(layers) {
        const errors = [];
        const warnings = [];

        if (!layers || layers.length === 0) {
            errors.push("At least one stratigraphic layer is required.");
            return { isValid: false, errors, warnings };
        }

        layers.forEach((layer, index) => {
            if (!layer.name) errors.push(`Layer ${index + 1}: Missing name.`);
            // BF-U1-017: a cleared box stored NaN, which passed every
            // comparison below and ran the engine to NaN
            if (!(Number(layer.thickness) > 0)) errors.push(`Layer '${layer.name || index+1}': Thickness must be a positive number.`);
            if (!Number.isFinite(Number(layer.ageStart)) || !Number.isFinite(Number(layer.ageEnd)) || layer.ageStart === '' || layer.ageEnd === '' || layer.ageStart == null || layer.ageEnd == null) errors.push(`Layer '${layer.name || index+1}': Start and end ages must be numbers (Ma).`);
            else if (Number(layer.ageEnd) < 0) errors.push(`Layer '${layer.name || index+1}': End age cannot be negative.`);
            if (layer.ageStart <= layer.ageEnd) errors.push(`Layer '${layer.name || index+1}': Start age (${layer.ageStart} Ma) must be older than End age (${layer.ageEnd} Ma).`);
        });

        // Continuity check (optional warning). W7F: this compared each
        // layer's start age with the previous row's end age, which only
        // holds for oldest-first lists. The templates and the engine list
        // stratigraphy youngest first, so every template warned of a gap at
        // every boundary. The check now runs in age order, oldest first,
        // whatever order the rows are in.
        const byAge = [...layers].sort((a, b) => Number(b.ageStart) - Number(a.ageStart));
        for (let i = 1; i < byAge.length; i++) {
            if (Math.abs(Number(byAge[i].ageStart) - Number(byAge[i - 1].ageEnd)) > 0.1) {
                warnings.push(`Gap or overlap detected between layer '${byAge[i].name}' and the layer below it.`);
            }
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    static validatePetroleumSystem(layers) {
        const errors = [];
        const warnings = [];
        
        const sources = layers.filter(l => l.sourceRock?.isSource);
        if (sources.length === 0) {
            warnings.push("No active source rocks defined. Simulation will run but no hydrocarbons will be generated.");
        } else {
            sources.forEach(s => {
                if (!(Number(s.sourceRock.toc) > 0)) errors.push(`Source '${s.name}': TOC must be greater than 0.`);
                if (!(Number(s.sourceRock.hi) > 0)) errors.push(`Source '${s.name}': HI must be greater than 0.`);
            });
        }

        // Check for reservoir/seal potential (heuristic)
        const reservoirs = layers.filter(l => ['sandstone', 'limestone'].includes(l.lithology.toLowerCase()));
        const seals = layers.filter(l => ['shale', 'salt'].includes(l.lithology.toLowerCase()));
        
        if (reservoirs.length === 0) warnings.push("No obvious reservoir lithologies (Sandstone/Limestone) defined.");
        if (seals.length === 0) warnings.push("No obvious seal lithologies (Shale/Salt) defined.");

        return { isValid: errors.length === 0, errors, warnings };
    }

    static validateHeatFlow(heatFlow) {
        const errors = [];
        if (!heatFlow) {
            errors.push("Heat flow settings are missing.");
        } else {
            // Handle both ID string from wizard or object from context
            if (typeof heatFlow === 'object') {
                if (heatFlow.type === 'constant' && heatFlow.value <= 0) errors.push("Heat flow must be positive.");
            } else if (typeof heatFlow === 'string' && !heatFlow) {
                errors.push("Please select a heat flow model.");
            }
        }
        return { isValid: errors.length === 0, errors, warnings: [] };
    }

    static validateErosion(data) {
        const errors = [];
        if (data.erosionOption === 'custom') {
            if (!data.erosionEvent || data.erosionEvent.amount <= 0) {
                errors.push("Custom erosion event requires a valid amount (> 0m).");
            }
            if (data.erosionEvent && data.erosionEvent.age < 0) {
                errors.push("Erosion age cannot be negative.");
            }
        }
        return { isValid: errors.length === 0, errors, warnings: [] };
    }

    static validateProject(project) {
        const stratResult = this.validateStratigraphy(project.stratigraphy);
        const psResult = this.validatePetroleumSystem(project.stratigraphy);
        const hfResult = this.validateHeatFlow(project.heatFlow);

        const errors = [...stratResult.errors, ...psResult.errors, ...hfResult.errors];
        const warnings = [...stratResult.warnings, ...psResult.warnings, ...hfResult.warnings];

        return { isValid: errors.length === 0, errors, warnings };
    }
}