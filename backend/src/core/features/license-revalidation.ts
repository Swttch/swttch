import { readLicense, saveLicense, clearLicense } from './license';
import type { LicenseVerifyResult } from './license';

/**
 * Keeps the locally stored sponsor key honest.
 *
 * `getSponsorStatus()` trusts whatever key is on disk, which is what makes the
 * sponsor state survive restarts and offline use. The gap that leaves: a key
 * that www later marks refunded/expired would keep unlocking sponsor features
 * forever, because nothing ever asks www again after the initial activation.
 *
 * So the stored key is re-checked against www, but only occasionally — a
 * round-trip in front of every sponsor-gated action would be both slow and
 * pointless, since entitlement changes are rare. `verifiedAt` on the stored
 * license records when we last asked, and doubles as the throttle.
 *
 * Fail-open is the rule: only an authoritative "this key is not valid" answer
 * revokes sponsorship. A network error, a 5xx, a thrown exception — anything
 * that merely means "could not ask" — leaves the license untouched, because
 * stripping a paying sponsor for being offline is far worse than letting a
 * refunded one linger until the next successful check.
 */

/** How long a verification stays good before the key is re-checked. */
export const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

/** Verifier signature — `verifyLicenseRemote`, injected so tests stay offline. */
export type LicenseVerifier = (sponsorKey: string) => Promise<LicenseVerifyResult>;

/**
 * True when the last verification is old enough (or unusable) that we should ask
 * www again. An absent/unparseable `verifiedAt` counts as stale rather than
 * fresh — otherwise a corrupted timestamp would pin the key as valid forever.
 */
function isStale(verifiedAt: string): boolean {
  const last = Date.parse(verifiedAt);
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= REVALIDATE_INTERVAL_MS;
}

/**
 * Re-check the stored sponsor key if its last verification has gone stale.
 *
 * Never throws: any failure is swallowed so this can be called from a hot path
 * without becoming a way to break sponsor-gated features.
 */
export async function revalidateStoredLicense(verify: LicenseVerifier): Promise<void> {
  try {
    const license = await readLicense();
    if (license === null) return;
    if (!isStale(license.verifiedAt)) return;

    const result = await verify(license.licenseKey);

    // `valid:false` with an `error` means "could not ask" (transport/HTTP
    // failure), not "not a sponsor" — see verifyLicenseRemote. Only an answer
    // that actually reached www may revoke.
    if (!result.valid && result.error === undefined) {
      await clearLicense();
      return;
    }
    if (!result.valid) return;

    // Still valid: stamp the check so the next call waits another interval.
    await saveLicense({
      licenseKey: license.licenseKey,
      status: result.status ?? license.status,
      verifiedAt: new Date().toISOString(),
    });
  } catch {
    // Re-validation is best-effort; a failure must never revoke or throw.
  }
}
