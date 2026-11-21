/**
 * Global type definitions for WebView-Kotlin IPC bridge
 */

interface Window {
  /**
   * JCEF environment marker.
   * Injected by ClaudeCodePanel.kt onLoadStart before page JS runs.
   */
  __JCEF__?: boolean;

  /**
   * IDE Look-and-Feel theme hint.
   * Injected by ClaudeCodePanel.kt at page load and updated whenever the
   * IDE LAF changes at runtime. Consumers should listen for the
   * 'ide-theme-changed' event on window to react to changes.
   *
   * Only meaningful when __JCEF__ === true. In standalone (browser) mode
   * this is always undefined and consumers fall back to matchMedia.
   */
  __IDE_THEME__?: 'dark' | 'light';

  /**
   * Bridge to send messages from WebView to Kotlin
   * Injected by ClaudeCodePanel.kt via JBCefJSQuery
   */
  kotlinBridge?: {
    send: (message: IPCMessage) => void;
  };

  /**
   * Handler called by Kotlin to send messages to WebView
   * Implemented by useBridge.ts
   */
  dispatchKotlinMessage?: (message: IPCMessage) => void;
}

/**
 * IPC message structure for WebView <-> Kotlin communication
 */
interface IPCMessage {
  /**
   * Message type identifier
   * WebView -> Kotlin: SEND_MESSAGE, SESSION_CHANGE, TOOL_RESPONSE, APPLY_DIFF, REJECT_DIFF, START_SESSION, STOP_SESSION, CREATE_SESSION, OPEN_TAB, OPEN_FILE
   * Kotlin -> WebView: ACK, ERROR, STREAM_EVENT, ASSISTANT_MESSAGE, RESULT_MESSAGE, SERVICE_ERROR, THEME_CHANGE
   */
  type: string;

  /**
   * Unique request identifier for matching responses
   */
  requestId?: string;

  /**
   * Message payload (type-specific data)
   */
  payload?: Record<string, unknown>;

  /**
   * Unix timestamp in milliseconds
   */
  timestamp: number;
}

/**
 * Typed payload interfaces for specific IPC message types.
 * IPCMessage.payload is Record<string, unknown> for flexibility,
 * but these interfaces document the expected shape for each message type.
 */

/** Payload for SEND_MESSAGE (WebView -> Backend) */
interface SendMessagePayload {
  sessionId: string;
  isNewSession: boolean;
  content: string;
  /** Image attachments encoded as base64 inline data */
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    base64: string;
  }>;
  context: Array<Record<string, unknown>>;
  workingDir: string;
  inputMode: string;
  /** User-selected model, used to spawn the CLI with `--model`. */
  model?: string;
}

// NOTE: The legacy `MessageTypes` ambient constant was removed. The single
// source of truth for IPC message types is the `MessageType` enum in
// `@/shared` (src/shared/message-type.ts).
