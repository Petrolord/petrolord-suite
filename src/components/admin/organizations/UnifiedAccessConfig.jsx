import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Server, Globe } from 'lucide-react';
import { useAdminOrg } from '@/contexts/AdminOrganizationContext';

const UnifiedAccessConfig = () => {
  const { selectedOrg } = useAdminOrg();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-pl-muted" aria-hidden="true" /> 
          Unified Access Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-4">
          <div className="bg-pl-sunken p-3 rounded border border-pl-border">
            <div className="text-xs text-pl-muted uppercase font-bold mb-1 flex items-center gap-1">
              <Server className="h-3 w-3" /> Primary Application
            </div>
            <div className="text-pl-text font-medium">
              {selectedOrg.primary_app === 'hse' ? 'HSE Manager' : 'Suite Dashboard'}
            </div>
          </div>
          
          <div className="bg-pl-sunken p-3 rounded border border-pl-border">
            <div className="text-xs text-pl-muted uppercase font-bold mb-1 flex items-center gap-1">
              <Globe className="h-3 w-3" /> Environment
            </div>
            <div className="text-pl-text font-medium capitalize">
              {selectedOrg.app_type || 'Standard'}
            </div>
          </div>

          <div className="bg-pl-sunken p-3 rounded border border-pl-border">
            <div className="text-xs text-pl-muted uppercase font-bold mb-1">
              HSE Access
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={selectedOrg.hse_enabled ? "success" : "neutral"}>
                {selectedOrg.hse_enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UnifiedAccessConfig;