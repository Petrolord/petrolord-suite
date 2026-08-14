// VOI Analyzer computation layer. Since D3 the math delegates to the
// canonical decision-analysis engine (src/lib/decisionTree.js): EMV / EVPI
// come from the engine, per-indicator EMVs use bestActionEmv over the
// user-entered posteriors, and impliedPriors flags inputs whose indicator
// marginals and posteriors contradict the stated outcome priors (the user
// types those independently in this legacy input shape, so nothing forces
// them to be Bayes-consistent).

import { bestActionEmv, evpi as engineEvpi, impliedPriors } from '@/lib/decisionTree';

export const generateVoiData = (inputs) => {
    const { decisionCost, outcomes, infoScenario } = inputs;

    const engineOutcomes = outcomes.map((o) => ({ label: o.name, probability: o.probability / 100 }));
    const engineActions = [
        { label: inputs.decisionName, cost: decisionCost, payoffs: outcomes.map((o) => o.payoff) },
        { label: `Do Not ${inputs.decisionName}`, cost: 0, payoffs: outcomes.map(() => 0) },
    ];

    // --- Base Case (Without Information) ---
    const prior = bestActionEmv(engineOutcomes, engineActions);
    const emvWithoutInfo = prior.emv;
    const optimalActionWithoutInfo = engineActions[prior.actionIndex].label;
    const emvDecision = engineOutcomes.reduce(
        (acc, o, i) => acc + o.probability * outcomes[i].payoff, 0) - decisionCost;

    // --- With Information (legacy shape: user-entered indicator marginals
    // and posteriors, evaluated indicator by indicator) ---
    let emvWithInfoPreCost = 0;
    const indicatorNodes = [];
    const indicatorLinks = [];
    let nodeCounter = 2; // 0: Initial, 1: Acquire, 2: No Acquire

    infoScenario.indicators.forEach(indicator => {
        const pIndicator = indicator.probability / 100;

        const posterior = outcomes.map((o) => {
            const cp = indicator.conditionalProbabilities.find((c) => c.outcomeId === o.id);
            return (cp?.probability ?? 0) / 100;
        });
        const conditional = bestActionEmv(engineOutcomes, engineActions, posterior);
        const emvForIndicator = conditional.emv;
        const emvDecisionGivenIndicator = posterior.reduce(
            (acc, p, i) => acc + p * outcomes[i].payoff, 0) - decisionCost;

        emvWithInfoPreCost += pIndicator * emvForIndicator;

        // For Plotting
        const indicatorNodeId = ++nodeCounter;
        indicatorNodes.push({
            id: indicatorNodeId,
            label: `${indicator.name} (${indicator.probability}%)`,
            color: '#f97316',
            emv: emvForIndicator
        });
        indicatorLinks.push({
            source: 1,
            target: indicatorNodeId,
            value: pIndicator * emvWithInfoPreCost,
            label: `${indicator.name} (${indicator.probability}%)`,
            color: 'rgba(249, 115, 22, 0.6)'
        });

        const decisionNodeId = ++nodeCounter;
        const noDecisionNodeId = ++nodeCounter;

        const optimalPathNodeId = conditional.actionIndex === 0 ? decisionNodeId : noDecisionNodeId;

        indicatorNodes.push({ id: decisionNodeId, label: `${inputs.decisionName} (EMV $${emvDecisionGivenIndicator.toFixed(2)}M)`, color: '#10b981' });
        indicatorNodes.push({ id: noDecisionNodeId, label: `Do Not ${inputs.decisionName} (EMV $0.00M)`, color: '#ef4444' });

        indicatorLinks.push({
            source: indicatorNodeId,
            target: optimalPathNodeId,
            value: pIndicator * emvWithInfoPreCost,
            label: conditional.actionIndex === 0 ? inputs.decisionName : `Do Not ${inputs.decisionName}`,
            color: conditional.actionIndex === 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'
        });
    });

    const emvWithInfo = emvWithInfoPreCost - infoScenario.cost;
    const voi = emvWithInfoPreCost - emvWithoutInfo;
    const netVoi = voi - infoScenario.cost;

    // --- EVPI (canonical engine) ---
    const { evpi } = engineEvpi(engineOutcomes, engineActions);

    // --- Bayes-consistency check on the user-entered indicator set ---
    const consistency = impliedPriors(
        engineOutcomes,
        infoScenario.indicators.map((ind) => ({
            label: ind.name,
            probability: ind.probability / 100,
            posteriors: outcomes.map((o) => {
                const cp = ind.conditionalProbabilities.find((c) => c.outcomeId === o.id);
                return (cp?.probability ?? 0) / 100;
            }),
        })),
    );

    const kpis = {
        emvWithInfo: emvWithInfo.toFixed(2),
        emvWithoutInfo: emvWithoutInfo.toFixed(2),
        voi: voi.toFixed(2),
        netVoi: netVoi.toFixed(2),
        evpi: evpi.toFixed(2),
    };

    const plotData = {
        nodes: [
            { id: 0, label: 'Initial Decision', color: '#3b82f6', emv: emvWithInfo },
            { id: 1, label: `Acquire ${infoScenario.name}`, color: '#8b5cf6', emv: emvWithInfo },
            { id: 2, label: 'Do Not Acquire', color: '#8b5cf6', emv: emvWithoutInfo },
            ...indicatorNodes,
            { id: ++nodeCounter, label: `${inputs.decisionName} (EMV $${emvDecision.toFixed(2)}M)`, color: '#10b981' },
            { id: ++nodeCounter, label: `Do Not ${inputs.decisionName} (EMV $0.00M)`, color: '#ef4444' },
        ],
        links: [
            ...indicatorLinks,
            { source: 0, target: 1, value: emvWithInfo, label: `Acquire Info (Cost $${infoScenario.cost}M)`, color: 'rgba(139, 92, 246, 0.6)' },
            { source: 0, target: 2, value: emvWithoutInfo, label: 'No Info', color: 'rgba(139, 92, 246, 0.4)' },
            { source: 2, target: optimalActionWithoutInfo === inputs.decisionName ? nodeCounter - 1 : nodeCounter, value: emvWithoutInfo, label: optimalActionWithoutInfo, color: optimalActionWithoutInfo === inputs.decisionName ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)' },
        ].map((link, i) => ({ ...link, id: i }))
    };

    const recommendation = netVoi > 0
        ? `Since this is positive, acquiring the information is financially advantageous.`
        : netVoi < 0
            ? `Since this is negative, the information costs more than the value it adds, so acquiring it is not justified on EMV grounds.`
            : `The information exactly pays for itself, so the decision is value-neutral on EMV grounds.`;
    let insights = `The Expected Monetary Value (EMV) without new information is $${emvWithoutInfo.toFixed(2)}M, with the optimal decision being to '${optimalActionWithoutInfo}'. Acquiring the '${infoScenario.name}' for $${infoScenario.cost}M results in a final EMV of $${emvWithInfo.toFixed(2)}M. The gross Value of Information (VOI) is $${voi.toFixed(2)}M. After accounting for the cost, the Net VOI is $${netVoi.toFixed(2)}M. ${recommendation} The EVPI of $${evpi.toFixed(2)}M sets the theoretical maximum value of any information-gathering activity.`;

    if (!consistency.consistent) {
        const impliedTxt = outcomes
            .map((o, i) => `${o.name} ${(consistency.implied[i] * 100).toFixed(1)}% vs stated ${o.probability}%`)
            .join('; ');
        insights += ` Consistency warning: the indicator probabilities you entered imply different outcome chances than your stated ones (${impliedTxt}). The VOI figure is only as reliable as these inputs; consider adjusting them until they agree, or use the Decision Tree Builder, which derives them from reliabilities so they cannot disagree.`;
    }

    return {
        kpis,
        plotData,
        insights,
        consistency,
    };
};
