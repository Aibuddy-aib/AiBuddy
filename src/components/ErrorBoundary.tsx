import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state, next render will show fallback UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught error:', error, errorInfo);
    
    // If it's a PIXI-related error, try to clean up and reset
    if (error.message.includes('removeEventListener') || error.message.includes('pixi')) {
      console.log('Detected PIXI-related error, attempting cleanup...');
      // Can add PIXI cleanup logic here
    }
    
    // Can log error to error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // If custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      // Otherwise use default error UI
      return (
        <div className="error-boundary p-4 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
          <h2 className="text-lg font-bold mb-2">Error Occurred</h2>
          <details className="whitespace-pre-wrap">
            <summary>View Details</summary>
            <p className="mt-2 text-sm font-mono">{this.state.error && this.state.error.toString()}</p>
          </details>
          <button
            className="mt-4 bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            onClick={() => window.location.reload()}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 