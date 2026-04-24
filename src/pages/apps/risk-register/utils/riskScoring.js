export const calculateRiskScore = (likelihood, impact) => {
  const l = Number(likelihood) || 0;
  const i = Number(impact) || 0;
  return l * i;
};

export const getRiskBand = (score) => {
  if (score >= 15) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  if (score > 0) return 'Low';
  return 'None';
};

export const getRiskBandColor = (band) => {
  switch (band) {
    case 'Critical': return 'hsl(var(--risk-critical))';
    case 'High': return 'hsl(var(--risk-high))';
    case 'Medium': return 'hsl(var(--risk-medium))';
    case 'Low': return 'hsl(var(--risk-low))';
    default: return 'hsl(var(--muted))';
  }
};

export const getRiskBandClasses = (score) => {
  const band = getRiskBand(score);
  switch (band) {
    case 'Critical': return 'bg-red-500/10 text-red-500 border-red-500/20';
    case 'High': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'Medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'Low': return 'bg-green-500/10 text-green-500 border-green-500/20';
    default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  }
};