import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { SessionMcpInfo } from '@/hooks/queries/useSessionMcp';
import type { ExtendKitInfo } from '@/hooks/queries/useExtendKit';
import type { CloudflaredInfo } from '@/hooks/queries/useCloudflaredVersion';

/**
 * Acceptance for: "As a user I see, under About, the separately installed programs this app uses
 * with their versions. The two packages read like the Claude Code version row (up to date, update,
 * re-check), and the session-management MCP updates itself instead of waiting for me."
 */

let mcp: SessionMcpInfo | undefined;
let kit: ExtendKitInfo | undefined;
let cloudflared: CloudflaredInfo | undefined;
const mcpInstall = vi.fn(() => Promise.resolve());
const mcpUninstall = vi.fn(() => Promise.resolve());
const mcpRefresh = vi.fn(() => Promise.resolve());
const kitInstall = vi.fn(() => Promise.resolve());
const kitRefresh = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/queries/useSessionMcp', () => ({
  useSessionMcp: () => ({
    info: mcp,
    loading: mcp === undefined,
    install: mcpInstall,
    installing: false,
    uninstall: mcpUninstall,
    uninstalling: false,
    refresh: mcpRefresh,
    refreshing: false,
  }),
}));
vi.mock('@/hooks/queries/useExtendKit', () => ({
  useExtendKit: () => ({
    info: kit,
    loading: kit === undefined,
    install: kitInstall,
    installing: false,
    uninstall: vi.fn(() => Promise.resolve()),
    uninstalling: false,
    refresh: kitRefresh,
    refreshing: false,
  }),
}));
vi.mock('@/hooks/useVersionInfo', () => ({ useVersionInfo: () => ({ nodeVersion: '24.7.0' }) }));
vi.mock('@/hooks/queries/useCloudflaredVersion', () => ({
  useCloudflaredVersion: () => ({ info: cloudflared, loading: false, refresh: vi.fn(() => Promise.resolve()), refreshing: false }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { DependenciesSection } from '..';
import { SessionMcpRow } from '../SessionMcpRow';
import { ExtendKitRow } from '../ExtendKitRow';

const MCP: SessionMcpInfo = {
  packageName: '@swttch/session-manager-mcp',
  installed: '0.1.1',
  latest: '0.1.1',
  updatable: false,
  updating: false,
};
const KIT: ExtendKitInfo = { packageName: '@swttch/extend-kit', installed: '0.11.0', latest: '0.11.0', updatable: false };

const button = (name: RegExp) => screen.queryByRole('button', { name });
const recheck = () => screen.getByRole('button', { name: /refresh version/i });
/** The trash button carries an aria-label; the dialog's confirm button carries the same word as text. */
const removeButton = () => screen.getAllByRole('button', { name: /^remove$/i }).find((b) => b.hasAttribute('aria-label'));

beforeEach(() => {
  vi.clearAllMocks();
  mcp = MCP;
  kit = KIT;
  cloudflared = { installed: true, version: '2026.3.0' };
});

describe('the session-management MCP row', () => {
  it('offers Install, and nothing to remove, while the package is not there', () => {
    mcp = { ...MCP, installed: null };
    render(<SessionMcpRow />);
    expect(button(/^install$/i)).not.toBeNull();
    expect(screen.getByText('Not installed')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull();
  });

  it('asks before installing, and says in the question that it is attached to Claude from then on', async () => {
    mcp = { ...MCP, installed: null };
    render(<SessionMcpRow />);
    fireEvent.click(button(/^install$/i)!);
    const dialog = await screen.findByRole('dialog');
    expect(mcpInstall).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('@swttch/session-manager-mcp');
    expect(dialog.textContent).toContain('attached to every Claude Code session');
    fireEvent.click(within(dialog).getByRole('button', { name: /^install$/i }));
    await waitFor(() => expect(mcpInstall).toHaveBeenCalledTimes(1));
  });

  it('installs nothing when the question is answered no', async () => {
    mcp = { ...MCP, installed: null };
    render(<SessionMcpRow />);
    fireEvent.click(button(/^install$/i)!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mcpInstall).not.toHaveBeenCalled();
  });

  it('reads as up to date, with the version and a re-check, once it is current', () => {
    render(<SessionMcpRow />);
    expect(screen.getByText('Up to date')).toBeDefined();
    expect(screen.getByText('0.1.1')).toBeDefined();
    expect(button(/^update$/i)).toBeNull();
    fireEvent.click(recheck());
    expect(mcpRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows the update running by itself, with nothing to press, while the backend updates it', () => {
    mcp = { ...MCP, installed: '0.1.0', updatable: true, updating: true };
    render(<SessionMcpRow />);
    const running = button(/updating/i)!;
    expect(running.hasAttribute('disabled')).toBe(true);
    fireEvent.click(running);
    expect(mcpInstall).not.toHaveBeenCalled();
    expect(button(/^update$/i)).toBeNull();
    // Removing in the middle of an update would race it.
    expect(removeButton()!.hasAttribute('disabled')).toBe(true);
  });

  it('falls back to an Update button only when the automatic update did not get there', async () => {
    mcp = { ...MCP, installed: '0.1.0', updatable: true, updating: false };
    render(<SessionMcpRow />);
    fireEvent.click(button(/^update$/i)!);
    await waitFor(() => expect(mcpInstall).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('claims nothing about being current while the registry is unreachable', () => {
    mcp = { ...MCP, latest: null };
    render(<SessionMcpRow />);
    expect(screen.queryByText('Up to date')).toBeNull();
    expect(screen.getByText('0.1.1')).toBeDefined();
  });

  it('removes only after the question is answered yes', async () => {
    render(<SessionMcpRow />);
    fireEvent.click(removeButton()!);
    const dialog = await screen.findByRole('dialog');
    expect(mcpUninstall).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(mcpUninstall).toHaveBeenCalledTimes(1));
  });
});

describe('the extend kit row', () => {
  it('reads as up to date with the version and a re-check, and has no remove of its own', () => {
    render(<ExtendKitRow />);
    expect(screen.getByText('Up to date')).toBeDefined();
    expect(screen.getByText('0.11.0')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull();
    fireEvent.click(recheck());
    expect(kitRefresh).toHaveBeenCalledTimes(1);
  });

  it('updates from the row when a newer version is out', async () => {
    kit = { ...KIT, installed: '0.10.0', updatable: true };
    render(<ExtendKitRow />);
    fireEvent.click(button(/^update$/i)!);
    await waitFor(() => expect(kitInstall).toHaveBeenCalledTimes(1));
  });

  it('installs from the row when the kit is not there', async () => {
    kit = { ...KIT, installed: null };
    render(<ExtendKitRow />);
    expect(screen.getByText('Not installed')).toBeDefined();
    fireEvent.click(button(/^install$/i)!);
    await waitFor(() => expect(kitInstall).toHaveBeenCalledTimes(1));
  });
});

describe('the Dependencies section', () => {
  it('lists the two packages, Node.js and cloudflared with their versions', () => {
    render(<DependenciesSection />);
    for (const name of ['@swttch/extend-kit', '@swttch/session-manager-mcp', 'Node.js', 'cloudflared']) {
      expect(screen.getByText(name)).toBeDefined();
    }
    for (const version of ['0.11.0', '0.1.1', '24.7.0', '2026.3.0']) {
      expect(screen.getByText(version)).toBeDefined();
    }
  });

  it('says cloudflared is not installed rather than leaving its version blank', () => {
    mcp = { ...MCP };
    cloudflared = { installed: false, version: null };
    render(<DependenciesSection />);
    expect(screen.getByText('Not installed')).toBeDefined();
  });
});
