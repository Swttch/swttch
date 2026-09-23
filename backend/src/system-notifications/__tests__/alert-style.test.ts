import { describe, it, expect } from 'vitest';
import { parseAlertStyle, parseAuthorization } from '../alert-style';

/**
 * Real `terminal-notifier -diagnose` output, captured on macOS 26.6.2. Kept
 * verbatim — the column alignment and the surrounding lines are what the parser
 * has to survive, and a hand-tidied sample would not prove that.
 */
const DIAGNOSE = (alertStyle: string, authorization = 'authorized') => `terminal-notifier 3.1.0
  bundle id           com.github.yhk1038.claude-code-gui.notifier
  bundle path         /Users/someone/Applications/Swttch.app
  macOS               Version 26.6.2 (Build 25G83)
  NotificationCenter  running

  authorization       ${authorization}
  alerts              enabled
  alert style         ${alertStyle}
  sounds              enabled
  notification centre enabled
  lock screen         enabled
  previews            always
  critical alerts     not supported
  time sensitive      not supported
  scheduled delivery  not supported
`;

describe('parseAlertStyle', () => {
  /**
   * macOS names the fading style "Banners" (임시) and the one that stays up
   * "Alerts" (지속적 표시). The names read backwards from how the settings
   * screen talks about them, so the mapping is pinned here rather than inferred.
   */
  it('reads banners as the style that fades', () => {
    expect(parseAlertStyle(DIAGNOSE('banners'))).toBe('transient');
  });

  it('reads alerts as the style that stays up', () => {
    expect(parseAlertStyle(DIAGNOSE('alerts'))).toBe('persistent');
  });

  /**
   * "none" is what a bundle reports before anyone has granted it permission, and
   * also when the user switched notifications off outright. Neither is a fading
   * banner to complain about, so neither should raise the hint.
   */
  it('claims nothing when the style is none', () => {
    expect(parseAlertStyle(DIAGNOSE('none'))).toBe('unknown');
  });

  it('claims nothing when the line is absent', () => {
    expect(parseAlertStyle('terminal-notifier 3.1.0\n  bundle id  x\n')).toBe('unknown');
  });

  it('claims nothing about empty output', () => {
    expect(parseAlertStyle('')).toBe('unknown');
  });

  /**
   * The `alerts` row sits two lines above `alert style` and starts with the same
   * word. A parser matching the prefix rather than the whole label would read
   * "enabled" off that row and answer nonsense.
   */
  it('does not mistake the alerts row for the alert style row', () => {
    expect(parseAlertStyle(DIAGNOSE('alerts'))).toBe('persistent');
    // The row above says `alerts enabled`; 'enabled' is not a style.
    expect(parseAlertStyle('  alerts              enabled\n')).toBe('unknown');
  });
});

/**
 * What the user answered the permission prompt, read from the same output.
 *
 * Polled rather than taken from the notifier's exit code: the notifier stays
 * alive for ten minutes waiting for a click, so its exit code arrives ten
 * minutes after the user pressed Allow. Measured — permission was granted and
 * our switch stayed `null` the whole time.
 */
describe('parseAuthorization', () => {
  it('reads a granted permission', () => {
    expect(parseAuthorization(DIAGNOSE('banners', 'authorized'))).toBe('authorized');
  });

  it('reads a refused permission', () => {
    expect(parseAuthorization(DIAGNOSE('none', 'denied'))).toBe('denied');
  });

  /**
   * The state the poll waits out. Reading it as anything else would record an
   * answer before the user gave one — and then never ask again.
   */
  it('reads "not requested yet" as nobody having answered', () => {
    expect(parseAuthorization(DIAGNOSE('none', 'not requested yet'))).toBe('notRequested');
  });

  it('claims nothing when the line is absent', () => {
    expect(parseAuthorization('terminal-notifier 3.1.0\n')).toBe('unknown');
  });

  // terminal-notifier appends a parenthetical to some values; the leading word
  // is what carries the meaning.
  it('reads a value that carries a trailing explanation', () => {
    expect(parseAuthorization('  authorization       authorized (provisional)\n')).toBe('authorized');
  });

  /**
   * The output has an `alerts` row two lines above `alert style`, and both
   * answers are read from one run. Neither parser may pick up the other's row.
   */
  it('does not confuse the two rows that are read from one run', () => {
    const out = DIAGNOSE('banners', 'denied');
    expect(parseAuthorization(out)).toBe('denied');
    expect(parseAlertStyle(out)).toBe('transient');
  });
});
