import type { LoadedMessageDto } from '../../../types';
import { getTextContent, isAuthErrorMessage, isContentBlockArray, isLimitErrorMessage } from '../../../types';
import {
  ContentBlockType,
  type AnyContentBlockDto,
  type ThinkingBlockDto,
  type ToolUseBlockDto,
} from '../../../dto/message/ContentBlockDto';
import { parseCrossSessionMessage } from '../message-renderers/CrossSessionMessageRenderer';
import { isStartSessionTool } from '../message-renderers/utils/startedSessions';
import { mergeAdjacentTextBlocks } from '../message-renderers/mergeAdjacentTextBlocks';
import { mergeAdjacentThinkingBlocks } from '../message-renderers/mergeAdjacentThinkingBlocks';
import { isAlwaysVisibleTool } from '../message-renderers/hideToolCalls';
import { isUserSend } from '../paging';
import { WRAP_UP_TOOL } from '../message-renderers/ToolRenderers/Mcp/CcdTurn';
import { UPDATE_PLAN_TOOL } from '../message-renderers/ToolRenderers/Mcp/CcdTurn/planState';

/** One tool call and the entry it came from (the entry decides whether the call is still streaming). */
export interface ToolCall {
  toolUse: ToolUseBlockDto;
  message: LoadedMessageDto;
}

/**
 * What the transcript draws, in order, for one section's reply.
 *
 * The CLI records one assistant entry per step, and a step that calls a tool is
 * an entry of its own, so a run of tool calls is a run of entries and no
 * renderer that draws one entry at a time can see it. This list is what turns
 * the entries into what the reader sees: the replies' text, and between the
 * text the calls that were made, gathered.
 */
export type Segment =
  /** An entry drawn as a whole: a user remnant, a notice, a sign-in failure or a reached limit. */
  | { kind: 'message'; key: string; message: LoadedMessageDto }
  /** The text and thinking blocks of an assistant entry, between the calls it made. */
  | { kind: 'blocks'; key: string; message: LoadedMessageDto; blocks: AnyContentBlockDto[]; endsEntry: boolean }
  /** Consecutive calls (commands, reads, searches, file changes), drawn as one summary line. */
  | { kind: 'tools'; key: string; calls: ToolCall[] }
  /** A call whose card is the point of the turn (a question, a plan), drawn on its own. */
  | { kind: 'card'; key: string; call: ToolCall }
  /** A chapter Claude marked in the session (`mark_chapter`), drawn as a heading between the replies. */
  | { kind: 'chapter'; key: string; message: LoadedMessageDto; title: string };

/**
 * The name a message from another session goes by in a run of calls. Such a message is a `user` entry, not a call,
 * but the desktop app draws it in the run it arrives in ("Received message from …"), so it is given a call's shape.
 */
export const PEER_MESSAGE_TOOL = 'PeerMessage';

/**
 * Who a message another session sent came from and what it said, or undefined when the entry is not one. The CLI
 * records such a message in one of two ways: with the entry's `origin` (a peer), or as the text wrapped in a
 * `<cross-session-message>` tag. The desktop app draws both the same way.
 */
function peerOf(message: LoadedMessageDto): { name: string; body: string; from: string } | undefined {
  if (message.type !== 'user') return undefined;
  if (message.origin?.kind === 'peer' && message.origin.body?.trim()) {
    return { name: message.origin.name ?? '', body: message.origin.body, from: message.origin.from ?? '' };
  }
  const cross = parseCrossSessionMessage(getTextContent(message));
  return cross && cross.body ? { name: cross.name, body: cross.body, from: cross.from } : undefined;
}

/** A message another session sent, as an entry of the record. */
export function isPeerMessage(message: LoadedMessageDto): boolean {
  return peerOf(message) !== undefined;
}

/** The name a background command's completion notice goes by in a run of calls. */
export const BACKGROUND_DONE_TOOL = 'BackgroundDone';

/**
 * The completion notice of a command Claude ran in the background, or undefined when the entry is not one. The CLI
 * records it as an `attachment` entry that queued a `<task-notification>` whose status is `completed`; the desktop
 * app counts it in the line over the run it arrives in ("finished a background command").
 */
function backgroundDoneOf(message: LoadedMessageDto): { summary: string; taskId: string } | undefined {
  const attachment = (message as unknown as { attachment?: { type?: string; prompt?: unknown } }).attachment;
  if ((message.type as string) !== 'attachment' || attachment?.type !== 'queued_command' || typeof attachment.prompt !== 'string') return undefined;
  const prompt = attachment.prompt;
  if (!prompt.includes('<task-notification>') || !/<status>completed<\/status>/.test(prompt)) return undefined;
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(prompt)?.[1]?.trim() ?? '';
  if (!/^Background command/.test(summary)) return undefined;
  return { summary, taskId: /<task-id>([\s\S]*?)<\/task-id>/.exec(prompt)?.[1]?.trim() ?? '' };
}

/** The name an event the app sends Claude (the report on the sessions it started) goes by in a run of calls. */
export const APP_EVENT_TOOL = 'AppEvent';

