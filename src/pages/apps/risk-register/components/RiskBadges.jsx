import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getRiskBandClasses, getRiskBand } from '../utils/riskScoring';

export const RiskScoreBadge = ({ score, className = "" }) => {
  const numScore = Number(score) || 0;
  const classes = getRiskBandClasses(numScore);
  const band = getRiskBand(numScore);
  
  return (
    <Badge variant="outline" className={`font-semibold border ${classes} ${className}`}>
      {numScore} - {band}
    </Badge>
  );
};

export const RiskStatusBadge = ({ status, className = "" }) => {
  let colorClass = "bg-slate-500/10 text-slate-500 border-slate-500/20";
  
  switch (status) {
    case 'Draft': colorClass = 'bg-slate-500/10 text-slate-500 border-slate-500/20'; break;
    case 'Open': colorClass = 'bg-blue-500/10 text-blue-500 border-blue-500/20'; break;
    case 'Under Review': colorClass = 'bg-purple-500/10 text-purple-500 border-purple-500/20'; break;
    case 'Mitigated': colorClass = 'bg-green-500/10 text-green-500 border-green-500/20'; break;
    case 'Closed': colorClass = 'bg-slate-800 text-slate-400 border-slate-700'; break;
    case 'Realized': colorClass = 'bg-red-500/10 text-red-500 border-red-500/20'; break;
  }

  return (
    <Badge variant="outline" className={`font-medium ${colorClass} ${className}`}>
      {status}
    </Badge>
  );
};