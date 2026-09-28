import React from 'react';
import {
  RISK_BANDS, calculateRiskScore, getBandCellClasses, getHeatmapCellClasses, getRiskBand,
} from '@/lib/riskScoring';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const RiskHeatmapMatrix = ({ risks = [], onCellClick, compact = false }) => {
  // Initialize 5x5 matrix
  const matrix = Array(5).fill(0).map(() => Array(5).fill(0).map(() => []));
  
  risks.forEach(r => {
    const l = r.likelihood;
    const i = r.impact;
    if (l >= 1 && l <= 5 && i >= 1 && i <= 5) {
      // Map to matrix indices: impact is Y (bottom to top), likelihood is X (left to right)
      matrix[5 - i][l - 1].push(r);
    }
  });

  return (
    <div className="flex flex-col items-center">
      <div className="flex">
        {/* Y Axis Label */}
        <div className="flex flex-col justify-center mr-4 w-6">
          <span className="text-xs font-semibold text-pl-muted -rotate-90 whitespace-nowrap tracking-widest uppercase origin-center transform -translate-y-1/2">
            Impact
          </span>
        </div>
        
        <div className="flex flex-col">
          {/* Matrix */}
          <div className="grid grid-rows-5 gap-1">
            {[5, 4, 3, 2, 1].map((impact, rowIdx) => (
              <div key={`row-${impact}`} className="flex gap-1 items-center">
                <div className="w-4 text-right text-xs text-pl-muted pr-1">{impact}</div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((likelihood, colIdx) => {
                    const cellRisks = matrix[rowIdx][colIdx];
                    const count = cellRisks.length;
                    
                    return (
                      <TooltipProvider key={`cell-${likelihood}-${impact}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onCellClick && count > 0 && onCellClick(likelihood, impact, cellRisks)}
                              disabled={count === 0}
                              aria-label={`Likelihood ${likelihood}, impact ${impact}: ${getRiskBand(calculateRiskScore(likelihood, impact))}, score ${calculateRiskScore(likelihood, impact)}, ${count} risk${count !== 1 ? 's' : ''}`}
                              className={`
                                ${compact ? 'w-12 h-12' : 'w-12 h-12 md:w-16 md:h-16'} rounded flex items-center justify-center text-lg font-bold transition-all
                                ${getHeatmapCellClasses(likelihood, impact)}
                                ${count === 0 ? 'opacity-60 cursor-not-allowed' : 'shadow-pl-sm ring-1 ring-pl-border cursor-pointer hover:scale-105 z-10 relative'}
                              `}
                            >
                              {count > 0 ? count : ''}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold mb-1">Score: {calculateRiskScore(likelihood, impact)} ({getRiskBand(calculateRiskScore(likelihood, impact))})</p>
                            <p className="text-xs text-pl-muted mb-2">{count} Risk{count !== 1 ? 's' : ''}</p>
                            {count > 0 && (
                                <ul className="text-xs max-w-[200px] space-y-1 list-disc pl-4">
                                    {cellRisks.slice(0, 3).map(r => (
                                        <li key={r.id} className="truncate">{r.risk_id}: {r.title}</li>
                                    ))}
                                    {count > 3 && <li>+{count - 3} more...</li>}
                                </ul>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          
          {/* X Axis Labels */}
          <div className="flex mt-2 ml-5">
             <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(l => (
                    <div key={`x-${l}`} className={`${compact ? 'w-12' : 'w-12 md:w-16'} text-center text-xs text-pl-muted`}>{l}</div>
                ))}
             </div>
          </div>
          <div className="text-center mt-1 ml-5">
            <span className="text-xs font-semibold text-pl-muted uppercase tracking-widest">
              Likelihood
            </span>
          </div>
        </div>
      </div>
      
      {/* Legend. ASC-0 (RC-6): the bands and their edges come from the
          engine's RISK_BANDS, lowest first. This file restated them. */}
      <div className="flex flex-wrap gap-4 mt-6 text-xs text-pl-muted" data-testid="risk-band-legend">
          {[...RISK_BANDS].reverse().map((b) => (
              <div key={b.band} className="flex items-center gap-1">
                  <div className={`w-3 h-3 rounded-sm ${getBandCellClasses(b.band)}`}></div> {b.band} ({b.min}-{b.max})
              </div>
          ))}
      </div>
    </div>
  );
};