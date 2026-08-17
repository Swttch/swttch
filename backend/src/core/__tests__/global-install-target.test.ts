import { describe, it, expect } from 'vitest';
import {
  detectGlobalInstallManager,
  installManagerFor,
  resolveLauncher,
  buildInstallSpec,
  buildUninstallSpec,
} from '../global-install-target';
import { PackageManager } from '../../shared';

const HOME = '/Users/jake';
/** Pretend every `<bin>/npm` exists, so the sibling-pinning branch is exercised. */
const npmSiblingExists = (p: string) => p.endsWith('/npm') || p.endsWith('\\npm.cmd');
/** Pretend nothing exists, so we see the bare-name fallback. */
const nothingExists = () => false;

describe('detectGlobalInstallManager', () => {
  // The bug behind #298: the installer asked only `process.execPath` while the
  // CLI updater asked the `claude` binary. On a machine where those two live in
  // different worlds the two features disagreed about which manager owns global
  // packages, and the install went somewhere the loader never reads.
  it('prefers the manager that owns the `claude` the user runs in a terminal', () => {
    const pm = detectGlobalInstallManager(
      ['/Users/jake/.volta/bin/claude', '/Users/jake/.volta/tools/image/packages/x/bin/claude'],
      '/opt/homebrew/bin/node',
      HOME,
    );
    expect(pm).toBe(PackageManager.VOLTA);
  });

  it('falls back to the running Node when `claude` is not on PATH', () => {
    const pm = detectGlobalInstallManager([null, null], '/Users/jake/.volta/tools/image/node/24.7.0/bin/node', HOME);
    expect(pm).toBe(PackageManager.VOLTA);
  });

  it('falls back to the running Node when `claude` reveals nothing usable', () => {
    // An unrecognised claude path must not pin the answer to UNKNOWN and hide a
    // perfectly detectable Node.
    const pm = detectGlobalInstallManager(['/some/vendored/claude'], '/Users/jake/.nvm/versions/node/v22.14.0/bin/node', HOME);
    expect(pm).toBe(PackageManager.NPM);
  });

  it('is UNKNOWN only when neither the claude paths nor the Node say anything', () => {
    expect(detectGlobalInstallManager([null], '/nowhere/bin/node', HOME)).toBe(PackageManager.UNKNOWN);
  });

  // Windows: npm's default global prefix is %APPDATA%\npm, and volta keeps its
  // shims under %LOCALAPPDATA%\Volta\bin. Both must be recognised from the
  // backslash form `where claude` returns.
  it('recognises the windows npm-global and volta layouts', () => {
    const winHome = 'C:\\Users\\jake';
    const winNode = 'C:\\Program Files\\nodejs\\node.exe';
    expect(
      detectGlobalInstallManager(
        [
          'C:\\Users\\jake\\AppData\\Roaming\\npm\\claude.cmd',
          'C:\\Users\\jake\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js',
        ],
        winNode,
        winHome,
      ),
    ).toBe(PackageManager.NPM);
    expect(
      detectGlobalInstallManager(['C:\\Users\\jake\\AppData\\Local\\Volta\\bin\\claude.exe'], winNode, winHome),
    ).toBe(PackageManager.VOLTA);
  });

  // Linux distro packages (apt/dnf/snap) install claude somewhere with no
  // non-interactive npm story. They must land on UNKNOWN so the npm fallback
  // takes over rather than a wrong manager being invoked.
  it('leaves distro-packaged installs to the npm fallback', () => {
    for (const p of ['/usr/bin/claude', '/snap/bin/claude']) {
      const pm = detectGlobalInstallManager([p], '/usr/bin/node', '/home/jake');
      expect(pm).toBe(PackageManager.UNKNOWN);
      expect(installManagerFor(pm)).toBe(PackageManager.NPM);
    }
  });

  // WSL runs an ordinary Linux backend inside the distro, so nothing special is
  // needed — but the distro's own nvm/npm must still resolve normally.
  it('treats a WSL distro install like any other linux one', () => {
    expect(
      detectGlobalInstallManager(
        ['/home/jake/.nvm/versions/node/v22.14.0/bin/claude'],
        '/home/jake/.nvm/versions/node/v22.14.0/bin/node',
        '/home/jake',
      ),
    ).toBe(PackageManager.NPM);
  });
});

describe('installManagerFor', () => {
  // brew/native/winget genuinely describe how Claude Code was installed, but
  // none of them can install an npm package — they must resolve to npm.
  it('routes managers that cannot install npm packages to npm', () => {
    for (const pm of [
      PackageManager.HOMEBREW,
      PackageManager.NATIVE,
      PackageManager.WINGET,
      PackageManager.UNKNOWN,
    ]) {
      expect(installManagerFor(pm)).toBe(PackageManager.NPM);
    }
  });

  it('leaves the node package managers alone', () => {
    for (const pm of [PackageManager.VOLTA, PackageManager.PNPM, PackageManager.YARN, PackageManager.NPM]) {
      expect(installManagerFor(pm)).toBe(pm);
    }
  });
});

