import React from 'react';
import { LoadedMessageDto, LoadedMessageType, getTextContent } from '../../../types';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useCliConfig } from '@/contexts/CliConfigContext';
import { isModelChangeFor } from '@/types/models';
import { parseUserContent } from './utils/parseUserContent';
import type { ModelInfo } from '@/types/slashCommand';

interface NotificationMessageRendererProps {
  message: LoadedMessageDto;
}

/** Centered, muted, italic one-liner used for inline system notices. */
export const NotificationLine: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex justify-center py-2">
    <span className="text-[0.8461rem] text-text-tertiary italic">{text}</span>
  </div>
);

export const NotificationMessageRenderer: React.FC<NotificationMessageRendererProps> = ({ message }) => {
  const { messages } = useChatStreamContext();
  const { controlResponse } = useCliConfig();
  const text = message.summary;
  if (!text) return null;

  // A model-change notice is added instantly (on model switch) for feedback,
  // but the CLI emits its own echo of the same change once a message is sent,
  // and that echo lands at the correct chronological position (and persists in
  // the session). Once the echo exists, hide this ephemeral notice so the two
  // converge to a single line whose position stays stable across reloads.
  //
  // Match by model identity (the notice's `modelChangeValue`), not by display
  // text: the notice summary is localized while the echo is English, so string
  // equality would never converge and both lines would linger.
  //
  // Ask whether the echo names THIS row rather than resolving the echo to a row
  // and comparing: several rows can resolve to one model id, so resolving picks
  // one arbitrarily and the row the user actually chose may lose the comparison.
  const modelValue = message.modelChangeValue;
  if (modelValue) {
    const models: ModelInfo[] = controlResponse?.response?.response?.models ?? [];
    const echoArrived = messages.some((m) => {
      if (m.type !== LoadedMessageType.User) return false;
      const parsed = parseUserContent(getTextContent(m));
      if (!parsed.hasLocalCommandStdout && parsed.commandName !== 'model') return false;
      return isModelChangeFor(parsed.text, modelValue, models);
    });
    if (echoArrived) return null;
  }

  return <NotificationLine text={text} />;
};
