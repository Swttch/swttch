import { describe, it, expect } from 'vitest';
import { formatSwVers, formatWindows, getOsInfo } from '../os-info';

/** Verbatim `sw_vers` output from the machine this was developed on. */
const SW_VERS_REAL = `ProductName:\t\tmacOS
ProductVersion:\t\t26.5.2
BuildVersion:\t\t25F84`;

describe('formatSwVers', () => {
  it('builds product + version + build from real sw_vers output', () => {
    // The whole point of #320: this is the value a reporter should copy, and it
    // differs from os.release() (25.5.0) on the very same machine.
    expect(formatSwVers(SW_VERS_REAL)).toBe('macOS 26.5.2 (25F84)');
  });

  it('omits the build when sw_vers does not report one', () => {
    expect(formatSwVers('ProductName:\tmacOS\nProductVersion:\t26.5.2')).toBe('macOS 26.5.2');
  });

  it('keeps the reported product name instead of hardcoding macOS', () => {
    const legacy = 'ProductName:\tMac OS X\nProductVersion:\t10.13.6\nBuildVersion:\t17G14042';
    expect(formatSwVers(legacy)).toBe('Mac OS X 10.13.6 (17G14042)');
  });

  it('defaults the product name when only a version is reported', () => {
    expect(formatSwVers('ProductVersion:\t26.5.2')).toBe('macOS 26.5.2');
  });

  it('returns null when there is no product version to show', () => {
    expect(formatSwVers('')).toBeNull();
    expect(formatSwVers('ProductName:\tmacOS')).toBeNull();
    expect(formatSwVers('garbage')).toBeNull();
  });
});

describe('formatWindows', () => {
  it('appends a descriptive name when os.version() provides one', () => {
    expect(formatWindows('Windows 11 Pro', '10.0.26100')).toBe('Windows 11 Pro (10.0.26100)');
  });

  it('falls back when os.version() merely repeats the build', () => {
    // Guards the unverified case: os.version() is documented only as "kernel
    // version", so it may well be numeric on Windows.
    expect(formatWindows('10.0.26100', '10.0.26100')).toBe('Windows 10.0.26100');
  });

  it('falls back when os.version() is empty or has no letters', () => {
    expect(formatWindows('', '10.0.26100')).toBe('Windows 10.0.26100');
    expect(formatWindows('   ', '10.0.26100')).toBe('Windows 10.0.26100');
  });

  it('never drops the build number', () => {
    for (const descriptive of ['Windows 11 Pro', '10.0.26100', '']) {
      expect(formatWindows(descriptive, '10.0.26100')).toContain('10.0.26100');
    }
  });
});

describe('getOsInfo', () => {
  it('resolves a non-empty string on the host platform', async () => {
    const info = await getOsInfo();
    expect(typeof info).toBe('string');
    expect(info.length).toBeGreaterThan(0);
  });

  it('reports the product version, not the kernel release, on macOS', async () => {
    if (process.platform !== 'darwin') return;
    const info = await getOsInfo();
    // e.g. "macOS 26.5.2 (25F84)" — must not degrade to the Darwin kernel string.
    expect(info).toMatch(/^(macOS|Mac OS X) \d/);
    expect(info).not.toContain('darwin');
  });
});
