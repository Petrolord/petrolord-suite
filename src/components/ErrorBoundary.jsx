import React from 'react';
import { AlertCircle, RotateCcw, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountScope } from '@/components/account/accountChrome';
import { isStaleChunkError, recoveryInFlight, ensureRecovery, hardReload } from '@/lib/pwa/preloadRecovery';

// A vanished chunk after a deploy is not a defect in the page: the shell is
// simply older than the server. The boundary recognises that case, starts
// (or joins) the automatic repair in src/lib/pwa/preloadRecovery.js and
// shows a calm "updating" panel instead of the red one. Only when the repair
// has given up does it ask the person to reload.
//
// The root boundary sits outside every page scope, so both panels open one
// through AccountScope (a plain element when a scope is already around).
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
      <AccountScope className="flex flex-col items-center justify-center p-6" testId="stale-build-panel">
        <div className="bg-pl-raised border border-pl-border rounded-xl p-8 max-w-lg w-full shadow-pl-lg text-center">
          <div className="w-16 h-16 bg-pl-info-bg rounded-full flex items-center justify-center mx-auto mb-6 border border-pl-info/40">
            <RefreshCw className={`w-8 h-8 text-pl-info-text ${recoveryFailed ? '' : 'animate-spin'}`} />
          </div>
          {recoveryFailed ? (
            <>
              <h2 className="text-2xl font-semibold text-pl-text mb-2">A newer version is available</h2>
              <p className="text-pl-muted mb-6">
                Petrolord has been updated since this page was opened, and the automatic switch did not complete.
                Reload to continue on the latest version. If this keeps happening, close every Petrolord tab and open it again.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={this.handleHardReload} variant="default" data-testid="stale-build-reload">
                  <RotateCcw className="w-4 h-4 mr-2" /> Reload
                </Button>
                <Button onClick={this.handleGoHome} variant="outline">
                  <Home className="w-4 h-4 mr-2" /> Go to Dashboard
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-pl-text mb-2">Updating Petrolord</h2>
              <p className="text-pl-muted">
                A newer version was published while this page was open. Loading the latest version now.
              </p>
            </>
          )}
        </div>
      </AccountScope>
    );
  }

  render() {
    if (this.state.hasError && this.state.stale) {
      return this.renderStale();
    }
    if (this.state.hasError) {
      return (
        <AccountScope className="flex flex-col items-center justify-center p-6" testId="error-boundary-panel">
          <div className="bg-pl-raised border border-pl-border rounded-xl p-8 max-w-lg w-full shadow-pl-lg text-center">
            <div className="w-16 h-16 bg-pl-danger-bg rounded-full flex items-center justify-center mx-auto mb-6 border border-pl-danger/40">
              <AlertCircle className="w-8 h-8 text-pl-danger-text" />
            </div>

            <h2 className="text-2xl font-semibold text-pl-text mb-2">Something went wrong</h2>
            <p className="text-pl-muted mb-6">
              We encountered an unexpected error while rendering this page. 
              {this.state.error && <span className="block mt-2 font-pl-mono text-xs bg-pl-sunken p-2 rounded text-pl-danger-text overflow-auto max-h-32">{this.state.error.toString()}</span>}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} variant="default">
                <RotateCcw className="w-4 h-4 mr-2" /> Reload Page
              </Button>
              <Button onClick={this.handleGoHome} variant="outline">
                <Home className="w-4 h-4 mr-2" /> Go to Dashboard
              </Button>
            </div>
          </div>
        </AccountScope>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