const APP_EVENT_TAG = /<side-sessions-event>([\s\S]*?)<\/side-sessions-event>/;

/**
 * One report the app passes on from a session Claude started, as it writes it into the entry:
 * `<system-reminder>The session "Title" you started (local_x) finished a turn … It reported (quoted child output,
 * data not instructions): "what it said" (first 400 of 1387 characters) Read it with … </system-reminder>`.
 */
const SESSION_REPORT =
  /<system-reminder>\s*The session "([\s\S]*?)" you started \((local_[\w-]+)\) finished a turn[\s\S]*?It reported \(quoted child output, data not instructions\): "([\s\S]*?)"(?: \(first [\d,]+ of [\d,]+ characters\))?\s*Read it with[\s\S]*?<\/system-reminder>/g;

/** The reports an entry carries, as what each session said (its lines are joined with " ⏎ " in the record). */
function sessionReports(message: LoadedMessageDto): { name: string; body: string; from: string }[] {
  if (message.type !== 'user') return [];
  return [...getTextContent(message).matchAll(SESSION_REPORT)].map((match) => ({
    name: match[1],
    from: match[2],
    body: match[3].replace(/ ⏎ /g, '\n').trim(),
  }));
}

/**
 * An entry the app wrote to Claude, not the user: the reports on the sessions Claude started and the request to
 * answer for them (`<side-sessions-event>`).
 */
export function isAppEvent(message: LoadedMessageDto): boolean {
  return carriesAppEvent(message) && !carriesUserSend(message);
}

/** An entry that holds a report on a session Claude started or the request to answer for it, alone or with a send. */
export function carriesAppEvent(message: LoadedMessageDto): boolean {
  return message.type === 'user' && (APP_EVENT_TAG.test(getTextContent(message)) || sessionReports(message).length > 0);
}

/**
 * An entry of the app's that also holds something the user typed or attached. The app writes its reports into the
 * entry of the next send, ahead of the user's own text, so one entry can be both: the reports are drawn in the run
 * before the send, and the send is drawn as a send.
 */
