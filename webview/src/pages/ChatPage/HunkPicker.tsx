import { useTranslation } from '@/i18n';
import type { PreviewHunk } from '@/hooks/usePendingDiffPreview';

interface Props {
  filePath: string;
  hunks: PreviewHunk[];
  acceptedHunks: number[];
  onToggle: (index: number) => void;
  onSetAll: (accepted: boolean) => void;
}

function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/**
 * The change a pending edit would make, one checkbox per hunk (#109).
 *
 * Everything starts ticked, so doing nothing approves the whole edit exactly as
 * before; unticking is how a reviewer narrows it. Rendered inside the approval
 * prompt rather than as a separate step, because the decision and the thing
 * being decided belong on one screen.
 */
export function HunkPicker(props: Props) {
  const { filePath, hunks, acceptedHunks, onToggle, onSetAll } = props;
  const { t } = useTranslation('chat');

  if (hunks.length === 0) return null;

  const allAccepted = acceptedHunks.length === hunks.length;

  return (
    <div className="rounded-[4px] border border-border-subtle bg-surface-base overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border-subtle">
        <span className="text-[0.9230rem] text-text-secondary truncate" title={filePath}>
          {basename(filePath)}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[0.8461rem] text-text-tertiary">
            {t('hunkPicker.selected', { kept: acceptedHunks.length, total: hunks.length })}
          </span>
          <button
            type="button"
            onClick={() => onSetAll(!allAccepted)}
            className="text-[0.8461rem] text-text-secondary hover:text-text-primary underline underline-offset-2"
          >
            {allAccepted ? t('hunkPicker.selectNone') : t('hunkPicker.selectAll')}
          </button>
        </div>
      </div>

      <div className="max-h-[18rem] overflow-y-auto">
        {hunks.map((hunk) => {
          const accepted = acceptedHunks.includes(hunk.index);
          return (
            <label
              key={hunk.index}
              className={`flex gap-2 px-2.5 py-1.5 border-b border-border-subtle last:border-b-0 cursor-pointer transition-opacity ${
                accepted ? '' : 'opacity-45'
              }`}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={() => onToggle(hunk.index)}
                className="mt-1 flex-shrink-0"
                aria-label={t('hunkPicker.hunkLabel', {
                  number: hunk.index + 1,
                  line: hunk.oldStart,
                })}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[0.8461rem] text-text-tertiary mb-0.5">
                  {t('hunkPicker.hunkLabel', { number: hunk.index + 1, line: hunk.oldStart })}
                </div>
                <pre className="text-[0.8461rem] leading-[1.45] font-mono whitespace-pre-wrap break-words m-0">
                  {hunk.lines.map((line, i) => {
                    const kind = line[0];
                    const cls =
                      kind === '+'
                        ? 'hunk-line-add'
                        : kind === '-'
                          ? 'hunk-line-delete'
                          : 'text-text-tertiary';
                    return (
                      <span key={i} className={`block ${cls}`}>
                        {line}
                      </span>
                    );
                  })}
                </pre>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
