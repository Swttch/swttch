import type { TFunction } from 'i18next';
import type { LoadedMessageDto } from '../../../types';
import { parseSessionDelivery } from '../message-renderers/ToolRenderers/SendMessageRenderer';
import { toolResultText, toolStatus } from '../message-renderers/ToolRenderers/common/toolStatus';
import { APP_EVENT_TOOL, PEER_MESSAGE_TOOL, type ToolCall } from './buildSegments';
import { changedLineCounts } from './fileDiff';

/** The kinds of call the summary line tells apart. Anything else is counted as "other actions". */
export type ToolKind =
  | 'command'
  | 'read'
  | 'searchCode'
  | 'searchFiles'
  | 'write'
  | 'edit'
  | 'pageScript'
  | 'click'
  | 'doubleClick'
  | 'hover'
  | 'capture'
  | 'pageOpen'
  | 'resize'
  | 'sessionRename'
  | 'sessionStart'
  | 'sessionList'
  | 'sessionMessage'
  | 'receivedMessage'
  | 'toolLoad'
  | 'sessionArchive'
  | 'appRequest'
  | 'skill'
  | 'sessionLookup'
  | 'sessionRead'
  | 'messageSent'
  | 'other';

const BROWSER_TOOL = /^mcp__(?:Claude_Browser|claude-in-chrome)__(.+)$/;

/** Which browser tool a call is, by its short name (`javascript_tool`, `computer`), or '' for any other call. */
export function browserToolOf(name: string): string {
  return BROWSER_TOOL.exec(name)?.[1] ?? '';
}

/** What a call to the browser pane's `computer` tool does, from its `action` input. */
function computerKind(action: unknown): ToolKind {
  switch (action) {
    case 'left_click':
    case 'right_click':
      return 'click';
    case 'double_click':
    case 'triple_click':
      return 'doubleClick';
    case 'hover':
      return 'hover';
    case 'screenshot':
    case 'zoom':
      return 'capture';
    default:
      return 'other';
  }
}

/** The sessions' own tools of the desktop app (`mcp__ccd_session__…`, `mcp__ccd_session_mgmt__…`), by their short name. */
const SESSION_TOOL = /^mcp__ccd_session(?:_mgmt)?__(.+)$/;

export function toolKindOf(call: ToolCall): ToolKind {
  switch (SESSION_TOOL.exec(call.toolUse.name)?.[1]) {
    case 'set_session_title':
      return 'sessionRename';
    case 'start_session':
      return 'sessionStart';
    case 'list_sessions':
      return 'sessionList';
    case 'send_message':
      return 'sessionMessage';
    case 'archive_session':
      return 'sessionArchive';
    case 'get_session':
      return 'sessionLookup';
    case 'list_events':
      return 'sessionRead';
  }
  switch (call.toolUse.name) {
    case PEER_MESSAGE_TOOL:
      return 'receivedMessage';
    case APP_EVENT_TOOL:
      return 'appRequest';
    case 'ToolSearch':
      return 'toolLoad';
    case 'Skill':
      return 'skill';
    case 'SendMessage':
      return 'messageSent';
    case 'Bash':
      return 'command';
    case 'Read':
      return 'read';
    case 'Grep':
      return 'searchCode';
    case 'Glob':
      return 'searchFiles';
    case 'Write':
      return 'write';
    case 'Edit':
    case 'NotebookEdit':
      return 'edit';
  }
  switch (browserToolOf(call.toolUse.name)) {
    case 'javascript_tool':
      return 'pageScript';
    case 'computer':
      return computerKind(call.toolUse.input?.action);
    case 'navigate':
    case 'preview_start':
      return 'pageOpen';
    case 'resize_window':
      return 'resize';
    default:
      return 'other';
  }
}

/** The last part of a path, whichever way it is written. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function inputString(call: ToolCall, key: string): string {
  const value = call.toolUse.input?.[key];
  return typeof value === 'string' ? value : '';
}

/** The path a call is about, or '' when the call names none. */
export function pathOf(call: ToolCall): string {
  return inputString(call, 'file_path') || inputString(call, 'notebook_path');
}

