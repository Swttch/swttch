import type { ChildProcess } from 'child_process';
import type { ConnectionManager } from '../ws/connection-manager';
import type { Bridge } from '../bridge/bridge-interface';
import { Claude } from './claude';
import { diagnoseAuthError } from './features/auth-diagnosis';
import { EditedFileTracker } from './features/editedFileTracker';
import { WorkflowProgressTracker } from './features/workflow-tracker';
import { isWslUncPath } from './wsl-path';
import { reportBackendError } from './features/telemetry';
import { restoreSchedulesForSession } from './features/scheduled-messages';
import { openDiffForPermission, rememberPreview, resolveDiffPreview } from './features/diffPreview';
import { readMergedSettings } from './features/settings';
import { findLiveCliForSession, killRegisteredCli, registerCliProcess, unregisterCliProcess } from './cli-registry';
import { MessageType } from '../shared';

// Tracks files Claude edits so the IDE can be told to reload them once the
// edit completes on disk. Shared across sessions — tool_use ids are unique.
const editedFileTracker = new EditedFileTracker();

// Tracks background dynamic workflows and streams live progress to the webview.
// Lazily created on the first stream event because it needs the (single,
// process-lifetime) ConnectionManager to broadcast from its polling timers.
let workflowTracker: WorkflowProgressTracker | null = null;
function getWorkflowTracker(connections: ConnectionManager): WorkflowProgressTracker {
  if (!workflowTracker) workflowTracker = WorkflowProgressTracker.create(connections);
  return workflowTracker;
}

/**
 * Settle a session's still-running background workflows as `stopped` and push a
 * final update to the webview.
 *
 * NOT called on interrupt any more (issue #330). An `interrupt` ends the turn
 * but leaves background tasks running — measured: the CLI answers the interrupt
 * and emits `result`, while the task sends no `task_notification` and keeps
 * going. Settling here painted live tasks as stopped, and a single Escape wiped
 * the Background tasks panel. A task still shown as "running" after Escape is
 * running.
 *
 * Has no caller at the moment. Process death is already handled by
 * `workflowTracker.stopSession` in the CLI `close` handler, which covers the
 * case this was written for; what is left here is settling workflows while the
 * process lives on, and nothing needs that today.
 */
export function stopWorkflowsForSession(sessionId: string): void {
  workflowTracker?.stopRunning(sessionId);
}

/**
 * Whether a workflow is still actually running in this process. Lets transcript
 * reconstruction (on session load) keep a genuinely-running workflow as
 * `running` while settling interrupted ones to `stopped` instead of resurrecting
 * them as `running`.
 */
export function isWorkflowRunning(sessionId: string, toolUseId: string): boolean {
  return workflowTracker?.isRunning(sessionId, toolUseId) ?? false;
}

// InputMode -> CLI --permission-mode flag mapping
const INPUT_MODE_TO_CLI_FLAG: Record<string, string> = {
  plan: 'plan',
  bypass: 'bypassPermissions',
  ask_before_edit: 'default',
  auto_edit: 'acceptEdits',
  auto: 'auto',
};

// Reverse of the above: the CLI reports its permission mode using its own flag
// names, and we store modes in the webview's vocabulary. Derived from the forward
// map so the two can never drift apart. Exported: both the live stream (system
// events) and the on-disk JSONL (user entries) carry the mode as this same flag
// vocabulary in a `permissionMode` field, so the translation is shared while each
// caller decides which entry's field to read (see readReportedMode and
// findLastReportedModeInPage in loadSessionMessages.ts).
export const CLI_FLAG_TO_INPUT_MODE: Record<string, string> = Object.fromEntries(
  Object.entries(INPUT_MODE_TO_CLI_FLAG).map(([inputMode, flag]) => [flag, inputMode]),
);

/**
 * The permission mode a CLI stream event reports, translated into our InputMode
 * vocabulary — or null if this event does not report one.
 *
 * The CLI announces its mode on `system/init` (at spawn) and again on
 * `system/status` when it changes the mode itself, which is how an approved
 * ExitPlanMode plan leaving plan mode becomes observable without inspecting the
 * tool call. Exported for tests.
 */
export function readReportedMode(event: Record<string, unknown>): string | null {
  if (event.type !== 'system') return null;
  const flag = event.permissionMode;
  if (typeof flag !== 'string') return null;
  return CLI_FLAG_TO_INPUT_MODE[flag] ?? null;
}

/**
 * Build the argv for spawning the Claude CLI in interactive print mode.
 * Extracted as a pure function so the flag composition (session flag,
 * permission mode, pinned model) is unit-testable without spawning a process.
 */
