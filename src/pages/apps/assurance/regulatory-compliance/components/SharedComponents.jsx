import React from 'react';
import { cn } from '@/lib/utils';

export const StatusBadge = ({ status }) => {
  const styles = {
    'Compliant': 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20',
    'Pending Review': 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20',
    'Overdue': 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/20',
    'Draft': 'bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted-foreground))] border-[hsl(var(--muted))]/20',
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", styles[status] || styles['Draft'])}>
      {status}
    </span>
  );
};

export const EmptyState = ({ title, description, icon }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))]/50">
    <div className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50">{icon}</div>
    <h3 className="text-lg font-medium text-[hsl(var(--foreground))] mb-1">{title}</h3>
    <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-sm">{description}</p>
  </div>
);

export const OwnerAvatar = ({ name }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2) : '?';
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] flex items-center justify-center text-[10px] font-bold border border-[hsl(var(--warning))]/30">
        {initials}
      </div>
      <span className="text-sm text-[hsl(var(--foreground))]">{name}</span>
    </div>
  );
};