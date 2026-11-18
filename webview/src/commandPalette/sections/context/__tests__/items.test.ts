import { describe, it, expect, vi } from 'vitest';
import { getContextItems } from '../items';
import { StaticItem } from '../../../types';
import type { CommandPaletteServices } from '../../../types';

const contextItems = getContextItems();

const byId = (id: string): StaticItem =>
  contextItems.find((item) => item.id === id) as StaticItem;

describe('contextItems — open-workflows', () => {
  it('is a search-only item that surfaces under the /workflows query', () => {
    const wf = byId('open-workflows');
    expect(wf).toBeDefined();
    expect(wf.label).toBe('Workflow: Show background tasks');
    expect(wf.searchOnly).toBe(true);
    expect(wf.keywords).toContain('workflows');
  });

  it('opens the Background tasks panel without sending a message to Claude', async () => {
    const openPanel = vi.fn();
    const sendMessage = vi.fn();
    const services = {
      chatStream: { sendMessage },
      workflowState: { openPanel },
    } as unknown as CommandPaletteServices;

    const wf = byId('open-workflows');
    wf._bind(() => services);

    await wf.execute();

    expect(openPanel).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('contextItems — archive-conversation', () => {
  const make = (opts: { sessionId?: string | null; accepted?: boolean; streaming?: boolean }) => {
    const fns = {
      setArchived: vi.fn().mockResolvedValue(opts.accepted ?? true),
      stop: vi.fn(),
      resetForSessionSwitch: vi.fn(),
      resetToNewSession: vi.fn(),
    };
    const services = {
      chatStream: { isStreaming: opts.streaming ?? false, stop: fns.stop, resetForSessionSwitch: fns.resetForSessionSwitch },
      session: { currentSessionId: opts.sessionId === undefined ? 's1' : opts.sessionId, resetToNewSession: fns.resetToNewSession },
      archive: { available: true, isCurrentArchived: false, setArchived: fns.setArchived },
    } as unknown as CommandPaletteServices;
    const item = byId('archive-conversation');
    item._bind(() => services);
    return { item, fns };
  };

  it('sits right below Clear conversation', () => {
    const ids = contextItems.map((i) => i.id);
    expect(ids.indexOf('archive-conversation')).toBe(ids.indexOf('clear-conversation') + 1);
  });

  it('archives the open session and stays on it', async () => {
    const { item, fns } = make({});
    await item.execute();
    expect(fns.setArchived).toHaveBeenCalledWith('s1', true);
    expect(fns.resetForSessionSwitch).not.toHaveBeenCalled();
    expect(fns.resetToNewSession).not.toHaveBeenCalled();
    expect(fns.stop).not.toHaveBeenCalled();
  });

  it('does nothing when the session is not saved yet', async () => {
    const { item, fns } = make({ sessionId: null });
    await item.execute();
    expect(fns.setArchived).not.toHaveBeenCalled();
  });
});
