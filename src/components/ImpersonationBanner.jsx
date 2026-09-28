import React from 'react';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { ShieldAlert, LogOut } from 'lucide-react';

const ImpersonationBanner = () => {
  const { 
    isImpersonating, 
    impersonatedOrgName, 
    impersonatedUserEmail, 
    impersonationStartTime,
    exitImpersonation 
  } = useImpersonation();
  
  const { actualUser } = useAuth();

  if (!isImpersonating) return null;

  return (
    <div className="bg-pl-warning text-pl-warning-fg px-4 py-2 flex items-center justify-between shadow-pl-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 animate-pulse" />
        <div className="text-sm">
          <span className="font-bold uppercase mr-2">Impersonation Mode Active</span>
          <span>
            Viewing as: <strong>{impersonatedUserEmail || 'Organization View'}</strong> 
            {impersonatedOrgName && <span> @ <strong>{impersonatedOrgName}</strong></span>}
          </span>
          <span className="ml-2 opacity-80 text-xs hidden sm:inline">
            Started: {impersonationStartTime ? new Date(impersonationStartTime).toLocaleTimeString() : ''}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="secondary" 
          className="bg-pl-raised text-pl-warning-text hover:bg-pl-warning-bg font-bold border-none"
          onClick={() => exitImpersonation(actualUser?.id)}
        >
          <LogOut className="h-4 w-4 mr-2" /> Exit Impersonation
        </Button>
      </div>
    </div>
  );
};

export default ImpersonationBanner;