import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

export const StatusBadge = ({ status }) => {
  const styles = {
    'Published': 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20',
    'Under Review': 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20',
    'Draft': 'bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted-foreground))] border-[hsl(var(--muted))]/20',
    'Archived': 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/20',
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", styles[status] || styles['Draft'])}>
      {status}
    </span>
  );
};

export const ReusabilityBadge = ({ level }) => {
  const styles = {
    'High': 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
    'Medium': 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
    'Low': 'bg-[hsl(var(--muted))]/10 text-[hsl(var(--muted-foreground))]',
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", styles[level] || styles['Low'])}>
      {level} REUSE
    </span>
  );
};

export const ContributorAvatar = ({ name }) => {
  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2) : '?';
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] flex items-center justify-center text-[10px] font-bold border border-[hsl(var(--primary))]/30">
        {initials}
      </div>
      <span className="text-sm text-[hsl(var(--foreground))]">{name}</span>
    </div>
  );
};

export const MetricsCard = ({ title, value, icon, trend, colorClass }) => (
  <Card className="panel-elevation">
    <CardContent className="p-5 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{title}</p>
        <div className="flex items-baseline gap-2 mt-1">
          <h3 className={cn("text-3xl font-bold", colorClass)}>{value}</h3>
          {trend && <span className="text-xs text-[hsl(var(--success))]">{trend}</span>}
        </div>
      </div>
      <div className={cn("opacity-50", colorClass)}>
        {icon}
      </div>
    </CardContent>
  </Card>
);

export const EmptyState = ({ title, description, icon }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--background))]/50">
    <div className="text-[hsl(var(--muted-foreground))] mb-4 opacity-50">{icon}</div>
    <h3 className="text-lg font-medium text-[hsl(var(--foreground))] mb-1">{title}</h3>
    <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-md">{description}</p>
  </div>
);