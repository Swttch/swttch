import { afterEach, describe, expect, it } from 'vitest';
import { installRandomUUIDPolyfill, randomUUIDFromRandomValues } from '../randomUUIDPolyfill';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUIDPolyfill', () => {
  const native = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');

  afterEach(() => {
    if (native) Object.defineProperty(crypto, 'randomUUID', native);
    else delete (crypto as { randomUUID?: unknown }).randomUUID;
  });

  it('builds version 4 UUIDs with the RFC 4122 variant', () => {
    const ids = Array.from({ length: 200 }, randomUUIDFromRandomValues);

    ids.forEach((id) => expect(id).toMatch(V4));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills in crypto.randomUUID where a plain-HTTP page has none', () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });

    installRandomUUIDPolyfill();

    expect(crypto.randomUUID()).toMatch(V4);
  });

  it('leaves a native crypto.randomUUID alone', () => {
    const own = () => '00000000-0000-4000-8000-000000000000' as const;
    Object.defineProperty(crypto, 'randomUUID', { value: own, configurable: true, writable: true });

    installRandomUUIDPolyfill();

    expect(crypto.randomUUID).toBe(own);
  });
});
