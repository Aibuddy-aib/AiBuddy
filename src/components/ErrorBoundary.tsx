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
    // 更新状态，下一次渲染将显示备用UI
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('错误边界捕获到错误:', error, errorInfo);
    
    // 这里可以记录错误到错误报告服务
    // 例如: logErrorToService(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // 如果提供了自定义的fallback，则使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      // 否则使用默认的错误UI
      return (
        <div className="error-boundary p-4 bg-red-100 border border-red-400 text-red-700 rounded mb-4">
          <h2 className="text-lg font-bold mb-2">出错了</h2>
          <details className="whitespace-pre-wrap">
            <summary>查看详情</summary>
            <p className="mt-2 text-sm font-mono">{this.state.error && this.state.error.toString()}</p>
          </details>
          <button
            className="mt-4 bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 