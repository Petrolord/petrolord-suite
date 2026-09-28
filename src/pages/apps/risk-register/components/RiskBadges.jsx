import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getRiskBandClasses, getRiskBand } from '@/lib/riskScoring';

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

// Status on the design-system Badge variants: colour for meaning only,
// with the status word always in the badge.
const STATUS_VARIANT = {
  Draft: 'neutral',
  Open: 'info',
  'Under Review': 'warning',
  Mitigated: 'success',
  Closed: 'secondary',
  Realized: 'danger',
};

export const RiskStatusBadge = ({ status, className = "" }) => (
  <Badge variant={STATUS_VARIANT[status] || 'neutral'} className={`font-medium ${className}`}>
    {status}
  </Badge>
);
