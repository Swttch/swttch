import { Component, ErrorInfo, ReactNode } from 'react';
import { reportClientError } from '@/api/errorReporting';
import { i18n } from '@/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_LOAD_PATTERN = /Failed to fetch dynamically imported module|Loading chunk \d+ failed|ChunkLoadError/i;

export class ErrorBoundary extends Component<Props, State> {
  private chunkErrorRetried = false;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);

    // Frontend error boundary → single client reporting path (backend transmits).
    reportClientError(error, {
      source: 'render',
      componentStack: info.componentStack ?? undefined,
    });

    if (CHUNK_LOAD_PATTERN.test(error.message) && !this.chunkErrorRetried) {
      this.chunkErrorRetried = true;
      console.warn('[ErrorBoundary] Chunk load failure detected - auto-reloading once');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            // Divided by the UI zoom, which scales viewport units too (see postcss-viewport-zoom.js).
            height: 'calc(100vh / var(--ui-zoom, 1))',
            backgroundColor: '#1e1e1e',
            color: '#cccccc',
            fontFamily: 'system-ui, sans-serif',
            gap: '12px',
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: '14px', opacity: 0.8 }}>{i18n.t('errorBoundary.somethingWentWrong', { ns: 'common' })}</div>
          {this.state.error && (
            <div
              style={{
                fontSize: '11px',
                opacity: 0.5,
                maxWidth: '400px',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px',
              padding: '6px 16px',
              fontSize: '12px',
              cursor: 'pointer',
              backgroundColor: '#2d2d2d',
              color: '#cccccc',
              border: '1px solid #444',
              borderRadius: '4px',
            }}
          >
            {i18n.t('errorBoundary.retry', { ns: 'common' })}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
