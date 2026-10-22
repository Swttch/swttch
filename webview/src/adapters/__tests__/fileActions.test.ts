import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JetBrainsAdapter } from '../JetBrainsAdapter';
import { BrowserAdapter } from '../BrowserAdapter';
import * as BridgeModule from '@/api/bridge/Bridge';
import { MessageType } from '@/shared';

// The file link menu's two actions (#567): same request and same failure for both adapters.
describe.each([
  ['JetBrainsAdapter', () => new JetBrainsAdapter()],
  ['BrowserAdapter', () => new BrowserAdapter()],
])('%s file actions', (_name, create) => {
  let request: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    request = vi.fn().mockResolvedValue({ ok: true });
    vi.spyOn(BridgeModule, 'getBridge').mockReturnValue({ request } as unknown as ReturnType<
      typeof BridgeModule.getBridge
    >);
  });

  afterEach(() => vi.restoreAllMocks());

  it('asks the backend to open a file with the system app', async () => {
    await create().openFileWithSystemApp('C:/x.png');
    expect(request).toHaveBeenCalledWith(MessageType.OPEN_FILE_WITH_SYSTEM_APP, { filePath: 'C:/x.png' });
  });

  it('asks the backend to reveal a file', async () => {
    await create().revealFile('C:/x.png');
    expect(request).toHaveBeenCalledWith(MessageType.REVEAL_FILE, { filePath: 'C:/x.png' });
  });

  it('rejects with the reason when the backend answers ok:false', async () => {
    request.mockResolvedValue({ ok: false, reason: 'not-found' });
    await expect(create().revealFile('C:/gone.png')).rejects.toThrow('not-found');
    await expect(create().openFileWithSystemApp('C:/gone.png')).rejects.toThrow('not-found');
  });
});
