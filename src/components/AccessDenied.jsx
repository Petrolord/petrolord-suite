import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShoppingCart, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useThemeClass } from '@/design/themeClass';

const AccessDenied = ({ moduleId, appName, debugInfo }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = React.useState(false);
  // Design system: theme roles when rendered inside an opted-in app (a hub
  // or a pilot's route); the legacy screen byte for byte everywhere else.
  const tc = useThemeClass();

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
    <div className={tc("min-h-screen bg-slate-950 flex items-center justify-center p-4", "min-h-screen bg-pl-bg flex items-center justify-center p-4")}>
      <Card className={tc("w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl", "w-full max-w-md shadow-pl-lg")}>
        <CardHeader className="text-center space-y-2">
          <div className={tc("mx-auto w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center border border-slate-700", "mx-auto w-16 h-16 bg-pl-warning-bg rounded-full flex items-center justify-center border border-pl-warning/40")}>
            <Lock className={tc("w-8 h-8 text-amber-500", "w-8 h-8 text-pl-warning-text")} />
          </div>
          <CardTitle className={tc("text-2xl font-bold text-white", "text-2xl font-semibold text-pl-text")}>Access Restricted</CardTitle>
          <CardDescription className={tc("text-slate-400", "text-pl-muted")}>
            You do not have an active license for <span className={tc("font-semibold text-slate-200", "font-semibold text-pl-text")}>{displayName}</span>.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className={tc("bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3 items-start", "bg-pl-info-bg border border-pl-info/40 rounded-lg p-4 flex gap-3 items-start")}>
            <div className="mt-0.5">
              <AlertTriangle className={tc("w-5 h-5 text-blue-400", "w-5 h-5 text-pl-info-text")} />
            </div>
            <p className={tc("text-sm text-blue-200/80 leading-relaxed", "text-sm text-pl-info-text leading-relaxed")}>
              Your organization needs to purchase a subscription or renew an expired license to access this feature.
            </p>
          </div>

          {debugInfo && (
             <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full space-y-2">
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className={tc("w-full text-xs text-slate-600 hover:text-slate-400 h-6", "w-full text-xs h-6")}>
                        {isOpen ? 'Hide Diagnostics' : 'Show Diagnostics'}
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className={tc("bg-black/50 p-3 rounded text-[10px] font-mono text-slate-500 overflow-hidden", "bg-pl-sunken p-3 rounded text-[10px] font-pl-mono text-pl-muted overflow-hidden")}>
                    <p><strong>Checking:</strong> {debugInfo.checkedId}</p>
                    <p><strong>Mapped Parent:</strong> {debugInfo.mappedParent}</p>
                    <p><strong>Is Super Admin:</strong> {String(debugInfo.isSuperAdmin)}</p>
                    <p className="mt-1"><strong>Active Modules:</strong></p>
                    <div className={tc("max-h-20 overflow-y-auto pl-2 border-l border-slate-800", "max-h-20 overflow-y-auto pl-2 border-l border-pl-border")}>
                        {debugInfo.userModules?.join(', ') || 'None'}
                    </div>
                    <p className="mt-1"><strong>Active Apps:</strong></p>
                    <div className={tc("max-h-20 overflow-y-auto pl-2 border-l border-slate-800", "max-h-20 overflow-y-auto pl-2 border-l border-pl-border")}>
                        {debugInfo.userApps?.join(', ') || 'None'}
                    </div>
                </CollapsibleContent>
             </Collapsible>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button 
            className={tc("w-full bg-lime-500 hover:bg-lime-600 text-slate-900 font-semibold", "w-full font-semibold")}
            onClick={() => navigate('/dashboard/upgrade')}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Purchase License
          </Button>
          <Button 
            variant="outline" 
            className={tc("w-full border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800", "w-full")}
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