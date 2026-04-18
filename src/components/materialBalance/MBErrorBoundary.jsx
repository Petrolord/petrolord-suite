import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

class MBErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Material Balance Pro Error:", error, errorInfo);
    // Log to audit trail or analytics here
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
        this.props.onReset();
    } else {
        window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      // Task 3: Render specific error messages clearly to the user, like the initial day missing error
      const errorMessage = this.state.error?.message || this.state.error?.toString() || "Unknown error";
      
      return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-slate-950 p-8 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-200 mb-2">Calculation Error</h2>
          <p className="text-slate-400 max-w-md mb-6 text-sm">
            An issue occurred while running the Material Balance engine or rendering the view.
            Please verify your input data.
          </p>
          <div className="bg-slate-900 p-4 rounded border border-red-900/50 mb-6 w-full max-w-lg text-left overflow-auto max-h-40">
            <code className="text-sm text-red-400 font-mono whitespace-pre-wrap">
                {errorMessage}
            </code>
          </div>
          <Button onClick={this.handleReset} className="bg-blue-600 hover:bg-blue-500 gap-2">
            <RefreshCw className="w-4 h-4" /> Reset View
          </Button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default MBErrorBoundary;