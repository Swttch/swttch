import { describe, expect, it } from 'vitest';
import { buildInstalledKitUpdateSpec } from '../global-install-target';

describe('installed companion update target', () => {
  it('uses Volta even when the backend runs Homebrew Node', () => {
    const spec = buildInstalledKitUpdateSpec('/Users/test/.volta/tools/image/packages/@swttch/extend-kit/lib/node_modules', '0.5.0', '/opt/homebrew/bin/node', '/Users/test', 'darwin');
    expect(spec?.args).toEqual(['install', '@swttch/extend-kit@0.5.0']);
    expect(spec?.command).toMatch(/volta$/);
  });
  it('pins the installed npm prefix rather than the running Node prefix', () => {
    const spec = buildInstalledKitUpdateSpec('/Users/test/old node/lib/node_modules', '0.5.0', '/opt/homebrew/bin/node', '/Users/test', 'darwin');
    expect(spec?.args).toEqual(['install', '-g', '--prefix', '/Users/test/old node', '@swttch/extend-kit@0.5.0']);
  });
  it('pins the installed Windows npm prefix', () => {
    const spec = buildInstalledKitUpdateSpec('C:\\Users\\test\\AppData\\Roaming\\npm\\node_modules', '0.5.0', 'C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\test', 'win32', () => true);
    expect(spec?.args).toEqual(['install', '-g', '--prefix', 'C:/Users/test/AppData/Roaming/npm', '@swttch/extend-kit@0.5.0']);
    expect(spec?.command).toBe('C:\\Program Files\\nodejs\\npm.cmd');
  });
  it('does not guess a different store for an unsupported layout', () => {
    expect(buildInstalledKitUpdateSpec('/custom/node_modules', '0.5.0', '/opt/node/bin/node', '/home/test', 'linux')).toBeNull();
  });
  it('rejects invalid registry versions', () => {
    expect(buildInstalledKitUpdateSpec('/usr/local/lib/node_modules', 'latest --force', '/usr/bin/node', '/home/test')).toBeNull();
  });
  it.each(['darwin', 'linux', 'win32'] as const)('pins a custom Volta home on %s', platform => {
    const home = platform === 'win32' ? 'D:/한글 tools' : '/tmp/한글 tools';
    const node = platform === 'win32' ? 'C:/Program Files/nodejs/node.exe' : '/usr/bin/node';
    const spec = buildInstalledKitUpdateSpec(`${home}/tools/image/packages/@swttch/extend-kit/lib/node_modules`, '0.5.0', node, home, platform, () => false);
    expect(spec?.env).toEqual({ VOLTA_HOME: home });
  });
  it.each(['/usr/local', '/home/user/.nvm/versions/node/v22', '/home/user/.asdf/installs/nodejs/22', '/home/user/.volta/tools/image/node/22', '/opt/homebrew/Cellar/node/24'])('pins npm at %s', prefix => {
    const spec = buildInstalledKitUpdateSpec(`${prefix}/lib/node_modules`, '0.5.0', '/usr/bin/node', '/home/user', 'linux');
    expect(spec?.args).toContain(prefix);
  });
  it('preserves special Windows paths for the shared runner', () => {
    const spec = buildInstalledKitUpdateSpec('C:/Users/한 글&%PATH%!/npm/node_modules', '0.5.0', 'C:/Program Files/nodejs/node.exe', 'C:/Users/한 글', 'win32', () => true);
    expect(spec?.args).toContain('C:/Users/한 글&%PATH%!/npm');
  });
  it('delegates a missing npm sibling to the same launcher resolution as CLI update', () => {
    expect(buildInstalledKitUpdateSpec('C:/Users/test/npm/node_modules', '0.5.0', 'C:/node/node.exe', 'C:/Users/test', 'win32', () => false)?.command).toBe('npm.cmd');
  });
  it('pins the Bun global store', () => {
    const spec = buildInstalledKitUpdateSpec('/home/user/.bun/install/global/node_modules', '0.5.0', '/usr/bin/node', '/home/user', 'linux');
    expect(spec?.env).toEqual({ BUN_INSTALL_GLOBAL_DIR: '/home/user/.bun/install/global' });
  });
  it.each(['relative/lib/node_modules', '/custom/node_modules'])('skips unsupported root %s', root => {
    expect(buildInstalledKitUpdateSpec(root, '0.5.0', '/usr/bin/node', '/home/user', 'linux')).toBeNull();
  });

});
