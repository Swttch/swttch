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

/**
 * Parse CLI stdout to find the control_response event and return it as-is.
 * Returns null if no control_response is found.
 */
export function parseCliConfigResponse(stdout: string): CliConfigControlResponse | null {
  const lines = stdout.split('\n');

  let cliConfigResponse: CliConfigControlResponse | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (event.type === 'control_response') {
      cliConfigResponse = event as unknown as CliConfigControlResponse;
    }
  })

  return cliConfigResponse;
}

// Cache + dedup per workingDir. The Node backend is shared across all IDE
// projects (NodeBackendService is @Service(Service.Level.APP)), so a single
// global cache would leak commands/skills from the first project to every
// other project.
const cacheByWorkingDir = new Map<string, CliConfigControlResponse>();
const pendingByWorkingDir = new Map<string, Promise<CliConfigControlResponse | null>>();

export interface LoadCliConfigOptions {
  /** Skip the cache and respawn the CLI (used by UI-triggered refresh). */
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
  if (options.refresh) {
    cacheByWorkingDir.delete(workingDir);
    pendingByWorkingDir.delete(workingDir);
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

async function loadCliConfigInternal(workingDir: string): Promise<CliConfigControlResponse | null> {
  const args = [
    '-p',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'default',
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

    let stdout = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();

      const config = parseCliConfigResponse(stdout);
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
      console.error('[loadCliConfig] process closed with code:', code, 'stdout length:', stdout.length);
      const config = parseCliConfigResponse(stdout);
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