function lineCount(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

/** Lines a file change put in and took out, counted from what the call sent. */
export interface LineStats {
  added: number;
  removed: number;
}

export function lineStatsOf(call: ToolCall): LineStats {
  switch (call.toolUse.name) {
    case 'Write':
    case 'Edit': {
      // Counted from the diff, so the lines an edit left as they were (they are in `old_string` and `new_string`
      // alike) are neither put in nor taken out, as the desktop app counts them.
      const counts = changedLineCounts(call);
      if (counts.added > 0 || counts.removed > 0) return counts;
      return { added: lineCount(inputString(call, 'new_string')), removed: lineCount(inputString(call, 'old_string')) };
    }
    case 'NotebookEdit':
      return { added: lineCount(inputString(call, 'new_source')), removed: 0 };
    default:
      return { added: 0, removed: 0 };
  }
}

export function sumLineStats(calls: ToolCall[]): LineStats {
  return calls.reduce(
    (sum, call) => {
      const stats = lineStatsOf(call);
      return { added: sum.added + stats.added, removed: sum.removed + stats.removed };
    },
    { added: 0, removed: 0 },
  );
}

/** Whether the call ended in an error. A call that is still running, or that the user declined, has not failed. */
export function hasFailed(call: ToolCall): boolean {
  return toolStatus(call.toolUse.tool_result as LoadedMessageDto | undefined, call.message.isStreaming ?? false) === 'error';
}

/**
 * The calls of a group as the lines it shows: every call is one line, except that the edits of one file, and
 * the creations of one file, are one line between them (at the place of the first), the way the desktop app draws
 * "Edited x.ts +30 −5" for a file it changed twice. A line holds its calls in the order they were made.
 */
export function groupIntoRows(calls: ToolCall[]): ToolCall[][] {
  const rows: ToolCall[][] = [];
  const byFile = new Map<string, ToolCall[]>();
  for (const call of calls) {
    const kind = toolKindOf(call);
    const path = pathOf(call);
    const mergeable = (kind === 'edit' || kind === 'write') && path !== '';
    const key = `${kind}\n${path}`;
    const row = mergeable ? byFile.get(key) : undefined;
    if (row) {
      row.push(call);
      continue;
    }
    const fresh = [call];
    rows.push(fresh);
    if (mergeable) byFile.set(key, fresh);
  }
  return rows;
}

/** Whether the call has no result yet and its message is still streaming in. */
export function isRunning(call: ToolCall): boolean {
  return !call.toolUse.tool_result && (call.message.isStreaming ?? false);
}

/**
 * The site a browser call ran on, as the host name ("localhost"). The browser tools end their result with the
 * tabs that were open, each as `tabId n: "title" ("url")`, and the first of those is the page the call acted on.
 */
export function siteOf(call: ToolCall): string {
  const text = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined);
  const url = /\("(https?:\/\/[^"\s)]+)"\)/.exec(text)?.[1];
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** `mcp__ccd_session_mgmt__set_session_title` as `ccd session mgmt: set session title`; a plain name stays as it is. */
export function toolNameLabel(name: string): string {
  const match = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!match) return name;
  return `${match[1].replace(/_/g, ' ')}: ${match[2].replace(/_/g, ' ')}`;
}

/** The tools a `ToolSearch` call asked for ("select:A,B"), or what it searched for when it did not name them. */
function loadedToolNames(call: ToolCall): string {
  const query = inputString(call, 'query').trim();
  const names = query.startsWith('select:') ? query.slice('select:'.length).split(',') : [query];
  return names.map((name) => toolNameLabel(name.trim())).filter(Boolean).join(', ');
}

/** The first group of `pattern` in what a call answered, with a JSON string's escapes undone; '' when it is not there. */
function resultField(call: ToolCall, pattern: RegExp): string {
  const raw = pattern.exec(toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined))?.[1] ?? '';
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

