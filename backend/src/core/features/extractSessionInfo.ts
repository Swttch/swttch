import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { createInterface } from 'readline';

/**
 * Extract session info from a JSONL file (Cursor-compatible)
 *
 * The list needs a title, the two timestamps and the sidechain flag. Every one
 * of those except lastTimestamp is decided by the entries at the START of the
 * file, so the forward scan stops as soon as the title is settled instead of
 * parsing megabytes it would only discard. lastTimestamp then comes from a
 * small window at the END of the file.
 *
 * The file is read as a stream rather than loaded whole, so a multi-megabyte
 * session log neither stalls the event loop nor exhausts the heap. See #19.
 */

type ContentBlock = { type: string; text?: string; [key: string]: unknown };
type MessageContent = ContentBlock[] | string | null;

export interface SessionInfo {
  title: string;
  lastTimestamp: string | null;
  createdAt: string;
  /**
   * How many entries the session holds, or null when the file was not read to
   * the end. Counting entries means parsing every line, which is the single
   * thing the forward scan stops early to avoid, so a session whose title was
   * settled before the end reports null rather than a count that would be
   * wrong. No caller renders this value today; it stays on the wire so a later
   * change can fill it in without altering the shape.
   */
  messageCount: number | null;
  isSidechain: boolean;
}

/**
 * Window sizes tried, smallest first, when reading the end of the file for
 * lastTimestamp.
 *
 * A window starts mid-entry, so its first fragment fails to parse and is
 * skipped; every later line is complete. Across the 497 session files larger
 * than 64KB on the machine this was measured on, the smallest window always
 * held at least 3 complete entries, so it is the size that runs in practice.
 *
 * The larger sizes exist because a single entry CAN exceed a window — a session
 * whose final entry is huge would otherwise fall back to a timestamp from the
 * top of the file and sort as though it were old. Widening is rare enough that
 * its cost does not show up, and being wrong here is silent, which is worse
 * than being slow.
 */
const TAIL_WINDOW_SIZES = [64 * 1024, 1024 * 1024, 8 * 1024 * 1024];

function removeSystemTags(text: string): string {
  // Remove XML-style tags and their content
  const tagPattern = /<[^>]+>[^<]*<\/[^>]+>/g;
  let cleaned = text.replace(tagPattern, '');

  // Remove self-closing or unclosed tags
  const singleTagPattern = /<[^>]+>/g;
  cleaned = cleaned.replace(singleTagPattern, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // When the text is nothing but system tags (e.g. a slash command like
  // "<command-name>/init</command-name>"), nothing meaningful is left. Return
  // the empty string so the caller can fall through to the next title
  // candidate instead of leaking the raw tags.
  return cleaned;
}

/**
 * Derive a title from a user message's text. A slash command is recorded as
 * "<command-name>/init</command-name>", so we surface "/init" — mirroring the
 * command chip the chat renders (see the webview's parseUserContent) rather than
 * leaking raw tags or the expanded command prompt. Otherwise the text is returned
 * with system tags stripped, or null when nothing meaningful remains so the caller
 * can fall through to the next candidate.
 */
function deriveTitleFromUserText(text: string): string | null {
  const commandMatch = /<command-name>([\s\S]*?)<\/command-name>/.exec(text);
  if (commandMatch) {
    const name = commandMatch[1].trim().replace(/^\/+/, '');
    if (name) return `/${name}`;
  }
  const cleaned = removeSystemTags(text.replace(/\n/g, ' ').trim());
  return cleaned.length > 0 ? cleaned : null;
}

function extractTextFromContent(content: MessageContent): string | null {
  if (Array.isArray(content)) {
    const lastTextBlock = content.filter((block) => block.type === 'text').pop();
    return lastTextBlock?.text ?? null;
  } else if (typeof content === 'string') {
    return content;
  }
  return null;
}

// Counted toward messageCount + lastTimestamp + (potentially) hasUserOrAssistant.
const COUNTED_TYPES = new Set(['user', 'assistant', 'attachment', 'system', 'progress']);

// First entry of these types decides isSidechain for the whole session
// (Cursor performRefresh semantics).
const SIDECHAIN_GATE_TYPES = new Set(['user', 'assistant', 'attachment', 'system']);

interface HeadScan {
  createdAt: string;
  lastTimestamp: string | null;
  title: string | null;
  summary: string | null;
  messageCount: number;
  hasUserOrAssistant: boolean;
  isSidechain: boolean;
  /** The sidechain gate tripped, so the session is not shown at all. */
  skipSession: boolean;
  /**
   * The scan consumed the whole file. This single fact answers two questions:
   * messageCount is trustworthy, and the tail window holds nothing the scan has
   * not already seen.
   */
  readToEnd: boolean;
}

/**
 * Read forward from the start of the file, stopping once the title is settled.
 *
 * Reaching the end without stopping is the ordinary outcome for a short
 * session, and it is what makes messageCount trustworthy for those files.
 */
function scanHead(file: string): Promise<HeadScan> {
  return new Promise((resolve, reject) => {
    let messageCount = 0;
    let firstTimestamp: string | null = null;
    let lastTimestamp: string | null = null;
    let firstUserPrompt: string | null = null;
    let firstSummary: string | null = null;
    let hasUserOrAssistant = false;
    let sidechainGateSeen = false;
    let isSidechainFromGate = false;
    let skipSession = false;
    let stoppedEarly = false;

    const stream = createReadStream(file, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let settled = false;

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      rl.close();
      stream.destroy();
      if (err) {
        reject(err);
        return;
      }
      resolve({
        createdAt: firstTimestamp ?? '',
        lastTimestamp,
        title: firstUserPrompt,
        summary: firstSummary,
        messageCount,
        hasUserOrAssistant,
        isSidechain: isSidechainFromGate,
        skipSession,
        readToEnd: !stoppedEarly,
      });
    };

    const stopEarly = () => {
      stoppedEarly = true;
      settle();
    };

    stream.on('error', settle);
    rl.on('error', settle);

    rl.on('line', (line) => {
      if (settled) return;
      if (!line.trim()) return;

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = (entry.type as string) ?? null;
      const timestamp = (entry.timestamp as string) ?? null;
      const isSidechain = (entry.isSidechain as boolean) ?? false;
      const isMeta = (entry.isMeta as boolean) ?? false;

      if (timestamp && firstTimestamp === null) {
        firstTimestamp = timestamp;
      }

      // A summary outranks the first prompt as a title, but finding one is NOT
      // a reason to stop: a summary carries no user or assistant entry, so
      // stopping here would leave "does this session hold a conversation at
      // all" unanswered and mislabel the session Empty. The scan records the
      // summary and reads on until a prompt settles the title.
      if (type === 'summary') {
        if (firstSummary === null) {
          const summary = (entry.summary as string) ?? null;
          if (summary) firstSummary = summary;
        }
        return;
      }

      if (!type || !COUNTED_TYPES.has(type)) return;

      messageCount++;
      if (timestamp) lastTimestamp = timestamp;

      if (SIDECHAIN_GATE_TYPES.has(type) && !sidechainGateSeen) {
        sidechainGateSeen = true;
        isSidechainFromGate = isSidechain;
        if (isSidechain) {
          skipSession = true;
          stopEarly();
          return;
        }
      }

      if (type === 'user' || type === 'assistant') {
        hasUserOrAssistant = true;
      }

      // Capture the first meaningful prompt from a real (non-meta) user message.
      // A slash command surfaces as its name ("/init"); a normal message uses its
      // text with system tags stripped. Entries that reduce to nothing (a bare
      // system tag, an empty tool_result) are skipped so the scan continues to the
      // next real prompt.
      if (type === 'user' && !isMeta && firstUserPrompt === null) {
        const messageObj = entry.message as Record<string, unknown> | undefined;
        const content = (messageObj?.content ?? null) as MessageContent;
        const text = extractTextFromContent(content);
        if (text) {
          const candidate = deriveTitleFromUserText(text);
          if (candidate) {
            firstUserPrompt = candidate;
            // The title is settled. Everything still missing (lastTimestamp, and
            // a summary should the file carry one) is recoverable from the tail.
            stopEarly();
          }
        }
      }
    });

    rl.once('close', () => settle());
  });
}

export interface TailScan {
  lastTimestamp: string | null;
  summary: string | null;
}

/**
 * Read the last window of the file for the values the forward scan skipped.
 *
 * A summary is looked for here as well as in the head: it is the higher-ranked
 * title and the CLI appends it, so stopping the forward scan early must not be
 * able to lose one that sits at the end of the file.
 */
export async function scanTail(file: string): Promise<TailScan> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    if (size === 0) return { lastTimestamp: null, summary: null };

    let result: TailScan = { lastTimestamp: null, summary: null };

    for (const windowSize of TAIL_WINDOW_SIZES) {
      const length = Math.min(windowSize, size);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);

      result = readWindow(buffer);

      // A timestamp was found, or the window already covered the whole file so
      // a wider one would read the same bytes again.
      if (result.lastTimestamp !== null || length >= size) break;
    }

    return result;
  } finally {
    await handle.close();
  }
}

