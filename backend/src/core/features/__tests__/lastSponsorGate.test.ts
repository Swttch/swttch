import { describe, it, expect, beforeEach } from 'vitest';

import { SponsorGate } from '../../../shared';
import { rememberFollowedGate, takeFollowedGate, __resetFollowedGate } from '../lastSponsorGate';

const MINUTE = 60 * 1000;

beforeEach(() => __resetFollowedGate());

describe('lastSponsorGate', () => {
  it('has no answer before any gate has been followed', () => {
    // Null is a real answer: someone who opened Settings on their own was sent
    // by no feature, and naming one would invent a conversion.
    expect(takeFollowedGate()).toBeNull();
  });

  it('remembers the gate that was followed', () => {
    rememberFollowedGate(SponsorGate.Schedule);

    expect(takeFollowedGate()).toBe(SponsorGate.Schedule);
  });

  it('keeps answering while the visit is still the same visit', () => {
    // The walk from a gate to the checkout button is not one request: the user
    // reads the sponsor page first. Forgetting on the first read would lose the
    // origin of nearly every purchase.
    const t0 = 1_000_000;
    rememberFollowedGate(SponsorGate.Assets, t0);

    expect(takeFollowedGate(t0 + MINUTE)).toBe(SponsorGate.Assets);
    expect(takeFollowedGate(t0 + 5 * MINUTE)).toBe(SponsorGate.Assets);
  });

  it('answers with the latest gate when two were passed', () => {
    // Someone who walks past one offer and acts on the next decided at the
    // second one.
    rememberFollowedGate(SponsorGate.Assets);
    rememberFollowedGate(SponsorGate.AutoResume);

    expect(takeFollowedGate()).toBe(SponsorGate.AutoResume);
  });

  it('stops explaining a purchase once it is no longer the same trip', () => {
    // Without this, a gate followed weeks ago would be credited for a sale made
    // today from the Settings page, attributing it to a feature that had nothing
    // to do with it.
    const t0 = 1_000_000;
    rememberFollowedGate(SponsorGate.Assets, t0);

    expect(takeFollowedGate(t0 + 31 * MINUTE)).toBeNull();
  });

  it('stays forgotten once expired, even if asked again sooner', () => {
    // The expiry clears the record rather than merely hiding it, so a later
    // clock reading cannot resurrect an attribution already ruled stale.
    const t0 = 1_000_000;
    rememberFollowedGate(SponsorGate.Assets, t0);
    takeFollowedGate(t0 + 31 * MINUTE);

    expect(takeFollowedGate(t0 + MINUTE)).toBeNull();
  });
});
