import { useState, useEffect, useCallback } from 'react';
import { getBridgeClient } from '@/api/bridge/BridgeClient';
import { MessageType } from '@/shared';

export interface PreviewHunk {
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Unified-diff body: ' ' context, '-' removed, '+' added. */
  lines: string[];
}

export interface DiffPreview {
  toolUseId: string;
  filePath: string;
  hunks: PreviewHunk[];
}

/**
 * The change a pending permission request would make, as the backend split it.
 *
 * Arrives on its own message rather than inside the permission request: the
 * request is the CLI's, forwarded verbatim, and computing the diff means
 * reading the file, which must not delay the prompt. So the prompt renders
 * first and the hunks fill in a moment later.
 */
export function usePendingDiffPreview(toolUseId: string | undefined): {
  preview: DiffPreview | null;
  /** Hunks the user has kept. Starts as all of them — approving is the default. */
  acceptedHunks: number[];
  toggleHunk: (index: number) => void;
  setAllHunks: (accepted: boolean) => void;
} {
  const [previews, setPreviews] = useState<Record<string, DiffPreview>>({});
  const [selection, setSelection] = useState<Record<string, number[]>>({});

  useEffect(() => {
    const bridge = getBridgeClient();
    return bridge.subscribe(MessageType.DIFF_PREVIEW, (message) => {
      const preview = message.payload as DiffPreview | undefined;
      if (!preview?.toolUseId || !Array.isArray(preview.hunks)) return;
      setPreviews((prev) => ({ ...prev, [preview.toolUseId]: preview }));
      // Everything selected to begin with: the prompt still means "make this
      // edit?", and unticking is how you narrow it.
      setSelection((prev) => ({
        ...prev,
        [preview.toolUseId]: preview.hunks.map((h) => h.index),
      }));
    });
  }, []);

  const preview = toolUseId ? previews[toolUseId] ?? null : null;
  const acceptedHunks = toolUseId ? selection[toolUseId] ?? [] : [];

  const toggleHunk = useCallback(
    (index: number) => {
      if (!toolUseId) return;
      setSelection((prev) => {
        const current = prev[toolUseId] ?? [];
        const next = current.includes(index)
          ? current.filter((i) => i !== index)
          : [...current, index].sort((a, b) => a - b);
        return { ...prev, [toolUseId]: next };
      });
    },
    [toolUseId],
  );

  const setAllHunks = useCallback(
    (accepted: boolean) => {
      if (!toolUseId) return;
      setSelection((prev) => ({
        ...prev,
        [toolUseId]: accepted ? (previews[toolUseId]?.hunks ?? []).map((h) => h.index) : [],
      }));
    },
    [toolUseId, previews],
  );

  return { preview, acceptedHunks, toggleHunk, setAllHunks };
}
