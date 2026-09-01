/**
 * Reclaim the Docker containers a `claude` process we spawned left behind.
 *
 * ## What leaks, and why nothing else can clean it up
 *
 * An MCP server configured as `docker run -i --rm ...` is not the container: the
 * `docker` the CLI spawns is a client attached to a container the daemon owns.
 * Closing that client's stdin, then SIGTERM, then SIGKILL — which is what both
 * the CLI and the MCP SDK do on shutdown — all land on the client. A server whose
 * PID 1 neither exits on EOF nor handles SIGTERM survives every step, and `--rm`
 * never fires because `--rm` waits for the CONTAINER to exit. Measured: the
 * container is still up after the client is gone, and only `docker rm -f` ends it.
 *
 * Docker records nothing that identifies the client: comparing `docker inspect`
 * before and after killing the client shows not one changed field, and the labels
 * are empty. So an orphan cannot be recognised after the fact, and ownership has
 * to be recorded while we still have it.
 *
 * ## Why the CLI process, and not the chat session
 *
 * Each `claude` process starts its own containers and never adopts another
 * process's — measured with three concurrent CLIs, which produced three distinct
 * containers and reused none. MCP stdio is a pipe between one process and one
 * container, so the moment that process exits, its container is unreachable by
 * anyone, forever.
 *
 * That makes process exit the correct trigger, and it is a fact we observe
 * exactly. "The session ended" is not: a chat session outlives many CLI processes
 * (a dropped pipe, a `--resume`, a permission-mode restart all replace it), and
 * waiting for the session would let every intermediate process's container pile
 * up in the meantime.
 *
 * ## How ownership is recorded
 *
 * Snapshot the containers of the configured images before spawning, snapshot
 * again when the process exits, and reclaim the difference. The process lifetime
 * is the window, so nothing older and nothing newer is a candidate. A container
 * still has to match a configured server's image AND its exact `run` arguments to
 * be touched.
 *
 * Nothing here runs unless the user actually has a `command: "docker"` MCP server
 * configured, so the common case pays nothing at all — not even a `docker` lookup.
 */
import { execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { augmentedEnv } from './augmented-path';
import { collectMcpServerConfigs } from './features/mcp-config-files';
import { recordCliContainers } from './cli-registry';
import type { McpServerConfig } from '../shared';

const execFileAsync = promisify(execFile);

/** Docker calls are local and quick; a hung daemon must not hold up a spawn. */
const DOCKER_TIMEOUT_MS = 5_000;

/**
 * One configured MCP server that runs as `docker run ...`, reduced to what
 * identifies its containers: the image and the command it was told to run.
 */
export interface DockerMcpServer {
  /** The image reference exactly as the config spells it. */
  image: string;
  /** Everything after the image on the `docker run` line, joined as docker reports it. */
  command: string;
}

/** What was seen before a spawn, carried until the process exits. */
export interface ContainerSnapshot {
  servers: DockerMcpServer[];
  /** Container ids that already existed, and are therefore never ours. */
  existing: Set<string>;
}

/**
 * The `docker run` MCP servers among a set of configs.
 *
 * Only a plain `run` counts. `docker exec` addresses a container someone else
 * started and `docker compose run` builds a name of its own, so neither is a
 * container this created and neither is one to reclaim.
 */
export function findDockerMcpServers(
  configs: Array<McpServerConfig | null | undefined>,
): DockerMcpServer[] {
  const found: DockerMcpServer[] = [];
  for (const config of configs) {
    if (!config || config.command !== 'docker') continue;
    const args = config.args ?? [];
    if (args[0] !== 'run') continue;
    const image = findImageArg(args);
    if (!image) continue;
    found.push({ image, command: args.slice(args.indexOf(image) + 1).join(' ') });
  }
  return found;
}

/**
 * The image in a `docker run` argument list: the first argument that is neither a
 * flag nor a flag's value.
 *
 * Docker's own rule, applied to the flags an MCP config realistically uses. A
 * flag not listed here that takes a separate value would make the value look like
 * the image; that misreads which container to watch, and since a mismatch only
 * ever means "reclaim nothing", it fails towards leaving containers alone.
 */
const VALUE_FLAGS = new Set([
  '-e', '--env', '-v', '--volume', '--name', '--network', '--net', '-p', '--publish',
  '-w', '--workdir', '-u', '--user', '--entrypoint', '--cidfile', '--label', '-l',
  '--mount', '--add-host', '--device', '--platform', '--pull', '--restart', '--memory',
  '-m', '--cpus', '--env-file', '--tmpfs', '--log-driver', '--dns',
]);

function findImageArg(args: string[]): string | null {
  // args[0] is `run`.
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      // `--flag=value` carries its value inline, so only the separate form skips.
      if (VALUE_FLAGS.has(arg)) i += 1;
      continue;
    }
    return arg;
  }
  return null;
}

