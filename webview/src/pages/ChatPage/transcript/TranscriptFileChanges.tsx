import { useMemo, useState } from 'react';
import { DocumentIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { Tooltip } from '@/components/Tooltip';
import { useChatStreamContextOrNull } from '@/contexts/ChatStreamContext';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import type { LoadedMessageDto } from '@/types';
import { buildSegments, type ToolCall } from './buildSegments';
import { baseName, hasFailed, lineStatsOf, pathOf, wasStopped, type LineStats } from './toolSummary';

export interface FileTotal {
  path: string;
  stats: LineStats;
}

/**
 * The files these calls changed, in the order they were first changed, each with the lines put in and taken out in
 * all. A call the user turned down, one that failed and one still running changed nothing and is left out.
 */
export function changedFilesOfCalls(calls: ToolCall[]): FileTotal[] {
  const files = new Map<string, FileTotal>();
  for (const call of calls) {
    const name = call.toolUse.name;
    if ((name !== 'Edit' && name !== 'Write') || hasFailed(call) || wasStopped(call) || !call.toolUse.tool_result) continue;
    const path = pathOf(call);
    if (!path) continue;
    const stats = lineStatsOf(call);
    const known = files.get(path);
    if (known) {
      known.stats = { added: known.stats.added + stats.added, removed: known.stats.removed + stats.removed };
    } else {
      files.set(path, { path, stats });
    }
  }
  return [...files.values()];
}

export function changedFilesOf(body: LoadedMessageDto[]): FileTotal[] {
  const calls: ToolCall[] = [];
  for (const segment of buildSegments(body)) {
    if (segment.kind === 'tools') calls.push(...segment.calls);
  }
  return changedFilesOfCalls(calls);
}

function Counts({ stats }: { stats: LineStats }) {
  return (
    <span className="flex flex-shrink-0 items-baseline gap-[0.55rem] text-[0.9656rem]">
      <span className="text-[rgb(98,190,102)]">+{stats.added}</span>
      <span className="text-[rgb(214,69,96)]">−{stats.removed}</span>
    </span>
  );
}

/**
 * "Undo": asks Claude to take back what the turn changed, as the desktop app's does (its hover line says so: "Ask
 * Claude to undo this turn's file changes"). It sends a message; it does not restore the files by itself. It gets a
 * pill behind it while the pointer is on it. The words of the message are ours: the desktop app's are not in its files.
 */
function UndoButton() {
  const { t } = useTranslation('chat');
  const stream = useChatStreamContextOrNull();
  const inputMode = useSessionContextOrNull()?.inputMode;
  const send = stream?.sendMessage;
  if (!send || inputMode === undefined) return null;
  return (
    <Tooltip content={t('transcript.fileChanges.undoHint')} desktop="large" maxWidth="10.5rem">
      <button
        type="button"
        onClick={() => send(t('transcript.fileChanges.undoPrompt'), inputMode)}
        className="-my-1 rounded-[0.4375rem] px-[0.55rem] py-[0.2062rem] text-text-secondary transition-colors hover:bg-text-primary/[0.1] hover:text-text-primary"
      >
        {t('transcript.fileChanges.undo')}
      </button>
    </Tooltip>
  );
}

/**
 * What closes a turn that changed files, the way the desktop app draws it. One file is a single line: its name,
 * "Undo" and the lines put in and taken out. Several are a card with the number of files and "Undo" over a line for
 * each file, and the totals under them. Measured on the desktop app's recordings.
 */
/** Past this many files the card lists the first few and ends on "View all" (measured on a turn that wrote 20 files). */
const SHOWN_FILES = 3;

export function TranscriptFileChanges({ body, hidden }: { body: LoadedMessageDto[]; sectionKey?: string | null; hidden: boolean }) {
  const { t } = useTranslation('chat');
  const files = useMemo(() => changedFilesOf(body), [body]);
  const [all, setAll] = useState(false);
  if (hidden || files.length < 1) return null;
  const border = 'rounded-[0.6875rem] border border-text-primary/[0.07]';
  if (files.length === 1) {
    const [file] = files;
    return (
      <div className="pb-[0.25rem] pt-[1.8rem]" data-transcript-file-changes>
        <div className={`flex h-[2.775rem] items-center gap-[0.625rem] px-[1.0625rem] text-[0.9656rem] text-text-primary ${border}`}>
          <DocumentIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
          <span className="min-w-0 flex-1 truncate">{baseName(file.path)}</span>
          <UndoButton />
          <Counts stats={file.stats} />
        </div>
      </div>
    );
  }
  const total = files.reduce(
    (sum, file) => ({ added: sum.added + file.stats.added, removed: sum.removed + file.stats.removed }),
    { added: 0, removed: 0 },
  );
  return (
    <div className="pb-[0.25rem] pt-[1.8rem]" data-transcript-file-changes>
      <div className={`overflow-hidden text-[0.9656rem] text-text-primary ${border}`}>
        <div className="flex h-[2.625rem] items-center justify-between border-b border-text-primary/[0.07] px-[1.0625rem]">
          <span>{t('transcript.fileChanges.title', { count: files.length })}</span>
          <UndoButton />
        </div>
        <div className="flex flex-col py-[0.3rem]">
          {(files.length > SHOWN_FILES && !all ? files.slice(0, SHOWN_FILES) : files).map((file) => (
            <div key={file.path} className="flex h-[1.9062rem] items-center gap-[0.625rem] px-[1.0625rem]">
              <DocumentIcon className="h-4 w-4 flex-shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1 truncate">{baseName(file.path)}</span>
              <Counts stats={file.stats} />
            </div>
          ))}
          {files.length > SHOWN_FILES && !all ? (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="flex h-[1.9062rem] items-center justify-between px-[1.0625rem] text-start transition-colors hover:text-text-secondary"
            >
              <span>{t('transcript.fileChanges.viewAll')}</span>
              <Counts stats={total} />
            </button>
          ) : (
            <div className="flex h-[1.9062rem] items-center justify-between px-[1.0625rem]">
              <span>{t('transcript.fileChanges.total')}</span>
              <Counts stats={total} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