export function buildClaudeArgs(
  sessionFlag: string,
  targetSessionId: string,
  inputMode: string | undefined,
  model?: string,
): string[] {
  const args: string[] = [
    '-p',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    sessionFlag,
    targetSessionId,
  ];

  // No requested mode means nothing has established one for this session yet, so
  // the CLI is left to read its own `permissions.defaultMode`. Passing a flag here
  // would override that setting rather than defer to it — `--permission-mode
  // default` names the ask-before-edits mode, it does not mean "follow settings".
  const cliFlag = inputMode ? INPUT_MODE_TO_CLI_FLAG[inputMode] : undefined;
  if (cliFlag) {
    args.push('--permission-mode', cliFlag);
  }

  // Pin the user-selected model so the spawn honors it even when the previous
  // process has exited — set_model only reaches a live process, so without this
  // a model picked while idle would be lost and the CLI would fall back to its
  // default. 'default' is that very fallback, so passing it is redundant; omit
  // it to avoid handing the CLI a no-op alias.
  if (model && model !== 'default') {
    args.push('--model', model);
  }

  return args;
}

// result 이벤트 수신 여부 추적 (비정상 종료 시 에러 전파 판단용)
const sessionsWithResult = new Set<string>();

// Sessions whose CLI we are killing on purpose to respawn it under a different
// permission mode. The exit is ours, not a failure, so the close handler must not
// surface it as an error or as STREAM_END — the user only asked to switch modes and
// a new process is already on its way. Cleared as soon as that close is observed.
const sessionsRestartingForMode = new Set<string>();

// How long to wait for a CLI to exit on SIGTERM during a mode-change restart before
// escalating to SIGKILL. The user is waiting on their message, so this stays short.
const MODE_RESTART_KILL_TIMEOUT_MS = 3000;

// 한 번이라도 spawn된 세션 추적 (재시작 시 --resume 사용 판단용)
// --session-id: 새 세션 전용 (JSONL 이미 존재하면 "already in use" 에러)
// --resume: 기존 세션 이어받기 (JSONL이 있어야 동작)
const spawnedSessions = new Set<string>();

/**
 * 외부에서 세션을 spawned로 마킹 (다음 spawn 시 --resume 사용).
 * reclaimSession 등에서 사용.
 */
export function markSessionAsSpawned(sessionId: string): void {
  spawnedSessions.add(sessionId);
}

/**
 * Whether a live CLI running under `liveMode` can serve a message requesting
 * `requestedMode`, or has to be restarted first.
 *
 * `--permission-mode` is a spawn-time flag and no official CLI command changes it
 * in place, so honoring a mid-chat mode change means respawning (#172). Extracted
 * as a pure function so this decision is unit-testable without spawning anything.
 *
 * Every message carries the mode the UI is currently showing, so this compares it
 * against what the CLI is actually running under. `liveMode` tracks the CLI, not
 * merely the flag we spawned it with: the CLI reports its own mode on `system/init`
 * and again on `system/status` whenever it changes it itself (approving an
 * ExitPlanMode plan leaves plan mode with no respawn), and the stream handler keeps
 * the record in step. Comparing against a spawn-time-only record would read that
 * self-initiated exit as "no change" and reuse a CLI that is no longer in plan.
 *
 * A null `liveMode` means we have a process but never recorded a mode for it (e.g. a
 * session reclaimed after a backend restart). Restarting is the safe reading: reusing
 * would gamble on an unknown mode and risk edits running under looser permissions
 * than the user chose.
 */
export function needsRestartForMode(
  liveMode: string | null,
  requestedMode: string | undefined,
): boolean {
  // No requested mode is not a mode to compare against — it means the sender has
  // no mode to ask for, so whatever the live CLI is already running under stands.
  // Restarting here would tear down a working process to spawn an identical one.
  if (!requestedMode) return false;
  return liveMode !== requestedMode;
}

/**
 * Terminate a session's live CLI so it can be respawned under a different
 * permission mode, and wait until it is really gone.
 *
 * Waiting matters: the respawn uses `--resume` on the same session, and two CLIs
 * writing one JSONL branches the history. The CLI's own 'close' handler does the
 * teardown (process reference, registry entry), so this only has to kill and wait
 * for that to run. The timeout is a liveness guard — a CLI ignoring SIGTERM gets
 * SIGKILL rather than hanging the user's message forever.
 */
