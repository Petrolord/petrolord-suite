import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShoppingCart, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const AccessDenied = ({ moduleId, appName, debugInfo }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);
  // Design system: theme roles when rendered inside an opted-in app (a hub
  // or a pilot's route); the legacy screen byte for byte everywhere else.

  // Log debug info on mount
  useEffect(() => {
    console.error('⛔ ACCESS DENIED SCREEN RENDERED');
    console.table({
        ModuleChecked: moduleId,
        AppChecked: appName,
        ...debugInfo
    });
  }, [moduleId, appName, debugInfo]);

  // Derive display name nicely
  const displayName = appName 
    ? appName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    : moduleId;

  return (
    <div className={"min-h-screen bg-pl-bg flex items-center justify-center p-4"}>
      <Card className={"w-full max-w-md shadow-pl-lg"}>
        <CardHeader className="text-center space-y-2">
          <div className={"mx-auto w-16 h-16 bg-pl-warning-bg rounded-full flex items-center justify-center border border-pl-warning/40"}>
            <Lock className={"w-8 h-8 text-pl-warning-text"} />
          </div>
          <CardTitle className={"text-2xl font-semibold text-pl-text"}>Access Restricted</CardTitle>
          <CardDescription className={"text-pl-muted"}>
            You do not have an active license for <span className={"font-semibold text-pl-text"}>{displayName}</span>.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className={"bg-pl-info-bg border border-pl-info/40 rounded-lg p-4 flex gap-3 items-start"}>
            <div className="mt-0.5">
              <AlertTriangle className={"w-5 h-5 text-pl-info-text"} />
            </div>
            <p className={"text-sm text-pl-info-text leading-relaxed"}>
              Your organization needs to purchase a subscription or renew an expired license to access this feature.
            </p>
          </div>

          {debugInfo && (
             <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full space-y-2">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className={"w-full text-xs h-6"}>
                        {isOpen ? 'Hide Diagnostics' : 'Show Diagnostics'}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className={"bg-pl-sunken p-3 rounded text-[10px] font-pl-mono text-pl-muted overflow-hidden"}>
                    <p><strong>Checking:</strong> {debugInfo.checkedId}</p>
                    <p><strong>Mapped Parent:</strong> {debugInfo.mappedParent}</p>
                    <p><strong>Is Super Admin:</strong> {String(debugInfo.isSuperAdmin)}</p>
                    <p className="mt-1"><strong>Active Modules:</strong></p>
                    <div className={"max-h-20 overflow-y-auto pl-2 border-l border-pl-border"}>
                        {debugInfo.userModules?.join(', ') || 'None'}
                    </div>
                    <p className="mt-1"><strong>Active Apps:</strong></p>
                    <div className={"max-h-20 overflow-y-auto pl-2 border-l border-pl-border"}>
                        {debugInfo.userApps?.join(', ') || 'None'}
                    </div>
                </CollapsibleContent>
             </Collapsible>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button 
            className={"w-full font-semibold"}
            onClick={() => navigate('/dashboard/upgrade')}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Purchase License
          </Button>
          <Button 
            variant="outline" 
            className={"w-full"}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default AccessDenied;