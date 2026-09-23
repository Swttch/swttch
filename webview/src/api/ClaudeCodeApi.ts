import { BridgeClient, getBridgeClient } from './bridge/BridgeClient';
import { SessionsApi } from './modules/SessionsApi';
import { MessagesApi } from './modules/MessagesApi';
import { ToolsApi } from './modules/ToolsApi';
import { SoundsApi } from './modules/SoundsApi';
import { MessageType } from '@/shared';
import { NotificationsApi } from './modules/NotificationsApi';

/**
 * API configuration options
 */
export interface ApiConfig {
  workingDir?: string;
}

/**
 * Main API class for Claude Code WebView
 * Provides typed, RESTful-style access to all backend operations
 *
 * Usage:
 * ```typescript
 * import { api } from './api/ClaudeCodeApi';
 *
 * // Configure working directory
 * api.setWorkingDir('/path/to/project');
 *
 * // Session operations (parent resource)
 * const sessions = await api.sessions.index();
 *
 * // Load session (triggers SESSION_LOADED event)
 * await api.sessions.load(sessionId);
 *
 * // Send message
 * await api.messages.create(sessionId, 'Hello');
 *
 * // Tool operations
 * await api.tools.approve(toolUseId);
 * ```
 */
export class ClaudeCodeApi {
  private bridge: BridgeClient;
  private config: ApiConfig;

  readonly sessions: SessionsApi;
  readonly messages: MessagesApi;
  readonly tools: ToolsApi;
  readonly sounds: SoundsApi;
  readonly notifications: NotificationsApi;

  constructor(configOrBridge?: ApiConfig | BridgeClient, bridge?: BridgeClient) {
    // Handle both constructor signatures for backwards compatibility
    if (configOrBridge instanceof BridgeClient) {
      this.bridge = configOrBridge;
      this.config = {};
    } else {
      this.config = configOrBridge || {};
      this.bridge = bridge || getBridgeClient();
    }

    // Create config getter for modules that need it
    const getConfig = () => this.config;

    this.sessions = new SessionsApi(this.bridge, getConfig);
    this.messages = new MessagesApi(this.bridge);
    this.tools = new ToolsApi(this.bridge);
    this.sounds = new SoundsApi(this.bridge, getConfig);
    this.notifications = new NotificationsApi(this.bridge, getConfig);
  }

  /**
   * Set the working directory for all API operations
   */
  setWorkingDir(dir: string): void {
    this.config.workingDir = dir;
  }

  /**
   * Get the current working directory
   */
  get workingDir(): string | undefined {
    return this.config.workingDir;
  }

  /**
   * Check if the API is connected to the backend
   */
  get isConnected(): boolean {
    return this.bridge.isConnected;
  }

  /**
   * Start the CLI service
   */
  async startService(): Promise<void> {
    await this.bridge.request(MessageType.START_SESSION, {});
  }

  /**
   * Stop the CLI service
   */
  async stopService(): Promise<void> {
    await this.bridge.request(MessageType.STOP_SESSION, {});
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(
    callback: (state: string) => void
  ): () => void {
    return this.bridge.subscribe(MessageType.STATE_CHANGE, (message) => {
      callback(message.payload?.state as string);
    });
  }
}

// Singleton instance
let apiInstance: ClaudeCodeApi | null = null;

/**
 * Get the singleton API instance
 */
export function getApi(): ClaudeCodeApi {
  if (!apiInstance) {
    apiInstance = new ClaudeCodeApi();
  }
  return apiInstance;
}

/**
 * Default export for convenient importing
 * Usage: import { api } from './api/ClaudeCodeApi';
 */
export const api = getApi();
