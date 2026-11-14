import { Fragment, useMemo } from 'react';
import { openChatFile } from '@/utils/openChatFile';
import toast from 'react-hot-toast';
import { ClipboardDocumentIcon } from '@heroicons/react/20/solid';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { DiffLineType, type DiffLine } from '../message-renderers/ToolRenderers/EditRenderer';
import { HighlightedCode } from '../message-renderers/ToolRenderers/Mcp/Generic/HighlightedCode';
import type { ToolCall } from './buildSegments';
import { diffLinesOf } from './fileDiff';
import { hasFailed } from './toolSummary';
import { toolResultText } from '../message-renderers/ToolRenderers/common/toolStatus';
import type { LoadedMessageDto } from '@/types';
import { markHunk, type MarkedLine } from '../diffMarks';
import { pathOf } from './toolSummary';

/** A created file is a window onto its start: the real length is in its row's line counts. */
const MAX_SHOWN_LINES = 200;

/** The language the highlighter is asked for, from the file's extension; nothing it does not know. */
const LANGUAGE_OF_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  py: 'python',
  kt: 'kotlin',
  kts: 'kotlin',
  java: 'java',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  sql: 'sql',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
};

function languageOf(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_OF_EXTENSION[extension] ?? 'text';
}

/** `/Users/me/Projects/x/y.ts` as `~/Projects/x/y.ts`, the way the desktop app writes a path under the home folder. */
function withHomeAsTilde(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');
}

/**
 * The path over a file's changes. It is cut in the middle when it is too long for the line: the end,
 * which names the file, always stays whole, and what is cut is the folders before it.
 */
