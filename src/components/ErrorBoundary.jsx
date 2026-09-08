import React from 'react';
import { AlertCircle, RotateCcw, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStaleChunkError, recoveryInFlight, ensureRecovery, hardReload } from '@/lib/pwa/preloadRecovery';

// A vanished chunk after a deploy is not a defect in the page: the shell is
// simply older than the server. The boundary recognises that case, starts
// (or joins) the automatic repair in src/lib/pwa/preloadRecovery.js and
// shows a calm "updating" panel instead of the red one. Only when the repair
// has given up does it ask the person to reload.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, stale: false, recoveryFailed: false };
    this.unmounted = false;
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, stale: isStaleChunkError(error) || recoveryInFlight() };
  }

  componentDidCatch(error, errorInfo) {
    if (isStaleChunkError(error) || recoveryInFlight()) {
      console.warn('Stale build detected, loading the latest version:', error && error.message);
      ensureRecovery().then((result) => {
        if (!result.reloaded && !this.unmounted) this.setState({ recoveryFailed: true });
      });
      return;
    }
    // You can also log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  componentWillUnmount() {
    this.unmounted = true;
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHardReload = () => {
    hardReload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  renderStale() {
    const { recoveryFailed } = this.state;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6" data-testid="stale-build-panel">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-lg w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-cyan-950/30 rounded-full flex items-center justify-center mx-auto mb-6 border border-cyan-900/50">
            <RefreshCw className={`w-8 h-8 text-cyan-400 ${recoveryFailed ? '' : 'animate-spin'}`} />
          </div>
          {recoveryFailed ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-2">A newer version is available</h2>
              <p className="text-slate-400 mb-6">
                Petrolord has been updated since this page was opened, and the automatic switch did not complete.
                Reload to continue on the latest version. If this keeps happening, close every Petrolord tab and open it again.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={this.handleHardReload} variant="default" className="bg-blue-600 hover:bg-blue-500" data-testid="stale-build-reload">
                  <RotateCcw className="w-4 h-4 mr-2" /> Reload
                </Button>
                <Button onClick={this.handleGoHome} variant="outline" className="border-slate-700 hover:bg-slate-800">
                  <Home className="w-4 h-4 mr-2" /> Go to Dashboard
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white mb-2">Updating Petrolord</h2>
              <p className="text-slate-400">
                A newer version was published while this page was open. Loading the latest version now.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  render() {
    if (this.state.hasError && this.state.stale) {
      return this.renderStale();
    }
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-lg w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-900/50">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-slate-400 mb-6">
              We encountered an unexpected error while rendering this page. 
              {this.state.error && <span className="block mt-2 font-mono text-xs bg-black/30 p-2 rounded text-red-300 overflow-auto max-h-32">{this.state.error.toString()}</span>}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} variant="default" className="bg-blue-600 hover:bg-blue-500">
                <RotateCcw className="w-4 h-4 mr-2" /> Reload Page
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="border-slate-700 hover:bg-slate-800">
                <Home className="w-4 h-4 mr-2" /> Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
