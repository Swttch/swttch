import { describe, it, expect } from 'vitest';
import {
  EFFORT_AUTO,
  buildEffortSteps,
  canonicalModelName,
  modelsToKeepLegacyEffort,
  resolveEffortModel,
  storedEffortLevel,
  storedModelEffort,
} from '../effort';
import { ModelInfo } from '../slashCommand';
import type { CliConfigControlResponse } from '../slashCommand';

const SUPPORTED = ['low', 'medium', 'high', 'xhigh', 'max'];

const responseWith = (models: ModelInfo[]) =>
  ({ response: { response: { models } } }) as unknown as CliConfigControlResponse;

describe('buildEffortSteps', () => {
  it('puts Auto first, below the first level, and keeps the levels after it', () => {
    const steps = buildEffortSteps(SUPPORTED);
    expect(steps.map((s) => s.key)).toEqual([EFFORT_AUTO, ...SUPPORTED]);
    expect(steps[0]).toMatchObject({ label: 'Auto', filledDots: 0, totalDots: SUPPORTED.length });
    expect(steps[1]).toMatchObject({ key: 'low', label: 'Low', filledDots: 1 });
  });
});

describe('canonicalModelName', () => {
  it('drops the [1m] suffix and the date, and gives nothing for an alias', () => {
    expect(canonicalModelName('claude-opus-5-5[1m]')).toBe('claude-opus-5-5');
    expect(canonicalModelName('claude-sonnet-5-5-20260601')).toBe('claude-sonnet-5-5');
    expect(canonicalModelName('opusplan')).toBeNull();
    expect(canonicalModelName(undefined)).toBeNull();
  });
});

describe('resolveEffortModel', () => {
  const opus = ModelInfo.from({
    value: 'opus',
    displayName: 'Opus',
    resolvedModel: 'claude-opus-5-5',
    supportsEffort: true,
    supportedEffortLevels: SUPPORTED,
  });

  it('names the concrete model the picker row resolved to', () => {
    expect(resolveEffortModel(responseWith([opus]), 'opus')).toBe('claude-opus-5-5');
  });

  it('uses the model id as it is when it is already a concrete id the catalog does not list', () => {
    expect(resolveEffortModel(responseWith([opus]), 'claude-haiku-5-5[1m]')).toBe('claude-haiku-5-5');
  });

  it('gives nothing when only an alias is known, so the pick is not stored under a key the CLI cannot match', () => {
    const unresolved = ModelInfo.from({ value: 'opusplan', displayName: 'Opus Plan', supportsEffort: true });
    expect(resolveEffortModel(responseWith([unresolved]), 'opusplan')).toBeNull();
    expect(resolveEffortModel(null, 'opus')).toBeNull();
  });
});

describe('modelsToKeepLegacyEffort', () => {
  const info = (value: string, resolvedModel: string, levels = SUPPORTED, supportsEffort = true) =>
    ModelInfo.from({ value, displayName: value, resolvedModel, supportsEffort, supportedEffortLevels: levels });
  const catalog = responseWith([
    info('opus', 'claude-opus-5-5'),
    info('sonnet', 'claude-sonnet-5-5'),
    info('haiku', 'claude-haiku-5-5', ['low', 'medium'], true),
    info('plain', 'claude-plain-1', [], false),
    info('opus-1m', 'claude-opus-5-5[1m]'),
  ]);

  it('lists the other models that take the old level, once each, in the spelling the settings file uses', () => {
    expect(modelsToKeepLegacyEffort(catalog, undefined, 'high', 'claude-sonnet-5-5'))
      .toEqual(['claude-opus-5-5']);
  });

  it('leaves out models that do not take effort, or not that level, and the model being picked', () => {
    expect(modelsToKeepLegacyEffort(catalog, {}, 'xhigh', 'claude-opus-5-5')).toEqual(['claude-sonnet-5-5']);
    expect(modelsToKeepLegacyEffort(catalog, {}, 'medium', 'claude-opus-5-5'))
      .toEqual(['claude-sonnet-5-5', 'claude-haiku-5-5']);
  });

  it('is empty once any model has a level of its own, or when there is no old level', () => {
    expect(modelsToKeepLegacyEffort(catalog, { 'claude-opus-5-5': { effortLevel: 'low' } }, 'high', 'claude-sonnet-5-5')).toEqual([]);
    expect(modelsToKeepLegacyEffort(catalog, {}, null, 'claude-sonnet-5-5')).toEqual([]);
    expect(modelsToKeepLegacyEffort(catalog, {}, '', 'claude-sonnet-5-5')).toEqual([]);
    expect(modelsToKeepLegacyEffort(null, {}, 'high', 'claude-sonnet-5-5')).toEqual([]);
  });
});

describe('storedEffortLevel', () => {
  it("is the model's own level first", () => {
    expect(storedEffortLevel({ 'claude-sonnet-5-5': { effortLevel: 'low' } }, 'high', 'claude-sonnet-5-5')).toBe('low');
  });

  it('falls back to the top-level level only while no model has a level of its own', () => {
    expect(storedEffortLevel(undefined, 'high', 'claude-sonnet-5-5')).toBe('high');
    expect(storedEffortLevel({}, 'max', 'claude-sonnet-5-5')).toBe('max');
    expect(storedEffortLevel({ 'claude-opus-5-5': { maxEffortLevel: 'high' } }, 'low', 'claude-sonnet-5-5')).toBe('low');
    expect(storedEffortLevel({ 'claude-opus-5-5': { effortLevel: 'high' } }, 'low', 'claude-sonnet-5-5')).toBeUndefined();
  });

  it('is undefined (Auto) when nothing is stored, and for an unset, empty or null top-level level', () => {
    expect(storedEffortLevel(undefined, undefined, 'claude-sonnet-5-5')).toBeUndefined();
    expect(storedEffortLevel(undefined, '', 'claude-sonnet-5-5')).toBeUndefined();
    expect(storedEffortLevel(undefined, null, 'claude-sonnet-5-5')).toBeUndefined();
  });

  it('still names the top-level level when the model cannot be told', () => {
    expect(storedEffortLevel(undefined, 'high', null)).toBe('high');
  });
});

describe('storedModelEffort', () => {
  const settings = {
    'claude-opus-5-5': { effortLevel: 'high' },
    'claude-sonnet-5-5-20260601': { effortLevel: 'low' },
    'claude-haiku-5-5': { maxEffortLevel: 'medium' },
  };

  it("reads the model's own level, so each model of a plan shows its own", () => {
    expect(storedModelEffort(settings, 'claude-opus-5-5')).toBe('high');
    expect(storedModelEffort(settings, 'claude-sonnet-5-5')).toBe('low');
  });

  it('is undefined (Auto) for a model with no level of its own, even if its entry holds other keys', () => {
    expect(storedModelEffort(settings, 'claude-haiku-5-5')).toBeUndefined();
    expect(storedModelEffort(settings, 'claude-fable-5-1')).toBeUndefined();
    expect(storedModelEffort(undefined, 'claude-opus-5-5')).toBeUndefined();
    expect(storedModelEffort(settings, null)).toBeUndefined();
  });
});
