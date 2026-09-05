import { plainToInstance } from 'class-transformer';
import { BridgeClient } from '../bridge/BridgeClient';
import { SessionMetaDto } from '../../dto';
import type { ApiConfig } from '../ClaudeCodeApi';
import { MessageType } from '@/shared';

/**
 * A non-fatal reason the backend could not list sessions for this working dir.
 * Currently only WSL_HOST_MISMATCH: a Windows-native backend was handed a WSL
 * UNC project path, so the session files live under a Linux home it can't map.
 * The panel renders guidance from this instead of a bare "No sessions yet". (#175)
 */
export interface SessionServiceError {
  type: MessageType;
  reason: string;
}

/** Result of listing sessions: the sessions plus an optional non-fatal notice. */
export interface SessionListResult {
  sessions: SessionMetaDto[];
  serviceError?: SessionServiceError;
  /**
   * Sessions exist past the ones returned. False for an unpaged request, which
   * always carries the whole list.
   */
  hasMore: boolean;
  /**
   * The offset that continues from this result. Not the same as the number of
   * sessions returned: sessions the list does not show still advance the
   * backend's position, so counting rows here would re-read them.
   */
  nextOffset: number;
}

/** How much of the list to fetch. Omitting `limit` asks for all of it. */
export interface SessionListRange {
  offset?: number;
  limit?: number;
}

interface GetSessionsResponse {
  sessions: {
    sessionId: string;
    title: string;
    createdAt: string;
    lastTimestamp: string | null;
    /**
     * null when the backend settled the session's title without reading the
     * file to the end, which is what it does for anything but a short session.
     */
    messageCount: number | null;
    isSidechain: boolean;
    projectPath?: string;
    gitBranch?: string;
  }[];
  serviceError?: SessionServiceError;
  total?: number;
  hasMore?: boolean;
  nextOffset?: number;
}

/**
 * Sessions API module
 * RESTful CRUD operations for sessions
 *
 * Session is the parent resource of messages (1:N relationship)
 */
export class SessionsApi {

  constructor(
    private bridge: BridgeClient,
    private getConfig: () => ApiConfig
  ) {}

  /**
   * List all sessions
   * GET /sessions
   */
  async index(
    workingDir?: string,
    includeNested?: boolean,
    range?: SessionListRange,
  ): Promise<SessionListResult> {
    const dir = workingDir ?? this.getConfig().workingDir;
    const response = await this.bridge.request<GetSessionsResponse>(
      MessageType.GET_SESSIONS,
      {
        workingDir: dir,
        includeNested: includeNested ?? false,
        // Left off entirely when unpaged, so the backend keeps returning the
        // whole list exactly as it did before paging existed.
        ...(range?.offset !== undefined ? { offset: range.offset } : {}),
        ...(range?.limit !== undefined ? { limit: range.limit } : {}),
      }
    );

    if (!response?.sessions || !Array.isArray(response.sessions)) {
      return { sessions: [], hasMore: false, nextOffset: 0 };
    }

    const sessions = plainToInstance(SessionMetaDto, response.sessions);
    const hasMore = response.hasMore === true;
    // A backend that does not report a position cannot be paged past, so the
    // only safe continuation is the range that was just asked for.
    const nextOffset = response.nextOffset ?? (range?.offset ?? 0) + sessions.length;
    return response.serviceError
      ? { sessions, hasMore, nextOffset, serviceError: response.serviceError }
      : { sessions, hasMore, nextOffset };
  }

  /**
   * Load a session's messages
   * Triggers SESSION_LOADED event which AppProviders.SessionLoader handles
   * POST /sessions/:id/load
   */
  async load(sessionId: string, workingDir?: string, limit?: number): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.LOAD_SESSION, { sessionId, workingDir: dir, limit });
  }

  /**
   * Load older messages before a specific message cursor (paging)
   * Triggers SESSION_LOADED event with prepend: true
   */
  async loadOlder(sessionId: string, beforeUuid: string, workingDir?: string, limit?: number): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.LOAD_OLDER_MESSAGES, { sessionId, workingDir: dir, beforeUuid, limit });
  }

  /**
   * Create a new session
   * POST /sessions
   */
  async create(): Promise<void> {
    await this.bridge.request(MessageType.CREATE_SESSION, {});
  }

  /**
   * Delete a session
   * DELETE /sessions/:id
   */
  async destroy(sessionId: string, workingDir?: string): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.DELETE_SESSION, { sessionId, workingDir: dir });
  }

  /**
   * Rename a session (persists a user-specified title override)
   * PATCH /sessions/:id
   */
  async rename(sessionId: string, title: string, workingDir?: string): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.RENAME_SESSION, { sessionId, title, workingDir: dir });
  }

  /**
   * Activate (switch to) a session
   * POST /sessions/:id/activate
   */
  async activate(sessionId: string): Promise<void> {
    await this.bridge.request(MessageType.SESSION_CHANGE, { sessionId });
  }

  /**
   * Reclaim a session that is already in use by another process
   * Kills the existing process and reloads session messages
   * POST /sessions/:id/reclaim
   */
  async reclaim(sessionId: string, workingDir?: string, limit?: number): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.RECLAIM_SESSION, { sessionId, workingDir: dir, limit });
  }
}
