import { hostname, platform } from 'os';

/**
 * A short label for THIS machine, shown in the sponsor's own device list so they
 * can tell their installs apart ("which one is my laptop?").
 *
 * Built from the machine name the owner already chose plus the OS, because those
 * are the terms they recognise — an install uuid is meaningless to a human. It
 * carries nothing beyond what the machine calls itself, and is only ever shown
 * back to the sponsor who owns the license.
 */

/** Longest label we report; keeps one machine from dominating the list. */
const MAX_LENGTH = 80;

/** Platform ids are developer-facing; these are what users call their systems. */
const OS_LABELS: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};

/**
 * Drop the mDNS suffix macOS appends: the owner named the machine
 * "Yonghyuns-MacBook-Pro", not "…-Pro.local".
 */
function cleanHostname(raw: string): string {
  return raw.replace(/\.local$/i, '').trim();
}

export function buildDeviceName(): string {
  try {
    const os = platform();
    const osLabel = OS_LABELS[os] ?? os;

    let host = '';
    try {
      host = cleanHostname(hostname() ?? '');
    } catch {
      // A machine without a resolvable hostname still deserves an OS label.
    }
    if (host === '') return osLabel;

    const suffix = ` · ${osLabel}`;
    const room = MAX_LENGTH - suffix.length;
    const trimmed = host.length > room ? host.slice(0, room) : host;
    return `${trimmed}${suffix}`;
  } catch {
    // Reported on a best-effort path (activation); never let it throw.
    return '';
  }
}