async function restartForModeChange(
  connections: ConnectionManager,
  sessionId: string,
  proc: ChildProcess,
): Promise<void> {
  sessionsRestartingForMode.add(sessionId);

  const exited = new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }
    proc.once('close', () => resolve());
  });

  Claude.killTree(proc);

  let escalation: NodeJS.Timeout | undefined;
  const escalated = new Promise<void>((resolve) => {
    escalation = setTimeout(() => {
      console.error(
        '[node-backend]',
        `CLI for session ${sessionId} did not exit on SIGTERM; escalating to SIGKILL`,
      );
      Claude.killTree(proc, 'SIGKILL');
      resolve();
    }, MODE_RESTART_KILL_TIMEOUT_MS);
  });

  await Promise.race([exited, escalated]);
  if (escalation) clearTimeout(escalation);
  // After a SIGKILL escalation the close handler may still be pending; give it the
  // same bounded wait so the respawn never races the teardown it depends on.
  await Promise.race([exited, new Promise<void>((r) => setTimeout(r, MODE_RESTART_KILL_TIMEOUT_MS))]);

  sessionsRestartingForMode.delete(sessionId);

  // The close handler clears these, but a hard-killed process that never ran it
  // would otherwise leave the respawn reusing a dead reference and a stale buffer.
  connections.setProcess(sessionId, null);
  connections.setBuffer(sessionId, '');
  // The turn-in-flight flag is normally cleared by the CLI `result` event, with
  // STREAM_END as the process-death safety net — and this restart deliberately
  // suppresses that STREAM_END. A previous turn that died without a `result`
  // would leave the flag stuck on forever, so clear it here explicitly. The
  // replacement process sets it again when the pending message reaches stdin.
  connections.setStreaming(sessionId, false);
}

/**
 * 세션에 대한 claude -p 프로세스가 없으면 새로 spawn한다.
 * 이미 살아있는 프로세스가 있으면 아무 것도 하지 않는다.
 * 단, 요청된 권한 모드가 살아있는 프로세스의 모드와 다르면
 * 그 모드로 재시작한다(--permission-mode는 spawn 시점 플래그이므로).
 */
