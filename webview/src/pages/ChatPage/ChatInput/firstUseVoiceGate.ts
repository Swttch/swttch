/**
 * What pressing the microphone should do, before anything happens.
 *
 * Extracted from ChatInput the way `shouldSubmitOnEnter` was: the branching is
 * the part worth pinning down, and mocking ChatInput's whole context tree to
 * reach it costs more than it proves.
 */
export enum VoiceGateAction {
  /** Nothing stands in the way — open the microphone. */
  Record = 'record',
  /** First time here: put the one-time question up instead of recording. */
  Ask = 'ask',
}

export function decideVoiceGate(shouldAsk: boolean): VoiceGateAction {
  return shouldAsk ? VoiceGateAction.Ask : VoiceGateAction.Record;
}

/** What the user's answer commits us to. */
export enum VoiceAnswerEffect {
  /** Install the kit. Recording does NOT follow: see the note in ChatInput. */
  Install = 'install',
  /** Turn voice input off, globally, through the same write the settings toggle makes. */
  DisableVoice = 'disable-voice',
}

export function effectOfVoiceAnswer(accepted: boolean): VoiceAnswerEffect {
  return accepted ? VoiceAnswerEffect.Install : VoiceAnswerEffect.DisableVoice;
}

/**
 * Whether closing the dialog counts as an answer. It does not.
 *
 * "No" here is not "never mind" — it switches voice input off for the machine.
 * So Escape, the backdrop and the close button leave the question where it was,
 * and the next press of the microphone asks again.
 */
export function isAnswer(result: 'confirmed' | 'declined' | 'dismissed'): boolean {
  return result !== 'dismissed';
}

/**
 * The settings value written when the user declines.
 *
 * Spread over whatever Claude already stored so `mode` and `autoSubmit` — keys
 * that belong to the CLI's own key handling — survive, exactly as the settings
 * screen's toggle does. Turning voice input off must not quietly drop them.
 */
export function voiceSettingsAfterDecline(
  current: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...(current ?? {}), enabled: false };
}
