import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Contains render errors from a single panel so a fault in one tool cannot
 * white-screen the whole ReservoirCalc workspace. Resetting re-mounts the
 * subtree without a full page reload.
 */
class PanelErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error(`[ReservoirCalc] ${this.props.label || 'Panel'} error:`, error, info);
    }

    reset = () => this.setState({ hasError: false, error: null });

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-full w-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6 text-center">
                    <AlertTriangle className="w-8 h-8 mb-3 text-amber-500" />
                    <h3 className="text-sm font-semibold text-slate-200">{this.props.label || 'Panel'} failed to render</h3>
                    <p className="text-xs mt-1 mb-4 max-w-xs opacity-70">{this.state.error?.message || 'Unexpected error.'}</p>
                    <Button variant="outline" size="sm" onClick={this.reset} className="h-7 text-xs border-slate-700 gap-1.5">
                        <RotateCcw className="w-3 h-3" /> Retry
                    </Button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default PanelErrorBoundary;