export async function ensureClaudeProcess(
  connections: ConnectionManager,
  connectionId: string,
  workingDir: string,
  targetSessionId: string,
  inputMode: string | undefined,
  bridge: Bridge,
  model?: string,
): Promise<void> {
  // Standalone mode on Windows can't reach a WSL project's tooling: cmd.exe rejects
  // the UNC cwd and the CLI would use PowerShell instead of bash. Guide the user to
  // launch the GUI from inside their WSL shell. (JetBrains mode runs the backend
  // inside the distro, so platform is 'linux' there and this never trips.) Issue #57.
  if (process.platform === 'win32' && isWslUncPath(workingDir)) {
    const msg =
      'This project is inside WSL. On Windows, start the GUI from your WSL shell ' +
      '(run `ccg` in a WSL terminal) so Claude runs with bash and a Linux working ' +
      'directory instead of failing on the Windows UNC path.';
    console.error('[node-backend]', msg);
    connections.broadcastToSession(targetSessionId, MessageType.SERVICE_ERROR, {
      type: MessageType.WSL_HOST_MISMATCH,
      reason: msg,
      error: msg,
    });
    connections.broadcastToSession(targetSessionId, MessageType.STREAM_END);
    return;
  }

  const existingSession = connections.getSession(targetSessionId);
  if (existingSession?.process) {
    // `--permission-mode` is a spawn-time flag: a live CLI keeps whatever mode it
    // started with, and no official CLI command changes it in place. So when the user
    // picks a different mode mid-chat, honoring it means restarting the process under
    // the new flag — otherwise the choice is silently dropped and the CLI's next
    // `system/init` pushes the old mode back onto the webview, which looks like the
    // mode flipping itself off (#172). Same mode → reuse as before.
    const liveMode = connections.getInputMode(targetSessionId);
    if (!needsRestartForMode(liveMode, inputMode)) {
      console.error(
        '[node-backend]',
        `Reusing existing process for session ${targetSessionId} (PID: ${existingSession.process.pid})`,
      );
      return;
    }

    console.error(
      '[node-backend]',
      `Permission mode changed (${liveMode} -> ${inputMode}) for session ${targetSessionId}; ` +
        `restarting CLI (PID: ${existingSession.process.pid})`,
    );
    await restartForModeChange(connections, targetSessionId, existingSession.process);
  }

  // Liveness guard before spawning: a live, identity-checked CLI may
  // already be writing this session's JSONL — an orphan left by a hard-killed
  // backend, or a session legitimately open under another live backend. Spawning
  // a second CLI would mean two writers on one JSONL (branched history,
  // false task verdicts, interleaved GUI) — so kill the orphan / refuse the takeover.
  const conflict = findLiveCliForSession(targetSessionId);
  if (conflict) {
    if (conflict.ownerAlive) {
      const reason =
        `Session ${targetSessionId} is already active under another backend ` +
        `(CLI PID ${conflict.entry.pid}, backend PID ${conflict.entry.owner.pid}). ` +
        'Refusing to start a second writer on the same session.';
      console.error('[node-backend]', reason);
      connections.broadcastToSession(targetSessionId, MessageType.SERVICE_ERROR, {
        type: MessageType.SPAWN_ERROR,
        reason,
        error: reason,
      });
      connections.broadcastToSession(targetSessionId, MessageType.STREAM_END);
      return;
    }
    console.error(
      '[node-backend]',
      `Killing orphaned CLI ${conflict.entry.pid} before respawning session ${targetSessionId}`,
    );
    await killRegisteredCli(conflict.entry);
    // The orphan proves this session already ran — resume it instead of passing
    // --session-id, which would fail with "already in use".
    spawnedSessions.add(targetSessionId);
  }

  const useResume = spawnedSessions.has(targetSessionId);
  const sessionFlag = useResume ? '--resume' : '--session-id';

  console.error('[node-backend]', `Starting Claude CLI process (-p interactive)...`);
  console.error('[node-backend]', `Working directory: ${workingDir}`);
  console.error('[node-backend]', `Session: ${targetSessionId} (${sessionFlag})`);

  const args = buildClaudeArgs(sessionFlag, targetSessionId, inputMode, model);

  console.error('[node-backend]', `Command: ${Claude.command} ${args.join(' ')}`);

  // Load this project's CLAUDE_CONFIG_DIR (project > global) onto process.env before
  // spawning, so the CLI resolves the right Claude data dir for THIS workingDir. (#123)
  await Claude.applyConfigDir(workingDir);

  // spawnAuthed strips inherited OAuth tokens (e.g. from Claude Desktop spawning the IDE) so
  // the CLI falls through to its refreshable keychain auth. Centralized in Claude so chat and
  // `auth status` strip identically; user-pinned / ANTHROPIC_API_KEY env is preserved there.
  const proc = await Claude.spawnAuthed(args, workingDir, {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    // POSIX: detach the CLI into its own process group so every kill path can take
    // down the WHOLE tree at once (Claude.killTree signals -pid: the CLI plus its
    // subagent shells and background tasks). Trade-off: a detached CLI no longer
    // shares the terminal's process group, so it stops receiving the terminal's
    // SIGHUP alongside the backend — server.ts compensates with its own SIGHUP
    // handler (graceful shutdownAll). Keep those two in sync.
    detached: process.platform !== 'win32',
    env: {
      TERM: 'dumb',
      CI: 'true',
      CLAUDECODE: undefined,
    },
    // win32: route this long-lived chat CLI through a Job Object wrapper so its
    // whole tree (incl. MSYS/git-bash workers that escape taskkill /F /T) dies with
    // the backend. POSIX uses the detached process-group above instead.
  }, targetSessionId);

  let stderrBuffer = '';

  // spawn 완료까지 대기 (sendMessageToProcess가 안전하게 stdin write 가능하도록)
  await new Promise<void>((resolve, reject) => {
    proc.on('spawn', () => {
      console.error('[node-backend]', `Claude CLI spawned with PID: ${proc.pid}`);
      resolve();
    });
    proc.on('error', (err) => {
      console.error('[node-backend]', 'Failed to start Claude CLI:', err);
      // No trackError here: this rejects the awaited spawn promise, so it propagates
      // up through ensureClaudeProcess → sendMessageHandler → the ws-server handler
      // boundary, which reports it once via reportBackendError. Reporting here too
      // would double-count.
      connections.broadcastToSession(targetSessionId, MessageType.SERVICE_ERROR, {
        type: MessageType.SPAWN_ERROR,
        reason: err.message,
        error: err.message,
      });
      connections.broadcastToSession(targetSessionId, MessageType.STREAM_END);

      const session = connections.getSession(targetSessionId);
      if (session) {
        connections.setProcess(targetSessionId, null);
      }
      reject(err);
    });
  });

  // 성공적으로 spawn됨 → 다음 재시작 시 --resume 사용
  spawnedSessions.add(targetSessionId);

  // SessionRecord에 프로세스 저장
  connections.setProcess(targetSessionId, proc);
  // Remember the mode this process actually runs under, so a later mode change is
  // detected and honored by restarting instead of being silently dropped (#172).
  // Must follow setProcess — clearing the process also clears the recorded mode.
  // Spawning without a requested mode leaves this null: the CLI picked the mode
  // from its own settings, and it reports that choice on `system/init`, which is
  // what fills the record in.
  connections.setInputMode(targetSessionId, inputMode ?? null);
  connections.setBuffer(targetSessionId, '');

  // The session's process is now alive — this is where we re-arm any scheduled
  // messages ("send later" reservations) that outlived a backend restart. Timers
  // live in memory only, so a restart drops them; restoring here (the single
  // convergence point where a session's process spawns) rebuilds them so a due
  // reservation can deliver to this fresh process. Idempotent (already-armed
  // timers are skipped) and fire-and-forget so it never blocks the stream start.
  void restoreSchedulesForSession(targetSessionId, connections);

  // Record the live CLI in the on-disk registry: lets a FUTURE backend detect this
  // process as an orphan (startup sweep) or as a conflicting writer (resume guard)
  // if we die hard before the 'close' handler unregisters it.
  registerCliProcess(proc, targetSessionId, workingDir);

  // 모든 구독자에게 스트림 시작 알림
  connections.broadcastToSession(targetSessionId, MessageType.STREAM_START);

  proc.stdout?.on('data', (data: Buffer) => {
    // claude CLI stdout streaming runs outside the handleMessage flow, so the ws-server
    // handler boundary can't catch a throw here. Route any unexpected failure to the
    // single backend error reporting point so this async path converges with the rest.
    try {
      const chunk = data.toString();
      console.error('[node-backend]', `RAW stdout: ${chunk.trimEnd()}`);

      const currentBuffer = connections.getBuffer(targetSessionId);
      const newBuffer = currentBuffer + chunk;

      const lines = newBuffer.split('\n');
      connections.setBuffer(targetSessionId, lines.pop() ?? '');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          console.error('[node-backend]', `JSON event type: ${event.type}`);
          handleStreamEvent(targetSessionId, event, connections, bridge);
        } catch {
          // Non-JSON line is expected noise (not an error) in stream-json mode — only log.
          console.error('[node-backend]', `Non-JSON output (unexpected in stream-json mode): ${line}`);
        }
      }
    } catch (err) {
      reportBackendError(err instanceof Error ? err : new Error(String(err)), {
        layer: 'claude_stream',
        phase: 'stdout',
      });
    }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    console.error('[node-backend]', `Claude CLI stderr: ${text}`);
    stderrBuffer += text;
  });

  proc.on('close', (code) => {
    // Like the stdout handler, this close callback fires outside the handleMessage flow;
    // converge any unexpected throw at the single backend error reporting point.
    try {
      console.error('[node-backend]', `Claude CLI process exited with code: ${code}`);

      // We killed this process ourselves to respawn it under a new permission mode.
      // The user asked to switch modes, not to end anything, and a replacement CLI is
      // already being spawned — so skip the failure reporting and the STREAM_END that
      // would otherwise flash an error and a dead stream in the middle of a mode change.
      const restartingForMode = sessionsRestartingForMode.has(targetSessionId);

      // 남은 버퍼 처리
      const remainingBuffer = connections.getBuffer(targetSessionId);
      if (remainingBuffer.trim()) {
        try {
          const event = JSON.parse(remainingBuffer) as Record<string, unknown>;
          handleStreamEvent(targetSessionId, event, connections, bridge);
        } catch {
          console.error('[node-backend]', `Remaining buffer (non-JSON): ${remainingBuffer}`);
        }
        connections.setBuffer(targetSessionId, '');
      }

      // "already in use" 에러 감지 → spawnedSessions에 추가 (다음 시도에서 --resume 사용)
      // 이 경우는 백엔드 콜드스타트 시 기존 세션에 접근할 때 발생
      if (code !== 0 && stderrBuffer.includes('already in use')) {
        spawnedSessions.add(targetSessionId);
      }

      // 비정상 종료 + result 미수신 → 에러 전파
      if (code !== 0 && !sessionsWithResult.has(targetSessionId) && !restartingForMode) {
        const errorMessage = stderrBuffer.trim() || `Claude CLI exited with code ${code}`;
        connections.broadcastToSession(targetSessionId, MessageType.SERVICE_ERROR, {
          type: MessageType.CLI_EXIT_ERROR,
          reason: errorMessage,
          error: errorMessage,
          exitCode: code,
        });
        // 인증 에러 진단
        diagnoseAuthError(targetSessionId, errorMessage, connections).catch(() => {});
      }

      // 추적 정리
      sessionsWithResult.delete(targetSessionId);

      // On a mode-change restart the session continues in the replacement process, so
      // neither of these applies: tearing down the workflow tracker would drop progress
      // the new CLI still reports on, and STREAM_END would end a stream the user never
      // stopped. The respawn emits its own STREAM_START.
      if (!restartingForMode) {
        workflowTracker?.stopSession(targetSessionId);
        connections.broadcastToSession(targetSessionId, MessageType.STREAM_END);
      }

      // 프로세스 참조만 해제 (세션 레코드는 유지 — 구독자가 아직 있을 수 있음)
      connections.setProcess(targetSessionId, null);
      // Clean CLI exit — drop its registry entry (hard backend deaths skip this;
      // that is exactly what the startup orphan sweep is for).
      unregisterCliProcess(proc.pid);
    } catch (err) {
      reportBackendError(err instanceof Error ? err : new Error(String(err)), {
        layer: 'claude_stream',
        phase: 'close',
      });
    }
  });
}

