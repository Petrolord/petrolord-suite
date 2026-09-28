import React from 'react';
import { ChartPanel } from '@/components/ui/chart-panel';
import { RiskIntegrationService } from '@/services/fdp/RiskIntegrationService';
import { getRiskLevel } from '@/data/fdp/RiskManagementModel';

const RiskMatrix = ({ risks }) => {
    const matrixData = RiskIntegrationService.getMatrixData(risks);
    
    // Matrix labels
    const impacts = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
    const probabilities = ['Almost Certain', 'Likely', 'Possible', 'Unlikely', 'Rare']; // Rows top to bottom

    // EC6-1: the cells are coloured on the register's scale (20 Critical,
    // 12 High, 6 Medium). They used to colour on 15, 8 and 4, so the cell
    // for a score of 12 was orange while the register called the same risk
    // High and the HSE tab called it Medium.
    // Design system rollout 6B: the heat map is a chart, so it sits on the
    // white chart card in both themes, in the same four colours as the
    // severity bar chart on the overview. Dark ink on the lighter cells keeps
    // the counts readable.
    const CELL_COLOUR = {
        Critical: { backgroundColor: '#dc2626', color: '#ffffff' },
        High: { backgroundColor: '#f97316', color: '#0f172a' },
        Medium: { backgroundColor: '#eab308', color: '#0f172a' },
        Low: { backgroundColor: '#22c55e', color: '#0f172a' },
    };

    const getCellStyle = (r, c) => {
        // r is row (0=Almost Certain, 4=Rare), c is col (0=Negligible)
        const score = (5 - r) * (c + 1);
        return CELL_COLOUR[getRiskLevel(score).level];
    };

    return (
        <ChartPanel title="Risk Heat Map" bodyClassName="overflow-x-auto">
            <div className="mx-auto w-max p-2 pl-14">
                <div className="relative">
                    {/* Y Axis Label */}
                    <div className="absolute -left-12 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-bold text-pl-muted uppercase tracking-widest">
                        Probability
                    </div>

                    <div className="grid grid-cols-[auto_1fr] gap-2">
                        {/* Y Axis Ticks */}
                        <div className="flex flex-col justify-between py-4 text-right pr-2">
                            {probabilities.map(p => (
                                <div key={p} className="h-16 flex items-center justify-end text-xs text-pl-muted font-medium">{p}</div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            {/* Matrix Grid */}
                            <div className="grid grid-rows-5 gap-1">
                                {matrixData.map((row, rIdx) => (
                                    <div key={rIdx} className="grid grid-cols-5 gap-1">
                                        {row.map((count, cIdx) => (
                                            <div 
                                                key={cIdx} 
                                                className="w-24 h-16 rounded flex items-center justify-center font-bold text-lg shadow-sm transition cursor-pointer hover:brightness-110"
                                                style={getCellStyle(rIdx, cIdx)}
                                                title={`${probabilities[rIdx]} / ${impacts[cIdx]}`}
                                            >
                                                {count > 0 ? count : ''}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>

                            {/* X Axis Ticks */}
                            <div className="grid grid-cols-5 gap-1 text-center pt-2">
                                {impacts.map(i => (
                                    <div key={i} className="text-xs text-pl-muted font-medium w-24">{i}</div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* X Axis Label */}
                    <div className="text-center mt-4 text-xs font-bold text-pl-muted uppercase tracking-widest pl-24">
                        Impact (Consequence)
                    </div>
                </div>
            </div>
        </ChartPanel>
    );
};

export default RiskMatrix;