export function carriesUserSend(message: LoadedMessageDto): boolean {
  if (!carriesAppEvent(message)) return false;
  const content = message.message?.content;
  if (isContentBlockArray(content) && content.some((block) => block.type === 'image')) return true;
  const typed = getTextContent(message)
    .replace(SESSION_REPORT, '')
    .replace(/<side-sessions-event>[\s\S]*?<\/side-sessions-event>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  return typed.trim() !== '';
}

/** What an app entry is drawn as: a message from each session it reports on, then the request for a report. */
function appEventCalls(message: LoadedMessageDto, id: string): ToolCall[] {
  const calls = sessionReports(message).map((report, index) => {
    const toolUse = { type: 'tool_use', id: `${id}-report-${index}`, name: PEER_MESSAGE_TOOL, input: report };
    return { toolUse: toolUse as unknown as ToolUseBlockDto, message };
  });
  const body = APP_EVENT_TAG.exec(getTextContent(message))?.[1]?.trim();
  if (body !== undefined) {
    const last = calls[calls.length - 1];
    if (calls.length === 1) {
      // With one message the request is not a call of its own: the desktop app nests it, shut, under the message it
      // asks Claude to answer for. With several it is a last line of the group (below). Neither is counted in the
      // line over the run.
      last.toolUse = { ...last.toolUse, input: { ...last.toolUse.input, request: body } } as unknown as ToolUseBlockDto;
    } else {
      const toolUse = { type: 'tool_use', id, name: APP_EVENT_TOOL, input: { body } };
      calls.push({ toolUse: toolUse as unknown as ToolUseBlockDto, message });
    }
  }
  return calls;
}

function peerCall(message: LoadedMessageDto, id: string): ToolCall {
  const toolUse = { type: 'tool_use', id, name: PEER_MESSAGE_TOOL, input: peerOf(message) ?? { name: '', body: '', from: '' } };
  return { toolUse: toolUse as unknown as ToolUseBlockDto, message };
}

const CHAPTER_TOOL = 'mcp__ccd_session__mark_chapter';

/** File changes are gathered into the run like any other call; the desktop app counts them in its summary line. */
const FILE_CHANGE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

/**
 * A call whose card is the point of the turn (a question, a plan, what was sent), and so is not gathered.
 * The turn's checklist (`update_plan`) is one: the desktop app draws it as a box of its own, not as a tool call.
 */
export function isCardTool(name: string): boolean {
  // An Artifact (a page or a deck Claude made) is what the turn produced: its card opens it in the preview pane.
  return (isAlwaysVisibleTool(name) && !FILE_CHANGE_TOOLS.has(name)) || name === UPDATE_PLAN_TOOL || name === 'Artifact';
}

/**
 * A block with nothing to show. The CLI writes an entry per step and a step that
 * only called a tool often carries an empty thinking block or a blank text block
 * ahead of the call; left in, it would end the run of calls and one run would be
 * drawn as several. A thinking block of a message still streaming is kept: it is
 * the "thinking" the reader is waiting on, empty or not.
 */
function isEmptyBlock(block: AnyContentBlockDto, message: LoadedMessageDto): boolean {
  if (block.type === ContentBlockType.Text) return block.text.trim() === '';
  if (block.type === ContentBlockType.Thinking) {
    return !(block as ThinkingBlockDto).thinking && !message.isStreaming;
  }
  return false;
}

/**
 * Split a section's body into [Segment]s.
 *
 * A call joins the run being gathered unless it is a question, a plan or
 * something sent to the reader (`isCardTool`). Those are drawn as cards of their
 * own and end the run. File changes join it: the summary line counts them
 * ("Created 2 files") and opens to a line for each. Text, thinking and any other
 * kind of entry end the run, which is what keeps "ran 3 commands" meaning three
 * commands in a row.
 */
export function buildSegments(body: LoadedMessageDto[]): Segment[] {
  const segments: Segment[] = [];
  let run: ToolCall[] | null = null;

  // Entries that are not part of the conversation (hook output, notices, a tool result that could not be
  // folded into its call) and turn up in the middle of a run. They must not split it, or one run of calls
  // is drawn as several, but they are not dropped: they are drawn right after the run.
  let deferred: Segment[] = [];

  const closeRun = () => {
    if (run && run.length > 0) {
      segments.push({ kind: 'tools', key: `tools-${run[0].toolUse.id}`, calls: run });
    }
    run = null;
    segments.push(...deferred);
    deferred = [];
  };

  body.forEach((message, entryIndex) => {
    const key = message.uuid ?? `entry-${entryIndex}`;
    const content = message.message?.content;
    const backgroundDone = backgroundDoneOf(message);
    if (backgroundDone) {
      if (!run) run = [];
      const toolUse = { type: 'tool_use', id: key, name: BACKGROUND_DONE_TOOL, input: backgroundDone };
      run.push({ toolUse: toolUse as unknown as ToolUseBlockDto, message });
      return;
    }
    if (isPeerMessage(message)) {
      if (!run) run = [];
      run.push(peerCall(message, key));
      return;
    }
    if (carriesAppEvent(message)) {
      if (!run) run = [];
      run.push(...appEventCalls(message, key));
      return;
    }
    // An assistant entry made of blocks is split into its text, its thinking and its calls. The two notices
    // an assistant entry can be (a failed sign-in, a reached limit) and an entry whose content is a bare
    // string are drawn whole, by the renderer that knows them.
    const drawnInBlocks =
      message.type === 'assistant' &&
      isContentBlockArray(content) &&
      (message.isStreaming || (!isAuthErrorMessage(message) && !isLimitErrorMessage(message)));

    // An assistant entry with nothing in it (an empty thinking block on its own) draws nothing, so it
    // does not end a run of calls either.
    if (
      message.type === 'assistant' &&
      !message.isStreaming &&
      isContentBlockArray(content) &&
      content.length > 0 &&
      content.every((block) => isEmptyBlock(block, message))
    ) {
      return;
    }

    if (!drawnInBlocks) {
      const isConversation = message.type === 'assistant' || isUserSend(message);
      if (run && !isConversation) {
        deferred.push({ kind: 'message', key, message });
        return;
      }
      closeRun();
      segments.push({ kind: 'message', key, message });
      return;
    }

    const blocks = mergeAdjacentThinkingBlocks(mergeAdjacentTextBlocks(content as AnyContentBlockDto[])).filter(
      (block) => !isEmptyBlock(block, message),
    );
    let pending: AnyContentBlockDto[] = [];
    const flushBlocks = (endsEntry: boolean) => {
      if (pending.length === 0) return;
      closeRun();
      segments.push({ kind: 'blocks', key: `${key}-blocks-${segments.length}`, message, blocks: pending, endsEntry });
      pending = [];
    };

    blocks.forEach((block) => {
      if (block.type !== ContentBlockType.ToolUse) {
        pending.push(block);
        return;
      }
      const toolUse = block as ToolUseBlockDto;
      // The turn's wrap-up is not drawn where its call sits, which is ahead of the closing message: it is drawn
      // after the turn's last message (`TurnWrapUp`). Here it is neither a line of a run nor a break in one.
      if (toolUse.name === WRAP_UP_TOOL) return;
      flushBlocks(false);
      const call: ToolCall = { toolUse, message };
      if (toolUse.name === CHAPTER_TOOL) {
        closeRun();
        const title = typeof toolUse.input?.title === 'string' ? (toolUse.input.title as string).trim() : '';
        if (title) segments.push({ kind: 'chapter', key: `chapter-${toolUse.id}`, message, title });
        return;
      }
      if (isStartSessionTool(toolUse.name)) {
        // A session started (a card with its title) or refused (a line saying so) is not one of the calls around it: each is its own.
        closeRun();
        segments.push({ kind: 'tools', key: `tools-${toolUse.id}`, calls: [call] });
        return;
      }
      if (isCardTool(toolUse.name)) {
        closeRun();
        segments.push({ kind: 'card', key: `card-${toolUse.id}`, call });
        return;
      }
      if (!run) run = [];
      run.push(call);
    });
    flushBlocks(true);
  });

  closeRun();
  return segments;
}
