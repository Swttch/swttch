import { execFileSync, execSync } from 'child_process';
import { selectKillablePids } from './core/port-utils';
import { startWebSocketServer, type BridgeMap } from './ws/ws-server';
import { BrowserBridge } from './bridge/browser-bridge';
import { JetBrainsBridge } from './bridge/jetbrains-bridge';
import { handleMessage } from './core/handlers/index';
import { initSettingsWatcher, stopSettingsWatcher } from './core/features/settings-watcher';
import { migrateSettingsToCorrectStore } from './core/features/settings-migration';
import { ensureProfile } from './core/features/profile';
import { trackEvent, reportBackendError } from './core/features/telemetry';
import { restoreTunnelState } from './core/features/tunnel-manager';
import { tunnelPairing } from './core/features/tunnel-pairing';
import { restoreSleepGuardState } from './core/features/sleep-guard';
import { registerAutoResumeHook } from './core/features/auto-resume';
import { isJetBrainsMode, serverPort, serverHost, webviewDir } from './config/environment';
import { parseResolveDiffParams, resolveDiffReview } from './core/features/resolveDiff';
import { initLogger, getLogger } from './logging';
import { LogWebSocketServer } from './logging/log-ws';
import { Claude } from './core/claude';
import { sweepOrphanCliProcesses } from './core/cli-registry';
import { startParentWatchdog } from './core/parent-watchdog';
import { ClientEnv, MessageType } from './shared';
import type { NativeDropEntry } from './core/types';

/**
 * JetBrains 모드: JETBRAINS_MODE=true 환경변수로 감지
 * - Kotlin이 Node.js를 spawn할 때 이 환경변수를 설정
 * - WEBVIEW_DIR: WebView 정적 파일 경로 (Kotlin이 추출 후 전달)
 * - Node.js는 PORT:{n}\n을 stdout 첫 줄에 출력 (Kotlin이 읽음)
 * - IDE는 /rpc WebSocket 경로로 연결하여 JSON-RPC 통신
 * - stderr는 로그 출력
 *
 * Browser (standalone) 모드: 기본값
 * - 고정 포트(19836) 사용 (PORT 환경변수로 오버라이드 가능)
 * - BrowserBridge 사용 (Vite dev server가 정적 파일 제공)
 *
 * 부트스트랩 순서:
 * 1. JetBrainsBridge 생성 (WebSocket RPC 클라이언트 대기)
 * 2. WebSocket 서버 시작 (포트 확보)
 * 3. PORT:{port}\n 을 stdout에 출력 (Kotlin이 읽음)
 * 4. Kotlin이 /rpc WebSocket에 연결 → JSON-RPC 채널 수립
 * 5. Kotlin이 http://localhost:{port} 로 JCEF 로드 → /ws WebSocket 연결
 */

