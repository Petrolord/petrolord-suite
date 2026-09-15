/**
 * Risk Integration Service
 * Consolidates risks from various FDP modules into a unified view.
 */

import { createRisk, RiskTypes, RiskStatus } from '@/data/fdp/RiskManagementModel';

export class RiskIntegrationService {
    static consolidateRisks(fdpState) {
        const consolidated = [];

        // 1. General Project Risks (from Risk Module directly)
        // EC6-1: the Risk module reuses the HSE form, which saves the text as
        // `mitigation`, while every register screen reads `mitigationStrategy`.
        // Everything a user typed there showed as "-" and as "No preventative
        // actions defined". Normalised here, in one place.
        if (fdpState.risks && Array.isArray(fdpState.risks)) {
            consolidated.push(...fdpState.risks.map(r => ({
                ...r,
                mitigationStrategy: r.mitigationStrategy || r.mitigation || '',
                source: r.source || 'Risk Register',
            })));
        }

        // 2. HSE Risks
        if (fdpState.hseData && fdpState.hseData.hazards) {
            fdpState.hseData.hazards.forEach(hazard => {
                consolidated.push(createRisk({
                    id: `hse-${hazard.id}`,
                    name: hazard.name,
                    description: hazard.description,
                    type: RiskTypes.HSE,
                    category: hazard.category,
                    probability: hazard.probability,
                    impact: hazard.impact,
                    mitigationStrategy: hazard.mitigation,
                    owner: hazard.owner,
                    status: hazard.status,
                    source: 'HSE Module',
                    sourceId: hazard.id
                }));
            });
        }

        // 3. Drilling/Wells Risks
        if (fdpState.wells && fdpState.wells.risks) {
            fdpState.wells.risks.forEach(risk => {
                consolidated.push(createRisk({
                    id: `well-${risk.id}`,
                    name: risk.summary || risk.name || 'Drilling Risk',
                    type: RiskTypes.DRILLING,
                    probability: risk.probability || 3,
                    impact: risk.impact || 3,
                    description: risk.description,
                    source: 'Wells Module',
                    status: RiskStatus.IDENTIFIED
                }));
            });
        }

        // 4. Schedule Risks
        if (fdpState.schedule && fdpState.schedule.risks) {
            fdpState.schedule.risks.forEach(risk => {
                consolidated.push(createRisk({
                    id: `sched-${risk.id}`,
                    name: risk.name,
                    type: RiskTypes.SCHEDULE,
                    probability: risk.probability || 3,
                    impact: risk.impact || 3,
                    description: `Delay risk for activity: ${risk.activityName}`,
                    source: 'Schedule Module',
                    status: RiskStatus.ASSESSED
                }));
            });
        }

        // 5. Subsurface/Reserves Risks
        if (fdpState.subsurface && fdpState.subsurface.risks) {
            fdpState.subsurface.risks.forEach(risk => {
                consolidated.push(createRisk({
                    id: `res-${risk.id}`,
                    name: risk.name,
                    type: RiskTypes.SUBSURFACE,
                    probability: risk.probability || 3,
                    impact: risk.impact || 3,
                    description: risk.description,
                    source: 'Subsurface Module',
                    status: RiskStatus.IDENTIFIED
                }));
            });
        }

        return consolidated;
    }

    static getMatrixData(risks) {
        // Generate 5x5 grid data
        const matrix = Array(5).fill(0).map(() => Array(5).fill(0));
        
        risks.forEach(risk => {
            // Indices 0-4 for probabilities 5-1 (inverted Y usually) and impacts 1-5
            // Let's standard: Row=Prob(5 down to 1), Col=Imp(1 to 5)
            // Array index: [5 - prob][impact - 1]
            const rIdx = 5 - Math.min(5, Math.max(1, risk.probability));
            const cIdx = Math.min(5, Math.max(1, risk.impact)) - 1;
            if (matrix[rIdx] && matrix[rIdx][cIdx] !== undefined) {
                matrix[rIdx][cIdx]++;
            }
        });
        return matrix;
    }
}