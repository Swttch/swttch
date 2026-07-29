import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSupportItems } from '../items';
import { StaticItem } from '../../../types';
import type { CommandPaletteServices } from '../../../types';
import * as Adapters from '@/adapters';
import * as CopyLogs from '@/utils/copyFrontendLogs';
import toast from 'react-hot-toast';

const supportItems = getSupportItems();

const byId = (id: string): StaticItem =>
  supportItems.find(item => item.id === id) as StaticItem;

const makeServices = (
  confirm: CommandPaletteServices['ui']['confirm'],
): CommandPaletteServices =>
  ({ ui: { confirm } } as unknown as CommandPaletteServices);

describe('supportItems', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes a "Restart plugin" item', () => {
    const restart = byId('restart-plugin');
    expect(restart).toBeDefined();
    expect(restart.label).toBe('Restart plugin');
    expect(restart.disabled).toBe(false);
  });

  it('restarts the backend when the user confirms', async () => {
    const restartBackend = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(Adapters, 'getAdapter').mockReturnValue({
      restartBackend,
    } as unknown as ReturnType<typeof Adapters.getAdapter>);

    const restart = byId('restart-plugin');
    restart._bind(() => makeServices(vi.fn().mockResolvedValue(true)));

    await restart.execute();

    expect(restartBackend).toHaveBeenCalledTimes(1);
  });

  // Diagnostics aid, not an everyday action: it stays out of the default list and
  // only surfaces once the user searches for it.
  it('exposes a search-only "Copy plugin front log" item above the help docs entry', () => {
    const copyLogs = byId('copy-front-log');
    expect(copyLogs).toBeDefined();
    expect(copyLogs.label).toBe('Copy plugin front log');
    expect(copyLogs.disabled).toBe(false);
    expect(copyLogs.searchOnly).toBe(true);

    const ids = supportItems.map(item => item.id);
    expect(ids.indexOf('copy-front-log')).toBeLessThan(ids.indexOf('help-docs'));
  });

  it('does not restart the backend when the user cancels', async () => {
    const restartBackend = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(Adapters, 'getAdapter').mockReturnValue({
      restartBackend,
    } as unknown as ReturnType<typeof Adapters.getAdapter>);

    const restart = byId('restart-plugin');
    restart._bind(() => makeServices(vi.fn().mockResolvedValue(false)));

    await restart.execute();

    expect(restartBackend).not.toHaveBeenCalled();
  });

  it('confirms with a toast once the log has been copied', async () => {
    vi.spyOn(CopyLogs, 'copyFrontendLogs').mockResolvedValue({ ok: true, lineCount: 12 });
    const success = vi.spyOn(toast, 'success').mockReturnValue('t1');

    await byId('copy-front-log').execute();

    expect(success).toHaveBeenCalledTimes(1);
  });

  it('tells the user when there was nothing to copy', async () => {
    vi.spyOn(CopyLogs, 'copyFrontendLogs').mockResolvedValue({ ok: false, lineCount: 0 });
    const success = vi.spyOn(toast, 'success').mockReturnValue('t1');
    const error = vi.spyOn(toast, 'error').mockReturnValue('t2');

    await byId('copy-front-log').execute();

    expect(success).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
