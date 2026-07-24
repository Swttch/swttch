/**
 * MessageType — the single source of truth for every IPC message `type` that
 * travels over the WebSocket bridge between the webview and the Node.js backend.
 *
 * Use `MessageType.X` instead of bare string literals everywhere a message
 * `type` is produced or consumed (`bridge.request`, `send`, `subscribe`,
 * `waitFor`, backend routing `switch`, `connections.sendTo`, ...). The member
 * name equals its string value so a value reads identically to the wire format
 * and stays greppable.
 *
 * Naming rule (CLAUDE.md "consistent naming"): one action → one word across all
 * layers. The backend handler, the webview call site, and this enum all share
 * the same token.
 *
 * NOTE: This file is mirrored 1:1 in `backend/src/shared/message-type.ts`.
 * Any edit here MUST be copied there (see `shared/CLAUDE.md`).
 */
export enum MessageType {
  // ───────────────────────────────────────────────────────────────────────
  // Inbound — webview → backend (request/response via ACK, or fire-and-forget)
  // ───────────────────────────────────────────────────────────────────────

  // -- Chat session lifecycle & messaging --
  /** Send a user prompt to the Claude CLI for the active session. */
  SEND_MESSAGE = 'SEND_MESSAGE',
  /** Interrupt the in-flight generation (assistant turn) without ending the session. */
  STOP_GENERATION = 'STOP_GENERATION',
  /** Stop and tear down the CLI process backing a session. */
  STOP_SESSION = 'STOP_SESSION',
  /** Spawn/start the Claude CLI process for a session. */
  START_SESSION = 'START_SESSION',
  /** Switch the active session the backend streams to this connection. */
  SESSION_CHANGE = 'SESSION_CHANGE',
  /** Reply to a tool-permission/tool-use request raised by the CLI. */
  TOOL_RESPONSE = 'TOOL_RESPONSE',
  /** Re-attach this connection to an already-running session (e.g. after reconnect). */
  RECLAIM_SESSION = 'RECLAIM_SESSION',

  // -- Sessions CRUD --
  /** Create a new session (optionally in a given working directory). */
  CREATE_SESSION = 'CREATE_SESSION',
  /** List all known sessions (optionally scoped to a working directory). */
  GET_SESSIONS = 'GET_SESSIONS',
  /** Load the full message history (JSONL) of one session. */
  LOAD_SESSION = 'LOAD_SESSION',
  /** Load older messages before a specific message cursor (paging). */
  LOAD_OLDER_MESSAGES = 'LOAD_OLDER_MESSAGES',
  /** Delete a session and its on-disk history. */
  DELETE_SESSION = 'DELETE_SESSION',
  /** Rename a session's title. */
  RENAME_SESSION = 'RENAME_SESSION',

  // -- IDE settings (terminal/theme/etc., ~/.claude GUI settings) --
  /** Read merged or scope-specific GUI settings. */
  GET_SETTINGS = 'GET_SETTINGS',
  /** Persist a single GUI setting at a given scope (global/project). */
  SAVE_SETTINGS = 'SAVE_SETTINGS',

  // -- Claude Code settings (~/.claude/settings.json) --
  /** Read merged or scope-specific Claude Code settings. */
  GET_CLAUDE_SETTINGS = 'GET_CLAUDE_SETTINGS',
  /** Persist a single Claude Code setting at a given scope. */
  SAVE_CLAUDE_SETTINGS = 'SAVE_CLAUDE_SETTINGS',
  /** Read the effective CLAUDE_CONFIG_DIR: active value, per-scope plugin settings, and the value inherited from the environment at startup. inbound webview→backend */
  GET_CLAUDE_CONFIG_DIR = 'GET_CLAUDE_CONFIG_DIR',
  /** Persist CLAUDE_CONFIG_DIR into the plugin settings `env` map at a scope (global/project) and re-apply it. inbound webview→backend */
  SAVE_CLAUDE_CONFIG_DIR = 'SAVE_CLAUDE_CONFIG_DIR',
  /** Set the active model for the session/CLI. */
  SET_MODEL = 'SET_MODEL',
  /** Read the CLI control configuration (slash commands, etc.). */
  GET_CLI_CONFIG = 'GET_CLI_CONFIG',

