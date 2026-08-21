import { describe, it, expect } from 'vitest';
import { parseOsRelease, formatOsRelease } from '../os-release';

/** Real `/etc/os-release` excerpts, kept verbatim so the quoting styles stay honest. */
const UBUNTU = `PRETTY_NAME="Ubuntu 24.04.1 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
VERSION="24.04.1 LTS (Noble Numbat)"
VERSION_CODENAME=noble
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
UBUNTU_CODENAME=noble`;

const FEDORA = `NAME="Fedora Linux"
VERSION="41 (Workstation Edition)"
ID=fedora
VERSION_ID=41
PRETTY_NAME="Fedora Linux 41 (Workstation Edition)"
DEFAULT_HOSTNAME="fedora"`;

const ARCH = `NAME="Arch Linux"
PRETTY_NAME="Arch Linux"
ID=arch
BUILD_ID=rolling
ANSI_COLOR="38;2;23;147;209"`;

const ALPINE = `NAME="Alpine Linux"
ID=alpine
VERSION_ID=3.20.3
PRETTY_NAME="Alpine Linux v3.20"
HOME_URL="https://alpinelinux.org/"`;

describe('parseOsRelease', () => {
  it('reads the display fields from a real Ubuntu file', () => {
    const parsed = parseOsRelease(UBUNTU);
    expect(parsed.prettyName).toBe('Ubuntu 24.04.1 LTS');
    expect(parsed.name).toBe('Ubuntu');
    expect(parsed.version).toBe('24.04.1 LTS (Noble Numbat)');
    expect(parsed.versionId).toBe('24.04');
    expect(parsed.id).toBe('ubuntu');
  });

  it('strips double quotes and keeps unquoted values intact', () => {
    const parsed = parseOsRelease(FEDORA);
    expect(parsed.prettyName).toBe('Fedora Linux 41 (Workstation Edition)');
    // VERSION_ID=41 carries no quotes at all — quoting is optional in the spec.
    expect(parsed.versionId).toBe('41');
  });

  it('accepts single-quoted values', () => {
    expect(parseOsRelease("PRETTY_NAME='Debian GNU/Linux 12 (bookworm)'").prettyName)
      .toBe('Debian GNU/Linux 12 (bookworm)');
  });

  it('unescapes backslash-escaped shell characters inside quotes', () => {
    expect(parseOsRelease('PRETTY_NAME="Weird \\"Distro\\" v1"').prettyName)
      .toBe('Weird "Distro" v1');
  });

  it('leaves an apostrophe in an unquoted value alone', () => {
    // Only a matching leading/trailing pair counts as quoting.
    expect(parseOsRelease("NAME=it's").name).toBe("it's");
  });

  it('ignores comments, blank lines and unknown keys', () => {
    const parsed = parseOsRelease(`# a comment\n\nNAME="Ubuntu"\nSUPPORT_URL="https://x"\n`);
    expect(parsed.name).toBe('Ubuntu');
    expect(Object.keys(parsed)).toEqual(['name']);
  });

  it('skips malformed lines instead of aborting the parse', () => {
    const parsed = parseOsRelease('garbage line\n=novalue\nNAME="Ubuntu"');
    expect(parsed.name).toBe('Ubuntu');
  });

  it('returns an empty object for empty input', () => {
    expect(parseOsRelease('')).toEqual({});
  });
});

describe('formatOsRelease', () => {
  it('prefers PRETTY_NAME across real distros', () => {
    expect(formatOsRelease(parseOsRelease(UBUNTU))).toBe('Ubuntu 24.04.1 LTS');
    expect(formatOsRelease(parseOsRelease(FEDORA))).toBe('Fedora Linux 41 (Workstation Edition)');
    expect(formatOsRelease(parseOsRelease(ARCH))).toBe('Arch Linux');
    expect(formatOsRelease(parseOsRelease(ALPINE))).toBe('Alpine Linux v3.20');
  });

  it('rebuilds a name from NAME + VERSION when PRETTY_NAME is absent', () => {
    expect(formatOsRelease({ name: 'Ubuntu', version: '24.04.1 LTS' })).toBe('Ubuntu 24.04.1 LTS');
  });

  it('falls back to VERSION_ID when VERSION is absent', () => {
    expect(formatOsRelease({ name: 'Alpine Linux', versionId: '3.20.3' })).toBe('Alpine Linux 3.20.3');
  });

  it('falls back to the name alone, then to the literal Linux', () => {
    expect(formatOsRelease({ name: 'Arch Linux' })).toBe('Arch Linux');
    expect(formatOsRelease({})).toBe('Linux');
  });
});
