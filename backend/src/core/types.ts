export interface IPCMessage {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Native drag-and-drop entry. Produced by Kotlin CefDragHandler (one entry per
 * file in the drag), stashed against the panel's connection, and replayed to the
 * webview on NATIVE_DROP_FLUSH as the payload.entries[] of NATIVE_DROP_ENTRIES.
 */
export interface NativeDropEntry {
  path: string;
  type: 'file' | 'folder';
}

/**
 * What the IDE host read off the system clipboard (GET_CLIPBOARD). [files] are the
 * files and folders copied in a file manager, shaped like a drop's entries so a
 * paste of them takes the same way into the chat as a drop does.
 */
export interface HostClipboardContents {
  text: string | null;
  image: { mimeType: string; base64: string } | null;
  files: NativeDropEntry[];
}