/**
 * 기존 프로세스의 stdin에 JSON 메시지를 write한다.
 * 프로세스가 없거나 stdin이 쓸 수 없으면 false를 반환한다.
 */
export function sendMessageToProcess(
  connections: ConnectionManager,
  sessionId: string,
  content: string,
  attachments?: Array<
    | { type: 'image'; fileName: string; mimeType: string; base64: string }
    | { type: 'file'; fileName: string; absolutePath: string }
    | { type: 'folder'; folderName: string; absolutePath: string }
  >,
): boolean {
  const session = connections.getSession(sessionId);
  if (!session?.process?.stdin?.writable) {
    console.error('[node-backend]', `No writable stdin for session: ${sessionId}`);
    return false;
  }

  // 파일/폴더 경로를 프롬프트 앞에 삽입
  const fileRefs = attachments?.filter(a => a.type !== 'image') ?? [];
  let finalContent = content;
  if (fileRefs.length > 0) {
    const pathLines = fileRefs.map(r => (r as { absolutePath: string }).absolutePath).join('\n');
    finalContent = `${pathLines}\n\n${content}`;
  }

  // 이미지만 image block으로 변환
  const imageAtts = attachments?.filter(a => a.type === 'image') ?? [];

  let messageContent: string | Array<Record<string, unknown>>;
  if (imageAtts.length > 0) {
    const blocks: Array<Record<string, unknown>> = [];
    if (finalContent) {
      blocks.push({ type: 'text', text: finalContent });
    }
    for (const att of imageAtts) {
      if (att.type === 'image') {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mimeType, data: att.base64 },
        });
      }
    }
    messageContent = blocks;
  } else {
    messageContent = finalContent;
  }

  const stdinMessage =
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: messageContent },
    }) + '\n';

  // Truncate log to avoid flooding with base64 data
  const logPreview = stdinMessage.length > 200
    ? stdinMessage.substring(0, 200) + `... (${stdinMessage.length} bytes total)`
    : stdinMessage.trimEnd();
  console.error('[node-backend]', `Sending to stdin: ${logPreview}`);
  session.process.stdin.write(stdinMessage);
  // Turn in flight — cleared on the CLI `result` event (turn end) or on
  // STREAM_END (process death safety net inside broadcastToSession).
  connections.setStreaming(sessionId, true);
  return true;
}

