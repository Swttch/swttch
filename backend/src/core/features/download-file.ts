import { createWriteStream } from 'fs';
import { rename, rm } from 'fs/promises';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import { pipeline } from 'stream/promises';

export interface DownloadOptions {
  /** How long the whole download may take, body included. */
  timeoutMs: number;
  /** For tests. Defaults to Node's own `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Downloads [url] to [destination] with Node alone.
 *
 * The Windows download used to go through PowerShell, which does not exist as an option on a
 * machine where PowerShell is blocked. Node ships what is needed, so nothing else is started.
 *
 * The bytes land in `<destination>.download` first and are moved into place when complete, so
 * a download that stops half way never leaves a truncated file where an installed binary is
 * looked for.
 */
export async function downloadToFile(url: string, destination: string, options: DownloadOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const partial = `${destination}.download`;
  try {
    const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(options.timeoutMs) });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
    }
    await pipeline(Readable.fromWeb(response.body as unknown as WebReadableStream), createWriteStream(partial));
    await rename(partial, destination);
  } catch (err) {
    await rm(partial, { force: true });
    throw err;
  }
}