const GRACEFUL_RECLAIM_MS = 2_500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listeningPidsOnPort(port: number): number[] {
  // CRITICAL: only ever target processes *LISTENING* on the port. A plain
  // `lsof -ti :PORT` also returns processes merely connected to it — including the
  // IDE JVM's RPC WebSocket — and killing those kills the entire IDE (exit 137).
  // Restricting to LISTEN sockets + filtering our own PID (selectKillablePids)
  // ensures we only reclaim the port from a stale backend, never the IDE.
  if (process.platform === 'win32') {
    try {
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf8',
      }).trim();
      if (!output) return [];
      // Last column of each netstat row is the PID.
      const rawPids = output
        .split('\n')
        .map((line) => line.trim().split(/\s+/).pop() ?? '')
        .join('\n');
      return selectKillablePids(rawPids, process.pid);
    } catch {
      // netstat/findstr returns non-zero when no match — ignore
      return [];
    }
  }
  try {
    // -sTCP:LISTEN restricts the query to listening sockets only.
    const raw = execFileSync('lsof', ['-ti', `:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return selectKillablePids(raw, process.pid);
  } catch {
    // lsof returns non-zero when no process found — ignore
    return [];
  }
}

/**
 * Direct children of a stale backend, captured BEFORE it is killed. If the
 * graceful phase fails and we SIGKILL the backend, it can no longer clean its
 * CLI children up itself — we sweep the survivors from here instead. POSIX only
 * (win32 uses taskkill /T, which tears the whole tree down by itself).
 */
function childPidsOf(pid: number): number[] {
  try {
    const raw = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' });
    return selectKillablePids(raw, process.pid);
  } catch {
    // pgrep returns non-zero when there are no children — ignore
    return [];
  }
}

function sigkillPid(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)]);
    } else {
      process.kill(pid, 'SIGKILL');
    }
    console.error('[node-backend]', `SIGKILLed stale process ${pid}`);
  } catch {
    // Process may have already exited — ignore
  }
}

async function startServerWithRetry(
  bridges: BridgeMap,
  logWs?: LogWebSocketServer,
): Promise<Awaited<ReturnType<typeof startWebSocketServer>>> {
  const start = () =>
    startWebSocketServer(serverPort, serverHost, bridges, handleMessage, webviewDir, logWs);
  try {
    return await start();
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;

    const stalePids = listeningPidsOnPort(serverPort);
    console.error(
      '[node-backend]',
      `Port ${serverPort} already in use by PID(s) ${stalePids.join(', ') || '?'}. Reclaiming...`,
    );

    if (process.platform === 'win32') {
      // Node emulates SIGTERM with TerminateProcess on Windows, so there is no
      // graceful phase to offer — go straight to the tree kill (taskkill /T takes
      // the stale backend's CLI children down with it).
      stalePids.forEach(sigkillPid);
      await delay(200);
      return await start();
    }

    // Ask the stale backend to shut down FIRST: its SIGTERM handler runs
    // shutdownAll(), which kills its CLI children. The previous straight-SIGKILL
    // behavior orphaned them (measured with a real orphan: it kept making API
    // calls for ~5 more minutes). Children are captured up front so that if we
    // do have to escalate, we can sweep the CLI trees the SIGKILL leaves behind.
    const staleChildren = stalePids.flatMap(childPidsOf);
    stalePids.forEach((pid) => {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Process may have already exited — ignore
      }
    });

    // The dying backend frees the port at close() almost immediately; it may then
    // linger flushing logs, which is fine — we only need the LISTEN socket.
    const deadline = Date.now() + GRACEFUL_RECLAIM_MS;
    while (Date.now() < deadline) {
      await delay(250);
      try {
        return await start();
      } catch (retryErr: unknown) {
        if ((retryErr as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw retryErr;
      }
    }

    console.error('[node-backend]', 'Graceful port reclaim timed out — escalating to SIGKILL');
    stalePids.forEach(sigkillPid);
    for (const child of staleChildren) {
      // Group signal first: post-fix backends spawn chat CLIs as process-group
      // leaders, so -pid takes the whole CLI tree; plain kill covers pre-fix ones.
      try {
        process.kill(-child, 'SIGKILL');
      } catch {
        try {
          process.kill(child, 'SIGKILL');
        } catch {
          // Already gone — ignore
        }
      }
    }
    await delay(200);
    return await start();
  }
}

/**
 * Validate NATIVE_DROP `params.entries` arriving over JSON-RPC. Kotlin builds
 * each entry as `{ path: string; type: "file" | "folder" }`, but the value lands
 * here as `unknown`, so we narrow it explicitly. Malformed elements are dropped
 * (not coerced) so a single bad path can't poison the stash.
 */
function parseNativeDropEntries(raw: unknown): NativeDropEntry[] {
  if (!Array.isArray(raw)) return [];
  const result: NativeDropEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { path?: unknown; type?: unknown };
    if (typeof candidate.path !== 'string' || !candidate.path) continue;
    const type = candidate.type === 'folder' ? 'folder' : 'file';
    result.push({ path: candidate.path, type });
  }
  return result;
}

async function main() {
  // Survive parent process (Kotlin/JVM) shutdown.
  // When JVM exits, stdin/stdout/stderr pipes break. Without these handlers,
  // any console.error() call would crash the process with EPIPE.
  process.on('SIGPIPE', () => {}); // Ignore SIGPIPE signal
  process.stdout.on('error', () => {}); // Ignore stdout EPIPE
  process.stderr.on('error', () => {}); // Ignore stderr EPIPE

  // No temp-dir cleanup on exit. The JetBrains plugin extracts webview/backend
  // resources into a version-scoped dir shared across backend generations and prunes
  // stale versions at extraction time (issue #149). Deleting on exit here would let an
  // old generation remove the dir a new one is actively serving → blank `Not found`.

  // 1. Logger 즉시 초기화 (부트스트랩 로그도 파일에 기록)
  const logger = initLogger();
  await logger.init();
  logger.interceptConsole();

  // 설치 단위 가명 식별자(uuid)를 동의 여부와 무관하게 보장한다.
  await ensureProfile();

  // 각 설정 키를 공식 스키마 기준의 올바른 저장소로 1회 이관한다(양방향).
  // 멱등(이미 이관됐으면 no-op)하고, 실패해도 시작을 막지 않도록 내부에서 방어한다.
  // 첫 GET_SETTINGS/GET_CLAUDE_SETTINGS가 이관된 값을 보도록 서버 시작 전에 await.
  await migrateSettingsToCorrectStore();

  // 백엔드 error boundary의 최상위(process-global) 절반. 핸들러 흐름 밖에서 터진 에러
  // (예: 비동기 콜백의 미처리 throw)도 reportBackendError 단일 진입점으로 수렴시킨다.
  // 보고·로깅만 하고 프로세스 동작은 기존 생존 스타일 유지 — 강제 종료/재throw하지 않는다.
  process.on('uncaughtException', (err) => {
    console.error('[node-backend]', 'uncaughtException:', err);
    reportBackendError(err, { layer: 'process', hook: 'uncaughtException' });
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('[node-backend]', 'unhandledRejection:', err);
    reportBackendError(err, { layer: 'process', hook: 'unhandledRejection' });
  });

  // 동의(ACCEPTED)한 사용자에 한해 앱 시작(활성) 이벤트를 보낸다. 공통 필드(os/버전/설정 등)는
  // trackEvent가 자동으로 싣는다. 미동의면 내부에서 no-op.
  trackEvent('app_started');

  // Load CLI path from settings before any handler can spawn claude
  await Claude.refresh();

  // Orphan sweep: a backend that died hard (SIGKILL bypasses every
  // JS-level guard from the process-group hard-binding) leaves its CLI children running
  // headless. The registry written at spawn time lets this fresh backend find
  // and kill them before it starts serving.
  await sweepOrphanCliProcesses();

  const bridges: BridgeMap = {
    [ClientEnv.BROWSER]: new BrowserBridge(),
    [ClientEnv.JETBRAINS]: new JetBrainsBridge(),
  };

  // 2. LogWebSocketServer 생성
  const logWs = new LogWebSocketServer((entries) => {
    logger.handleWebViewLogs(entries);
  });

  // 3. 서버 시작 (logWs 전달)
  const { port, close, connections } = await startServerWithRetry(bridges, logWs);

  // Register the AUTO_RESUME pre-send gate on the scheduled-message engine once,
  // now that the ConnectionManager (needed to broadcast poll progress) exists.
  // The engine's per-session timers are restored on session connect; this only
  // installs the quota-check hook the engine calls before delivering a reservation.
  registerAutoResumeHook(connections);

  // Last-resort orphan guard: tie CLI lifetime to backend lifetime. Every soft
  // cleanup path (grace timers, shutdownAll) needs a LIVE backend; this hook
  // covers every death that still runs 'exit' hooks (process.exit, fatal
  // main().catch, handled signals). uncaughtException/unhandledRejection above
  // deliberately do NOT exit (survival style), so they reach this hook only if
  // the process really dies. A hard SIGKILL bypasses JS entirely — that residual
  // gap is narrowed by the graceful port reclaim (startServerWithRetry) and,
  // later, orphan detection at startup.
  process.on('exit', () => {
    const killed = connections.killAllSessionProcesses('SIGKILL');
    if (killed > 0) {
      console.error('[node-backend]', `Exit sweep: SIGKILLed ${killed} CLI process tree(s)`);
    }
  });

  // Stash native drop paths on drag-enter; the webview will flush them on its drop event.
  // The page's HTML5 `dataTransfer` doesn't expose absolute paths (browser security), so
  // Kotlin sends the paths it received from CefDragHandler over /rpc, and we hold them
  // against the panelId until the webview confirms the actual drop via NATIVE_DROP_FLUSH.
  // That ensures attach happens on release — not on hover — while still using the real
  // OS file paths.
  // Kotlin (IDE plugin) error boundary → Node. The plugin's top-level catch forwards
  // exceptions here as a CLIENT_ERROR JSON-RPC notification; we converge them at the
  // single backend reporting point with origin:'kotlin'. Kotlin holds no telemetry
  // logic (single-backend principle) — it is only the transport that hands the error
  // to Node. Fire-and-forget; never throws back into the RPC reader.
  (bridges[ClientEnv.JETBRAINS] as JetBrainsBridge).onNotification('CLIENT_ERROR', (_method, params) => {
    const message = typeof params.message === 'string' && params.message.length > 0
      ? params.message
      : 'Unknown Kotlin error';
    const error = new Error(message);
    if (typeof params.stack === 'string' && params.stack.length > 0) {
      error.stack = params.stack;
    }
    const context: Record<string, string> = { origin: 'kotlin', layer: 'plugin' };
    if (typeof params.where === 'string' && params.where.length > 0) {
      context.where = params.where;
    }
    reportBackendError(error, context);
  });

  (bridges[ClientEnv.JETBRAINS] as JetBrainsBridge).onNotification('NATIVE_DROP', (_method, params) => {
    const panelId = typeof params.panelId === 'string' ? params.panelId : '';
    const entries = parseNativeDropEntries(params.entries);
    if (!panelId || entries.length === 0) return;
    const stashed = connections.setNativeDropStash(panelId, entries);
    if (!stashed) {
      console.error('[node-backend]', `[NATIVE_DROP] stash failed — no connection for panelId=${panelId}`);
    }
  });

  // Parent-death watchdog. The parent (the process that spawned and owns this
  // backend) dying is the signal that the backend must give up — but what
  // "giving up" means differs by who the owner is:
  //
  //  - JetBrains: the owner is the IDE, and it is NOT the only surface that can
  //    keep the backend useful — a browser/tunnel client may still be working.
  //    So on IDE death the backend does NOT exit; it only flips the keep-alive
  //    gate off, restoring the idle-shutdown regime. A live /ws client keeps it
  //    alive; with none, setKeepAlive(false) arms the idle timer immediately, so
  //    a truly orphaned client-less backend exits after the grace (this also
  //    closes the prewarm-leak case).
  //
  //  - Standalone: the owner is the terminal shell that launched `ccg`, and it
  //    OWNS the lifetime outright. When the shell is gone the backend must die
  //    regardless of any browser/tunnel client — otherwise it is a literal
  //    orphan nobody launched and nobody can stop. The clean path is SIGHUP
  //    (handled below); this watchdog is the backup for the cases SIGHUP does
  //    not cover (shell SIGKILLed, or the backend reparented away from the
  //    terminal), detected within one poll interval.
  //
  // The standalone arm is installed after `shutdown` is defined (below), since
  // its callback calls it.
  if (isJetBrainsMode) {
    startParentWatchdog(() => connections.setKeepAlive(false));
  }

  // Idle-shutdown gate ("keep backend running"). Kotlin pushes the
  // desired state on every /rpc (re)connect and on user toggle; a `false` push
  // with zero /ws connections arms the idle timer immediately (see
  // ConnectionManager.setKeepAlive), which also closes the pre-existing
  // prewarm leak where a backend that never received a /ws client lived forever.
  (bridges[ClientEnv.JETBRAINS] as JetBrainsBridge).onNotification(MessageType.SET_KEEP_ALIVE, (_method, params) => {
    connections.setKeepAlive(params.enabled === true);
  });

  // The IDE's diff viewer reporting which hunks of a pending edit the user kept
  // (#109). Answering happens there because that is where the change is legible;
  // the backend turns the selection into the CLI's control_response.
  (bridges[ClientEnv.JETBRAINS] as JetBrainsBridge).onNotification(MessageType.RESOLVE_DIFF, (_method, params) => {
    const parsed = parseResolveDiffParams(params);
    if (!parsed) {
      console.error('[node-backend]', 'RESOLVE_DIFF ignored: malformed params');
      return;
    }
    resolveDiffReview(connections, parsed);
  });

  // 4. Logger에 LogWS 참조 설정
  logger.setLogWs(logWs);

  // PORT를 stdout 첫 줄에 출력. Wrapper(JetBrains 플러그인 또는 ccg standalone
  // 런처)가 이를 읽고 후속 연결을 시작한다. 사용자가 직접 `node backend.mjs`로
  // 실행하더라도 한 줄 noise일 뿐 부작용 없음.
  process.stdout.write(`PORT:${port}\n`);

  console.error(
    '[node-backend]',
    `Server started on ${serverHost}:${port}`,
    `(mode: ${isJetBrainsMode ? 'JetBrains' : 'browser'})`,
    webviewDir ? `(webviewDir: ${webviewDir})` : '',
  );

  // Seed the launcher-provided INITIAL LOCAL pairing code. The launcher (Kotlin
  // plugin / ccg CLI) owns the stable auth token and, on each launch, mints a
  // single-use pairing code that it (a) passes here via CCG_INITIAL_PAIR_CODE and
  // (b) embeds as `?pair=` in the local webview URL. Seeding it lets the local
  // webview redeem it at /pair for the token on first load — the token is thus
  // NEVER placed in any URL. Guarded on presence; the code value is NEVER logged.
  const initialPairCode = process.env.CCG_INITIAL_PAIR_CODE?.trim();
  if (initialPairCode) {
    tunnelPairing.seedCode(initialPairCode);
    console.error('[node-backend]', 'Seeded initial local pairing code');
  }

  // Restore tunnel/sleep state from previous session
  restoreTunnelState();
  restoreSleepGuardState().catch(() => {});

  // Start watching all settings files for external changes
  const settingsWatcher = initSettingsWatcher((event, data) => {
    console.error('[node-backend]', `Broadcasting ${event} event`);
    connections.broadcastToAll(event, data);
  });
  settingsWatcher.startGlobalWatchers();

  async function shutdown(signal: string) {
    console.error('[node-backend]', `${signal} received, shutting down...`);
    stopSettingsWatcher();
    connections.shutdownAll();
    close();

    // 로그 스트림 flush 대기 (최대 5초)
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    await Promise.race([getLogger().close(), timeoutPromise]);

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  // SIGHUP (terminal window closed): MANDATORY now that chat CLIs run in their own
  // process groups — they no longer receive the terminal's SIGHUP alongside the
  // backend (pre-fix they died with us for free). Without
  // this handler the process-group isolation itself would mint a new orphan class.
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  // Standalone parent-death watchdog (see the JetBrains/standalone split above):
  // the owning shell dying means the backend must exit outright — browser/tunnel
  // clients do NOT keep a shell-orphaned backend alive. SIGHUP is the clean path;
  // this is the backup for a shell SIGKILL or a reparent that delivers no SIGHUP.
  if (!isJetBrainsMode) {
    startParentWatchdog(() => shutdown('parent-death'));
  }
}

main().catch((err) => {
  console.error('[node-backend]', 'Fatal error:', err);
  process.exit(1);
});