/**
 * Note which containers of these servers' images already exist.
 *
 * Returns null when there is nothing to watch or docker cannot be reached, and a
 * null snapshot makes the matching reclaim a no-op. Never throws: failing to set
 * up a cleanup must not stop the spawn the user actually asked for.
 */
export async function snapshotContainers(
  servers: DockerMcpServer[],
): Promise<ContainerSnapshot | null> {
  if (servers.length === 0) return null;
  try {
    const existing = await listContainerIds(servers);
    return { servers, existing };
  } catch (err) {
    console.error('[node-backend]', `MCP container snapshot skipped: ${message(err)}`);
    return null;
  }
}

/**
 * Remove the containers that appeared during the window and match one of the
 * configured servers. Returns the ids removed, for the log and for tests.
 *
 * Never throws, for the same reason as the snapshot: this runs inside a process
 * `close` handler that still has a stream to end and errors to report.
 */
export async function reclaimContainers(
  snapshot: ContainerSnapshot | null,
): Promise<string[]> {
  if (!snapshot) return [];
  try {
    const appeared = await appearedSinceSnapshot(snapshot);
    if (appeared.length === 0) return [];

    const reclaimed: string[] = [];
    for (const id of appeared) {
      try {
        await docker(['rm', '-f', id]);
        reclaimed.push(id);
      } catch (err) {
        // A container that is already gone is the outcome we wanted.
        console.error('[node-backend]', `MCP container ${id.slice(0, 12)} not removed: ${message(err)}`);
      }
    }
    if (reclaimed.length > 0) {
      console.error(
        '[node-backend]',
        `Reclaimed ${reclaimed.length} MCP docker container(s) left by an exited CLI: ` +
          reclaimed.map((id) => id.slice(0, 12)).join(', '),
      );
    }
    return reclaimed;
  } catch (err) {
    console.error('[node-backend]', `MCP container reclaim skipped: ${message(err)}`);
    return [];
  }
}

/**
 * Snapshot ahead of spawning a `claude` for this workspace.
 *
 * Reads the configuration first so that a user with no `docker run` MCP server —
 * which is most users — never reaches a `docker` command at all.
 */
export async function snapshotMcpContainers(cwd?: string): Promise<ContainerSnapshot | null> {
  const servers = findDockerMcpServers(await collectMcpServerConfigs(cwd));
  return snapshotContainers(servers);
}

/**
 * Run something that spawns a `claude` we do not hold a handle to, then reclaim
 * whatever MCP containers it left behind.
 *
 * Used where the spawner is not `Claude` — our own MCP SDK connection, which
 * starts `docker` itself.
 *
 * The reclaim is awaited rather than fired off, so a caller that returns to an
 * idle backend still gets its containers cleaned up. It costs a couple of local
 * docker calls, and only when a `docker run` server is configured.
 */
export async function withMcpContainerReclaim<T>(
  cwd: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const snapshot = await snapshotMcpContainers(cwd);
  try {
    return await run();
  } finally {
    await reclaimContainers(snapshot);
  }
}

/**
 * Reclaim a spawned CLI's MCP containers when that CLI exits.
 *
 * Attached inside `Claude.spawn` rather than at each call site, because the call
 * sites cannot be enumerated reliably: measurement found `claude auth status` and
 * the slash-command config probe starting MCP servers too, neither of which reads
 * like an MCP command. One attachment point covers every CLI the backend starts,
 * including ones added later.
 *
 * The snapshot is started but not awaited, because `Claude.spawn` is synchronous.
 * That is safe with room to spare: `docker ps` answers in tens of milliseconds
 * while a CLI takes far longer to boot and complete an MCP handshake, so the
 * snapshot lands well before the first container appears. If it ever did not, the
 * container would count as pre-existing and simply be left alone.
 */
export function attachMcpContainerReclaim(proc: ChildProcess, cwd?: string): void {
  const snapshot = snapshotMcpContainers(cwd);
  void noteContainersForCrashRecovery(proc, snapshot);
  proc.once('close', () => {
    const running = snapshot
      .then(reclaimContainers)
      .catch((err) => console.error('[node-backend]', `MCP container reclaim failed: ${message(err)}`))
      .finally(() => inFlight.delete(running));
    inFlight.add(running);
  });
}

/**
 * When, after a spawn, to look for the containers that spawn started.
 *
 * A CLI boots and completes its MCP handshake in seconds, so the first probe
 * usually sees everything. The second covers a server that took longer (a cold
 * image, a slow database). Missing one only costs the crash-recovery path: it is
 * still reclaimed normally when the CLI exits.
 */
const CONTAINER_NOTE_DELAYS_MS = [4_000, 12_000];

