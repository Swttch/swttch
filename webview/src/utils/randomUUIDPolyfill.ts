/**
 * Supplies `crypto.randomUUID` where the browser leaves it out.
 *
 * Browsers expose `crypto.randomUUID` only in a secure context: HTTPS or a loopback address. A phone that opens the
 * app over plain HTTP on the LAN (`ccg run -b 0.0.0.0`, or the Vite dev server at `http://<this machine's IP>:5173`)
 * is not one, so the first `crypto.randomUUID()` threw and the whole page fell into the error boundary.
 * `crypto.getRandomValues` has no such restriction, and a version 4 UUID is nothing more than 122 random bits in a fixed
 * layout, so the missing function is rebuilt from it here. Imported for its side effect first thing in main.tsx.
 */

/** A random RFC 4122 version 4 UUID built from `crypto.getRandomValues`. */
export function randomUUIDFromRandomValues(): `${string}-${string}-${string}-${string}-${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Define `crypto.randomUUID` when it is missing. Leaves a native one alone. */
export function installRandomUUIDPolyfill(): void {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') return;
  if (typeof crypto.randomUUID === 'function') return;
  Object.defineProperty(crypto, 'randomUUID', {
    value: randomUUIDFromRandomValues,
    configurable: true,
    writable: true,
  });
}

installRandomUUIDPolyfill();