/** The title of the session an `archive_session` call archived, from its answer ("Archived session local_x ("Title")."). */
function archivedTitle(call: ToolCall): string {
  const text = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined).trim();
  return /\("([\s\S]*)"\)\.?$/.exec(text)?.[1] ?? '';
}

/** The title of the session a `SendMessage` went to, when the answer names it. */
export function sentTo(call: ToolCall): string {
  return parseSessionDelivery(toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined)).title ?? '';
}

/**
 * What renaming a session changed, read from the answer ("Renamed session local_x to "New" (was "Old")"):
 * the title it had and the one it has now. The old one is missing when the answer does not say it.
 */
export function renameOutcome(call: ToolCall): { before: string; after: string } {
  const text = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined);
  const match = /\bto "([\s\S]*?)"(?: \(was "([\s\S]*?)"\))?\.?\s*$/.exec(text.trim());
  return { before: match?.[2] ?? '', after: match?.[1] ?? inputString(call, 'title') };
}

/** Stands in for a file's name while a label is built, so the name can be drawn as a link where it falls. */
const NAME_TOKEN = '\u0001';

/** A row's label in pieces: text, the file named in it (if any), text after it. */
export interface RowLabel {
  before: string;
  fileName: string;
  after: string;
  /** What the call was about when that is not a file (a session's title, who a message came from), drawn after the text. */
  meta?: string;
}

/**
 * The short stand-in for a command the desktop app writes in its row ("cat …"): the first words of the command
 * that are plain words, and an ellipsis when there is more after them. Nothing when the command does not begin
 * with a plain word (a path, a quote, a pipe), and the row says "a command" then.
 */
export function commandStandIn(command: string): string {
  const firstLine = command.trim().split('\n')[0] ?? '';
  const words = firstLine.split(/ +/).filter(Boolean);
  const taken: string[] = [];
  for (const word of words) {
    if (taken.length === 3 || !/^[A-Za-z][\w.+/@:-]*$/.test(word)) break;
    taken.push(word);
  }
  if (taken.length === 0) return '';
  const more = taken.length < words.length || command.trim().includes('\n');
  return more ? `${taken.join(' ')}…` : taken.join(' ');
}

function withFile(key: string, call: ToolCall, t: TFunction): RowLabel {
  const path = pathOf(call);
  const text = t(key, { ns: 'chat', name: path ? NAME_TOKEN : call.toolUse.name });
  if (!path) return { before: text, fileName: '', after: '' };
  const at = text.indexOf(NAME_TOKEN);
  return { before: text.slice(0, at), fileName: baseName(path), after: text.slice(at + 1) };
}

function plain(text: string): RowLabel {
  return { before: text, fileName: '', after: '' };
}

/**
 * What one row of an open group says about its call.
 *
 * A command that is still running, or that failed, says "Running command": the desktop app leaves a failed one
 * at its running wording and marks it failed beside it, so it is not reported as done when it was not.
 */
