/**
 * Which key a stored sponsor license should be kept under.
 *
 * www accepts the payment provider's license key wherever a sponsor key is asked
 * for, because buyers see that key on their order page and type it into the
 * sponsor screen. Such a key verifies, but it is not the credential this install
 * should hold on to. www answers every check with the canonical sponsor key, so
 * the stored key moves to it the first time www names one.
 *
 * Only a real answer replaces the stored key. An absent or blank `sponsorKey`
 * (an older www, or a license whose sponsor key has not been minted yet) keeps
 * what is on disk, so a thin answer can never blank out a working key.
 */
export function canonicalSponsorKey(answered: string | undefined, current: string): string {
  const key = typeof answered === 'string' ? answered.trim() : '';
  return key !== '' ? key : current;
}
