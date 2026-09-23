import { spawn, type ChildProcess } from 'child_process';
import { scanSystemSounds, type SystemSound } from './scanner';

const POWERSHELL_UNSAFE_CHARS = /["'`$]/;

/**
 * The volume scale, as the settings file stores it: ten steps, 1 quietest.
 *
 * A step does NOT mean the same loudness on every OS, and cannot. macOS is the
 * only one of the three whose player amplifies past the recording, so its scale
 * runs from the file as recorded up to ten times that, while Windows and Linux
 * run from a tenth of the recording up to the recording itself. The system
 * sounds macOS ships are quiet enough that a scale topping out at "as recorded"
 * would be useless there — the Stop hook this feature replaces was already
 * running at `afplay -v 6` for exactly that reason.
 */
export const MIN_VOLUME_STEP = 1;
export const MAX_VOLUME_STEP = 10;
export const DEFAULT_VOLUME_STEP = 5;

/** `paplay --volume` is linear with 65536 meaning "as recorded". */
const PULSE_VOLUME_AT_FULL = 65536;

export interface PlaybackOptions {
  /**
   * How loud to play, 1-10. Omitted plays at the default step.
   */
  volumeStep?: number;
}

/**
 * Clamps to the stored range and treats anything unusable as the default, so a
 * hand-edited settings file can make the sound quiet but never silence it by
 * accident — silence is what choosing no sound is for.
 */
export function normalizeVolumeStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_VOLUME_STEP;
  }
  return Math.min(MAX_VOLUME_STEP, Math.max(MIN_VOLUME_STEP, Math.round(value)));
}

/**
 * Spawn a process fire-and-forget. Resolves once the spawn attempt has had a
 * chance to surface synchronous/immediate errors (ENOENT, etc). The caller
 * does not wait for the child to exit.
 */
function spawnNoShell(command: string, args: string[]): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let child: ChildProcess;
    try {
      child = spawn(command, args);
    } catch (err) {
      reject(err);
      return;
    }
    child.once('error', (err) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(err);
    });
    // Wait one macrotask so that an immediate 'error' event (e.g. ENOENT) wins
    // over the resolve. Node emits spawn errors asynchronously via process.nextTick.
    setImmediate(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(child);
    });
  });
}

/**
 * `afplay -v` is a gain multiplier where 1.0 is the file as recorded, so the
 * step IS the gain: 1 plays it as recorded and 10 plays it ten times louder.
 */
async function playOnDarwin(sound: SystemSound, volumeStep: number): Promise<void> {
  await spawnNoShell('afplay', ['-v', volumeStep.toFixed(3), sound.path]);
}

/**
 * Windows plays through WPF's MediaPlayer rather than Media.SoundPlayer,
 * because SoundPlayer has no volume control at all — it plays every sound at
 * whatever the system mixer is set to. A volume row that did nothing on Windows
 * would be a control that lies.
 *
 * MediaPlayer loads asynchronously and returns immediately, so the script waits
 * for the clip's own length before exiting; leaving early cuts the sound off.
 * If anything in that path fails, it falls back to SoundPlayer inside the same
 * PowerShell invocation — one spawn either way — so a Windows box that cannot
 * load presentationCore still gets its notification, just without the volume.
 */
async function playOnWindows(sound: SystemSound, volumeStep: number): Promise<void> {
  if (POWERSHELL_UNSAFE_CHARS.test(sound.path)) {
    throw new Error(`Unsafe character in sound path: ${sound.path}`);
  }
  // MediaPlayer.Volume is 0.0-1.0 and does not amplify, so the top step is the
  // file as recorded.
  const volume = (volumeStep / MAX_VOLUME_STEP).toFixed(3);
  const script = [
    'try {',
    '  Add-Type -AssemblyName presentationCore -ErrorAction Stop;',
    '  $p = New-Object System.Windows.Media.MediaPlayer;',
    `  $p.Open([uri]"${sound.path}");`,
    '  $w = 0;',
    '  while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 50) { Start-Sleep -Milliseconds 20; $w++ };',
    `  $p.Volume = ${volume};`,
    '  $p.Play();',
    '  if ($p.NaturalDuration.HasTimeSpan) {',
    '    Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 250)',
    '  } else { Start-Sleep -Milliseconds 2000 };',
    '  $p.Close()',
    '} catch {',
    `  (New-Object Media.SoundPlayer "${sound.path}").PlaySync()`,
    '}',
  ].join(' ');
  await spawnNoShell('powershell', ['-NoProfile', '-Command', script]);
}

/**
 * `paplay` takes a linear volume; `aplay` takes none at all, so the fallback
 * path plays at whatever the mixer is set to. That fallback only runs on a box
 * without PulseAudio, where there is no volume for us to set anyway.
 */
async function playOnLinux(sound: SystemSound, volumeStep: number): Promise<void> {
  const pulseVolume = Math.round((volumeStep / MAX_VOLUME_STEP) * PULSE_VOLUME_AT_FULL);
  try {
    await spawnNoShell('paplay', [`--volume=${pulseVolume}`, sound.path]);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      await spawnNoShell('aplay', [sound.path]);
      return;
    }
    throw err;
  }
}

export async function playSystemSound(
  soundId: string,
  options: PlaybackOptions = {},
): Promise<void> {
  const sounds = await scanSystemSounds();
  const sound = sounds.find((s) => s.id === soundId);
  if (!sound) {
    throw new Error(`Unknown sound id: ${soundId}`);
  }

  const volumeStep = normalizeVolumeStep(options.volumeStep ?? DEFAULT_VOLUME_STEP);

  switch (process.platform) {
    case 'darwin':
      await playOnDarwin(sound, volumeStep);
      return;
    case 'win32':
      await playOnWindows(sound, volumeStep);
      return;
    case 'linux':
      await playOnLinux(sound, volumeStep);
      return;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