export function rowLabel(call: ToolCall, t: TFunction): RowLabel {
  const kind = toolKindOf(call);
  switch (kind) {
    case 'command': {
      const unfinished = isRunning(call) || hasFailed(call);
      // Without a description of its own the row says what the command begins with ("Ran cat …"), as the desktop app does.
      const standIn = inputString(call, 'description').trim() === '' ? commandStandIn(inputString(call, 'command')) : '';
      if (standIn) return plain(t(unfinished ? 'transcript.tools.runningCommandOf' : 'transcript.tools.ranCommandOf', { ns: 'chat', what: standIn }));
      return plain(t(unfinished ? 'transcript.tools.runningCommand' : 'transcript.tools.ranCommand', { ns: 'chat' }));
    }
    case 'sessionRename': {
      const own = inputString(call, 'session_id') === '';
      return { ...plain(t(own ? 'transcript.tools.renamedSession' : 'transcript.tools.renamedAnotherSession', { ns: 'chat' })), meta: inputString(call, 'title') };
    }
    case 'sessionStart':
      // A start the app refused ("start sessions only on the user's own words") is a line of its own that says so.
      return { ...plain(t(hasFailed(call) ? 'transcript.tools.sessionNotStarted' : 'transcript.tools.startedSession', { ns: 'chat' })), meta: inputString(call, 'title') };
    case 'skill':
      return { ...plain(t('transcript.tools.skillRan', { ns: 'chat' })), meta: inputString(call, 'skill') ? `/${inputString(call, 'skill')}` : '' };
    case 'sessionLookup':
      return { ...plain(t('transcript.tools.sessionLookedUp', { ns: 'chat' })), meta: resultField(call, /"title":\s*"((?:[^"\\]|\\.)*)"/) };
    case 'sessionRead':
      return { ...plain(t('transcript.tools.sessionTranscriptRead', { ns: 'chat' })), meta: resultField(call, /Session "([\s\S]*?)" \(/) };
    case 'sessionList':
      return plain(t('transcript.tools.listedSessions', { ns: 'chat' }));
    case 'sessionMessage':
      return plain(t('transcript.tools.messagedAnotherSession', { ns: 'chat' }));
    case 'receivedMessage':
      return { ...plain(t('transcript.tools.receivedMessageFrom', { ns: 'chat' })), meta: inputString(call, 'name') };
    case 'sessionArchive':
      return { ...plain(t('transcript.tools.archivedSession', { ns: 'chat' })), meta: archivedTitle(call) };
    case 'appRequest':
      return plain(t('transcript.tools.appAskedReport', { ns: 'chat' }));
    case 'toolLoad':
      return { ...plain(t('transcript.tools.loadedTools', { ns: 'chat' })), meta: loadedToolNames(call) };
    case 'messageSent':
      return { ...plain(t('sendMessage.sent', { ns: 'chatTools' })), meta: sentTo(call) || t('sendMessage.anotherSession', { ns: 'chatTools' }) };
    case 'read':
      return withFile('transcript.tools.readFile', call, t);
    case 'write':
      return withFile('transcript.tools.createdFile', call, t);
    case 'edit':
      return withFile('transcript.tools.editedFile', call, t);
    case 'searchCode':
      return plain(t('transcript.tools.searchedCode', { ns: 'chat' }));
    case 'searchFiles':
      return plain(t('transcript.tools.searchedFiles', { ns: 'chat' }));
    case 'resize': {
      const width = call.toolUse.input?.width;
      const height = call.toolUse.input?.height;
      const preset = call.toolUse.input?.preset;
      const verb = t('transcript.tools.resized', { ns: 'chat' });
      if (width !== undefined && height !== undefined) {
        return plain(`${verb} ${t('transcript.tools.resizedTo', { ns: 'chat', width: String(width), height: String(height) })}`);
      }
      return plain(typeof preset === 'string' ? `${verb} ${t('transcript.tools.resizedPreset', { ns: 'chat', preset })}` : verb);
    }
    case 'pageScript': {
      // A script that failed stays at its running wording, like a command: it did not finish.
      const verb = t(isRunning(call) || hasFailed(call) ? 'transcript.tools.pageScriptRunning' : 'transcript.tools.pageScript', { ns: 'chat' });
      const site = siteOf(call);
      return plain(site ? `${verb} ${t('transcript.tools.onSite', { ns: 'chat', site })}` : verb);
    }
    case 'click':
      return plain(withPosition(t('transcript.tools.clicked', { ns: 'chat' }), call, t));
    case 'doubleClick':
      return plain(withPosition(t('transcript.tools.doubleClicked', { ns: 'chat' }), call, t));
    case 'hover':
      return plain(withPosition(t('transcript.tools.hovered', { ns: 'chat' }), call, t));
    case 'capture':
      return plain(t('transcript.tools.capturedPage', { ns: 'chat' }));
    case 'pageOpen':
      return plain(t('transcript.tools.pageOpened', { ns: 'chat' }));
    default:
      return plain(browserToolOf(call.toolUse.name) || call.toolUse.name);
  }
}

