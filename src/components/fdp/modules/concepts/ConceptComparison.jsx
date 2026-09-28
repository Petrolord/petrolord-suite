import React from 'react';
import { NumericTable, NumTh, NumRow, RowLabel, NumCell } from '@/components/ui/numeric-table';
import { calculateConceptCost } from '@/utils/fdp/conceptCalculations';

const ConceptComparison = ({ concepts }) => {
    if (concepts.length < 2) {
        return (
            <div className="text-center p-8 text-pl-muted">
                Add at least two concepts to view comparison.
            </div>
        );
    }

    const comparisonData = concepts.map(c => ({
        ...c,
        costs: calculateConceptCost(c)
    }));

    // Design system rollout 6A: the side-by-side reads as a ledger, so it
    // uses the NumericTable recipe (sticky metric names, mono numbers).
    const TEXT_CELL = 'whitespace-nowrap border-b border-pl-border px-3 py-2 text-center text-xs text-pl-text';
    const textRow = (label, key) => (
        <NumRow>
            <RowLabel>{label}</RowLabel>
            {comparisonData.map(c => (
                <td key={c.id} className={TEXT_CELL}>{c[key]}</td>
            ))}
        </NumRow>
    );

    return (
        <div className="space-y-4">
            <NumericTable>
                <thead>
                    <tr>
                        <NumTh sticky className="w-[200px]">Metric</NumTh>
                        {comparisonData.map(c => (
                            <NumTh key={c.id} numeric>{c.name}</NumTh>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {textRow('Facility Type', 'facilityType')}
                    {textRow('Drive Mechanism', 'driveMechanism')}
                    <NumRow>
                        <RowLabel>Well Count</RowLabel>
                        {comparisonData.map(c => (
                            <NumCell key={c.id} value={c.wellCount} signed={false}>{c.wellCount}</NumCell>
                        ))}
                    </NumRow>
                    <NumRow>
                        <RowLabel>Peak Production</RowLabel>
                        {comparisonData.map(c => (
                            <NumCell key={c.id} value={c.peakProduction} signed={false}>{c.peakProduction} kbpd</NumCell>
                        ))}
                    </NumRow>
                    <NumRow>
                        <RowLabel>Total CAPEX ($MM)</RowLabel>
                        {comparisonData.map(c => (
                            <NumCell key={c.id} value={c.costs.totalCapex} signed={false}>{c.costs.totalCapex}</NumCell>
                        ))}
                    </NumRow>
                    <NumRow>
                        <RowLabel>Annual OPEX ($MM)</RowLabel>
                        {comparisonData.map(c => (
                            <NumCell key={c.id} value={c.opex} signed={false}>{c.opex}</NumCell>
                        ))}
                    </NumRow>
                </tbody>
            </NumericTable>
        </div>
    );
};

export default ConceptComparison;