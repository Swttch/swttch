import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { useSessionContext } from './SessionContext';

interface ChatInputStateContextType {
  input: string;
  setInput: (input: string) => void;
  /**
   * Whether the composer holds anything at all: typed text, a picture or file, a picked page element, a quoted
   * reply, or an upload under way. The composer reports it; whatever must stand back while a message is being
   * put together (the wrap-up box's Cmd+Enter) reads it.
   */
  composerHasContent: boolean;
  setComposerHasContent: (hasContent: boolean) => void;
}

const ChatInputStateContext = createContext<ChatInputStateContextType>({
  input: '',
  setInput: () => {},
  composerHasContent: false,
  setComposerHasContent: () => {},
});

export function useChatInputState() {
  return useContext(ChatInputStateContext);
}

interface Props {
  children: ReactNode;
  inputRef?: React.MutableRefObject<string>;
  setInputCallbackRef?: React.MutableRefObject<(value: string) => void>;
}

export function ChatInputStateProvider(props: Props) {
  const { children, inputRef, setInputCallbackRef } = props;
  const [input, setInputRaw] = useState('');
  const [composerHasContent, setComposerHasContent] = useState(false);
  const session = useSessionContext();

  // Keep shared ref in sync so sibling providers (ChatStreamProvider) can read
  // the latest input without subscribing to this context.
  // Updating refs in an effect avoids mutating refs during render (React anti-pattern).
  useEffect(() => {
    if (inputRef) inputRef.current = input;
  }, [input, inputRef]);

  const setInput = useCallback((value: string) => {
    setInputRaw(value);
  }, []);

  // Wire the external callback ref so ChatStreamProvider can call setInput
  // without being a consumer of this context.
  useEffect(() => {
    if (setInputCallbackRef) setInputCallbackRef.current = setInput;
  }, [setInput, setInputCallbackRef]);

  // Save input draft to localStorage for tab move/split restoration.
  // Skip the first mount to prevent the initial empty input from clearing
  // a saved draft (JCEF may reload the page on browser component reattach).
  const draftInitializedRef = useRef(false);
  useEffect(() => {
    if (!session.currentSessionId) return;
    if (!draftInitializedRef.current) {
      draftInitializedRef.current = true;
      return;
    }
    const key = `claude-gui:draft:${session.currentSessionId}`;
    try {
      if (input) {
        localStorage.setItem(key, input);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage may be unavailable in some environments (e.g., tests)
    }
  }, [input, session.currentSessionId]);

  return (
    <ChatInputStateContext.Provider value={{ input, setInput, composerHasContent, setComposerHasContent }}>
      {children}
    </ChatInputStateContext.Provider>
  );
}