  // -- Telemetry consent --
  /** Read the current telemetry consent state. */
  GET_TELEMETRY_CONSENT = 'GET_TELEMETRY_CONSENT',
  /** Persist the user's telemetry consent decision. */
  SET_TELEMETRY_CONSENT = 'SET_TELEMETRY_CONSENT',

  // -- Announcements --
  /** Fetch the current locale's announcement list plus dismissedIds. Backend fetches (cached) from the remote delivery endpoint and returns the raw response. inbound webview→backend */
  GET_ANNOUNCEMENTS = 'GET_ANNOUNCEMENTS',
  /** Persist a `{ id }` dismissal to profile.json and return the updated dismissedIds. inbound webview→backend */
  DISMISS_ANNOUNCEMENT = 'DISMISS_ANNOUNCEMENT',
  /** Read whether the user has announcement delivery enabled (profile.json `announcementsEnabled`, default true). inbound webview→backend */
  GET_ANNOUNCEMENTS_ENABLED = 'GET_ANNOUNCEMENTS_ENABLED',
  /** Persist the announcements on/off toggle; when turned off, the backend stops fetching announcements entirely (no network request). inbound webview→backend */
  SET_ANNOUNCEMENTS_ENABLED = 'SET_ANNOUNCEMENTS_ENABLED',

  // -- Sponsor / license --
  /** Build the sponsorship (pricing) URL with the install id + account context prefilled, for the webview to open in the external browser. The install id stays backend-side (never exposed to the webview). inbound webview→backend */
  GET_SPONSOR_URL = 'GET_SPONSOR_URL',
  /** Read the current sponsor entitlement (derived from the locally stored license key). inbound webview→backend */
  GET_SPONSOR_STATUS = 'GET_SPONSOR_STATUS',
  /** Verify a sponsor license key against www; persists it locally on success. inbound webview→backend */
  VERIFY_LICENSE = 'VERIFY_LICENSE',
  /** Remove the stored sponsor license (turn sponsorship off on this install). inbound webview→backend */
  DEACTIVATE_LICENSE = 'DEACTIVATE_LICENSE',
  /** Poll www for a sponsor key minted for this install id and auto-activate it (copy/paste-free). inbound webview→backend */
  CHECK_SPONSOR = 'CHECK_SPONSOR',

  // -- Account / usage / version --
  /** Read the signed-in Claude account info. */
  GET_ACCOUNT = 'GET_ACCOUNT',
  /** List the saved Claude accounts and which one is live now. inbound webview→backend */
  GET_ACCOUNTS = 'GET_ACCOUNTS',
  /** Capture the currently logged-in Claude account into the saved registry. inbound webview→backend */
  SAVE_ACCOUNT = 'SAVE_ACCOUNT',
  /** Switch the live CLI credentials to a saved account by id. inbound webview→backend */
  SWITCH_ACCOUNT = 'SWITCH_ACCOUNT',
  /** Remove a saved account (snapshot + registry entry) by id. inbound webview→backend */
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  /** Read usage/quota information. */
  GET_USAGE = 'GET_USAGE',
  /** Run `claude -p "/usage"` and return its raw report text for the usage modal. inbound webview→backend */
  GET_USAGE_REPORT = 'GET_USAGE_REPORT',
  /** Install the claude-code-battery CLI (npm i -g) that backs the usage panel. inbound webview→backend */
  INSTALL_CCB = 'INSTALL_CCB',
  /** Platform-correct ccb install command + shells for the not-installed notice. inbound webview→backend */
  GET_CCB_INSTALL_HINT = 'GET_CCB_INSTALL_HINT',
  /** Read usage/quota information for all accounts. */
  GET_ALL_USAGE = 'GET_ALL_USAGE',
  /** Read the plugin/backend version info. */
  GET_VERSION = 'GET_VERSION',
  /** Detect the CLI install method + query npm for available versions (stable/latest). inbound webview→backend */
  GET_CLI_UPDATE_INFO = 'GET_CLI_UPDATE_INFO',
  /** Run the install-method-specific update command for the Claude Code CLI. inbound webview→backend */
  UPDATE_CLI = 'UPDATE_CLI',

