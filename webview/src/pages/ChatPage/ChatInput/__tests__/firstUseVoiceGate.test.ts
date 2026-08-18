import { describe, it, expect } from 'vitest';
import {
  decideVoiceGate,
  VoiceGateAction,
  effectOfVoiceAnswer,
  VoiceAnswerEffect,
  voiceSettingsAfterDecline,
  isAnswer,
} from '../firstUseVoiceGate';

/**
 * Acceptance for: "As someone who has never used voice input, I want to be told
 * once what it is and what it installs, so I can decide instead of finding a
 * microphone button I did not ask for." (#299)
 */

describe('what pressing the microphone does', () => {
  it('asks first when the question is unanswered', () => {
    expect(decideVoiceGate(true)).toBe(VoiceGateAction.Ask);
  });

  it('records once the question has been answered', () => {
    // Including the user who declined and later turned voice input back on:
    // they answered, so they are not asked again.
    expect(decideVoiceGate(false)).toBe(VoiceGateAction.Record);
  });
});

describe('closing the dialog is not an answer', () => {
  // "No" switches voice input off for the machine, so it must be chosen, not
  // arrived at by pressing Escape or clicking away.
  it('does not count a dismissal', () => {
    expect(isAnswer('dismissed')).toBe(false);
  });

  it('counts both buttons', () => {
    expect(isAnswer('confirmed')).toBe(true);
    expect(isAnswer('declined')).toBe(true);
  });
});

describe('what the answer commits us to', () => {
  it('installs the kit on yes', () => {
    expect(effectOfVoiceAnswer(true)).toBe(VoiceAnswerEffect.Install);
  });

  it('turns voice input off on no', () => {
    expect(effectOfVoiceAnswer(false)).toBe(VoiceAnswerEffect.DisableVoice);
  });
});

describe('the settings write behind "no"', () => {
  it('turns the feature off', () => {
    expect(voiceSettingsAfterDecline({})).toEqual({ enabled: false });
  });

  it('keeps the CLI keys it shares the object with', () => {
    // `mode` and `autoSubmit` belong to Claude Code's own key handling. Declining
    // our question is not a reason to drop the user's CLI preferences.
    expect(voiceSettingsAfterDecline({ mode: 'push-to-talk', autoSubmit: true })).toEqual({
      mode: 'push-to-talk',
      autoSubmit: true,
      enabled: false,
    });
  });

  it('overrides an explicit enabled:true', () => {
    expect(voiceSettingsAfterDecline({ enabled: true })).toEqual({ enabled: false });
  });

  it('handles a profile that has never stored a voice object', () => {
    expect(voiceSettingsAfterDecline(undefined)).toEqual({ enabled: false });
  });
});