/**
 * CLI에 interrupt control_request를 보낸다.
 * SIGTERM 대신 stdin을 통해 graceful하게 현재 생성을 중단시킨다.
 * CLI는 interrupt를 받으면 현재 턴을 중단하고, stdin 버퍼에 대기 중인 다음 메시지를 처리한다.
 */
export function sendInterruptToProcess(
  connections: ConnectionManager,
  sessionId: string,
): boolean {
  const session = connections.getSession(sessionId);
  if (!session?.process?.stdin?.writable) {
    console.error('[node-backend]', `No writable stdin for session: ${sessionId}`);
    return false;
  }

  const requestId = Math.random().toString(36).substring(2, 15);
  const stdinMessage =
    JSON.stringify({
      type: 'control_request',
      request_id: requestId,
      request: { subtype: 'interrupt' },
    }) + '\n';

  console.error('[node-backend]', `Sending interrupt to stdin: ${stdinMessage.trimEnd()}`);
  session.process.stdin.write(stdinMessage);
  return true;
}

/**
 * tool_result를 CLI stdin에 전송한다.
 * 일반 user message와 달리 content를 tool_result 블록 배열로 구성한다.
 */
export function sendToolResultToProcess(
  connections: ConnectionManager,
  sessionId: string,
  toolResult: { type: string; tool_use_id: string; content: string; is_error: boolean },
): boolean {
  const session = connections.getSession(sessionId);
  if (!session?.process?.stdin?.writable) {
    console.error('[node-backend]', `No writable stdin for session: ${sessionId}`);
    return false;
  }

  const stdinMessage =
    JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [toolResult] },
    }) + '\n';

  const logPreview = stdinMessage.length > 200
    ? stdinMessage.substring(0, 200) + `... (${stdinMessage.length} bytes total)`
    : stdinMessage.trimEnd();
  console.error('[node-backend]', `Sending tool_result to stdin: ${logPreview}`);
  session.process.stdin.write(stdinMessage);
  return true;
}

