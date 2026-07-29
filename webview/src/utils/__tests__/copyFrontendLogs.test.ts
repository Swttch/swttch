import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyFrontendLogs } from '../copyFrontendLogs';
import * as Logging from '@/api/logging';

const mockForwarder = (text: string) =>
  vi.spyOn(Logging, 'getLogForwarder').mockReturnValue({
    getHistoryText: () => text,
  } as unknown as ReturnType<typeof Logging.getLogForwarder>);

describe('copyFrontendLogs', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the captured console history to the clipboard', async () => {
    mockForwarder('line one\nline two');

    const result = await copyFrontendLogs();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('line one\nline two');
    expect(result).toEqual({ ok: true, lineCount: 2 });
  });

  // The palette entry exists for users who never opened devtools, so an empty
  // buffer must read as a clear "nothing to copy" rather than a silent success.
  it('reports failure when there is nothing captured yet', async () => {
    mockForwarder('');

    const result = await copyFrontendLogs();

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, lineCount: 0 });
  });

  it('reports failure when the clipboard write is rejected', async () => {
    mockForwarder('line one');
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('denied'),
    );

    const result = await copyFrontendLogs();

    expect(result).toEqual({ ok: false, lineCount: 1 });
  });

  it('survives the log forwarder not being initialised', async () => {
    vi.spyOn(Logging, 'getLogForwarder').mockReturnValue(
      undefined as unknown as ReturnType<typeof Logging.getLogForwarder>,
    );

    const result = await copyFrontendLogs();

    expect(result).toEqual({ ok: false, lineCount: 0 });
  });
});
