import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// isMac() reads the platform, so the two branches are exercised by stubbing it.
vi.mock('@/config/environment', () => ({
  isMac: vi.fn(),
}));

import { isMac } from '@/config/environment';
import { sendKeyLabel } from '../sendKeyLabel';

const mockedIsMac = vi.mocked(isMac);

describe('sendKeyLabel', () => {
  beforeEach(() => {
    mockedIsMac.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the plain Enter key when Ctrl+Enter-to-send is off', () => {
    mockedIsMac.mockReturnValue(true);
    expect(sendKeyLabel(false)).toBe('Enter');
  });

  it('is the same on Windows when Ctrl+Enter-to-send is off', () => {
    mockedIsMac.mockReturnValue(false);
    expect(sendKeyLabel(false)).toBe('Enter');
  });

  it('uses the Command symbol on macOS when Ctrl+Enter-to-send is on', () => {
    mockedIsMac.mockReturnValue(true);
    expect(sendKeyLabel(true)).toBe('⌘Enter');
  });

  it('names Ctrl on Windows and Linux, where there is no Command key', () => {
    mockedIsMac.mockReturnValue(false);
    expect(sendKeyLabel(true)).toBe('Ctrl+Enter');
  });
});