  // -- Authentication --
  /** Begin the CLI login flow (produces a login URL). */
  LOGIN = 'LOGIN',
  /** Submit the OAuth code pasted back by the user. */
  SUBMIT_LOGIN_CODE = 'SUBMIT_LOGIN_CODE',

  // -- Diff review (request side) --
  /** Open a proposed diff in the IDE diff viewer. */
  OPEN_DIFF = 'OPEN_DIFF',
  /** Accept a proposed diff (write changes to disk). */
  APPLY_DIFF = 'APPLY_DIFF',
  /** Reject a proposed diff (discard changes). */
  REJECT_DIFF = 'REJECT_DIFF',

  // -- Editor / file / project navigation --
  /** Open a file in an IDE editor tab. */
  OPEN_FILE = 'OPEN_FILE',
  /** Open a new Claude Code editor tab in the IDE. */
  OPEN_NEW_TAB = 'OPEN_NEW_TAB',
  /** Open a specific session (focus/route to it). */
  OPEN_SESSION = 'OPEN_SESSION',
  /** Open the settings screen. */
  OPEN_SETTINGS = 'OPEN_SETTINGS',
  /** Open a terminal at the working directory. */
  OPEN_TERMINAL = 'OPEN_TERMINAL',
  /** Open a URL in the external browser. */
  OPEN_URL = 'OPEN_URL',
  /** Open the native folder-picker dialog. */
  OPEN_FOLDER_DIALOG = 'OPEN_FOLDER_DIALOG',
  /** List files under the project for autocomplete/mentions. */
  LIST_PROJECT_FILES = 'LIST_PROJECT_FILES',
  /** Native multi-file picker. */
  PICK_FILES = 'PICK_FILES',
  /** List recent/known projects. */
  GET_PROJECTS = 'GET_PROJECTS',
  /** Read the current working directory the backend resolved. */
  GET_WORKING_DIR = 'GET_WORKING_DIR',
  /** Resolve the IDE project root containing the working directory. */
  GET_IDE_ROOT = 'GET_IDE_ROOT',
  /** Resolve the on-disk output path of a background task. */
  FIND_BG_TASK_OUTPUT_PATH = 'FIND_BG_TASK_OUTPUT_PATH',

  // -- Backend / process control --
  /** Restart the Node.js backend process. */
  RESTART_BACKEND = 'RESTART_BACKEND',

  // -- Terminal / CLI & node path detection --
  /** List terminal emulators available on the host. */
  GET_AVAILABLE_TERMINALS = 'GET_AVAILABLE_TERMINALS',
  /** inbound webview→backend: list code editors available on the host (for the "open files with" setting). */
  GET_AVAILABLE_EDITORS = 'GET_AVAILABLE_EDITORS',
  /** Detect the path to the `claude` CLI binary. */
  GET_DETECTED_CLI_PATH = 'GET_DETECTED_CLI_PATH',
  /** Detect the path to the `node` binary. */
  GET_DETECTED_NODE_PATH = 'GET_DETECTED_NODE_PATH',

