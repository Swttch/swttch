import { plainToInstance } from 'class-transformer';
import { BridgeClient } from '../bridge/BridgeClient';
import { SessionMetaDto } from '../../dto';
import type { ApiConfig } from '../ClaudeCodeApi';
import { MessageType, type SessionSearchHit } from '@/shared';
import { resolveHistoryPages, resolveMessagePageSize } from '@/utils/urlOverrides';

/** What a session search found: coordinates and counts, never the entries. */
export interface SessionSearchResult {
  hits: SessionSearchHit[];
  total: number;
  /** The match limit stopped the search, so older entries were not looked at. */
  truncated: boolean;
}

interface SearchSessionResponse {
  status?: string;
  error?: string;
  hits?: SessionSearchHit[];
  total?: number;
  truncated?: boolean;
}

/** What UPDATE_SESSIONS_ENTRYPOINT did to the sessions of one folder, as session ids. */
export interface SessionsEntrypointUpdate {
  updated: string[];
  running: string[];
  changedMeanwhile: string[];
  failed: { sessionId: string; error: string }[];
}

interface UpdateSessionsEntrypointResponse extends Partial<SessionsEntrypointUpdate> {
  status?: string;
  error?: string;
}

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
  /**
   * When the backend began reading this list. The list is the state of the sessions as of that
   * time: session news up to it is already in the rows, and news after it is not. Missing from
   * a backend that does not say.
   */
  ts?: number;
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
  /**
   * How many working directories these sessions were drawn from, or null when
   * the backend did not say.
   *
   * The list cannot answer this from the rows it holds. The newest sessions can
   * all belong to one directory while the rest of the list holds others, so a
   * page that looks single-directory is not evidence of anything — which is
   * exactly what made a merged list look unmerged until it was scrolled.
   */
  scopeDirCount: number | null;
}

/** How much of the list to fetch. Omitting `limit` asks for all of it. */
export interface SessionListRange {
  offset?: number;
  limit?: number;
}

interface GetSessionsResponse {
  /** When the backend began reading the list. See SessionListResult. */
  ts?: number;
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
  scopeDirCount?: number;
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
      return { sessions: [], hasMore: false, nextOffset: 0, scopeDirCount: null };
    }

    const sessions = plainToInstance(SessionMetaDto, response.sessions);
    const hasMore = response.hasMore === true;
    // A backend that does not report a position cannot be paged past, so the
    // only safe continuation is the range that was just asked for.
    const nextOffset = response.nextOffset ?? (range?.offset ?? 0) + sessions.length;
    // Null rather than a guess: a backend that did not say leaves the list to
    // fall back on what it can see for itself, and pretending it said "one"
    // would state the opposite of what a merged list needs.
    const scopeDirCount = typeof response.scopeDirCount === 'number' ? response.scopeDirCount : null;
    const readAt = typeof response.ts === 'number' ? { ts: response.ts } : {};
    return response.serviceError
      ? { sessions, hasMore, nextOffset, scopeDirCount, ...readAt, serviceError: response.serviceError }
      : { sessions, hasMore, nextOffset, scopeDirCount, ...readAt };
  }

  /**
   * Load a session's messages
   * Triggers SESSION_LOADED event which AppProviders.SessionLoader handles
   * POST /sessions/:id/load
   */
  async load(sessionId: string, workingDir?: string): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.LOAD_SESSION, { sessionId, workingDir: dir, limit: resolveMessagePageSize() });
  }

  /**
   * Load the page of messages before a message cursor, toward the oldest.
   * Triggers SESSION_LOADED event with prepend: true
   *
   * `untilUuid` is the entry the transcript already holds on the far side of the page: the page begins
   * right after it, and the answer says so (`reached`) when there is nothing in between.
   */
  async loadOlder(sessionId: string, beforeUuid: string, untilUuid?: string, workingDir?: string): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.LOAD_OLDER_MESSAGES, { sessionId, workingDir: dir, beforeUuid, untilUuid, limit: resolveMessagePageSize() });
  }

  /**
   * Load the page of messages after a message cursor, toward the newest. The
   * transcript lets go of pages far from the reader, and this brings them back.
   * Triggers SESSION_LOADED event with append: true
   *
   * `untilUuid` is the entry the transcript already holds on the far side of the page: the page ends
   * right in front of it, and the answer says so (`reached`) when there is nothing in between.
   */
  async loadNewer(sessionId: string, afterUuid: string, untilUuid?: string, workingDir?: string): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.LOAD_NEWER_MESSAGES, { sessionId, workingDir: dir, afterUuid, untilUuid, limit: resolveMessagePageSize() });
  }

  /**
   * Load the page of messages centred on one entry the transcript does not hold,
   * for the find bar or the send index jumping to it. The page takes the place of
   * the history held; the newest pages stay.
   * Triggers SESSION_LOADED event with around: true
   */
  async loadAround(sessionId: string, aroundUuid: string, workingDir?: string): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    // All the window keeps around the reader at once, so that a jump does not land beside what is still to come.
    const limit = resolveMessagePageSize() * resolveHistoryPages();
    await this.bridge.request(MessageType.LOAD_MESSAGES_AROUND, { sessionId, workingDir: dir, aroundUuid, limit });
  }

  /**
   * Search a session's whole history for some text without loading it: the
   * entries that contain it, newest first, with how many times each does.
   */
  async search(sessionId: string, query: string, workingDir?: string): Promise<SessionSearchResult> {
    const dir = workingDir ?? this.getConfig().workingDir;
    const response = await this.bridge.request<SearchSessionResponse>(MessageType.SEARCH_SESSION, {
      sessionId,
      workingDir: dir,
      query,
    });
    if (response?.status !== 'ok' || !Array.isArray(response.hits)) {
      throw new Error(response?.error ?? 'Session search failed');
    }
    return {
      hits: response.hits,
      total: typeof response.total === 'number' ? response.total : 0,
      truncated: response.truncated === true,
    };
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
   * Move the sessions of a folder that were started before this app named its entrypoint to that name, so Claude
   * Desktop's "Import Claude Code CLI sessions" lists them (#647). Sessions a CLI is running are left as they are.
   */
  async updateEntrypoint(workingDir?: string): Promise<SessionsEntrypointUpdate> {
    const dir = workingDir ?? this.getConfig().workingDir;
    const response = await this.bridge.request<UpdateSessionsEntrypointResponse>(
      MessageType.UPDATE_SESSIONS_ENTRYPOINT,
      { workingDir: dir },
    );
    if (response?.status !== 'ok' || !Array.isArray(response.updated)) {
      throw new Error(response?.error ?? 'Updating the sessions failed');
    }
    return {
      updated: response.updated,
      running: response.running ?? [],
      changedMeanwhile: response.changedMeanwhile ?? [],
      failed: response.failed ?? [],
    };
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
   * Put the title the session shows into its transcript for Claude Desktop to read, unless the transcript already
   * carries a name. Resolves with whether a name was written.
   */
  async updateDesktopTitle(sessionId: string, title: string, workingDir?: string): Promise<{ written: boolean }> {
    const dir = workingDir ?? this.getConfig().workingDir;
    const response = await this.bridge.request<{ written?: boolean }>(MessageType.UPDATE_SESSION_DESKTOP_TITLE, {
      sessionId,
      title,
      workingDir: dir,
    });
    return { written: response?.written === true };
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
  async reclaim(sessionId: string, workingDir?: string): Promise<void> {
    const dir = workingDir ?? this.getConfig().workingDir;
    await this.bridge.request(MessageType.RECLAIM_SESSION, { sessionId, workingDir: dir, limit: resolveMessagePageSize() });
  }
}
