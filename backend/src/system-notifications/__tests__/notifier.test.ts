import { describe, it, expect } from 'vitest';
import { escapeForOsascript, buildWindowsToastScript } from '../notifier';

describe('escapeForOsascript', () => {
  it('escapes double quotes', () => {
    expect(escapeForOsascript('say "hi"')).toBe('say \\"hi\\"');
  });

  it('escapes backslashes before quotes', () => {
    expect(escapeForOsascript('a\\b"c')).toBe('a\\\\b\\"c');
  });

  it('leaves plain text untouched', () => {
    expect(escapeForOsascript('Response complete')).toBe('Response complete');
  });
});

describe('buildWindowsToastScript', () => {
  it('embeds title and body and escapes single quotes', () => {
    const script = buildWindowsToastScript("It's done", 'all good');
    expect(script).toContain("CreateTextNode('It''s done')");
    expect(script).toContain("CreateTextNode('all good')");
  });

  it('uses the WinRT ToastNotificationManager without external modules', () => {
    const script = buildWindowsToastScript('t', 'b');
    expect(script).toContain('Windows.UI.Notifications.ToastNotificationManager');
    expect(script).not.toContain('BurntToast');
  });
});
