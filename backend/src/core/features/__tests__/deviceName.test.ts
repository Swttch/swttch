import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The device label is what a sponsor uses to tell their own machines apart in
// the device list, so it has to stay readable on every platform we ship to —
// and must never leak more than the machine's own name.
const mockHostname = vi.fn();
const mockPlatform = vi.fn();

vi.mock('os', () => ({
  hostname: () => mockHostname(),
  platform: () => mockPlatform(),
}));

import { buildDeviceName } from '../deviceName';

describe('buildDeviceName', () => {
  beforeEach(() => {
    mockHostname.mockReset();
    mockPlatform.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pairs the machine name with a human-readable OS name', () => {
    mockHostname.mockReturnValue('Yonghyuns-MacBook-Pro.local');
    mockPlatform.mockReturnValue('darwin');

    // ".local" is mDNS noise, not part of what the owner calls the machine.
    expect(buildDeviceName()).toBe('Yonghyuns-MacBook-Pro · macOS');
  });

  it('names Windows and Linux in the terms their users use', () => {
    mockPlatform.mockReturnValue('win32');
    mockHostname.mockReturnValue('DESKTOP-4F2C1');
    expect(buildDeviceName()).toBe('DESKTOP-4F2C1 · Windows');

    mockPlatform.mockReturnValue('linux');
    mockHostname.mockReturnValue('dev-box');
    expect(buildDeviceName()).toBe('dev-box · Linux');
  });

  it('falls back to the raw platform id for anything unrecognised', () => {
    mockPlatform.mockReturnValue('freebsd');
    mockHostname.mockReturnValue('server-1');

    expect(buildDeviceName()).toBe('server-1 · freebsd');
  });

  it('still returns the OS when the hostname is unavailable', () => {
    mockPlatform.mockReturnValue('darwin');
    mockHostname.mockReturnValue('');

    // A label of just "· macOS" would read as broken; the OS alone is honest.
    expect(buildDeviceName()).toBe('macOS');
  });

  it('never throws when the OS lookups fail', () => {
    mockHostname.mockImplementation(() => {
      throw new Error('nope');
    });
    mockPlatform.mockReturnValue('darwin');

    // This runs inside best-effort activation reporting; throwing here would
    // take down something the user actually cares about.
    expect(() => buildDeviceName()).not.toThrow();
  });

  it('trims an over-long hostname so one machine cannot dominate the list', () => {
    mockPlatform.mockReturnValue('linux');
    mockHostname.mockReturnValue('a'.repeat(200));

    const name = buildDeviceName();
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name.endsWith('· Linux')).toBe(true);
  });
});