  // -- MCP server management --
  /** List all MCP servers with status, scope, and config. inbound webview→backend */
  GET_MCP_SERVERS = 'GET_MCP_SERVERS',
  /** Reconnect (restart) a named MCP server. inbound webview→backend */
  RECONNECT_MCP_SERVER = 'RECONNECT_MCP_SERVER',
  /** Trigger the OAuth/auth flow for a named MCP server. inbound webview→backend */
  AUTHENTICATE_MCP_SERVER = 'AUTHENTICATE_MCP_SERVER',
  /** Clear saved authentication for a named MCP server. inbound webview→backend */
  CLEAR_MCP_SERVER_AUTH = 'CLEAR_MCP_SERVER_AUTH',
  /** Enable or disable a named MCP server (edits disabledMcpServers in config). inbound webview→backend */
  SET_MCP_SERVER_ENABLED = 'SET_MCP_SERVER_ENABLED',
  /** Submit a manual OAuth callback URL after a failed redirect. inbound webview→backend */
  SUBMIT_MCP_OAUTH_CALLBACK_URL = 'SUBMIT_MCP_OAUTH_CALLBACK_URL',
  /** Add a new MCP server via `claude mcp add-json`. inbound webview→backend */
  ADD_MCP_SERVER = 'ADD_MCP_SERVER',
  /** Remove a named MCP server via `claude mcp remove`. inbound webview→backend */
  REMOVE_MCP_SERVER = 'REMOVE_MCP_SERVER',
  /** Search the official MCP registry for installable servers. inbound webview→backend */
  SEARCH_MCP_REGISTRY = 'SEARCH_MCP_REGISTRY',
  /** Fetch the tool list of one MCP server by connecting to it (MCP tools/list). inbound webview→backend */
  GET_MCP_SERVER_TOOLS = 'GET_MCP_SERVER_TOOLS',

  // -- Plugin updates --
  /** Check for available plugin updates. */
  GET_PLUGIN_UPDATES = 'GET_PLUGIN_UPDATES',
  /** Trigger a plugin update. */
  UPDATE_PLUGIN = 'UPDATE_PLUGIN',

  // -- Remote-control tunnel (cloudflared) --
  /** Start the remote-control tunnel. */
  TUNNEL_START = 'TUNNEL_START',
  /** Stop the remote-control tunnel. */
  TUNNEL_STOP = 'TUNNEL_STOP',
  /** Read the current tunnel status. */
  GET_TUNNEL_STATUS = 'GET_TUNNEL_STATUS',
  /** Read whether tunnel prerequisites (cloudflared, etc.) are satisfied. */
  GET_TUNNEL_PREREQS = 'GET_TUNNEL_PREREQS',
  /** Install the cloudflared binary. */
  INSTALL_CLOUDFLARED = 'INSTALL_CLOUDFLARED',
  /**
   * inbound webview→backend. Issue a fresh single-use, short-lived pairing code
   * for the running tunnel and return the QR pairing URL
   * (`https://<sub>.trycloudflare.com/?pair=<code>`). Carries only the code —
   * never the auth token. Re-callable to rotate an expired code.
   */
  ISSUE_TUNNEL_PAIRING = 'ISSUE_TUNNEL_PAIRING',
  /**
   * inbound webview→backend. Issue a fresh single-use pairing code for opening
   * the current session in the SYSTEM BROWSER (a separate storage partition from
   * JCEF, so it cannot reuse the JCEF token). Returns { code }; the webview builds
   * the localhost `?pair=` URL itself. Carries only the code — never the auth
   * token. Unlike ISSUE_TUNNEL_PAIRING this does NOT require a running tunnel.
   */
  ISSUE_LOCAL_PAIRING = 'ISSUE_LOCAL_PAIRING',

  // -- Sleep guard (keep-awake) --
  /** Enable the system sleep guard. */
  SLEEP_GUARD_ENABLE = 'SLEEP_GUARD_ENABLE',
  /** Disable the system sleep guard. */
  SLEEP_GUARD_DISABLE = 'SLEEP_GUARD_DISABLE',

