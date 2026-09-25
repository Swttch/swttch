import { describe, it, expect, afterEach, vi } from 'vitest';
import { isLevelEnabled, isDebugEnabled, minLogLevel, LOG_LEVEL_ENV } from '../log-level';

/**
 * Before this filter existed, every console call in the backend was written to
 * disk regardless of level — a line per streamed token, measured at 9,146 B/s in
 * issue #477. Moving those lines to DEBUG only helps if DEBUG can be left out.
 */

afterEach(() => {
  delete process.env[LOG_LEVEL_ENV];
  vi.restoreAllMocks();
});

describe('minLogLevel', () => {
  it('leaves DEBUG out by default', () => {
    expect(minLogLevel()).toBe('log');
    expect(isDebugEnabled()).toBe(false);
  });

  it('lets CCG_LOG_LEVEL turn DEBUG back on', () => {
    process.env[LOG_LEVEL_ENV] = 'debug';
    expect(isDebugEnabled()).toBe(true);
  });

  it('accepts the level in any case, as a user typing it would', () => {
    process.env[LOG_LEVEL_ENV] = 'DEBUG';
    expect(isDebugEnabled()).toBe(true);
  });

  it('falls back to the default on an unrecognised value rather than throwing', () => {
    process.env[LOG_LEVEL_ENV] = 'verbose';
    expect(minLogLevel()).toBe('log');
  });

  it('is read on each call, so a change applies without a restart', () => {
    expect(isDebugEnabled()).toBe(false);
    process.env[LOG_LEVEL_ENV] = 'debug';
    expect(isDebugEnabled()).toBe(true);
  });
});

describe('isLevelEnabled', () => {
  it('keeps ordinary progress lines at the default floor', () => {
    expect(isLevelEnabled('log')).toBe(true);
    expect(isLevelEnabled('info')).toBe(true);
    expect(isLevelEnabled('warn')).toBe(true);
    expect(isLevelEnabled('error')).toBe(true);
    expect(isLevelEnabled('debug')).toBe(false);
  });

  it('accepts the written spelling too, since webview entries arrive as DEBUG/LOG', () => {
    expect(isLevelEnabled('DEBUG')).toBe(false);
    expect(isLevelEnabled('ERROR')).toBe(true);
  });

  it('keeps a level it cannot classify rather than dropping the line', () => {
    expect(isLevelEnabled('trace')).toBe(true);
  });

  it('drops everything below the floor when the floor is raised', () => {
    process.env[LOG_LEVEL_ENV] = 'warn';
    expect(isLevelEnabled('log')).toBe(false);
    expect(isLevelEnabled('info')).toBe(false);
    expect(isLevelEnabled('warn')).toBe(true);
  });

  it('treats log and info as the same rank, so raising to info keeps progress lines', () => {
    process.env[LOG_LEVEL_ENV] = 'info';
    expect(isLevelEnabled('log')).toBe(true);
  });
});
