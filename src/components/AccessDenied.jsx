import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShoppingCart, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const AccessDenied = ({ moduleId, appName, debugInfo }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);

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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center border border-slate-700">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">Access Restricted</CardTitle>
          <CardDescription className="text-slate-400">
            You do not have an active license for <span className="font-semibold text-slate-200">{displayName}</span>.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3 items-start">
            <div className="mt-0.5">
              <AlertTriangle className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-sm text-blue-200/80 leading-relaxed">
              Your organization needs to purchase a subscription or renew an expired license to access this feature.
            </p>
          </div>

          {debugInfo && (
             <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full space-y-2">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full text-xs text-slate-600 hover:text-slate-400 h-6">
                        {isOpen ? 'Hide Diagnostics' : 'Show Diagnostics'}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="bg-black/50 p-3 rounded text-[10px] font-mono text-slate-500 overflow-hidden">
                    <p><strong>Checking:</strong> {debugInfo.checkedId}</p>
                    <p><strong>Mapped Parent:</strong> {debugInfo.mappedParent}</p>
                    <p><strong>Is Super Admin:</strong> {String(debugInfo.isSuperAdmin)}</p>
                    <p className="mt-1"><strong>Active Modules:</strong></p>
                    <div className="max-h-20 overflow-y-auto pl-2 border-l border-slate-800">
                        {debugInfo.userModules?.join(', ') || 'None'}
                    </div>
                    <p className="mt-1"><strong>Active Apps:</strong></p>
                    <div className="max-h-20 overflow-y-auto pl-2 border-l border-slate-800">
                        {debugInfo.userApps?.join(', ') || 'None'}
                    </div>
                </CollapsibleContent>
             </Collapsible>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button 
            className="w-full bg-lime-500 hover:bg-lime-600 text-slate-900 font-semibold"
            onClick={() => navigate('/dashboard/upgrade')}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Purchase License
          </Button>
          <Button 
            variant="outline" 
            className="w-full border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
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