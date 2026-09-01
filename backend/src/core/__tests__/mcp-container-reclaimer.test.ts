import { describe, it, expect } from 'vitest';
import { findDockerMcpServers } from '../mcp-container-reclaimer';
import { McpTransportType } from '../../shared';
import type { McpServerConfig } from '../../shared';

/**
 * `findDockerMcpServers` decides what the reclaimer is allowed to touch, so it is
 * the piece worth pinning down: everything downstream only ever removes a
 * container that matched one of these entries. It is pure, so none of this needs
 * a Docker daemon.
 */
describe('findDockerMcpServers', () => {
  const stdio = (command: string, args: string[]): McpServerConfig => ({
    type: McpTransportType.STDIO,
    command,
    args,
  });

  it('reads the image and the command out of a plain `docker run`', () => {
    const config = stdio('docker', [
      'run', '-i', '--rm', 'crystaldba/postgres-mcp:latest', '--access-mode=restricted',
    ]);
    expect(findDockerMcpServers([config])).toEqual([
      { image: 'crystaldba/postgres-mcp:latest', command: '--access-mode=restricted' },
    ]);
  });

  it('skips the values of flags that take one, so `-e VAR` is not read as the image', () => {
    const config = stdio('docker', [
      'run', '-i', '--rm', '-e', 'DATABASE_URI', '--name', 'pg', 'my/image:1', 'serve',
    ]);
    expect(findDockerMcpServers([config])).toEqual([{ image: 'my/image:1', command: 'serve' }]);
  });

  it('keeps an inline `--flag=value` from consuming the image', () => {
    const config = stdio('docker', ['run', '--network=host', 'my/image:1']);
    expect(findDockerMcpServers([config])).toEqual([{ image: 'my/image:1', command: '' }]);
  });

  it('ignores servers that are not run through docker at all', () => {
    expect(findDockerMcpServers([stdio('npx', ['some-mcp-server'])])).toEqual([]);
  });

  it('ignores `docker exec`, which addresses a container it did not start', () => {
    expect(findDockerMcpServers([stdio('docker', ['exec', '-i', 'running', 'serve'])])).toEqual([]);
  });

  it('ignores `docker compose run`, whose container is not identified this way', () => {
    const config = stdio('docker', ['compose', 'run', '--rm', 'svc']);
    expect(findDockerMcpServers([config])).toEqual([]);
  });

  it('ignores a `docker run` with no image argument at all', () => {
    expect(findDockerMcpServers([stdio('docker', ['run', '-i', '--rm'])])).toEqual([]);
  });

  it('ignores null and undefined entries, which is how unknown configs arrive', () => {
    expect(findDockerMcpServers([null, undefined])).toEqual([]);
  });

  it('finds every docker server in a mixed configuration', () => {
    const configs = [
      stdio('npx', ['a']),
      stdio('docker', ['run', '-i', '--rm', 'img/one', 'x']),
      { type: McpTransportType.HTTP, url: 'http://localhost:1' },
      stdio('docker', ['run', 'img/two']),
    ];
    expect(findDockerMcpServers(configs)).toEqual([
      { image: 'img/one', command: 'x' },
      { image: 'img/two', command: '' },
    ]);
  });
});
