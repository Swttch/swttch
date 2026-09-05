import { describe, it, expect, vi, beforeEach } from 'vitest';

// Turning sponsorship off has to leave a trace, because automatic key pick-up
// reads that trace to decide whether to hand the key back. These tests pin down
// what lands on disk and how an unreadable file is judged.
const { mockReadFile, mockAtomicWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockAtomicWriteFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
}));
vi.mock('../atomic-json', () => ({ atomicWriteFile: mockAtomicWriteFile }));

import { deactivateLicense, wasDeactivatedHere, readLicense } from '../license';

/** An fs error the way Node actually raises it: the code, not the message. */
function fsError(code: string): NodeJS.ErrnoException {
  const e = new Error(code) as NodeJS.ErrnoException;
  e.code = code;
  return e;
}

const NOW = new Date('2026-09-05T12:00:00.000Z');

beforeEach(() => {
  mockReadFile.mockReset();
  mockAtomicWriteFile.mockReset().mockResolvedValue(undefined);
});

describe('deactivateLicense', () => {
  it('drops the key and records when the user asked for it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    await deactivateLicense();

    expect(mockAtomicWriteFile).toHaveBeenCalledTimes(1);
    const [, contents] = mockAtomicWriteFile.mock.calls[0] as [string, string];
    expect(JSON.parse(contents)).toEqual({ deactivatedAt: NOW.toISOString() });
    // The whole point of deactivating: the key must really be gone.
    expect(contents).not.toContain('licenseKey');

    vi.useRealTimers();
  });

  it('leaves nothing a later read could mistake for a license', async () => {
    await deactivateLicense();
    const [, contents] = mockAtomicWriteFile.mock.calls[0] as [string, string];
    mockReadFile.mockResolvedValue(contents);

    expect(await readLicense()).toBeNull();
  });
});

describe('wasDeactivatedHere', () => {
  it('reports the deactivation written by deactivating', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ deactivatedAt: NOW.toISOString() }));

    expect(await wasDeactivatedHere()).toBe(true);
  });

  // Presence is the answer, so an unparseable date still counts as "they turned
  // it off" rather than quietly reopening pick-up.
  it('counts any non-empty stamp, even an unparseable one', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ deactivatedAt: 'not-a-date' }));

    expect(await wasDeactivatedHere()).toBe(true);
  });

  it.each([
    ['an empty stamp', { deactivatedAt: '' }],
    ['a non-string stamp', { deactivatedAt: true }],
  ])('ignores %s', async (_label, stored) => {
    mockReadFile.mockResolvedValue(JSON.stringify(stored));

    expect(await wasDeactivatedHere()).toBe(false);
  });

  it('reports no deactivation when a real license is stored', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ licenseKey: 'CCG-abc', status: 'active', verifiedAt: '' }),
    );

    expect(await wasDeactivatedHere()).toBe(false);
  });

  // Nothing was ever turned off here, so pick-up is free to run.
  it('reports no deactivation when the file does not exist', async () => {
    mockReadFile.mockRejectedValue(fsError('ENOENT'));

    expect(await wasDeactivatedHere()).toBe(false);
  });

  // "Cannot tell" must not become "go ahead". Claiming on a guess would hand the
  // key back to someone who deliberately turned it off, and that overrules the
  // user; skipping merely costs them one retry.
  it.each([
    ['a permission error', fsError('EACCES')],
    ['an I/O error', fsError('EIO')],
  ])('holds off when the file is unreadable — %s', async (_label, error) => {
    mockReadFile.mockRejectedValue(error);

    expect(await wasDeactivatedHere()).toBe(true);
  });

  it('holds off when the file is corrupt', async () => {
    mockReadFile.mockResolvedValue('{ not json');

    expect(await wasDeactivatedHere()).toBe(true);
  });
});
