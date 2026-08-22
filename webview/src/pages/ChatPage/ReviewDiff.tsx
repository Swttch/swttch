import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@/contexts/ApiContext';
import { useTranslation } from '@/i18n';
import type { DiffPreview } from '@/api/modules/ToolsApi';

/**
 * The review diff drawn here rather than in the IDE.
 *
 * Loaded lazily because the renderer is large and most turns never propose a
 * file edit; paying for it on first paint would slow every session down for a
 * screen many never see.
 */
const ReviewDiffSurface = lazy(() => import('./ReviewDiffSurface'));

interface Props {
  toolUseId: string;
}

/**
 * Review a proposed file edit and answer its permission request, for hosts with
 * no IDE diff to open.
 *
 * Fetches the change the backend is holding, shows it, and sends the reviewer's
 * decision back through the same message the IDE's diff uses — so a request
 * answered here settles exactly as one answered there.
 */
export function ReviewDiff({ toolUseId }: Props) {
  const api = useApi();
  const { t } = useTranslation('chat');
  const [preview, setPreview] = useState<DiffPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  // The proposed side as the reviewer has it now. Undefined until they touch
  // it, which is what tells the backend to let Claude's own call through.
  const editedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.tools
      .getDiffPreview(toolUseId)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, toolUseId]);

  const handleEdit = useCallback((contents: string) => {
    editedRef.current = contents;
  }, []);

  const resolve = useCallback(
    async (keepEdits: boolean) => {
      if (!preview?.sessionId || !preview.controlRequestId) return;
      setResolving(true);
      try {
        await api.tools.resolveDiff({
          toolUseId,
          controlRequestId: preview.controlRequestId,
          sessionId: preview.sessionId,
          // Every region, because this surface does not offer per-hunk picking
          // yet. Sending nothing would read as a refusal.
          acceptedRanges: keepEdits
            ? [{ oldStart: 0, oldEnd: lineCount(preview.oldContent), newStart: 0, newEnd: lineCount(preview.newContent) }]
            : [],
          // Reject discards any edit: refusing a change is not a way to write
          // a different one.
          editedContent: keepEdits ? editedRef.current : undefined,
        });
        // The prompt closes on the backend's PERMISSION_RESOLVED broadcast, the
        // same way it does when the IDE's diff answers. Dismissing it here as
        // well would be a second decision for a settled request.
      } finally {
        setResolving(false);
      }
    },
    [api, preview, toolUseId],
  );

  const fileName = useMemo(
    () => (preview ? preview.filePath.split(/[\\/]/).pop() ?? preview.filePath : ''),
    [preview],
  );

  if (loading) {
    return <div className="text-text-tertiary text-sm py-4">{t('reviewDiff.loading')}</div>;
  }

  // Answered while we were fetching, or never a file edit. Nothing to review.
  if (!preview) return null;

  return (
    <div className="review-diff border border-border-default rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary">
        <span className="text-sm text-text-primary font-medium truncate" title={preview.filePath}>
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-state-success-bg text-state-success-fg disabled:opacity-50"
            disabled={resolving}
            onClick={() => void resolve(true)}
          >
            {t('reviewDiff.apply')}
          </button>
          <button
            type="button"
            className="px-3 py-1 text-sm rounded bg-state-error-bg text-state-error-fg disabled:opacity-50"
            disabled={resolving}
            onClick={() => void resolve(false)}
          >
            {t('reviewDiff.reject')}
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="text-text-tertiary text-sm p-3">{t('reviewDiff.loading')}</div>}>
        <ReviewDiffSurface preview={preview} onEdit={handleEdit} />
      </Suspense>
    </div>
  );
}

/** Lines in [text], counting the way the backend's ranges do. */
function lineCount(text: string): number {
  if (text === '') return 0;
  const withoutTrailing = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutTrailing.split('\n').length;
}