/** What a kind of call is counted by: files by their path (one file edited five times is one file), the rest by call. */
function countKey(call: ToolCall, kind: ToolKind): string {
  if (kind === 'read' || kind === 'write' || kind === 'edit') return pathOf(call) || call.toolUse.id;
  return call.toolUse.id;
}

/** The kinds that say what happened on a page; each is a phrase on its own, counted as "n times". */
const PAGE_KINDS = new Set<ToolKind>(['pageScript', 'click', 'doubleClick', 'hover', 'capture', 'pageOpen', 'resize']);

/**
 * The line over a group of calls: what kinds there were, in the order each first came up, joined by commas, and
 * after them how many calls failed.
 *
 * A kind that touched one file names it ("Edited cli-update.ts"); several are counted ("Edited 2 files"). Reading
 * and editing the same single file is one phrase, "Read and edited X". What happened on a page is a phrase with a
 * count of times when there was more than one ("Clicked 3 times"). Calls with no phrase of their own are counted
 * together as other actions.
 */
export function groupLabel(calls: ToolCall[], t: TFunction): string {
  const order: ToolKind[] = [];
  const keys = new Map<ToolKind, Set<string>>();
  const first = new Map<ToolKind, ToolCall>();
  for (const call of calls) {
    const kind = toolKindOf(call);
    if (!keys.has(kind)) {
      order.push(kind);
      keys.set(kind, new Set());
      first.set(kind, call);
    }
    keys.get(kind)?.add(countKey(call, kind));
  }

  const countOf = (kind: ToolKind) => keys.get(kind)?.size ?? 0;
  const onlyFile = (kind: ToolKind) => (countOf(kind) === 1 ? pathOf(first.get(kind) as ToolCall) : '');
  const readPath = onlyFile('read');
  const readAndEdited = readPath !== '' && readPath === onlyFile('edit');
  const oneRow = (kind: ToolKind) => {
    const label = rowLabel(first.get(kind) as ToolCall, t);
    return label.before + label.fileName + label.after;
  };

  // The phrases about other sessions come after the rest: "Received 4 messages, Ran 1 command, Archived session 4 times"
  // is how the desktop app writes a run that archived sessions and then ran a command.
  // The line over a group does not follow the order of the rows: messages received first, then what was created and
  // commands, then the rest as it came, then skills, loaded tools, the phrases about sessions, and "other" last.
  const rank = (kind: ToolKind): number => {
    switch (kind) {
      case 'receivedMessage':
        return 0;
      case 'write':
        return 1;
      case 'command':
        return 2;
      case 'skill':
        return 4;
      case 'toolLoad':
        return 5;
      case 'sessionRename':
      case 'sessionArchive':
      case 'sessionStart':
      case 'sessionList':
      case 'sessionMessage':
      case 'sessionLookup':
      case 'sessionRead':
        return 6;
      case 'other':
        return 9;
      default:
        return 3;
    }
  };
  order.sort((a, b) => rank(a) - rank(b));

  const parts = order
    .filter((kind) => !(readAndEdited && kind === 'edit'))
    .map((kind) => {
      const count = countOf(kind);
      switch (kind) {
        case 'command':
          return t('transcript.tools.ranCommands', { ns: 'chat', count });
        case 'read':
          if (readAndEdited) return t('transcript.tools.readAndEditedFile', { ns: 'chat', name: baseName(readPath) });
          return count === 1 ? oneRow(kind) : t('transcript.tools.readFiles', { ns: 'chat', count });
        case 'searchCode':
          return t('transcript.tools.searchedCode', { ns: 'chat' });
        case 'searchFiles':
          return t('transcript.tools.searchedFiles', { ns: 'chat' });
        case 'write':
          // A group counts its files even when there is one: "Created 1 file", as the desktop app says it.
          return t('transcript.tools.createdFiles', { ns: 'chat', count });
        case 'edit':
          return t('transcript.tools.editedFiles', { ns: 'chat', count });
        case 'receivedMessage':
          return t('transcript.tools.receivedMessages', { ns: 'chat', count });
        case 'toolLoad':
          return t('transcript.tools.loadedTools', { ns: 'chat' });
        case 'messageSent':
          return t('sendMessage.sent', { ns: 'chatTools' });
        case 'appRequest':
          // The app's request for a report is not counted in the line over the group: the desktop app leaves it out.
          return '';
        case 'skill':
        case 'sessionLookup':
        case 'sessionRead':
        case 'sessionRename':
        case 'sessionArchive':
        case 'sessionStart':
        case 'sessionList':
        case 'sessionMessage': {
          // A phrase of its own: the title it names is in the row, not in the line over the group. Said "n times" when repeated.
          const phrase = rowLabel(first.get(kind) as ToolCall, t).before;
          return count > 1 ? t('transcript.tools.times', { ns: 'chat', label: phrase, count }) : phrase;
        }
        case 'other':
          return t('transcript.tools.otherActions', { ns: 'chat', count });
        default: {
          // A page phrase carries no site here: the line is over calls that may be on different pages.
          const unfinished = (calls.filter((call) => toolKindOf(call) === kind)).some((call) => isRunning(call) || hasFailed(call));
          const phrase = pageGroupPhrase(kind, t, unfinished);
          return count > 1 && PAGE_KINDS.has(kind) ? t('transcript.tools.times', { ns: 'chat', label: phrase, count }) : phrase;
        }
      }
    });

  const failed = calls.filter(hasFailed).length;
  if (failed > 0) parts.push(t('transcript.tools.failed', { ns: 'chat', count: failed }));
  return parts.filter(Boolean).join(', ');
}

