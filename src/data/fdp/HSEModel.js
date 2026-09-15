/**
 * HSE Risk Model
 * Defines structure for HSE risks and hazards.
 *
 * EC6-1: the banding and the score are no longer defined here. This file
 * banded on 15 and 8 while the risk register banded the same score on 20, 12
 * and 6 and the matrix coloured its cells on 15, 8 and 4, so one hazard
 * scored 12 read Medium on this tab, High on the register and orange in the
 * matrix. There is one scale now, in the engines package.
 */
import { getRiskLevel as canonicalRiskLevel, riskScore } from '@/data/fdp/RiskManagementModel';

export const RiskTypes = {
    SAFETY: 'Safety',
    HEALTH: 'Health',
    ENVIRONMENTAL: 'Environmental',
    COMMUNITY: 'Community',
    REGULATORY: 'Regulatory',
    SECURITY: 'Security'
};

export const RiskCategories = {
    HAZARD: 'Hazard Identification',
    EXPOSURE: 'Exposure',
    CONSEQUENCE: 'Consequence',
    PROBABILITY: 'Probability'
};

export const RiskStatus = {
    IDENTIFIED: 'Identified',
    ASSESSED: 'Assessed',
    MITIGATED: 'Mitigated',
    CLOSED: 'Closed'
};

let sequence = 0;

export const createRisk = (data = {}) => ({
    // EC6-1: `risk-${Date.now()}` gave the three example hazards, created in
    // the same millisecond, ONE id between them, so deleting one deleted all
    // three. A counter makes it unique whatever the clock does.
    id: data.id || `risk-${Date.now()}-${(sequence += 1)}`,
    name: data.name || '',
    description: data.description || '',
    type: data.type || RiskTypes.SAFETY,
    category: data.category || RiskCategories.HAZARD,
    probability: data.probability || 3, // 1-5
    impact: data.impact || 3, // 1-5
    mitigation: data.mitigation || '',
    owner: data.owner || '',
    status: data.status || RiskStatus.IDENTIFIED,
    createdDate: data.createdDate || new Date().toISOString(),
    modifiedDate: new Date().toISOString()
});

/**
 * The score of one hazard, or null when a factor is missing.
 * It used to read a missing factor as a zero, which scores an unassessed
 * hazard as Low.
 */
export const calculateRiskScore = (risk) => riskScore(risk);

/** The one banding scale: 20 Critical, 12 High, 6 Medium, below Low. */
export const getRiskLevel = (score) => (score === null || score === undefined
    ? 'Unscored'
    : canonicalRiskLevel(score).level);