/**
 * set_model control_request를 CLI stdin에 전송한다.
 * 세션 레벨 모델 변경용 (프로세스 라이프사이클 동안만 유효).
 */
export function sendSetModelToProcess(
  connections: ConnectionManager,
  sessionId: string,
  model: string,
): boolean {
  const session = connections.getSession(sessionId);
  if (!session?.process?.stdin?.writable) {
    console.error('[node-backend]', `No writable stdin for session: ${sessionId}`);
    return false;
  }

  const stdinMessage =
    JSON.stringify({
      type: 'control_request',
      request_id: `set_model_${Date.now()}`,
      request: { subtype: 'set_model', model },
    }) + '\n';

  console.error('[node-backend]', `Sending set_model "${model}" to stdin`);
  session.process.stdin.write(stdinMessage);
  return true;
}

/**
 * 임의의 control_request를 CLI stdin에 전송한다.
 *
 * 비대화형(stream-json) 세션에서 CLI가 거부하는 슬래시 커맨드
 * (`/reload-plugins`, `/btw`)를 실행하기 위한 통로. 커맨드 텍스트를 보내면
 * CLI는 `isn't available in this environment`로 거절하지만, 같은 작업을
 * 수행하는 control_request는 받아준다 (#270).
 *
 * request_id는 호출자가 정한다 — 응답(control_response)은 CLI 이벤트로
 * 그대로 브로드캐스트되므로, WebView가 자기가 보낸 요청의 응답을 이
 * id로 골라낸다.
 */
export function sendControlRequestToProcess(
  connections: ConnectionManager,
  sessionId: string,
  requestId: string,
  request: Record<string, unknown>,
): boolean {
  const session = connections.getSession(sessionId);
  if (!session?.process?.stdin?.writable) {
    console.error('[node-backend]', `No writable stdin for session: ${sessionId}`);
    return false;
  }

  const stdinMessage =
    JSON.stringify({
      type: 'control_request',
      request_id: requestId,
      request,
    }) + '\n';

  console.error(
    '[node-backend]',
    `Sending control_request "${String(request.subtype)}" to stdin (request_id: ${requestId})`,
  );
  session.process.stdin.write(stdinMessage);
  return true;
}

/**
 * control_response를 CLI stdin에 전송한다.
 * AskUserQuestion 등 control_request에 대한 응답용.
 */
export function sendControlResponseToProcess(
  connections: ConnectionManager,
  sessionId: string,
  response: Record<string, unknown>,
): boolean {
  const session = connections.getSession(sessionId);
  if (!session?.process?.stdin?.writable) {
    console.error('[node-backend]', `No writable stdin for session: ${sessionId}`);
    return false;
  }

  const stdinMessage =
    JSON.stringify({
      type: 'control_response',
      response,
    }) + '\n';

  const logPreview = stdinMessage.length > 200
    ? stdinMessage.substring(0, 200) + `... (${stdinMessage.length} bytes total)`
    : stdinMessage.trimEnd();
  console.error('[node-backend]', `Sending control_response to stdin: ${logPreview}`);
  session.process.stdin.write(stdinMessage);
  return true;
}

/**
 * When the CLI asks permission for a file edit, open that edit in the IDE's
 * diff viewer so the user can see it while deciding.
 *
 * Gated on the `showDiffInIde` setting, read per session working directory so a
 * project can opt out on its own. Off means the flow behaves exactly as it did
 * before this existed — no tab, no diff, prompt unchanged.
 *
 * Deliberately not awaited by the caller: reading the setting and the file both
 * touch disk, and the permission prompt must reach the WebView immediately.
 */