function pageGroupPhrase(kind: ToolKind, t: TFunction, unfinished: boolean): string {
  switch (kind) {
    case 'pageScript':
      return t(unfinished ? 'transcript.tools.pageScriptRunning' : 'transcript.tools.pageScript', { ns: 'chat' });
    case 'resize':
      return t('transcript.tools.resized', { ns: 'chat' });
    case 'click':
      return t('transcript.tools.clicked', { ns: 'chat' });
    case 'doubleClick':
      return t('transcript.tools.doubleClicked', { ns: 'chat' });
    case 'hover':
      return t('transcript.tools.hovered', { ns: 'chat' });
    case 'capture':
      return t('transcript.tools.capturedPage', { ns: 'chat' });
    default:
      return t('transcript.tools.pageOpened', { ns: 'chat' });
  }
}

/** The pictures a call returned (a screenshot), as URLs the page can draw. */
export { toolResultImages as imagesOfResult } from "../message-renderers/ToolRenderers/common/toolResultImages";

/**
 * Whether a row can be opened. Resizing the browser to a size that was named says everything in its line
 * ("Resized browser to 701 x 901 pixels"), and the desktop app gives that line nothing to open.
 */
export function isExpandable(call: ToolCall): boolean {
  switch (toolKindOf(call)) {
    case 'resize':
      return call.toolUse.input?.width === undefined || call.toolUse.input?.height === undefined;
    case 'click':
    case 'doubleClick':
    case 'hover':
      // "Clicked at 190, 213" says everything a click did.
      return coordinateOf(call) === null;
    default:
      return true;
  }
}

/** The point on the page a click or a hover was aimed at, from the call's `coordinate` input. */
function coordinateOf(call: ToolCall): [number, number] | null {
  const point = call.toolUse.input?.coordinate;
  if (Array.isArray(point) && point.length === 2 && point.every((n) => typeof n === 'number')) {
    return [point[0] as number, point[1] as number];
  }
  return null;
}

/** "Clicked" becomes "Clicked at 190, 213" when the call says where. */
function withPosition(verb: string, call: ToolCall, t: TFunction): string {
  const point = coordinateOf(call);
  if (!point) return verb;
  return `${verb} ${t('transcript.tools.atPosition', { ns: 'chat', x: String(Math.round(point[0])), y: String(Math.round(point[1])) })}`;
}
