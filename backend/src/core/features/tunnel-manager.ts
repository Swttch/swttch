import { spawn, execFileSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, chmodSync, openSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { arch, platform, tmpdir, homedir } from 'os';
import { augmentedEnv } from '../augmented-path';
import { downloadToFile } from './download-file';
import { consoleSafeExecOptions } from '../console-safe';

const execAsync = promisify(execCallback);

export interface TunnelStatus {
  enabled: boolean;
  url: string | null;
}

export type TunnelErrorCode =
  | 'cloudflared-missing' // cloudflared not found and could not be installed
  | 'tunnel-timeout'      // URL never appeared within the timeout window
  | 'tunnel-exited'       // cloudflared exited before producing a URL
  | 'unknown';

/** Error carrying a machine-readable code so the UI can show actionable guidance. */
export class TunnelError extends Error {
  constructor(public readonly code: TunnelErrorCode, message: string) {
    super(message);
    this.name = 'TunnelError';
  }
}

let tunnelProcess: ChildProcess | null = null;
let tunnelUrl: string | null = null;
const TUNNEL_LOG_FILE = resolve(tmpdir(), 'cloudflared-tunnel.log');
const TUNNEL_PID_FILE = resolve(tmpdir(), 'cloudflared-tunnel.pid');

function getLocalBinPath(): string {
  // A stable, writable, per-user location (NOT process.cwd(), which for an
  // IDE-spawned backend is unpredictable and may be read-only). This dir is
  // also registered in candidateBinDirs so an installed binary is found later.
  return resolve(homedir(), '.claude-code-gui', 'bin', getLocalBinName());
}

function getDownloadUrl(): string | null {
  const os = platform();
  const cpuArch = arch();

  if (os === 'darwin') {
    if (cpuArch === 'arm64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz';
    if (cpuArch === 'x64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
  } else if (os === 'linux') {
    if (cpuArch === 'x64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
    if (cpuArch === 'arm64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64';
  } else if (os === 'win32') {
    if (cpuArch === 'x64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
    if (cpuArch === 'arm64') return 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-arm64.exe';
  }

  return null;
}

function getLocalBinName(): string {
  return platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

export async function installCloudflared(): Promise<string> {
  const localBin = getLocalBinPath();
  const localBinDir = resolve(localBin, '..');
  const os = platform();
  // Run every probe/install with the augmented PATH so brew/winget/cloudflared
  // are visible even when the IDE handed us a minimal PATH.
  const env = augmentedEnv();

  // Try package manager first
  if (os === 'darwin') {
    try {
      await execAsync('which brew', { env });
      console.error('[node-backend]', 'Installing cloudflared via Homebrew...');
      await execAsync('brew install cloudflared', { env });
      const { stdout } = await execAsync('which cloudflared', { env });
      return stdout.trim();
    } catch {
      // brew not available or install failed, fall through
    }
  } else if (os === 'win32') {
    try {
      await execAsync('where winget', consoleSafeExecOptions({ env }));
      console.error('[node-backend]', 'Installing cloudflared via winget...');
      await execAsync('winget install --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements', consoleSafeExecOptions({ env }));
      const { stdout } = await execAsync('where cloudflared', consoleSafeExecOptions({ env }));
      return stdout.trim().split('\n')[0];
    } catch {
      // winget not available or install failed, fall through
    }
  }

  // Direct binary download
  const url = getDownloadUrl();
  if (!url) {
    throw new Error(`Unsupported OS/architecture: ${os}/${arch()}. Install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`);
  }

  console.error('[node-backend]', `Downloading cloudflared from ${url}...`);
  mkdirSync(localBinDir, { recursive: true });

  if (url.endsWith('.tgz')) {
    await execAsync(`curl -fsSL "${url}" | tar -xz -C "${localBinDir}"`, { env });
  } else if (os === 'win32') {
    // Windows: Node downloads it itself. PowerShell is not available on every machine.
    await downloadToFile(url, localBin, { timeoutMs: 60_000 });
  } else {
    await execAsync(`curl -fsSL -o "${localBin}" "${url}"`, { env });
  }

  if (os !== 'win32') {
    chmodSync(localBin, 0o755);
  }

  console.error('[node-backend]', 'cloudflared installed successfully');
  return localBin;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function savePidFile(pid: number): void {
  try {
    writeFileSync(TUNNEL_PID_FILE, String(pid), 'utf-8');
  } catch {
    // ignore
  }
}

function removePidFile(): void {
  try {
    if (existsSync(TUNNEL_PID_FILE)) unlinkSync(TUNNEL_PID_FILE);
  } catch {
    // ignore
  }
}

/**
 * Restore tunnel state from previous session.
 * Called on backend startup to recover from backend restart
 * while cloudflared (detached) is still running.
 */
export function restoreTunnelState(): void {
  try {
    if (!existsSync(TUNNEL_PID_FILE) || !existsSync(TUNNEL_LOG_FILE)) return;

    const pid = parseInt(readFileSync(TUNNEL_PID_FILE, 'utf-8').trim(), 10);
    if (isNaN(pid) || !isProcessAlive(pid)) {
      removePidFile();
      return;
    }

    const log = readFileSync(TUNNEL_LOG_FILE, 'utf-8');
    const URL_PATTERN = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
    const match = URL_PATTERN.exec(log);
    if (!match) {
      removePidFile();
      return;
    }

    // Process is alive and URL was found — restore state
    tunnelUrl = match[0];
    // We don't have the ChildProcess reference, but we track the PID
    // getTunnelStatus will use tunnelUrl to determine enabled state
    console.error('[node-backend]', `Restored tunnel state: pid=${pid} url=${tunnelUrl}`);
  } catch {
    // ignore restore errors
  }
}

/**
 * Locate cloudflared WITHOUT installing it — installation is now an explicit,
 * user-consented action (see installCloudflaredHandler). Returns null if not
 * found. The PATH lookup is augmented so an IDE-spawned backend still sees a
 * brew/winget install.
 */
async function findCloudflared(): Promise<string | null> {
  const whichCmd = platform() === 'win32' ? 'where cloudflared' : 'which cloudflared';
  try {
    const { stdout } = await execAsync(whichCmd, consoleSafeExecOptions({ env: augmentedEnv() }));
    const binPath = stdout.trim().split('\n')[0];
    if (binPath) return binPath;
  } catch {
    // not in PATH
  }
  const localBin = getLocalBinPath();
  return existsSync(localBin) ? localBin : null;
}

export function startTunnel(port: number): Promise<string> {
  return new Promise(async (resolvePromise, rejectPromise) => {
    if (tunnelProcess) {
      if (tunnelUrl) {
        resolvePromise(tunnelUrl);
        return;
      }
      rejectPromise(new Error('Tunnel process already running but URL not yet available'));
      return;
    }

    const binaryPath = await findCloudflared();
    if (!binaryPath) {
      // Do NOT auto-install here — the UI asks for consent and calls
      // INSTALL_CLOUDFLARED explicitly before retrying.
      rejectPromise(new TunnelError('cloudflared-missing', 'cloudflared is not installed'));
      return;
    }

    const args = ['tunnel', '--protocol', 'http2', '--url', `http://localhost:${port}`];

    // tunnel.sh 방식: 로그 파일로 리다이렉트 후 polling으로 URL 추출
    const logFd = openSync(TUNNEL_LOG_FILE, 'w');
    const proc = spawn(binaryPath, args, {
      stdio: ['ignore', logFd, logFd],
      detached: true,
      windowsHide: true, // don't pop a console window on Windows
      env: augmentedEnv(),
    });

    tunnelProcess = proc;

    const URL_PATTERN = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        rejectPromise(new TunnelError('tunnel-timeout', 'Timed out waiting for cloudflared tunnel URL (15s)'));
        stopTunnel();
      }
    }, 15_000);

    // 0.5초 간격으로 로그 파일에서 URL 추출 (최대 30회 = 15초)
    const pollId = setInterval(() => {
      try {
        const log = readFileSync(TUNNEL_LOG_FILE, 'utf-8');
        const match = URL_PATTERN.exec(log);
        if (match && !resolved) {
          resolved = true;
          clearInterval(pollId);
          clearTimeout(timeoutId);
          const foundUrl = match[0];
          tunnelUrl = foundUrl;
          if (proc.pid) savePidFile(proc.pid);
          // Resolve as soon as the URL is available. cloudflared prints the URL
          // once the edge routing is essentially ready, so there's no value in
          // an extra HTTP-200 warm-up poll — it only delayed the spinner.
          resolvePromise(foundUrl);
        }
      } catch {
        // file not ready yet
      }
    }, 500);

    proc.on('error', (err) => {
      console.error('[node-backend]', 'cloudflared process error:', err);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        rejectPromise(new TunnelError('unknown', `cloudflared process error: ${err.message}`));
      }
      tunnelProcess = null;
      tunnelUrl = null;
    });

    proc.on('exit', (code, signal) => {
      console.error('[node-backend]', `cloudflared exited with code=${code} signal=${signal}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        rejectPromise(new TunnelError('tunnel-exited', `cloudflared exited unexpectedly (code=${code})`));
      }
      tunnelProcess = null;
      tunnelUrl = null;
    });
  });
}

/** Terminate the cloudflared process by PID, using the right mechanism per OS. */
function killTunnelPid(pid: number): void {
  if (process.platform === 'win32') {
    // Windows ignores SIGTERM; taskkill /T also reaps the detached child tree.
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], consoleSafeExecOptions());
    } catch {
      // already gone
    }
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

export function stopTunnel(): void {
  // Prefer the live ChildProcess pid; fall back to the PID file for a tunnel
  // restored from a previous backend session (no ChildProcess reference).
  let pid = tunnelProcess?.pid ?? null;
  if (pid === null && existsSync(TUNNEL_PID_FILE)) {
    try {
      const parsed = parseInt(readFileSync(TUNNEL_PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(parsed) && isProcessAlive(parsed)) pid = parsed;
    } catch {
      // ignore
    }
  }
  if (pid !== null) killTunnelPid(pid);

  tunnelProcess = null;
  tunnelUrl = null;
  removePidFile();
}

/**
 * Whether cloudflared can be located without installing it. Lets the UI warn
 * the user (and ask for install consent) before they toggle the tunnel on.
 */
export async function isCloudflaredAvailable(): Promise<boolean> {
  return (await findCloudflared()) !== null;
}

/**
 * Verify tunnel process is still alive. If it died without
 * notification (e.g. restored-from-PID-file session), clean up
 * stale state so callers get accurate status.
 *
 * @returns true if state was corrected (was stale → now cleaned up)
 */
export function validateTunnelStatus(): boolean {
  if (tunnelUrl === null) return false;

  // ChildProcess reference exists — Node's 'exit' event handles cleanup
  if (tunnelProcess) return false;

  // Restored state: check PID file
  try {
    if (existsSync(TUNNEL_PID_FILE)) {
      const pid = parseInt(readFileSync(TUNNEL_PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(pid) && isProcessAlive(pid)) return false;
    }
  } catch {
    // read error — treat as dead
  }

  // Process is gone — clean up stale state
  console.error('[node-backend]', 'Tunnel process no longer alive, cleaning up stale state');
  tunnelUrl = null;
  removePidFile();
  return true;
}

export function getTunnelStatus(): TunnelStatus {
  return {
    enabled: tunnelUrl !== null,
    url: tunnelUrl,
  };
}

// Kill cloudflared when backend exits
process.on('exit', () => {
  stopTunnel();
});

process.on('SIGTERM', () => {
  stopTunnel();
});