function maybeOpenPermissionDiff(
  targetSessionId: string,
  event: Record<string, unknown>,
  connections: ConnectionManager,
  bridge: Bridge,
): void {
  if (event.type !== 'control_request') return;
  const request = event.request as Record<string, unknown> | undefined;
  if (request?.subtype !== 'can_use_tool') return;

  const toolName = request.tool_name;
  const input = request.input;
  if (typeof toolName !== 'string' || typeof input !== 'object' || input === null) return;

  const workingDir = connections.getSession(targetSessionId)?.workingDir || undefined;
  const toolUseId = request.tool_use_id as string | undefined;
  const toolInput = input as Record<string, unknown>;

  void (async () => {
    try {
      const { settings } = await readMergedSettings(workingDir);
      // Default on: the setting only exists to let people turn it back off.
      if (settings.showDiffInIde === false) return;

      const preview = await resolveDiffPreview(toolName, toolInput);
      if (!preview) return;

      // Hold the change backend-side so the IDE's answer can name hunks rather
      // than ship file contents back: what gets written is then the text we
      // diffed, not something reassembled from what a viewer rendered.
      const controlRequestId = String(event.request_id ?? '');
      if (toolUseId) {
        rememberPreview(toolUseId, {
          ...preview,
          input: toolInput,
          toolName,
          sessionId: targetSessionId,
          controlRequestId,
        });
      }
      await openDiffForPermission(bridge, preview, toolUseId, {
        sessionId: targetSessionId,
        controlRequestId,
      });
    } catch (err) {
      console.error('[node-backend]', 'Permission diff preview failed:', err);
    }
  })();
}

function handleStreamEvent(
  targetSessionId: string,
  event: Record<string, unknown>,
  connections: ConnectionManager,
  bridge: Bridge,
): void {
  const eventType = event.type as string;

  // Detect files Claude edited and, once each edit completes on disk, ask the
  // IDE to reload them (issue #72 — CLI writes bypass the IDE, and the native
  // file watcher misses changes on Windows). Record intents from assistant
  // events; emit refreshes when the matching tool_result succeeds.
  editedFileTracker.recordEdits(event);
  const pathsToRefresh = editedFileTracker.collectRefreshPaths(event);
  if (pathsToRefresh.length > 0) {
    bridge.refreshFiles({ paths: pathsToRefresh }).catch((err) => {
      console.error('[node-backend]', 'Failed to refresh files in IDE:', err);
    });
  }

  // Detect background dynamic workflows and stream their live progress. Pure
  // side-effect — the raw CLI event is still forwarded unchanged below.
  getWorkflowTracker(connections).handleEvent(targetSessionId, event);

  // Show the pending file edit in the IDE's diff viewer while the permission
  // prompt is up, so the user sees what they are approving rather than only the
  // file name (#41, #109). Fire-and-forget: the prompt itself is forwarded
  // below either way, and a diff we cannot open must not delay it.
  maybeOpenPermissionDiff(targetSessionId, event, connections, bridge);

  // Keep the recorded permission mode in step with what the CLI says it is running
  // under. The CLI reports this on `system/init` (spawn) and again on `system/status`
  // when it changes mode by itself — approving an ExitPlanMode plan leaves plan mode
  // with no respawn. Without adopting that, the record would still read `plan`, the
  // user re-picking Plan Mode would compare equal, and the CLI would be reused while
  // actually out of plan — the "Plan Mode turns itself off" report (#172).
  const reportedMode = readReportedMode(event);
  if (reportedMode && reportedMode !== connections.getInputMode(targetSessionId)) {
    console.error(
      '[node-backend]',
      `CLI reports permission mode "${reportedMode}" for session ${targetSessionId} ` +
        `(was "${connections.getInputMode(targetSessionId)}")`,
    );
    connections.setInputMode(targetSessionId, reportedMode);
  }

  // 백엔드 고유 사이드이펙트 (WebView 전달과 무관한 서버 내부 로직)
  if (eventType === 'result') {
    sessionsWithResult.add(targetSessionId);
    // Turn ended (success, error and interrupt alike emit a result event).
    connections.setStreaming(targetSessionId, false);
    connections.broadcastToAll(MessageType.SESSIONS_UPDATED, {
      action: 'upsert',
      session: {
        sessionId: event.session_id ?? targetSessionId,
      },
    });

    // 인증 에러 진단 (비동기, 실패해도 무시)
    const errorData = event.error as { message?: string } | null;
    if (errorData?.message) {
      diagnoseAuthError(targetSessionId, errorData.message, connections).catch(() => {});
    }
  }

  // 모든 CLI 이벤트를 있는 그대로 전달 — 타입별 분기/가공 없음
  connections.broadcastToSession(targetSessionId, MessageType.CLI_EVENT, event);
}
