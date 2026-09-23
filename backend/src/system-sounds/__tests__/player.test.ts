import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../scanner', () => ({
  scanSystemSounds: vi.fn(),
}));

import { spawn } from 'child_process';
import { scanSystemSounds } from '../scanner';
import { playSystemSound } from '../player';

const mockSpawn = vi.mocked(spawn);
const mockScan = vi.mocked(scanSystemSounds);

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

function restorePlatform() {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
}

function makeChild(): EventEmitter {
  // Minimal stub that satisfies the .once('error', ...) contract.
  return new EventEmitter();
}

function spawnReturning(child: EventEmitter) {
  mockSpawn.mockReturnValue(child as never);
}

function spawnSequence(children: EventEmitter[]) {
  let i = 0;
  mockSpawn.mockImplementation(() => {
    const c = children[i++];
    if (!c) throw new Error('no more spawn children configured');
    return c as never;
  });
}

describe('playSystemSound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScan.mockResolvedValue([
      { id: 'Glass', label: 'Glass', path: '/System/Library/Sounds/Glass.aiff' },
      { id: 'chimes', label: 'chimes', path: 'C:\\Windows\\Media\\chimes.wav' },
      { id: 'bell', label: 'bell', path: '/usr/share/sounds/freedesktop/stereo/bell.oga' },
      { id: 'evil', label: 'evil', path: 'C:\\Windows\\Media\\evil";rm -rf.wav' },
    ]);
  });

  afterEach(() => {
    restorePlatform();
  });

  it('throws when soundId is not in the whitelist', async () => {
    setPlatform('darwin');

    await expect(playSystemSound('Nonexistent')).rejects.toThrow(/Unknown sound id: Nonexistent/);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  describe('darwin', () => {
    beforeEach(() => setPlatform('darwin'));

    it('spawns afplay with the resolved path and no shell option', async () => {
      spawnReturning(makeChild());

      await playSystemSound('Glass');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const [cmd, args, ...rest] = mockSpawn.mock.calls[0]!;
      expect(cmd).toBe('afplay');
      // An unnamed volume is the default step, which on macOS is gain 5.
      expect(args).toEqual(['-v', '5.000', '/System/Library/Sounds/Glass.aiff']);
      // No options object passed at all — confirms shell:true is NOT used.
      expect(rest).toEqual([]);
    });

    it('uses the step itself as the afplay gain', async () => {
      spawnReturning(makeChild());

      await playSystemSound('Glass', { volumeStep: 7 });

      expect(mockSpawn.mock.calls[0]![1]).toEqual([
        '-v',
        '7.000',
        '/System/Library/Sounds/Glass.aiff',
      ]);
    });

    // The quietest step on macOS is the file as recorded, because this is the
    // only platform whose player can go above that.
    it('plays the file as recorded at the quietest step', async () => {
      spawnReturning(makeChild());

      await playSystemSound('Glass', { volumeStep: 1 });

      expect(mockSpawn.mock.calls[0]![1]).toEqual([
        '-v',
        '1.000',
        '/System/Library/Sounds/Glass.aiff',
      ]);
    });

    it('rejects when spawn emits ENOENT', async () => {
      const child = makeChild();
      spawnReturning(child);
      const promise = playSystemSound('Glass');

      // Wait for scanSystemSounds() and the synchronous spawn setup to settle
      // so that the 'error' listener is registered before we emit.
      await Promise.resolve();
      await Promise.resolve();

      const enoent = Object.assign(new Error('spawn afplay ENOENT'), { code: 'ENOENT' });
      child.emit('error', enoent);

      await expect(promise).rejects.toThrow(/ENOENT/);
    });
  });

  describe('win32', () => {
    beforeEach(() => setPlatform('win32'));

    it('spawns powershell with a MediaPlayer script and no shell option', async () => {
      spawnReturning(makeChild());

      await playSystemSound('chimes');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const [cmd, args, ...rest] = mockSpawn.mock.calls[0]!;
      expect(cmd).toBe('powershell');
      const [noProfile, command, script] = args as string[];
      expect(noProfile).toBe('-NoProfile');
      expect(command).toBe('-Command');
      // MediaPlayer rather than SoundPlayer, because SoundPlayer has no volume
      // control at all — a volume row that did nothing here would be a lie.
      expect(script).toContain('System.Windows.Media.MediaPlayer');
      expect(script).toContain('$p.Volume = 0.500');
      expect(script).toContain('C:\\Windows\\Media\\chimes.wav');
      // SoundPlayer survives as the in-script fallback, so a machine that
      // cannot load presentationCore still gets its notification.
      expect(script).toContain('New-Object Media.SoundPlayer');
      expect(rest).toEqual([]);
    });

    it('scales the MediaPlayer volume to the requested step', async () => {
      spawnReturning(makeChild());

      await playSystemSound('chimes', { volumeStep: 4 });

      const script = (mockSpawn.mock.calls[0]![1] as string[])[2]!;
      expect(script).toContain('$p.Volume = 0.400');
    });

    it('throws when path contains unsafe shell characters', async () => {
      await expect(playSystemSound('evil')).rejects.toThrow(/Unsafe character in sound path/);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('linux', () => {
    beforeEach(() => setPlatform('linux'));

    it('spawns paplay on success', async () => {
      spawnReturning(makeChild());

      await playSystemSound('bell');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const [cmd, args, ...rest] = mockSpawn.mock.calls[0]!;
      expect(cmd).toBe('paplay');
      // 65536 is "as recorded" to PulseAudio, which the top step maps onto;
      // the default step 5 is half of that.
      expect(args).toEqual(['--volume=32768', '/usr/share/sounds/freedesktop/stereo/bell.oga']);
      expect(rest).toEqual([]);
    });

    it('scales the paplay volume to the requested step', async () => {
      spawnReturning(makeChild());

      await playSystemSound('bell', { volumeStep: 10 });

      expect(mockSpawn.mock.calls[0]![1]).toEqual([
        '--volume=65536',
        '/usr/share/sounds/freedesktop/stereo/bell.oga',
      ]);
    });

    it('falls back to aplay when paplay spawn ENOENTs', async () => {
      const first = makeChild();
      const second = makeChild();
      spawnSequence([first, second]);

      const promise = playSystemSound('bell');
      await Promise.resolve();
      await Promise.resolve();
      first.emit('error', Object.assign(new Error('spawn paplay ENOENT'), { code: 'ENOENT' }));

      await promise;

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn.mock.calls[0]![0]).toBe('paplay');
      expect(mockSpawn.mock.calls[1]![0]).toBe('aplay');
      expect(mockSpawn.mock.calls[1]![1]).toEqual(['/usr/share/sounds/freedesktop/stereo/bell.oga']);
    });

    it('does not fall back when paplay fails with a non-ENOENT error', async () => {
      const child = makeChild();
      spawnReturning(child);

      const promise = playSystemSound('bell');
      await Promise.resolve();
      await Promise.resolve();
      child.emit('error', Object.assign(new Error('boom'), { code: 'EACCES' }));

      await expect(promise).rejects.toThrow(/boom/);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });
});