/** Walk a tail window backwards for the newest counted timestamp and a summary. */
function readWindow(buffer: Buffer): TailScan {
  const lines = buffer.toString('utf-8').split('\n');
  let lastTimestamp: string | null = null;
  let summary: string | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Either the window cut this line in half, or the file holds a
      // malformed one. Both are skipped exactly as the forward scan does.
      continue;
    }

    const type = (entry.type as string) ?? null;

    if (type === 'summary' && summary === null) {
      const value = (entry.summary as string) ?? null;
      if (value) summary = value;
      continue;
    }

    // Same rule as the forward scan: only a counted entry moves the clock.
    if (lastTimestamp === null && type && COUNTED_TYPES.has(type)) {
      const timestamp = (entry.timestamp as string) ?? null;
      if (timestamp) lastTimestamp = timestamp;
    }
  }

  return { lastTimestamp, summary };
}

export async function extractSessionInfo(file: string): Promise<SessionInfo> {
  const head = await scanHead(file);

  if (head.skipSession) {
    return {
      title: 'Sidechain Session',
      lastTimestamp: null,
      createdAt: head.createdAt,
      messageCount: head.readToEnd ? head.messageCount : null,
      isSidechain: true,
    };
  }

  // Reading to the end already produced every value, so opening the file a
  // second time would only re-read bytes the scan has seen.
  const tail = head.readToEnd ? { lastTimestamp: null, summary: null } : await scanTail(file);

  // The scan stops early only once a real user prompt has settled the title, so
  // any session that stopped early demonstrably holds a conversation. That is
  // what lets this check stand on hasUserOrAssistant alone: reaching here with
  // the flag false means the scan saw the whole file and found no conversation,
  // and messageCount is therefore a complete count.
  if (!head.hasUserOrAssistant) {
    return {
      title: 'Empty Session',
      lastTimestamp: null,
      createdAt: head.createdAt,
      messageCount: head.messageCount,
      isSidechain: true,
    };
  }

  const title = head.summary ?? tail.summary ?? head.title ?? 'No title';

  return {
    title,
    lastTimestamp: head.readToEnd ? head.lastTimestamp : (tail.lastTimestamp ?? head.lastTimestamp),
    createdAt: head.createdAt,
    messageCount: head.readToEnd ? head.messageCount : null,
    isSidechain: head.isSidechain,
  };
}
