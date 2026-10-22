import { StringDecoder } from 'string_decoder';
import { Claude } from '../claude';

export interface SlashCommandInfo {
  name: string;
  description: string;
  argumentHint: string;
}

export interface ControlResponse<T> {
  type: 'control_response';
  response: {
    subtype: 'success';
    request_id: string;
    response: T;
  };
}

export interface CliInitResponse {
  commands: SlashCommandInfo[];
  agents: AgentInfo[];
  output_style: string;
  available_output_styles: string[];
  models: ModelInfo[];
  account: AccountInfo;
  pid: number;
}

export interface AgentInfo {
  name: string;
  description: string;
  model?: string;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: string[];
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
  supportsAutoMode?: boolean;
}

export interface AccountInfo {
  email: string;
  subscriptionType: string;
}

export type CliConfigControlResponse = ControlResponse<CliInitResponse>;

/** The control_response event on one stdout line, or null for any other line (or noise). */
function parseConfigLine(line: string): CliConfigControlResponse | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }

  return event.type === 'control_response' ? (event as unknown as CliConfigControlResponse) : null;
}

/**
 * Parse CLI stdout to find the control_response event and return it as-is.
 * Returns null if no control_response is found.
 */
export function parseCliConfigResponse(stdout: string): CliConfigControlResponse | null {
  let cliConfigResponse: CliConfigControlResponse | null = null;

  for (const line of stdout.split('\n')) {
    const config = parseConfigLine(line);
    if (config) cliConfigResponse = config;
  }

  return cliConfigResponse;
}

/**
 * Finds the control_response in a CLI's stdout as the chunks arrive.
 *
 * Each completed line is parsed once. The probe used to append every chunk to one string and
 * parse all of it again, so a single 6.5MB hook event arriving in about a hundred chunks was
 * scanned a hundred times (#571). Bytes go through a StringDecoder, which holds back the
 * start of a multi-byte character cut by a chunk boundary instead of replacing it.
 */
export class CliConfigStreamParser {
  private readonly decoder = new StringDecoder('utf8');
  /** Pieces of the line still waiting for its newline; joined once, when the line completes. */
  private partial: string[] = [];
  private found: CliConfigControlResponse | null = null;

  /** Feed a chunk; returns the control_response as soon as its line is complete. */
  push(chunk: Buffer | string): CliConfigControlResponse | null {
    if (this.found) return this.found;

    const text = typeof chunk === 'string' ? chunk : this.decoder.write(chunk);

    // Only the new text is searched for a newline. Searching the whole unfinished line again
    // on every chunk would make one huge line cost as much as re-parsing it did.
    let from = 0;
    let newline = text.indexOf('\n', from);
    while (newline !== -1) {
      this.partial.push(text.slice(from, newline));
      const config = parseConfigLine(this.partial.join(''));
      this.partial = [];
      if (config) {
        this.found = config;
        return config;
      }
      from = newline + 1;
      newline = text.indexOf('\n', from);
    }
    if (from < text.length) this.partial.push(text.slice(from));
    return null;
  }

  /** The stream ended: the last line may have no trailing newline. */
  end(): CliConfigControlResponse | null {
    if (this.found) return this.found;

    this.partial.push(this.decoder.end());
    this.found = parseConfigLine(this.partial.join(''));
    this.partial = [];
    return this.found;
  }
}

// Cache + dedup per workingDir. The Node backend is shared across all IDE
// projects (NodeBackendService is @Service(Service.Level.APP)), so a single
// global cache would leak commands/skills from the first project to every
// other project.
const cacheByWorkingDir = new Map<string, CliConfigControlResponse>();
const pendingByWorkingDir = new Map<string, Promise<CliConfigControlResponse | null>>();

export interface LoadCliConfigOptions {
  /**
   * Skip the cache and ask the CLI again (used by UI-triggered refresh). A probe that is
   * already running for the same workingDir is joined instead of starting another.
   */
  refresh?: boolean;
}

/**
 * Spawn a config-only CLI process to load CLI config for a given workingDir.
 * Sends an `initialize` control_request to get control_response.
 * Results are cached per workingDir; pass `{ refresh: true }` to bypass.
 */
