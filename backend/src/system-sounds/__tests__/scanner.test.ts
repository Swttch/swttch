import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

import { readdir } from 'fs/promises';
import { join } from 'path';
import { scanSystemSounds, clearScanCache } from '../scanner';

const mockReaddir = vi.mocked(readdir);

// The scanner builds the user directory and every sound path with join(), so
// both are spelled with the host separator. Naming them here rather than typing
// POSIX literals keeps the assertions true on Windows too.
const SYSTEM_SOUNDS_DIR = '/System/Library/Sounds';
const LIBRARY_SOUNDS_DIR = '/Library/Sounds';
const USER_SOUNDS_DIR = join('/home/test', 'Library', 'Sounds');
const FREEDESKTOP_DIR = '/usr/share/sounds/freedesktop/stereo';

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

function restorePlatform() {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
}

describe('scanSystemSounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearScanCache();
  });

  afterEach(() => {
    restorePlatform();
    clearScanCache();
  });

  describe('darwin', () => {
    beforeEach(() => setPlatform('darwin'));

    it('scans all macOS sound directories and merges results', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === SYSTEM_SOUNDS_DIR) return ['Glass.aiff', 'Ping.aiff'] as any;
        if (dir === LIBRARY_SOUNDS_DIR) return ['Custom.aiff'] as any;
        if (dir === USER_SOUNDS_DIR) return ['User.aiff'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      const ids = sounds.map((s) => s.id);
      expect(ids).toEqual(['Custom', 'Glass', 'Ping', 'User']);
      expect(sounds.find((s) => s.id === 'Glass')?.path).toBe(
        join(SYSTEM_SOUNDS_DIR, 'Glass.aiff'),
      );
      expect(sounds.find((s) => s.id === 'User')?.path).toBe(join(USER_SOUNDS_DIR, 'User.aiff'));
    });

    it('filters out non-aiff extensions on darwin', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/System/Library/Sounds') return ['Glass.aiff', 'README.txt', 'foo.wav'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['Glass']);
    });

    it('deduplicates by id (first occurrence wins)', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/System/Library/Sounds') return ['Glass.aiff'] as any;
        if (dir === '/Library/Sounds') return ['Glass.aiff'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds).toHaveLength(1);
      expect(sounds[0]?.path).toBe(join(SYSTEM_SOUNDS_DIR, 'Glass.aiff'));
    });

    it('skips directories that fail to read', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/System/Library/Sounds') return ['Glass.aiff'] as any;
        if (dir === '/Library/Sounds') throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['Glass']);
    });

    it('produces id equal to label and uses join for path', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/System/Library/Sounds') return ['Tink.aiff'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds[0]).toEqual({
        id: 'Tink',
        label: 'Tink',
        path: join(SYSTEM_SOUNDS_DIR, 'Tink.aiff'),
      });
    });
  });

  describe('win32', () => {
    beforeEach(() => setPlatform('win32'));

    it('scans C:\\Windows\\Media for .wav files', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === 'C:\\Windows\\Media') return ['chimes.wav', 'ding.wav', 'readme.txt'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['chimes', 'ding']);
    });
  });

  describe('linux', () => {
    beforeEach(() => setPlatform('linux'));

    it('uses first non-empty directory only', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/usr/share/sounds/freedesktop/stereo') return ['bell.oga', 'message.oga'] as any;
        if (dir === '/usr/share/sounds/alsa') return ['Front_Center.wav'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['bell', 'message']);
      expect(sounds.map((s) => s.path)).toEqual([
        join(FREEDESKTOP_DIR, 'bell.oga'),
        join(FREEDESKTOP_DIR, 'message.oga'),
      ]);
    });

    it('falls back to next directory when first is empty', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/usr/share/sounds/freedesktop/stereo') return [] as any;
        if (dir === '/usr/share/sounds/alsa') return ['Front_Center.wav'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['Front_Center']);
    });

    it('falls back when first directory only contains non-matching files', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/usr/share/sounds/freedesktop/stereo') return ['README.txt'] as any;
        if (dir === '/usr/share/sounds/alsa') return ['Front_Center.wav'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['Front_Center']);
    });

    it('accepts .oga, .ogg, and .wav extensions', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/usr/share/sounds/freedesktop/stereo') {
          return ['a.oga', 'b.ogg', 'c.wav', 'd.mp3'] as any;
        }
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('caching', () => {
    beforeEach(() => setPlatform('darwin'));

    it('caches results across calls', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/System/Library/Sounds') return ['Glass.aiff'] as any;
        return [] as any;
      });

      const a = await scanSystemSounds();
      const b = await scanSystemSounds();

      expect(a).toBe(b);
      // 3 darwin dirs are scanned exactly once
      expect(mockReaddir).toHaveBeenCalledTimes(3);
    });

    it('clearScanCache() forces re-scan', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/System/Library/Sounds') return ['Glass.aiff'] as any;
        return [] as any;
      });

      await scanSystemSounds();
      expect(mockReaddir).toHaveBeenCalledTimes(3);

      clearScanCache();
      await scanSystemSounds();
      expect(mockReaddir).toHaveBeenCalledTimes(6);
    });
  });

  describe('sorting', () => {
    beforeEach(() => setPlatform('darwin'));

    it('sorts results alphabetically by id', async () => {
      mockReaddir.mockImplementation(async (dir) => {
        if (dir === '/System/Library/Sounds') return ['Zulu.aiff', 'Alpha.aiff', 'Mike.aiff'] as any;
        return [] as any;
      });

      const sounds = await scanSystemSounds();

      expect(sounds.map((s) => s.id)).toEqual(['Alpha', 'Mike', 'Zulu']);
    });
  });

  describe('unsupported platform', () => {
    it('returns empty array on unknown platform', async () => {
      setPlatform('freebsd' as NodeJS.Platform);

      const sounds = await scanSystemSounds();

      expect(sounds).toEqual([]);
      expect(mockReaddir).not.toHaveBeenCalled();
    });
  });
});
