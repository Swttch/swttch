import { describe, it, expect } from 'vitest';
import { detectInstalledEditors } from '../detectEditors';

describe('detectInstalledEditors', () => {
  // Real integration test: probes the host's actually-installed editors (macOS
  // Spotlight-free Info.plist scan of /Applications, Windows registry, or Linux
  // `which`). Scanning every installed .app's bundle id is I/O + subprocess bound,
  // so this needs more headroom than the default 5s test timeout.
  it('resolves to an array of EditorInfo entries with the expected shape', async () => {
    const editors = await detectInstalledEditors();

    expect(Array.isArray(editors)).toBe(true);
    for (const editor of editors) {
      expect(typeof editor.id).toBe('string');
      expect(typeof editor.name).toBe('string');
      expect(typeof editor.path).toBe('string');
      expect(editor.path.length).toBeGreaterThan(0);
    }
  }, 30000);
});