export async function loadCliConfig(
  workingDir: string,
  options: LoadCliConfigOptions = {},
): Promise<CliConfigControlResponse | null> {
  // A refresh discards the finished answer so a skill added at runtime is found (#176), but
  // not a probe that is still running: several windows ask at the same moment when the app
  // starts, and each of them starting its own CLI multiplied the work (#571). A refresh that
  // arrives while a probe is running joins it; one that arrives after it finished starts a new one.
  if (options.refresh) {
    cacheByWorkingDir.delete(workingDir);
  }
  const cached = cacheByWorkingDir.get(workingDir);
  if (cached) {
    console.error('[loadCliConfig] returning cached config for', workingDir);
    return cached;
  }
  const pending = pendingByWorkingDir.get(workingDir);
  if (pending) {
    console.error('[loadCliConfig] dedup — waiting for pending request for', workingDir);
    return pending;
  }
  const promise = loadCliConfigInternal(workingDir);
  pendingByWorkingDir.set(workingDir, promise);
  try {
    const config = await promise;
    if (config) cacheByWorkingDir.set(workingDir, config);
    return config;
  } finally {
    pendingByWorkingDir.delete(workingDir);
  }
}

/** Test-only: clear the workingDir cache between test cases. */
export function _resetCliConfigCache(): void {
  cacheByWorkingDir.clear();
  pendingByWorkingDir.clear();
}

/**
 * The `--settings` value that keeps the config probe from running hooks.
 *
 * The probe only asks for the catalog of commands, agents and models, which hooks do not
 * contribute to, yet every SessionStart hook still ran and its whole output came back on
 * stdout: one measured response was 6.5MB of hook output around a 58KB catalog (#571).
 * `disableAllHooks` is a documented CLI setting, so the catalog stays what a terminal user
 * gets while the hook output is never produced.
 *
 * On Windows the CLI is started through cmd.exe without any quoting of the arguments, which
 * strips unescaped double quotes and would leave invalid JSON. `\"` survives cmd.exe and is
 * turned back into `"` when the launcher splits its command line.
 */
export function configProbeSettingsArg(platform: NodeJS.Platform = process.platform): string {
  const json = JSON.stringify({ disableAllHooks: true });
  return platform === 'win32' ? json.replace(/"/g, '\\"') : json;
}

async function loadCliConfigInternal(workingDir: string): Promise<CliConfigControlResponse | null> {
  const args = [
    '-p',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'default',
    '--settings', configProbeSettingsArg(),
  ];

  // spawnAuthed: the config probe runs as the same authenticated identity as chat
  // (inherited OAuth tokens stripped identically); env-provided API keys are kept. Awaited
  // before wiring handlers — the 'spawn' event fires only after this sync block registers it.
  const proc = await Claude.spawnAuthed(args, workingDir, {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      TERM: 'dumb',
      CI: 'true',
      CLAUDECODE: undefined,
    },
  });

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const safeResolve = (value: CliConfigControlResponse | null): void => {
      if (resolved) return;
      resolved = true;
      // Clear the safety timeout so it cannot fire a stale killTree after the
      // probe process has already closed and its pid may have been reused.
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve(value);
    };

    const parser = new CliConfigStreamParser();
    let stdoutBytes = 0;

    proc.stdout?.on('data', (data: Buffer) => {
      stdoutBytes += data.length;

      const config = parser.push(data);
      if (!config) return;

      console.error('[loadCliConfig] resolved from stdout');
      Claude.killTree(proc);
      safeResolve(config);
    });

    // Send initialize control_request to trigger system/init + control_response
    proc.on('spawn', () => {
      const initReq = JSON.stringify({
        type: 'control_request',
        request_id: 'config_init',
        request: { subtype: 'initialize' },
      }) + '\n';
      proc.stdin?.write(initReq);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      console.error('[loadCliConfig] stderr:', data.toString().substring(0, 300));
    });

    proc.on('error', (err) => {
      console.error('[loadCliConfig] spawn error:', err);
      safeResolve(null);
    });

    proc.on('close', (code) => {
      console.error('[loadCliConfig] process closed with code:', code, 'stdout length:', stdoutBytes);
      const config = parser.end();
      console.error('[loadCliConfig] close fallback:', config ? 'found' : 'null');
      safeResolve(config);
    });

    // Safety timeout — kill process but let close event handle resolve
    timeoutHandle = setTimeout(() => {
      console.error('[loadCliConfig] timeout — killing process');
      Claude.killTree(proc);
    }, 15000);
  });
}
