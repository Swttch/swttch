import { useState, useCallback, useRef } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';

export enum MentionItemType {
  File = 'file',
  Directory = 'directory',
}

export class MentionResult {
  readonly relativePath: string;
  readonly type: MentionItemType;
  /**
   * 0-based indices (ascending) into {@link relativePath} of the characters the
   * backend's fuzzy search matched against the query. Forwarded verbatim from
   * the backend response — never edited or recomputed here (raw data
   * preservation principle). Undefined when the backend omits it (e.g. empty
   * query).
   */
  readonly matchIndices?: number[];

  constructor(params: { relativePath: string; type: MentionItemType; matchIndices?: number[] }) {
    this.relativePath = params.relativePath;
    this.type = params.type;
    this.matchIndices = params.matchIndices;
  }

  get displayName(): string {
    const segments = this.relativePath.replace(/\/$/, '').split('/');
    return segments[segments.length - 1] ?? this.relativePath;
  }

}

interface ListProjectFilesPayload {
  requestId: string;
  files: Array<{ relativePath: string; type: string; matchIndices?: number[] }>;
}

interface MentionState {
  isActive: boolean;
  query: string;
  triggerIndex: number;
  results: MentionResult[];
  selectedIndex: number;
  isLoading: boolean;
}

interface UseMentionParams {
  workingDirectory: string | null | undefined;
  /**
   * Called with the inserted path token (no trailing space), the caret offset
   * immediately after the inserted `token + ' '`, and the full composer value
   * that offset applies to, so the composer can highlight the token as a chip,
   * restore the caret, and re-run caret-dependent checks (e.g. reopening the
   * slash command panel) without waiting for a rerender. Fired once per
   * successful {@link UseMentionReturn.selectResult}.
   */
  onInsertMention: (token: string, caretOffset: number, nextValue: string) => void;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Build the inline path token for a selected mention result. The token is
 * prefixed with `@` so Claude Code CLI can recognise it as a file reference.
 * Directories get a single trailing slash (added only when not already present).
 * Examples: `@src/App.tsx`, `@src/utils/`.
 */
export function buildMentionToken(result: MentionResult): string {
  if (result.type === MentionItemType.Directory) {
    const path = result.relativePath.endsWith('/') ? result.relativePath : `${result.relativePath}/`;
    return `@${path}`;
  }
  return `@${result.relativePath}`;
}

interface UseMentionReturn {
  isActive: boolean;
  results: MentionResult[];
  selectedIndex: number;
  isLoading: boolean;
  detectMention: (value: string, cursorPosition: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLElement>) => boolean;
  selectResult: (index: number) => void;
  close: () => void;
}

const DEBOUNCE_MS = 150;

export function useMention(params: UseMentionParams): UseMentionReturn {
  const { workingDirectory, onInsertMention, value, onChange } = params;
  const bridge = useBridgeContext();

  const [state, setState] = useState<MentionState>({
    isActive: false,
    query: '',
    triggerIndex: -1,
    results: [],
    selectedIndex: 0,
    isLoading: false,
  });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const close = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setState({
      isActive: false,
      query: '',
      triggerIndex: -1,
      results: [],
      selectedIndex: 0,
      isLoading: false,
    });
  }, []);

  const search = useCallback(
    (query: string) => {
      if (!workingDirectory) return;

      setState(prev => ({ ...prev, isLoading: true }));

      bridge
        .send(MessageType.LIST_PROJECT_FILES, {
          query,
          workingDir: workingDirectory,
          limit: 20,
        })
        .then((payload: ListProjectFilesPayload) => {
          const results = (payload?.files ?? []).map(
            f =>
              new MentionResult({
                relativePath: f.relativePath,
                type: f.type === 'directory' ? MentionItemType.Directory : MentionItemType.File,
                matchIndices: f.matchIndices,
              }),
          );
          setState(prev => ({
            ...prev,
            results,
            selectedIndex: 0,
            isLoading: false,
          }));
        })
        .catch(() => {
          setState(prev => ({ ...prev, isLoading: false }));
        });
    },
    [bridge, workingDirectory],
  );

  const detectMention = useCallback(
    (newValue: string, cursorPosition: number) => {
      // 커서 앞 텍스트에서 @ 감지
      const textBeforeCursor = newValue.slice(0, cursorPosition);

      // 마지막 @ 위치 찾기
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex === -1) {
        if (state.isActive) close();
        return;
      }

      // @ 바로 앞 문자가 줄 시작이거나 공백이어야 함 (이메일 등 무시)
      const charBeforeAt = lastAtIndex > 0 ? newValue[lastAtIndex - 1] : null;
      const isValidTrigger = charBeforeAt === null || charBeforeAt === ' ' || charBeforeAt === '\n';

      if (!isValidTrigger) {
        if (state.isActive) close();
        return;
      }

      // @ 뒤의 쿼리 텍스트 (공백 없어야 함)
      const queryText = textBeforeCursor.slice(lastAtIndex + 1);

      // 쿼리에 공백이 있으면 멘션 종료
      if (/\s/.test(queryText)) {
        if (state.isActive) close();
        return;
      }

      const isAlreadyActive = state.isActive && state.triggerIndex === lastAtIndex;

      setState(prev => ({
        ...prev,
        isActive: true,
        query: queryText,
        triggerIndex: lastAtIndex,
        selectedIndex: isAlreadyActive ? prev.selectedIndex : 0,
      }));

      // debounce 검색
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        search(queryText);
      }, DEBOUNCE_MS);
    },
    [state.isActive, state.triggerIndex, close, search],
  );

  const selectResult = useCallback(
    (index: number) => {
      const result = state.results[index];
      if (!result || !workingDirectory) return;

      const { triggerIndex } = state;
      if (triggerIndex === -1) {
        close();
        return;
      }

      // Replace the `@query` span (from the `@` through the typed query) with the
      // resolved path token plus a trailing space, keeping surrounding text intact.
      const token = buildMentionToken(result);
      const currentValue = valueRef.current;
      const before = currentValue.slice(0, triggerIndex);
      const after = currentValue.slice(triggerIndex + 1 + state.query.length);
      const newValue = before + token + ' ' + after;
      const caretOffset = triggerIndex + token.length + 1;

      onChange(newValue);
      onInsertMention(token, caretOffset, newValue);

      close();
    },
    [state, workingDirectory, onInsertMention, onChange, close],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>): boolean => {
      if (!state.isActive) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: prev.results.length > 0 ? (prev.selectedIndex + 1) % prev.results.length : 0,
        }));
        return true;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex:
            prev.results.length > 0
              ? (prev.selectedIndex - 1 + prev.results.length) % prev.results.length
              : 0,
        }));
        return true;
      }

      if (e.key === 'Tab') {
        if (state.results.length > 0) {
          e.preventDefault();
          const result = state.results[state.selectedIndex];
          if (result) {
            const completedPath = result.relativePath + (result.type === MentionItemType.Directory ? '/' : '');
            const currentValue = valueRef.current;
            const before = currentValue.slice(0, state.triggerIndex + 1);
            const after = currentValue.slice(state.triggerIndex + 1 + state.query.length);
            const newValue = before + completedPath + after;
            onChange(newValue);
            setState(prev => ({
              ...prev,
              query: completedPath,
            }));
            if (debounceTimerRef.current !== null) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              debounceTimerRef.current = null;
              search(completedPath);
            }, DEBOUNCE_MS);
          }
          return true;
        }
        return false;
      }

      if (e.key === 'Enter') {
        if (state.results.length > 0) {
          e.preventDefault();
          selectResult(state.selectedIndex);
          return true;
        }
        return false;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return true;
      }

      return false;
    },
    [state, selectResult, close, onChange, search],
  );

  return {
    isActive: state.isActive,
    results: state.results,
    selectedIndex: state.selectedIndex,
    isLoading: state.isLoading,
    detectMention,
    handleKeyDown,
    selectResult,
    close,
  };
}
