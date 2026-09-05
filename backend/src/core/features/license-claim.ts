import {
  readLicense,
  wasDeactivatedHere,
  saveLicense,
  findSponsorByInstall,
  reportActivation,
  verifyLicenseRemote,
} from './license';
import { readProfile } from './profile';

/**
 * Picks up a sponsor key that was minted for this install but never arrived.
 *
 * Payment happens in a browser, so the key is created on www and has to travel
 * back to the plugin. Originally the only thing that carried it was a poll armed
 * by pressing "Sponsor" and disarmed ten minutes later, living in the Sponsor
 * screen's own component state. Miss that window — pay on a phone, close the
 * tab, come back tomorrow — and no later visit to any screen could ever recover
 * the key, because reopening the screen started that state at null again. The
 * sponsor kept paying and the plugin kept behaving as if they never had (#256).
 *
 * So pick-up lives here instead, as one function both callers share: the Sponsor
 * screen's post-checkout poll wants it immediately and repeatedly, while
 * `getSponsorStatus()` wants it quietly in the background. Same rules, same
 * writes; only the throttle differs. Two copies of "claim a key" would drift,
 * and the drift is exactly what caused the bug.
 */

/**
 * How long the background path waits between asks. Long, because the answer only
 * changes when someone pays: a sponsor who just did is covered by the Sponsor
 * screen's unthrottled poll, and everyone else is answered by a restart.
 */
export const CLAIM_RETRY_INTERVAL_MS = 60 * 60 * 1000; // 1h

/**
 * When the background path last asked www. In memory on purpose — a restart
 * should retry immediately (that is the moment a stranded sponsor reopens their
 * IDE hoping it works), and persisting it would need a file we do not have when
 * there is no key to write into.
 */
let lastBackgroundAttemptAt: number | null = null;

/** Test seam: forget the throttle so each case starts from a clean slate. */
export function resetClaimThrottle(): void {
  lastBackgroundAttemptAt = null;
}

export interface ClaimOptions {
  /**
   * Whether to respect the retry interval. The Sponsor screen polls with
   * `false` (the user is watching a payment land), background callers use
   * `true` so a hot path never turns into a request per call.
   */
  throttled: boolean;
}

/**
 * Ask www whether a sponsor key exists for this install and store it if so.
 *
 * Returns true only when a key was newly stored. Never throws: this runs inside
 * `getSponsorStatus()`, so a failure here must degrade to "not a sponsor yet",
 * never break the sponsor screen or a gated action.
 */
export async function claimSponsorByInstall({ throttled }: ClaimOptions): Promise<boolean> {
  try {
    // Already have one. Re-checking a stored key is revalidation's job.
    if ((await readLicense()) !== null) return false;

    // The user turned sponsorship off here. www still has the key linked to this
    // install id, so without this check the very next call would hand it back
    // and undo them.
    if (await wasDeactivatedHere()) return false;

    if (throttled) {
      const last = lastBackgroundAttemptAt;
      if (last !== null && Date.now() - last < CLAIM_RETRY_INTERVAL_MS) return false;
      lastBackgroundAttemptAt = Date.now();
    }

    const profile = await readProfile();
    const sponsorKey = await findSponsorByInstall(profile.uuid);
    if (sponsorKey === null) return false;

    // Ask what the key actually grants before storing it. by-install answers
    // only "here is the key", so storing that alone leaves tier, interval, price
    // and `cancellable` empty — and an empty `cancellable` hides "Cancel
    // recurring sponsorship" from the menu, so a sponsor who was just switched
    // on automatically could not find the way to stop paying. Re-validation
    // would fill it in later; "later" is not good enough for that one.
    const plan = await verifyLicenseRemote(sponsorKey).catch(() => null);
    await saveLicense({
      licenseKey: sponsorKey,
      status: plan?.status ?? 'active',
      verifiedAt: new Date().toISOString(),
      tier: plan?.tier ?? null,
      interval: plan?.interval ?? null,
      price: plan?.price ?? null,
      cancellable: plan?.cancellable ?? null,
    });
    // Fire-and-forget: www learns where the key is in use, but a sponsor must
    // not be held up by our bookkeeping.
    void reportActivation(sponsorKey);
    return true;
  } catch {
    return false;
  }
}