/**
 * Record this CLI's containers on its registry entry, so a SIGKILLed backend
 * does not strand them.
 *
 * The normal reclaim runs when the CLI exits; a backend killed outright never
 * runs it, and by the next boot there is no way to work out which containers
 * were that CLI's. So they are written down while the answer is still knowable.
 *
 * Only chat CLIs have a registry entry, so `recordCliContainers` is a no-op for
 * everything else. Probing is skipped once the process has exited, which is what
 * keeps short-lived commands from paying for two `docker ps` calls they cannot
 * use.
 */
async function noteContainersForCrashRecovery(
  proc: ChildProcess,
  snapshotPromise: Promise<ContainerSnapshot | null>,
): Promise<void> {
  const snapshot = await snapshotPromise;
  if (!snapshot) return;
  for (const delayMs of CONTAINER_NOTE_DELAYS_MS) {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs).unref?.());
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    try {
      const appeared = await appearedSinceSnapshot(snapshot);
      recordCliContainers(proc.pid, appeared);
    } catch (err) {
      console.error('[node-backend]', `MCP container note skipped: ${message(err)}`);
      return;
    }
  }
}

/**
 * Reclaims that started but have not finished.
 *
 * Backend shutdown is the reason this is tracked. `shutdownAll` signals every CLI
 * and then the process exits, so a reclaim triggered by those deaths is racing an
 * exit that does not wait for it. Losing that race leaks exactly the containers
 * the user's last session was holding, which is the moment they close the IDE.
 */
const inFlight = new Set<Promise<unknown>>();

/**
 * Wait for reclaims already under way, so shutdown does not exit out from under
 * them. Bounded, because a hung docker daemon must not keep the backend alive:
 * whatever has not finished by then is left to the next backend's own cleanup.
 */
export async function drainMcpContainerReclaims(timeoutMs = 4_000): Promise<void> {
  if (inFlight.size === 0) return;
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref?.());
  await Promise.race([Promise.allSettled([...inFlight]).then(() => undefined), deadline]);
}

/**
 * Containers that appeared since the snapshot AND match a configured server.
 *
 * Both halves matter. The window says the container is one this CLI could have
 * started; the argument match says it is one of the servers the workspace
 * configures rather than something the user launched from the same image by
 * hand. Neither alone is identity, which is why nothing acts on one of them.
 */
async function appearedSinceSnapshot(snapshot: ContainerSnapshot): Promise<string[]> {
  const now = await listContainerIds(snapshot.servers);
  const fresh = [...now].filter((id) => !snapshot.existing.has(id));
  const matching: string[] = [];
  for (const id of fresh) {
    if (await matchesConfiguredCommand(id, snapshot.servers)) matching.push(id);
  }
  return matching;
}

/**
 * Remove containers recorded against CLIs that are now gone (the startup sweep).
 *
 * Removal is by id alone because each id was only recorded after it matched a
 * configured server inside its CLI's own window; Docker ids are not reused, so
 * that judgement still holds. An id that is already gone is the wanted outcome.
 */
export async function removeContainersById(ids: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (const id of ids) {
    try {
      await docker(['rm', '-f', id]);
      removed.push(id);
    } catch {
      // Already removed, or docker is unreachable — nothing left to do either way.
    }
  }
  if (removed.length > 0) {
    console.error(
      '[node-backend]',
      `Reclaimed ${removed.length} MCP docker container(s) stranded by a killed backend: ` +
        removed.map((id) => id.slice(0, 12)).join(', '),
    );
  }
  return removed;
}

/** Container ids (running or not) for every configured image. */
async function listContainerIds(servers: DockerMcpServer[]): Promise<Set<string>> {
  const ids = new Set<string>();
  const images = new Set(servers.map((s) => s.image));
  for (const image of images) {
    const { stdout } = await docker(['ps', '-aq', '--filter', `ancestor=${image}`]);
    for (const id of stdout.split('\n').map((l) => l.trim()).filter(Boolean)) ids.add(id);
  }
  return ids;
}

/**
 * Whether a container was started with the image AND the command one of the
 * configured servers specifies.
 *
 * Both have to match. The image alone is not identity: a user running the same
 * MCP image by hand would look identical, and the point of this check is that
 * their container is not ours to remove.
 */
async function matchesConfiguredCommand(id: string, servers: DockerMcpServer[]): Promise<boolean> {
  const { stdout } = await docker([
    'inspect', id, '--format', '{{.Config.Image}}\t{{join .Config.Cmd " "}}',
  ]);
  const [image, command = ''] = stdout.trim().split('\t');
  return servers.some((s) => s.image === image && s.command === command.trim());
}

function docker(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('docker', args, {
    timeout: DOCKER_TIMEOUT_MS,
    // The backend can be launched by a GUI with a PATH that omits where docker
    // lives, the same gap augmentedPath already closes for `claude` (#59, #76).
    env: augmentedEnv(),
  });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
