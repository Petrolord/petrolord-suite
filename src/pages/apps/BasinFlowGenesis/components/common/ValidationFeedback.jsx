import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ValidationFeedback = ({ result }) => {
    if (!result || (result.isValid && result.warnings.length === 0)) return null;

    return (
        <div className="space-y-2 my-4 animate-in fade-in slide-in-from-top-2">
            {/* Errors */}
            {result.errors.length > 0 && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Validation Error</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-4 mt-1 space-y-1 text-xs">
                            {result.errors.map((err, i) => (
                                <li key={i}>{err}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
                <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warning</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-4 mt-1 space-y-1 text-xs">
                            {result.warnings.map((warn, i) => (
                                <li key={i}>{warn}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            
            {/* Success (if valid but has warnings, or strictly valid) */}
            {result.isValid && result.errors.length === 0 && result.warnings.length === 0 && (
                 <Alert variant="success">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Ready to Proceed</AlertTitle>
                    <AlertDescription className="text-xs">All validation checks passed.</AlertDescription>
                </Alert>
            )}
        </div>
    );
};

export const ValidationTooltip = ({ message, children }) => (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                {children}
            </TooltipTrigger>
            <TooltipContent>
                <p>{message}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
);