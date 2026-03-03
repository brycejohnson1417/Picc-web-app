'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component } from 'react';

interface MapRenderBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface MapRenderBoundaryState {
  hasError: boolean;
  message: string;
}

export class MapRenderBoundary extends Component<MapRenderBoundaryProps, MapRenderBoundaryState> {
  constructor(props: MapRenderBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
    };
  }

  static getDerivedStateFromError(error: unknown): MapRenderBoundaryState {
    const message = error instanceof Error ? error.message : 'Unknown map rendering error';
    return {
      hasError: true,
      message,
    };
  }

  componentDidCatch(error: unknown) {
    console.error('map_render_error', error);
  }

  reset = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#f8e9e6] px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-[#c93412]" />
        <p className="text-[15px] font-semibold text-[#8f1f08]">Map encountered an error and was reset.</p>
        <p className="max-w-[320px] text-[13px] text-[#9b4635]">{this.state.message || 'Unable to render one or more map points.'}</p>
        <button
          type="button"
          onClick={this.reset}
          className="inline-flex items-center gap-2 rounded-lg bg-[#c93412] px-3 py-2 text-[13px] font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Map
        </button>
      </div>
    );
  }
}