  // -- System sounds --
  /** List available system notification sounds. */
  LIST_SYSTEM_SOUNDS = 'LIST_SYSTEM_SOUNDS',
  /** Play a system notification sound. */
  PLAY_SYSTEM_SOUND = 'PLAY_SYSTEM_SOUND',

  // -- Native drag & drop --
  /** Flush buffered native-drop entries for the active drag. */
  NATIVE_DROP_FLUSH = 'NATIVE_DROP_FLUSH',

  // -- Panel focus routing --
  /** The webview reports its IDE panel (JCEF tab) gained window focus, carrying { panelId }, so the backend routes panel-scoped pushes (editor-context / ide-selection) to only the last-focused panel instead of every open Claude panel. inbound webview→backend */
  PANEL_FOCUSED = 'PANEL_FOCUSED',

  // -- Client diagnostics --
  /** Report client (webview) environment info to the backend. */
  CLIENT_INFO = 'CLIENT_INFO',
  /** Report a client-side (webview) error to the backend. */
  CLIENT_ERROR = 'CLIENT_ERROR',

  // ───────────────────────────────────────────────────────────────────────
  // Outbound — backend → webview (push events & request acknowledgements)
  // ───────────────────────────────────────────────────────────────────────

  // -- Protocol envelopes --
  /** Successful response to a request, matched by `requestId`. */
  ACK = 'ACK',
  /** Error response to a request, matched by `requestId`. */
  ERROR = 'ERROR',
  /** Backend announces it is ready to accept requests. */
  BRIDGE_READY = 'BRIDGE_READY',

  // -- Streaming (Claude CLI process → webview) --
  /** A streamed assistant turn has started. */
  STREAM_START = 'STREAM_START',
  /** A streamed assistant turn has ended. */
  STREAM_END = 'STREAM_END',
  /** Raw CLI stdout event envelope; the webview fans this out into the events below. */
  CLI_EVENT = 'CLI_EVENT',
  /** Session/assistant state transition (idle/streaming/waiting-permission/...). */
  STATE_CHANGE = 'STATE_CHANGE',
  /** A tool invocation began. */
  TOOL_USE = 'TOOL_USE',
  /** A tool invocation completed (with result). */
  TOOL_COMPLETE = 'TOOL_COMPLETE',
  /** Live progress of a background dynamic workflow; payload is a WorkflowTask. */
  WORKFLOW_PROGRESS = 'WORKFLOW_PROGRESS',

  // -- Diff push --
  /** A diff is available to review. */
  DIFF_AVAILABLE = 'DIFF_AVAILABLE',
  /** A diff was proposed by a tool and awaits the user's decision. */
  DIFF_PROPOSED = 'DIFF_PROPOSED',

  // -- Session push --
  /** Full session history payload in response to LOAD_SESSION. */
  SESSION_LOADED = 'SESSION_LOADED',
  /** The session list changed and clients should refresh. */
  SESSIONS_UPDATED = 'SESSIONS_UPDATED',
  /** A user message was broadcast to all connections viewing the session. */
  USER_MESSAGE_BROADCAST = 'USER_MESSAGE_BROADCAST',

  // -- Error / diagnosis push --
  /** A backend service-level error occurred. */
  SERVICE_ERROR = 'SERVICE_ERROR',
  /** Failed to spawn the CLI process. */
  SPAWN_ERROR = 'SPAWN_ERROR',
  /** The CLI process exited with an error. */
  CLI_EXIT_ERROR = 'CLI_EXIT_ERROR',
  /** WSL host/path mismatch detected (Windows + WSL). */
  WSL_HOST_MISMATCH = 'WSL_HOST_MISMATCH',
  /** Structured diagnosis of an authentication failure. */
  AUTH_ERROR_DIAGNOSIS = 'AUTH_ERROR_DIAGNOSIS',

