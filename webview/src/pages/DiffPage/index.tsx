import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '@/contexts/ApiContext';
import { useTranslation } from '@/i18n';
import type { DiffPreview } from '@/api/modules/ToolsApi';
import { DiffUnavailable } from './DiffUnavailable';
import { useCloseDiffWindow } from './useCloseDiffWindow';

/**
 * Loaded lazily because the renderer is large and most sessions never open this
 * page; paying for it up front would slow every chat down for a screen many
 * never see.
 */
const ReviewDiffSurface = lazy(() => import('../ChatPage/ReviewDiffSurface'));

interface Props {
  /**
   * The tool call to review. Read from the route when absent, which is the
   * ordinary case; passed in when the page is mounted as an overlay, where
   * there is no URL of its own.
   */
  toolUseId?: string;
  /** Dismiss an overlay. Absent when the page fills a window it can close. */
  onClose?: () => void;
}

/**
 * Review one proposed file edit, and answer the permission request behind it.
 *
 * A page of its own rather than a strip inside the chat: a diff needs room, and
 * inside the chat column it had none — it was capped at a fixed height, scrolled
 * inside that cap, and dropped to a single column below 720px. Here the window
 * is the size, so those compromises are gone.
 *
 * The same page serves every host. An IDE opens it in an editor tab, a browser
 * in a tab or an overlay; all three arrive with nothing but a tool-call id and
 * fetch the rest, so none of them needs a variant of this component.
 */
export function DiffPage(props: Props) {
  const params = useParams<{ tool_use_id?: string }>();
  const toolUseId = props.toolUseId ?? params.tool_use_id ?? '';
  const api = useApi();
  const { t } = useTranslation('chat');
  const closeWindow = useCloseDiffWindow();
  const close = props.onClose ?? closeWindow;

  const [preview, setPreview] = useState<DiffPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  // The proposed side as the reviewer has it now. Undefined until they touch
  // it, which is what tells the backend to let Claude's own call through.
  const editedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!toolUseId) {
      setLoading(false);
      return;
    }
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
            ? [
                {
                  oldStart: 0,
                  oldEnd: lineCount(preview.oldContent),
                  newStart: 0,
                  newEnd: lineCount(preview.newContent),
                },
              ]
            : [],
          // Reject discards any edit: refusing a change is not a way to write
          // a different one.
          editedContent: keepEdits ? editedRef.current : undefined,
        });
        // Answered, so the window has done its job. In an IDE the backend closes
        // the tab; elsewhere this is what dismisses it.
        close();
      } finally {
        setResolving(false);
      }
    },
    [api, preview, toolUseId, close],
  );

  const fileName = useMemo(
    () => (preview ? (preview.filePath.split(/[\\/]/).pop() ?? preview.filePath) : ''),
    [preview],
  );

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-text-tertiary text-sm">{t('reviewDiff.loading')}</span>
      </div>
    );
  }

  // Answered while we were fetching, opened twice, or reloaded long after the
  // fact. Either way there is no question left to put on screen.
  if (!preview) return <DiffUnavailable onClose={close} />;

  return (
    <div className="flex h-full w-full flex-col bg-bg-primary">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-default px-4 py-3">
        <span
          className="truncate text-sm font-medium text-text-primary"
          title={preview.filePath}
        >
          {fileName}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded bg-state-success-bg px-3 py-1.5 text-sm text-state-success-fg disabled:opacity-50"
            disabled={resolving}
            onClick={() => void resolve(true)}
          >
            {t('reviewDiff.apply')}
          </button>
          <button
            type="button"
            className="rounded bg-state-error-bg px-3 py-1.5 text-sm text-state-error-fg disabled:opacity-50"
            disabled={resolving}
            onClick={() => void resolve(false)}
          >
            {t('reviewDiff.reject')}
          </button>
        </div>
      </header>

      {/*
        The diff takes the rest of the window and scrolls on its own, so the
        header — the file name and the two decisions — stays put however long
        the change is.
      */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense
          fallback={
            <div className="p-4 text-sm text-text-tertiary">{t('reviewDiff.loading')}</div>
          }
        >
          <ReviewDiffSurface preview={preview} onEdit={handleEdit} />
        </Suspense>
      </div>
    </div>
  );
}

/** Lines in [text], counting the way the backend's ranges do. */
function lineCount(text: string): number {
  if (text === '') return 0;
  const withoutTrailing = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutTrailing.split('\n').length;
}
