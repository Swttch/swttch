import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType, SponsorGate, SponsorGateStep, SponsorGateSurface } from '../../../shared';

const trackEvent = vi.fn();
vi.mock('../../features/telemetry', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

const { sponsorGateActivityHandler } = await import('../sponsorGateActivity');
const { sponsorGateEventName } = await import('../../features/sponsorGateEvent');

const connections = {} as ConnectionManager;
const bridge = {} as Bridge;

function report(payload: Record<string, unknown>): void {
  const message: IPCMessage = {
    type: MessageType.SPONSOR_GATE_ACTIVITY,
    payload,
    timestamp: 0,
  } as IPCMessage;
  sponsorGateActivityHandler('c1', message, connections, bridge);
}

const lastName = () => trackEvent.mock.calls[trackEvent.mock.calls.length - 1]?.[0];
const lastProps = () => trackEvent.mock.calls[trackEvent.mock.calls.length - 1]?.[1];

beforeEach(() => trackEvent.mockReset());

describe('sponsorGateEventName', () => {
  it('puts the feature in the NAME, so each one can be counted in people', () => {
    // Rybbit reports unique users per event name but not per custom property.
    // With the feature in properties every gate would collapse into one
    // "someone was offered something" count and no per-feature rate could be
    // computed at all.
    expect(sponsorGateEventName(SponsorGate.Assets, SponsorGateStep.Seen)).toBe('gate_assets_seen');
    expect(sponsorGateEventName(SponsorGate.Schedule, SponsorGateStep.Clicked)).toBe(
      'gate_schedule_clicked',
    );
    expect(sponsorGateEventName(SponsorGate.AutoResume, SponsorGateStep.Seen)).toBe(
      'gate_autoresume_seen',
    );
  });

  it('gives every feature a distinct name at every step', () => {
    // The whole dashboard divides one of these counts by another, so two gates
    // sharing a name would silently add two features' people together.
    const names = new Set<string>();
    for (const gate of Object.values(SponsorGate)) {
      for (const step of Object.values(SponsorGateStep)) {
        names.add(sponsorGateEventName(gate, step));
      }
    }
    expect(names.size).toBe(Object.values(SponsorGate).length * Object.values(SponsorGateStep).length);
  });
});

describe('sponsorGateActivityHandler', () => {
  it('records the offer being shown, against the feature that raised it', () => {
    report({
      gate: SponsorGate.Schedule,
      step: SponsorGateStep.Seen,
      from: SponsorGateSurface.SchedulePopover,
    });

    expect(lastName()).toBe('gate_schedule_seen');
    expect(lastProps()).toEqual({ from: SponsorGateSurface.SchedulePopover });
  });

  it('keeps the surface in properties, not in the name', () => {
    // Which surface asked is a secondary question, answerable by hits. Splitting
    // the name by it would force every feature's headcount to be summed back
    // together from several names.
    report({
      gate: SponsorGate.AutoResume,
      step: SponsorGateStep.Seen,
      from: SponsorGateSurface.SettingsToggle,
    });
    const settingsName = lastName();

    report({
      gate: SponsorGate.AutoResume,
      step: SponsorGateStep.Seen,
      from: SponsorGateSurface.UsageLimit,
    });

    expect(lastName()).toBe(settingsName);
    expect(lastProps()).toEqual({ from: SponsorGateSurface.UsageLimit });
  });

  it('ignores a gate or step it does not know', () => {
    report({ gate: 'not_a_feature', step: SponsorGateStep.Seen });
    report({ gate: SponsorGate.Assets, step: 'not_a_step' });
    report({ gate: SponsorGate.Assets });
    report({ step: SponsorGateStep.Seen });
    report({ gate: 42, step: 7 });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('still counts the offer when only the surface is unrecognized', () => {
    // The surface merely refines a count that is already meaningful, so a build
    // that knows a surface this one does not must not lose the whole event.
    report({ gate: SponsorGate.Assets, step: SponsorGateStep.Seen, from: 'sideways' });

    expect(lastName()).toBe('gate_assets_seen');
    expect(lastProps()).toEqual({});
  });

  it('never forwards a non-numeric lockedCount', () => {
    report({ gate: SponsorGate.Assets, step: SponsorGateStep.Seen, lockedCount: '24' });

    expect(lastProps()).toEqual({});
  });

  it('carries nothing the user typed', () => {
    // The Assets index holds a caption of the user's own prompt; it must not
    // reach telemetry even if a caller hands it over.
    report({
      gate: SponsorGate.Assets,
      step: SponsorGateStep.Seen,
      lockedCount: 3,
      messagePreview: 'my secret project plan',
    });

    expect(JSON.stringify(lastProps())).not.toContain('secret');
    expect(lastProps()).toEqual({ lockedCount: 3 });
  });
});