  // -- IDE / editor push --
  /** The resolved IDE project root for the current working directory. */
  IDE_ROOT = 'IDE_ROOT',
  /** The IDE's current editor context (open file/selection). */
  EDITOR_CONTEXT = 'EDITOR_CONTEXT',
  /**
   * outbound backend→webview. The IDE's active editor / selection changed and is
   * pushed automatically (not via an explicit action) so the composer can show a
   * toggleable context chip. Distinct from EDITOR_CONTEXT, which inserts an
   * @mention into the input on an explicit "Add to Claude" (Alt+K) action.
   */
  IDE_SELECTION = 'IDE_SELECTION',
  /** A folder was chosen in the native folder dialog. */
  FOLDER_SELECTED = 'FOLDER_SELECTED',
  /** Resolved entries from a native file/folder drop. */
  NATIVE_DROP_ENTRIES = 'NATIVE_DROP_ENTRIES',
  /** The project list payload in response to GET_PROJECTS. */
  PROJECTS_LIST = 'PROJECTS_LIST',

  // -- Auth push --
  /** The login URL became available during the LOGIN flow. */
  LOGIN_URL_AVAILABLE = 'LOGIN_URL_AVAILABLE',
  /** The saved-account registry or live account changed; clients should refetch GET_ACCOUNT and GET_ACCOUNTS. outbound backend→webview */
  ACCOUNTS_CHANGED = 'ACCOUNTS_CHANGED',

  // -- Tunnel push --
  /** Tunnel status changed. */
  TUNNEL_STATUS = 'TUNNEL_STATUS',
  /** Progress/result of a cloudflared installation. */
  CLOUDFLARED_INSTALL_STATUS = 'CLOUDFLARED_INSTALL_STATUS',

  // -- Sleep guard push --
  /** Sleep-guard state changed. */
  SLEEP_GUARD_STATUS = 'SLEEP_GUARD_STATUS',

  // -- Settings change push --
  /** GUI settings changed on disk/externally; clients should refresh. */
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
  /** Claude Code settings changed on disk/externally; clients should refresh. */
  CLAUDE_SETTINGS_CHANGED = 'CLAUDE_SETTINGS_CHANGED',

  // ───────────────────────────────────────────────────────────────────────
  // Node.js backend ↔ Kotlin (IDE-native JSON-RPC bridge channel)
  //
  // Dispatched between the backend and the KotlinBridge for IDE-only
  // capabilities. The webview never sends these directly; many IDE actions
  // (OPEN_FILE, APPLY_DIFF, CREATE_SESSION, ...) reuse the inbound members
  // above as pass-through, so only the Kotlin-exclusive ones are listed here.
  // ───────────────────────────────────────────────────────────────────────
  /** Ask the IDE to refresh/sync the given file paths in its virtual file system. */
  REFRESH_FILES = 'REFRESH_FILES',
  /** Kotlin → backend notification registering the IDE project root paths. */
  REGISTER_PROJECT_ROOTS = 'REGISTER_PROJECT_ROOTS',
  /** Query the IDE whether a plugin restart is required (e.g. after an update). */
  REQUIRES_RESTART = 'REQUIRES_RESTART',
  /**
   * Node → Kotlin notification carrying the current `hostMode` value
   * (`editor-tab` | `tool-window`). The backend is the single source of truth for
   * settings; on WSL2 the IDE-side JVM home and the Linux home diverge, so Kotlin
   * cannot read the settings file reliably. The backend pushes this on RPC connect
   * and whenever `hostMode` is saved, and Kotlin caches it for synchronous host
   * routing. params: { hostMode: string }.
   */
  HOST_MODE_CHANGED = 'HOST_MODE_CHANGED',

  // ───────────────────────────────────────────────────────────────────────
  // Logging channel (webview LogForwarder → backend log-ws)
  //
  // A dedicated WebSocket channel separate from the IPCMessage envelope, used
  // to ship batched client-side log entries to the backend.
  // ───────────────────────────────────────────────────────────────────────
  /** A batch of forwarded client (webview) log entries. */
  LOG_BATCH = 'LOG_BATCH',
}
