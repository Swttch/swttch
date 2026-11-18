import type { TFunction } from 'i18next';
import type { LoadedMessageDto } from '../../../types';
import { mergeToolResults } from '../mergeToolResults';
import { buildSegments, type ToolCall } from './buildSegments';
import { baseName, pathOf, toolKindOf } from './toolSummary';
import { activityLabel, activityOfCall, isASend } from './streamingActivity';

function inputString(call: ToolCall, key: string): string {
  const value = call.toolUse.input?.[key];
  return typeof value === 'string' ? value : '';
}

/**
 * What a session is doing at this moment, in the words of a call that is running, for the card of a session another
 * session started (the desktop app draws it under the card's title while the session works, and not after): a
 * command is "Running <the command>", as long as the card has room for it, or the description the session wrote for
 * it ("Waiting 25 seconds"); another call says what it does in its own running wording ("Editing x").
 *
 * `body` is the newest entries of the session, as its record holds them. It says the last call's wording even when
 * that call has already answered, until the next call comes: between two calls the line stays, so the card does not
 * grow and shrink with every pause. Nothing when the session has made no call yet.
 */
export function sessionActivityLine(body: LoadedMessageDto[], t: TFunction): string | undefined {
  // Only the turn that is running: a call from before the message that began it is not what the session does now.
  let turnStart = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    if (isASend(body[index])) {
      turnStart = index;
      break;
    }
  }
  // The result of a call is an entry of its own in the record: it is put into its call, as the chat does before it draws.
  const segments = buildSegments(mergeToolResults(body.slice(turnStart)));
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (segment.kind !== 'tools') continue;
    const last = segment.calls[segment.calls.length - 1];
    if (!last) continue;

    if (toolKindOf(last) === 'command') {
      const described = inputString(last, 'description').trim();
      if (described) return described;
      // The whole first line of the command: the card cuts it where its room ends. The desktop app writes this line in
      // English whatever its language ("Running gh repo view …" on a Korean screen), so it is not translated here.
      const command = inputString(last, 'command').trim().split('\n')[0]?.trim() ?? '';
      return command ? `Running ${command}` : t('transcript.tools.runningCommand', { ns: 'chat' });
    }

    // A file being read is "Reading <file name>", in English whatever the language of the screen, as the desktop app
    // writes it (measured on its recording: "Reading README.md").
    if (toolKindOf(last) === 'read') {
      const file = baseName(pathOf(last));
      if (file) return `Reading ${file}`;
    }

    // Any other call: the words of the summary line a running chat shows for it (what the desktop app's card shows
    // under its title is that line), whether or not the call has answered by now.
    return activityLabel(activityOfCall(last), t) || undefined;
  }
  return undefined;
}
