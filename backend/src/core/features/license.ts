import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { readProfile } from './profile';
import { readLiveOauthAccount } from './live-credentials';

// Sponsor license storage + remote verification.
//
// Gating is decided by our own SaaS (www/), never by talking to the payment
// provider directly — the plugin stays free of any provider-specific code
// (see the payment plan, D2). This module: (1) asks www to verify a key, and
// (2) persists a verified key locally so the sponsor state survives restarts.
// The key itself is the identity ("the key is the account"), so there is no
// account/login here — just the key and its last-known status.

// Same install-scoped config dir as profile.json.
const LICENSE_DIR = join(homedir(), '.claude-code-gui');
const LICENSE_FILE = join(LICENSE_DIR, 'license.json');

// Our SaaS API base. Overridable for local development against a dev www server
// (e.g. CCG_WWW_API_BASE=http://localhost:8080/api); defaults to production.
function wwwApiBase(): string {
  const override = process.env.CCG_WWW_API_BASE;
  return override !== undefined && override !== '' ? override : 'https://just-swttch.com/api';
}

/** Result of a remote license verification (mirrors the www /license/verify contract). */
export interface LicenseVerifyResult {
  valid: boolean;
  status?: string;
  error?: string;
}

/** Locally persisted sponsor license — a verified key and its last-known status. */
export interface StoredLicense {
  licenseKey: string;
  /** Last status reported by www (e.g. "active"); null if unknown. */
  status: string | null;
  /** When this key was last verified (ISO 8601). */
  verifiedAt: string;
}

/** Sponsor entitlement derived from local storage — what the UI toggles on. */
export interface SponsorStatus {
  isSponsor: boolean;
  licenseKey?: string;
  status?: string;
}

// Ask www for a sponsor key's status. The key here is OUR bearer key (minted on
// the pricing page after payment), not a Lemon Squeezy key — the plugin never
// touches LS. www resolves it against its DB (kept current by the LS webhook), so
// this is a single round-trip. Network/other failures resolve to invalid.
export async function verifyLicenseRemote(sponsorKey: string): Promise<LicenseVerifyResult> {
  try {
    const res = await fetch(`${wwwApiBase()}/sponsor/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorKey }),
    });
    // fetch does not reject on 4xx/5xx — treat any non-2xx as "could not verify".
    if (!res.ok) {
      return { valid: false, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { valid?: boolean; status?: string; error?: string };
    return {
      valid: json.valid === true,
      status: typeof json.status === 'string' ? json.status : undefined,
      error: typeof json.error === 'string' ? json.error : undefined,
    };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'verify failed' };
  }
}

// Ask www whether a sponsor key has already been minted for this install id.
// Enables copy/paste-free activation: after the buyer pays (the plugin opened the
// pricing page with this install id), www links the minted key to it, and the
// plugin polls this to pick the key up on its own. Returns null until available.
export async function findSponsorByInstall(uid: string): Promise<string | null> {
  try {
    const res = await fetch(`${wwwApiBase()}/sponsor/by-install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { sponsorKey?: string };
    return typeof json.sponsorKey === 'string' && json.sponsorKey !== '' ? json.sponsorKey : null;
  } catch {
    return null;
  }
}

// Tell www that this sponsor key is active on this install, so the admin console
// can show where a key is in use and join it to this install's telemetry profile.
// The telemetry id is profile.uuid — the same value we send to Rybbit as user_id
// and that www stamped onto the license at checkout — so the three line up. The
// Claude account email is a best-effort hint read from the local oauth account
// (no CLI spawn); it's omitted when unavailable. Fire-and-forget: reporting must
// never block or fail activation, so every error is swallowed.
export async function reportActivation(sponsorKey: string): Promise<void> {
  try {
    const profile = await readProfile();
    let claudeEmail: string | undefined;
    try {
      const oauth = await readLiveOauthAccount();
      const email = (oauth as { emailAddress?: unknown } | null)?.emailAddress;
      if (typeof email === 'string' && email !== '') claudeEmail = email;
    } catch {
      // email is a best-effort hint — proceed without it.
    }
    await fetch(`${wwwApiBase()}/sponsor/activation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorKey, telemetryId: profile.uuid, claudeEmail }),
    });
  } catch {
    // best-effort — activation reporting never affects the sponsor state.
  }
}

/** Read the stored license, or null if none/corrupt. */
export async function readLicense(): Promise<StoredLicense | null> {
  try {
    const raw = await readFile(LICENSE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredLicense>;
    if (typeof parsed.licenseKey !== 'string' || parsed.licenseKey === '') return null;
    return {
      licenseKey: parsed.licenseKey,
      status: typeof parsed.status === 'string' ? parsed.status : null,
      verifiedAt: typeof parsed.verifiedAt === 'string' ? parsed.verifiedAt : '',
    };
  } catch {
    return null;
  }
}

/** Persist a verified license. */
export async function saveLicense(license: StoredLicense): Promise<void> {
  await mkdir(LICENSE_DIR, { recursive: true });
  await writeFile(LICENSE_FILE, JSON.stringify(license, null, 2) + '\n', 'utf-8');
}

/** Remove the stored license (deactivate sponsorship on this install). */
export async function clearLicense(): Promise<void> {
  await rm(LICENSE_FILE, { force: true });
}

/**
 * The sponsor entitlement the UI consumes. Derived from the locally stored key:
 * having a verified key on file means "sponsor" here, which is what lets the
 * state survive restarts and work offline.
 *
 * To keep that local trust from going stale, a throttled re-check against www
 * runs first (see license-revalidation): if the key has since been refunded or
 * expired it is cleared here, so the caller sees the corrected state. The check
 * is skipped while the last verification is still fresh, and it never revokes on
 * a network failure — see revalidateStoredLicense for the fail-open rules.
 */
export async function getSponsorStatus(): Promise<SponsorStatus> {
  // Imported lazily: license-revalidation reads/writes the license through this
  // module, so a top-level import would make the two files circular.
  const { revalidateStoredLicense } = await import('./license-revalidation');
  await revalidateStoredLicense(verifyLicenseRemote);

  const license = await readLicense();
  if (license === null) return { isSponsor: false };
  return {
    isSponsor: true,
    licenseKey: license.licenseKey,
    status: license.status ?? undefined,
  };
}
