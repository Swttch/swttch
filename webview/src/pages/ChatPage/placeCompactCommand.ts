import { getTextContent, type LoadedMessageDto } from '../../types';
import { LoadedMessageType } from '../../dto/common';
import { isCompactBoundary, isCompactSummaryEntry } from './transcript/compact';

function timeOf(message: LoadedMessageDto): number {
  return message.timestamp ? new Date(message.timestamp).getTime() : Number.NaN;
}

/**
 * Put the `/compact` the user typed back in front of the compaction it started (#722).
 *
 * The CLI writes a manual `/compact` as boundary, summary, caveat, command (and then the output line), chained by
 * `parentUuid`, although the user typed the command before any of them: the command keeps the time it was typed, which
 * is earlier than the summary. Read in file order, the saved session therefore draws the divider and the summary above
 * the command that caused them, while the same session drawn live shows the command first.
 *
 * This moves the caveat and the command to just before the boundary, which is where the user typed them. It touches
 * only a run that has exactly that shape: a summary whose parent is the boundary right before it, a caveat whose parent
 * is the summary, a `/compact` command whose parent is the caveat and whose time is earlier than the summary. An
 * automatic compaction has no such command, and a command written after the summary is already in the right place, so
 * both stay as they are. The entries themselves are not edited; only their order is. A list with nothing to move comes
 * back as the same array.
 */
export function placeCompactCommand(messages: LoadedMessageDto[]): LoadedMessageDto[] {
  let result: LoadedMessageDto[] | null = null;

  for (let i = 1; i + 2 < messages.length; i++) {
    const boundary = messages[i - 1];
    const summary = messages[i];
    const caveat = messages[i + 1];
    const command = messages[i + 2];
    if (!isCompactBoundary(boundary) || !boundary.uuid) continue;
    if (!isCompactSummaryEntry(summary) || summary.parentUuid !== boundary.uuid || !summary.uuid) continue;
    if (caveat.type !== LoadedMessageType.User || caveat.parentUuid !== summary.uuid || !caveat.uuid) continue;
    if (!getTextContent(caveat).includes('<local-command-caveat>')) continue;
    if (command.type !== LoadedMessageType.User || command.parentUuid !== caveat.uuid) continue;
    if (!getTextContent(command).includes('<command-name>/compact</command-name>')) continue;
    if (!(timeOf(command) < timeOf(summary))) continue;

    const out = (result ??= [...messages]);
    // boundary, summary, caveat, command  ->  caveat, command, boundary, summary
    out.splice(i - 1, 4, caveat, command, boundary, summary);
    i += 2;
  }
  return result ?? messages;
}