describe('resolveLauncher', () => {
  // The heart of #298. A GUI-launched backend's PATH is the IDE's, not the
  // user's, so a bare `npm` can belong to a different Node than the one running
  // this code — and installing with it writes to a global folder this backend
  // never reads. The install then succeeds, says so, and changes nothing.
  it('pins npm to the sibling of the running Node', () => {
    expect(
      resolveLauncher(PackageManager.NPM, '/Users/jake/.nvm/versions/node/v22.14.0/bin/node', 'darwin', npmSiblingExists),
    ).toBe('/Users/jake/.nvm/versions/node/v22.14.0/bin/npm');
  });

  it('falls back to the bare name when the Node ships no npm sibling', () => {
    expect(resolveLauncher(PackageManager.NPM, '/nowhere/bin/node', 'darwin', nothingExists)).toBe('npm');
    expect(resolveLauncher(PackageManager.NPM, 'C:\\nowhere\\node.exe', 'win32', nothingExists)).toBe('npm.cmd');
  });

  // volta/pnpm/yarn keep their own store, which is not tied to a Node prefix.
  // Guessing an absolute path next to node would be wrong for them.
  it('leaves non-npm managers to a PATH lookup', () => {
    for (const pm of [PackageManager.VOLTA, PackageManager.PNPM, PackageManager.YARN]) {
      expect(resolveLauncher(pm, '/Users/jake/.nvm/versions/node/v22.14.0/bin/node', 'darwin', npmSiblingExists)).toBe(pm);
    }
  });

  // Windows keeps node.exe and npm.cmd in the SAME directory (no bin/ subdir),
  // so the sibling lookup applies there too — but only if the path is built with
  // backslashes. Using the ambient path.join while targeting win32 would produce
  // `C:\Program Files\nodejs/npm.cmd` and never match.
  it('builds the win32 sibling path with backslashes, whatever OS runs this', () => {
    const winExists = (p: string) => p === 'C:\\Program Files\\nodejs\\npm.cmd';
    expect(resolveLauncher(PackageManager.NPM, 'C:\\Program Files\\nodejs\\node.exe', 'win32', winExists)).toBe(
      'C:\\Program Files\\nodejs\\npm.cmd',
    );
  });

  it('accepts npm.exe as a win32 sibling too', () => {
    const winExists = (p: string) => p === 'C:\\tools\\node\\npm.exe';
    expect(resolveLauncher(PackageManager.NPM, 'C:\\tools\\node\\node.exe', 'win32', winExists)).toBe(
      'C:\\tools\\node\\npm.exe',
    );
  });

  // A Windows install path with a space must survive as ONE argument. The
  // installer runs through execViaCmdArgv, which passes an argv array to
  // cmd.exe, so the space is safe there — this asserts we hand it the whole
  // path rather than something pre-split.
  it('keeps a space-bearing sibling path intact', () => {
    const winExists = (p: string) => p === 'C:\\Program Files\\nodejs\\npm.cmd';
    const launcher = resolveLauncher(PackageManager.NPM, 'C:\\Program Files\\nodejs\\node.exe', 'win32', winExists);
    expect(launcher).toContain(' ');
    expect(launcher.split(' ').length).toBeGreaterThan(1);
  });

  // fnm's default macOS location contains two spaces. The kit loader must not
  // interpolate this into a shell command line (see the ShellKind.Direct note in
  // extend-kit.ts); here we only assert the resolution itself is unmangled.
  it('resolves a unix sibling under a directory with spaces', () => {
    const fnm = '/Users/jake/Library/Application Support/fnm/node-versions/v22.0.0/installation/bin/node';
    expect(resolveLauncher(PackageManager.NPM, fnm, 'darwin', npmSiblingExists)).toBe(
      '/Users/jake/Library/Application Support/fnm/node-versions/v22.0.0/installation/bin/npm',
    );
  });
});

describe('buildInstallSpec', () => {
  it('uses each manager’s own global-install verb', () => {
    const node = '/nowhere/bin/node';
    expect(buildInstallSpec(PackageManager.VOLTA, node, 'darwin', nothingExists)).toEqual({
      command: 'volta',
      args: ['install', '@swttch/extend-kit'],
    });
    expect(buildInstallSpec(PackageManager.PNPM, node, 'darwin', nothingExists)).toEqual({
      command: 'pnpm',
      args: ['add', '-g', '@swttch/extend-kit'],
    });
    expect(buildInstallSpec(PackageManager.YARN, node, 'darwin', nothingExists)).toEqual({
      command: 'yarn',
      args: ['global', 'add', '@swttch/extend-kit'],
    });
    expect(buildInstallSpec(PackageManager.NPM, node, 'darwin', nothingExists)).toEqual({
      command: 'npm',
      args: ['install', '-g', '@swttch/extend-kit'],
    });
  });

  it('installs with the backend Node’s own npm when it has one', () => {
    expect(buildInstallSpec(PackageManager.HOMEBREW, '/opt/homebrew/bin/node', 'darwin', npmSiblingExists)).toEqual({
      command: '/opt/homebrew/bin/npm',
      args: ['install', '-g', '@swttch/extend-kit'],
    });
  });
});

describe('buildUninstallSpec', () => {
  // The removal has to use the SAME manager as the install: clearing the `ccb`
  // shim with the wrong tool leaves it in place and the retry fails identically.
  it('matches the install manager', () => {
    const node = '/nowhere/bin/node';
    expect(buildUninstallSpec(PackageManager.VOLTA, 'claude-code-battery', node, 'darwin', nothingExists)).toEqual({
      command: 'volta',
      args: ['uninstall', 'claude-code-battery'],
    });
    expect(buildUninstallSpec(PackageManager.PNPM, 'claude-code-battery', node, 'darwin', nothingExists)).toEqual({
      command: 'pnpm',
      args: ['remove', '-g', 'claude-code-battery'],
    });
    expect(buildUninstallSpec(PackageManager.HOMEBREW, 'claude-code-battery', node, 'darwin', nothingExists)).toEqual({
      command: 'npm',
      args: ['uninstall', '-g', 'claude-code-battery'],
    });
  });
});
