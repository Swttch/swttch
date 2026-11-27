import { LoadedMessageDto } from '../../types';
import { isQueueOperation, restoreQueuedEntries } from '@/shared';

/**
 * The messages of the chat with the ones typed during a turn put back (see `restoreQueuedEntries`, which the backend's
 * list of sends reads the transcript through as well). The same list comes back when there is nothing to put back.
 */
export function restoreQueuedMessages(messages: LoadedMessageDto[]): LoadedMessageDto[] {
  if (!messages.some(isQueueOperation)) return messages;
  const restored = restoreQueuedEntries(messages as unknown as Record<string, unknown>[]);
  return restored.map(({ entry }) => entry as unknown as LoadedMessageDto);
}
