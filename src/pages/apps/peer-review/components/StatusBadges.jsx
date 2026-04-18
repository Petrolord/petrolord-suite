import React from 'react';

export const StageBadge = ({ stage }) => {
  let colorClass = 'bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]';

  switch (stage?.toLowerCase()) {
    case 'closed':
    case 'approved':
      colorClass = 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20';
      break;
    case 'in review':
      colorClass = 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/20';
      break;
    case 'verification':
      colorClass = 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20';
      break;
    case 'rejected':
      colorClass = 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/20';
      break;
  }

  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>{stage}</span>;
};

export const PriorityBadge = ({ priority }) => {
  let colorClass = 'bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]';
  if (priority?.toLowerCase() === 'medium') colorClass = 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/20';
  if (priority?.toLowerCase() === 'high') colorClass = 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20';
  if (priority?.toLowerCase() === 'critical' || priority?.toLowerCase() === 'major') colorClass = 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/20';
  if (priority?.toLowerCase() === 'minor') colorClass = 'bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]';
  
  return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border ${colorClass}`}>{priority}</span>;
};

export const DecisionBadge = ({ decision }) => {
  let colorClass = 'bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]';

  switch (decision?.toLowerCase()) {
    case 'approved':
      colorClass = 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20';
      break;
    case 'approved with conditions':
      colorClass = 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20';
      break;
    case 'rejected':
      colorClass = 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/20';
      break;
    case 'pending':
      colorClass = 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/20';
      break;
  }

  return <span className={`px-2.5 py-0.5 rounded text-xs font-medium border ${colorClass}`}>{decision}</span>;
};