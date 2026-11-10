import { Type, Transform, Expose } from 'class-transformer';
import { AnyMessageDto } from '../message/MessageDto';
import { transformMessages } from '../../mappers/messageTransformer';
import { toFullTitle, toTitle } from '../../mappers/sessionTransformer';
import { To, ToDate, Rename } from '../decorators';

/**
 * The row the session-management MCP (`@swttch/session-manager-mcp`) keeps about
 * a session, as that package wrote it: what the CLI has no place for. The field
 * names belong to the package and are not renamed here.
 *
 * Only the fields this app reads are spelled out. The rest of the row arrives
 * with them and stays on the object.
 */
export class SessionMarkDto {
  /** The session the row is about (the session id the CLI gave it). */
  id: string;
  /** The session that started this one, or null when nothing did or it was moved to the top level. */
  parentSessionUid: string | null = null;
  /**
   * The session the Claude desktop app says started this one, in the CLI's id. Not a column of the package: this
   * app adds it beside the row when the package left the parent open (null, never ''), see `starterIdOf`.
   */
  desktopParentSessionId: string | null = null;
  /** The short name the family of sessions calls it by. */
  handle: string | null = null;
  /** When the package started the session, in milliseconds; 0 when it did not start it. */
  startedAt: number = 0;
  /** When the session was archived, in milliseconds; 0 when it is not archived. */
  archivedAt: number = 0;
}

/**
 * Session metadata DTO
 */
export class SessionMetaDto {
  @Rename('sessionId') id: string;
  @To(toTitle) title: string;
  /**
   * The whole title, where `title` is cut to fit a tab or a row. Empty (not "No title") when
   * there is none, so a caller falls back on `title`.
   */
  @Expose()
  @Transform(({ obj }) => toFullTitle(obj.title))
  fullTitle?: string;
  @ToDate() createdAt: Date;
  @Expose()
  @Transform(({ obj }) => {
    const ts = obj.lastTimestamp || obj.createdAt;
    return ts ? new Date(ts) : new Date();
  })
  updatedAt: Date;

  /**
   * How many entries the session holds, or null when the backend did not count
   * them. Listing a session settles its title from the opening entries and
   * stops there, so only a short session arrives with a count. Nothing renders
   * this today; it stays on the DTO so a later change can fill it in.
   */
  messageCount: number | null = null;
  isSidechain: boolean = false;
  projectPath?: string;
  gitBranch?: string;
  /**
   * The working directory this session belongs to. Always sent, so a row can
   * name where it came from and be opened in its own directory rather than the
   * one currently being browsed — they differ once nested sessions are listed.
   */
  sessionDir?: string;
  /**
   * What the session-management MCP recorded about this session, when it
   * recorded anything. The list draws a session under the one that started it
   * from `parentSessionUid`.
   */
  @Type(() => SessionMarkDto)
  sessionMark?: SessionMarkDto;
}

/**
 * Full session DTO with metadata and messages
 */
export class SessionDto {
  @Type(() => SessionMetaDto) meta: SessionMetaDto;
  @To(transformMessages) messages: AnyMessageDto[];
}

/**
 * Session list response DTO
 */
export class SessionListResponseDto {
  @Type(() => SessionMetaDto)
  sessions: SessionMetaDto[];
}
