import { Type, Transform, Expose } from 'class-transformer';
import { AnyMessageDto } from '../message/MessageDto';
import { transformMessages } from '../../mappers/messageTransformer';
import { toTitle } from '../../mappers/sessionTransformer';
import { To, ToDate, Rename } from '../decorators';

/**
 * Session metadata DTO
 */
export class SessionMetaDto {
  @Rename('sessionId') id: string;
  @To(toTitle) title: string;
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
