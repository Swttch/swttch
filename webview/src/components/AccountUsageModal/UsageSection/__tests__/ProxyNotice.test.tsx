import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const { originState } = vi.hoisted(() => ({
  originState: { data: undefined as unknown },
}));

// The notice asks the backend where the variable lives. That query needs a bridge and
// a react-query client, neither of which this render test has a use for.
vi.mock('@/hooks/queries/useEnvVarOriginsQuery', () => ({
  useEnvVarOriginsQuery: () => ({ data: originState.data }),
}));

import { ProxyNotice } from '../ProxyNotice';

const PROXY = { variable: 'HTTPS_PROXY', url: 'http://proxy.corp:3128' };

describe('ProxyNotice', () => {
  beforeEach(() => { originState.data = undefined; });
  afterEach(cleanup);

  it('names the hop the request takes', () => {
    // "network error" sends someone to check an internet connection that works fine;
    // the thing that refused them is named in their own settings.
    render(<ProxyNotice proxy={PROXY} />);
    expect(screen.getByText(/http:\/\/proxy\.corp:3128/)).toBeInTheDocument();
    expect(screen.getByText(/HTTPS_PROXY/)).toBeInTheDocument();
  });

  it('lists where the variable is assigned, with line numbers', () => {
    originState.data = [
      { kind: 'shell-file', path: '~/.zshrc', line: 18 },
      { kind: 'system-file', path: '/etc/environment', line: 4 },
    ];

    render(<ProxyNotice proxy={PROXY} />);

    expect(screen.getByText('~/.zshrc:18')).toBeInTheDocument();
    expect(screen.getByText('/etc/environment:4')).toBeInTheDocument();
  });

  it('says so when the variable is not in any file it can read', () => {
    // An empty result is an answer: the value came from the command line that
    // launched the IDE, or was inherited from the process that started it.
    originState.data = [];

    render(<ProxyNotice proxy={PROXY} />);

    expect(screen.getByText(/not assigned in any startup or settings file/i)).toBeInTheDocument();
  });

  it('renders the hop before the lookup finishes', () => {
    // Naming the proxy is already useful, so nothing waits on the filesystem.
    originState.data = undefined;

    render(<ProxyNotice proxy={PROXY} />);

    expect(screen.getByText(/http:\/\/proxy\.corp:3128/)).toBeInTheDocument();
    expect(screen.queryByText(/not assigned in any startup/i)).toBeNull();
  });

  it('shows whatever masking the backend applied without unmasking it', () => {
    // The URL arrives already masked; this component must not try to be clever
    // about credentials it was handed.
    render(<ProxyNotice proxy={{ variable: 'HTTPS_PROXY', url: 'http://alice:***@proxy.corp:3128' }} />);

    expect(screen.getByText(/alice:\*\*\*@proxy\.corp:3128/)).toBeInTheDocument();
  });
});
