import toast from 'react-hot-toast';
import { getBridge } from '@/api/bridge/Bridge';
import { getLogForwarder } from '@/api/logging';
import { i18n } from '@/i18n';
import { uploadFile } from '@/pages/ChatPage/ChatInput/hooks/droppedFiles';
import { MessageType } from '@/shared';
import type { LoadedMessageDto } from '@/types';

/** What goes into the file besides the console history, taken from the tab at the moment it is asked for. */
export interface FrontendLogSource {
  /** Every message loaded in this tab, as the CLI wrote them. */
  messages: readonly LoadedMessageDto[];
  sessionId: string | null;
  /** The message the menu was opened on, when it was opened on one. */
  entryUuid?: string | null;
}

/** `swttch-front-log-20261128174500.log`, in local time. */
export function frontendLogFileName(at: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  const stamp = [at.getFullYear(), two(at.getMonth() + 1), two(at.getDate()), two(at.getHours()), two(at.getMinutes()), two(at.getSeconds())].join('');
  return `swttch-front-log-${stamp}.log`;
}

/**
 * The whole of what this tab can tell about itself: the console history, and every loaded message in full. The history
 * leaves very long values out (see `LogForwarder`), so the messages are written from the tab itself, one per line.
 */
export function buildFrontendLogFile(source: FrontendLogSource, savedAt: Date): string {
  const { messages, sessionId, entryUuid } = source;
  const header = [`saved: ${savedAt.toISOString()}`, `session: ${sessionId ?? '(not started)'}`];
  if (entryUuid) {
    const index = messages.findIndex((message) => message.uuid === entryUuid);
    header.push(`menu opened on: ${entryUuid}${index < 0 ? '' : ` (line ${index + 1} of the loaded messages)`}`);
  }
  return [
    ...header,
    '',
    '===== front-end console log =====',
    getLogForwarder()?.getHistoryText() ?? '',
    '',
    `===== loaded messages (${messages.length}, one JSON per line) =====`,
    ...messages.map((message) => JSON.stringify(message)),
    '',
  ].join('\n');
}

interface SaveAnswer {
  path?: string | null;
  error?: string;
}

let running = false;

/**
 * Save that file where the person chooses. The bytes go to the backend in chunks, since the whole of them can be
 * larger than one message may be, and the host's own save dialog names the place: the IDE's embedded browser cannot
 * download a file by itself.
 *
 * One at a time: a second request while the dialog is still open does nothing.
 */
export async function downloadFrontendLogs(source: FrontendLogSource): Promise<void> {
  if (running) return;
  running = true;
  const toastId = toast.loading(i18n.t('commandPalette:support.downloadFrontLogWorking'));
  try {
    const savedAt = new Date();
    const name = frontendLogFileName(savedAt);
    const file = new File([buildFrontendLogFile(source, savedAt)], name, { type: 'text/plain' });
    const bridge = getBridge();
    const path = await uploadFile(file, (type, payload) => bridge.request(type, payload));
    // No time limit: the answer comes when the person closes the dialog.
    const answer = await bridge.request<SaveAnswer>(MessageType.SAVE_FRONTEND_LOG, { path, suggestedName: name }, { timeout: null });
    if (answer?.error) throw new Error(answer.error);
    if (answer?.path) {
      toast.success(i18n.t('commandPalette:support.downloadFrontLogDone', { path: answer.path }), { id: toastId, duration: 8000 });
    } else {
      toast.dismiss(toastId);
    }
  } catch (error) {
    console.error('[downloadFrontendLogs] failed:', error);
    toast.error(i18n.t('commandPalette:support.downloadFrontLogFailed'), { id: toastId });
  } finally {
    running = false;
  }
}
