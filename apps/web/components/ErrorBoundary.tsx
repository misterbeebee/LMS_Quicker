import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
  resetLabel?: string;
  modalOverlay?: boolean;
  key?: React.Key;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Props;
  declare setState: (update: Partial<State> | ((prevState: State) => Partial<State>)) => void;
  state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      const card = (
        <div className="bg-red-50/95 border border-red-200 rounded-2xl p-6 text-center my-4 animate-fadeIn max-w-md w-full shadow-lg">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <h3 className="font-bold text-slate-800 text-sm">
            {this.props.fallbackTitle || 'Unable to display this view'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {this.state.error?.message || 'A data display error occurred. You can reset filters or refresh the view.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{this.props.resetLabel || 'Retry View'}</span>
            </button>
          </div>
        </div>
      );

      if (this.props.modalOverlay) {
        return (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          >
            {card}
          </div>
        );
      }

      return card;
    }

    return this.props.children;
  }
}
