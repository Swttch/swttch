import { describe, it, expect } from 'vitest';
import {
  InputModeValues,
  INPUT_MODES,
  MODE_CYCLE,
  getAvailableModes,
  INPUT_MODE_TO_CLI_FLAG,
  CLI_FLAG_TO_INPUT_MODE,
  isValidInputMode,
} from '../chatInput';

describe('auto mode wiring', () => {
  it('exposes the AUTO input mode value', () => {
    expect(InputModeValues.AUTO).toBe('auto');
  });

  it('maps auto both ways to the CLI --permission-mode value', () => {
    expect(INPUT_MODE_TO_CLI_FLAG[InputModeValues.AUTO]).toBe('auto');
    expect(CLI_FLAG_TO_INPUT_MODE['auto']).toBe(InputModeValues.AUTO);
  });

  it('has a render config for auto', () => {
    expect(INPUT_MODES.auto).toBeDefined();
    expect(INPUT_MODES.auto.id).toBe('auto');
    expect(INPUT_MODES.auto.label).toBe('Auto mode');
  });

  it('includes auto in the cycle list', () => {
    expect(MODE_CYCLE).toContain(InputModeValues.AUTO);
  });
});

describe('getAvailableModes', () => {
  it('excludes auto when autoAvailable is false (default)', () => {
    expect(getAvailableModes(false)).not.toContain(InputModeValues.AUTO);
    expect(getAvailableModes(false, false)).not.toContain(InputModeValues.AUTO);
  });

  it('includes auto only when autoAvailable is true', () => {
    expect(getAvailableModes(false, true)).toContain(InputModeValues.AUTO);
  });

  it('excludes bypass when bypassDisabled, independently of auto', () => {
    const modes = getAvailableModes(true, true);
    expect(modes).not.toContain(InputModeValues.BYPASS);
    expect(modes).toContain(InputModeValues.AUTO);
  });

  it('keeps the always-available modes regardless of flags', () => {
    const modes = getAvailableModes(false, false);
    expect(modes).toEqual(
      expect.arrayContaining([
        InputModeValues.PLAN,
        InputModeValues.ASK_BEFORE_EDIT,
        InputModeValues.AUTO_EDIT,
      ]),
    );
  });
});

// Guards a value crossing the backend boundary (SESSION_LOADED.lastReportedMode)
// before it is cast and applied to the composer.
describe('isValidInputMode', () => {
  it('accepts every known InputMode value', () => {
    Object.values(InputModeValues).forEach((mode) => {
      expect(isValidInputMode(mode)).toBe(true);
    });
  });

  it('rejects null, undefined, and unrecognized strings', () => {
    expect(isValidInputMode(null)).toBe(false);
    expect(isValidInputMode(undefined)).toBe(false);
    expect(isValidInputMode('somethingNew')).toBe(false);
    expect(isValidInputMode('')).toBe(false);
  });

  it('rejects CLI flag names — these must already be translated by the backend', () => {
    // A regression here would mean the raw CLI vocabulary (e.g. "bypassPermissions")
    // reached the webview unmapped instead of the InputMode vocabulary ("bypass").
    expect(isValidInputMode('bypassPermissions')).toBe(false);
    expect(isValidInputMode('acceptEdits')).toBe(false);
  });
});
