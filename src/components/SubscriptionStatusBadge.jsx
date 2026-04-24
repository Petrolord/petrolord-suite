import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function SubscriptionStatusBadge({ status, expiryDate, daysRemaining }) {
  let colorClass = "bg-slate-700 text-slate-300";
  let icon = <Clock className="w-3 h-3 mr-1" />;
  let label = status;

  if (status === 'active') {
    if (daysRemaining <= 30) {
        colorClass = "bg-amber-500/20 text-amber-400 border-amber-500/50";
        icon = <AlertCircle className="w-3 h-3 mr-1" />;
        label = "Expiring Soon";
    } else {
        colorClass = "bg-green-500/20 text-green-400 border-green-500/50";
        icon = <CheckCircle className="w-3 h-3 mr-1" />;
        label = "Active";
    }
  } else if (status === 'expired') {
    colorClass = "bg-red-500/20 text-red-400 border-red-500/50";
    icon = <XCircle className="w-3 h-3 mr-1" />;
    label = "Expired";
  } else if (status === 'cancelled') {
    colorClass = "bg-slate-600/50 text-slate-400 border-slate-600";
    icon = <XCircle className="w-3 h-3 mr-1" />;
    label = "Cancelled";
  } else if (status === 'past_due') {
    colorClass = "bg-red-600/30 text-red-300 border-red-600";
    icon = <AlertCircle className="w-3 h-3 mr-1" />;
    label = "Past Due";
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className={`${colorClass} flex items-center gap-1`}>
            {icon} {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 border-slate-800 text-white">
          <p>Expires: {new Date(expiryDate).toLocaleDateString()}</p>
          <p>{daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expired'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}