function PathLine({ path }: { path: string }) {
  const { t } = useTranslation('chat');
  const shown = withHomeAsTilde(path);
  const cut = shown.lastIndexOf('/') + 1;
  return (
    <div dir="ltr" className="group mb-[0.7625rem] flex min-w-0 items-center gap-2 text-[0.9rem] text-text-primary">
      {/* The whole path is in the tooltip: the line itself may have cut the folders out of the middle. */}
      <Tooltip content={path} placement="top">
        <div role="link" tabIndex={0} onClick={() => void openChatFile(path)} className="flex min-w-0 cursor-pointer hover:underline">
          <span className="min-w-0 truncate">{shown.slice(0, cut)}</span>
          <span className="flex-shrink-0">{shown.slice(cut)}</span>
        </div>
      </Tooltip>
      {/* Copies the whole path, not the shortened one. Shown while the pointer is on the line. */}
      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(path).then(
            () => toast.success(t('sendActions.copyDone')),
            () => toast.error(t('sendActions.copyFailed')),
          )
        }
        className="flex-shrink-0 rounded p-0.5 text-[var(--tr-muted)] opacity-0 hover:text-[var(--tr-text)] focus-visible:opacity-100 group-hover:opacity-100"
        aria-label={t('sendActions.copyMessage')}
      >
        <ClipboardDocumentIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// The same colours as the permission card's change block (measured on the desktop app's frames).
const ROW_TINT: Record<DiffLineType, string> = {
  [DiffLineType.Add]: 'bg-[rgb(37,56,38)]',
  [DiffLineType.Delete]: 'bg-[rgb(44,28,30)]',
  [DiffLineType.Context]: '',
};

/** The bar at a changed line's left edge: solid green for an added line, hatched pink for a removed one. */
const ROW_BAR: Record<DiffLineType, string> = {
  [DiffLineType.Add]: 'bg-[rgb(55,169,68)]',
  [DiffLineType.Delete]: 'bg-[repeating-linear-gradient(135deg,rgb(206,97,118)_0_2px,rgb(94,1,20)_2px_4px)]',
  [DiffLineType.Context]: '',
};

const CHIP: Record<DiffLineType, string> = {
  [DiffLineType.Add]: 'bg-[rgb(44,84,44)]',
  [DiffLineType.Delete]: 'bg-[rgb(96,26,44)]',
  [DiffLineType.Context]: '',
};

/**
 * The chips of the changed words: a hunk's removed lines and added lines are paired from the top, and inside a
 * pair the words the two lines do not share are marked. A line with no partner has none.
 */
function chipMarks(lines: DiffLine[]): Array<MarkedLine | null> {
  const marks: Array<MarkedLine | null> = lines.map(() => null);
  let index = 0;
  while (index < lines.length) {
    if (lines[index].type !== DiffLineType.Delete) {
      index++;
      continue;
    }
    const removedFrom = index;
    while (index < lines.length && lines[index].type === DiffLineType.Delete) index++;
    const addedFrom = index;
    while (index < lines.length && lines[index].type === DiffLineType.Add) index++;
    const hunk = markHunk(
      lines.slice(removedFrom, addedFrom).map((line) => line.content),
      lines.slice(addedFrom, index).map((line) => line.content),
    );
    hunk.removed.forEach((marked, offset) => (marks[removedFrom + offset] = marked));
    hunk.added.forEach((marked, offset) => (marks[addedFrom + offset] = marked));
  }
  return marks;
}

function MarkedText({ marked, chip }: { marked: MarkedLine; chip: string }) {
  return (
    <>
      {marked.tokens.map((token, index) =>
        marked.marks[index] ? (
          <span key={index} className={`rounded-[0.1875rem] px-[0.125rem] ${chip}`}>
            {token}
          </span>
        ) : (
          <Fragment key={index}>{token}</Fragment>
        ),
      )}
    </>
  );
}

function DiffRow({ line, marked, language }: { line: DiffLine; marked: MarkedLine | null; language: string }) {
  // px are before the page's 0.9 zoom. From the desktop app's frames: the number ends 40px from the box's left edge and the
  // text starts at 57px (44.4 and 63.3 here), the bar is 7px wide.
  const hasChip = marked !== null && marked.marks.some(Boolean);
  return (
    <div className={`flex ${ROW_TINT[line.type]}`}>
      <span className={`w-[0.4375rem] flex-shrink-0 ${ROW_BAR[line.type]}`} />
      <span className="w-[2.2313rem] flex-shrink-0 select-none text-end text-text-secondary">{line.newNo ?? line.oldNo}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words ps-[1.05rem] pe-3">
        {hasChip ? (
          <MarkedText marked={marked} chip={CHIP[line.type]} />
        ) : (
          <HighlightedCode text={line.content} language={language} />
        )}
      </span>
    </div>
  );
}

/**
 * What a file change shows once its row is open, the way the desktop app draws it: the file's path, and under it
 * the changed lines in a box, each with its number, the changed ones tinted and marked at their left edge.
 * There is no title over it and no "modified" caption: the row it opens from already says what happened.
 */
export function FileChangeDetail({ calls, inBox = false }: { calls: ToolCall[]; inBox?: boolean }) {
  return (
    <>
      {calls.map((call) => (
        <OneChange key={call.toolUse.id} call={call} inBox={inBox} />
      ))}
    </>
  );
}

/** What the CLI answered a failed change with, without the tags it wraps an error in. */
function errorTextOf(call: ToolCall): string {
  const raw = toolResultText(call.toolUse.tool_result as LoadedMessageDto | undefined);
  return raw.replace(/<\/?tool_use_error>/g, '').trim();
}

/** One call's path and changed lines. A file changed twice shows two of these, one after the other. */
function OneChange({ call, inBox }: { call: ToolCall; inBox: boolean }) {
  const { t } = useTranslation('chat');
  const failed = hasFailed(call);
  const errorText = failed ? errorTextOf(call) : '';
  const path = pathOf(call);
  const lines = useMemo(() => diffLinesOf(call, MAX_SHOWN_LINES), [call]);
  const marks = useMemo(() => chipMarks(lines), [lines]);
  const language = languageOf(path);
  // The path and the box sit in a card of their own: 12px in on the sides and above, 8px under (on screen). Inside a
  // group's box they stand bare: the group's box is the card (measured on the desktop app's failed edit).
  return (
    <div className={inBox ? 'pb-3 pt-1' : 'mb-3 mt-1 rounded-[0.8125rem] border border-text-primary/[0.05] px-[0.6625rem] pb-[0.8063rem] pt-[1.0375rem]'}>
      <PathLine path={path} />
      {lines.length > 0 && (
        <div
          dir="ltr"
          className="max-h-[24rem] overflow-y-auto rounded-[0.5625rem] border border-text-primary/[0.04] py-[0.4169rem] font-mono text-[0.8461rem] leading-[1.3188rem] text-[var(--tr-text)]"
        >
          {errorText !== '' && (
            <div className="px-[0.875rem] pb-[0.75rem] pt-[0.3rem] leading-[1.1875rem]">
              <div className="whitespace-pre-wrap break-words font-sans text-[0.9656rem] text-[rgb(214,85,105)]">{errorText}</div>
              <div className="mt-[0.5rem] font-sans text-[0.9rem] text-text-secondary">{t('transcript.tools.notApplied')}</div>
            </div>
          )}
          {lines.map((line, index) => (
            <DiffRow key={index} line={line} marked={marks[index]} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}
