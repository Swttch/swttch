import { useMemo } from 'react';
import { openChatFile } from '@/utils/openChatFile';
import toast from 'react-hot-toast';
import { ClipboardDocumentIcon } from '@heroicons/react/20/solid';
import { Tooltip } from '@/components/Tooltip';
import { useTranslation } from '@/i18n';
import { DiffLineType, type DiffLine } from '../message-renderers/ToolRenderers/EditRenderer';
import { HighlightedCode } from '../message-renderers/ToolRenderers/Mcp/Generic/HighlightedCode';
import type { ToolCall } from './buildSegments';
import { diffLinesOf } from './fileDiff';
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
    <div dir="ltr" className="group mb-3 mt-1 flex min-w-0 items-center gap-2 text-[0.8461rem] text-[var(--tr-text)]">
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

const ROW_TINT: Record<DiffLineType, string> = {
  [DiffLineType.Add]: 'bg-[var(--tr-add-bg)]',
  [DiffLineType.Delete]: 'bg-[var(--tr-del-bg)]',
  [DiffLineType.Context]: '',
};

/** The bar at a changed line's left edge: solid green for an added line, hatched red for a removed one. */
const ROW_BAR: Record<DiffLineType, string> = {
  [DiffLineType.Add]: 'bg-[#3fa84f]',
  [DiffLineType.Delete]: 'bg-[repeating-linear-gradient(135deg,#c24b52_0_2px,transparent_2px_4px)]',
  [DiffLineType.Context]: '',
};

function DiffRow({ line, digits, language }: { line: DiffLine; digits: number; language: string }) {
  return (
    <div className={`flex ${ROW_TINT[line.type]}`}>
      <span className={`w-1 flex-shrink-0 ${ROW_BAR[line.type]}`} />
      <span className="flex-shrink-0 select-none pe-3 ps-2 text-end opacity-60" style={{ minWidth: `${digits + 2}ch` }}>
        {line.newNo ?? line.oldNo}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pe-3">
        <HighlightedCode text={line.content} language={language} />
      </span>
    </div>
  );
}

/**
 * What a file change shows once its row is open, the way the desktop app draws it: the file's path, and under it
 * the changed lines in a box, each with its number, the changed ones tinted and marked at their left edge.
 * There is no title over it and no "modified" caption: the row it opens from already says what happened.
 */
export function FileChangeDetail({ calls }: { calls: ToolCall[] }) {
  return (
    <>
      {calls.map((call) => (
        <OneChange key={call.toolUse.id} call={call} />
      ))}
    </>
  );
}

/** One call's path and changed lines. A file changed twice shows two of these, one after the other. */
function OneChange({ call }: { call: ToolCall }) {
  const path = pathOf(call);
  const lines = useMemo(() => diffLinesOf(call, MAX_SHOWN_LINES), [call]);
  const digits = lines.reduce((max, line) => Math.max(max, String(line.newNo ?? line.oldNo ?? '').length), 0);
  const language = languageOf(path);
  return (
    <div className="pb-3 pt-1">
      <PathLine path={path} />
      {lines.length > 0 && (
        <div
          dir="ltr"
          className="max-h-[24rem] overflow-y-auto rounded-lg border border-border-default/70 py-1 font-mono text-[0.8461rem] leading-[1.5] text-[var(--tr-text)]"
        >
          {lines.map((line, index) => (
            <DiffRow key={index} line={line} digits={digits} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}
