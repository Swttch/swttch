import { describe, it, expect } from 'vitest';
import { READ_ALOUD_LANGUAGES, readAloudVoicesFor } from '../settings';

describe('readAloudVoicesFor', () => {
  it('gives the voices of the language, named as the service names them', () => {
    expect(readAloudVoicesFor('ko').map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'ko-balgeun', name: '밝은' },
      { id: 'ko-chabunhan', name: '차분한' },
    ]);
  });

  it('matches a regional code to its own entry first, then to the language', () => {
    expect(readAloudVoicesFor('pt-PT')[0].id).toBe('pt-PT-clara');
    expect(readAloudVoicesFor('pt_BR')[0].id).toBe('pt-BR-clara');
    expect(readAloudVoicesFor('ko-KR')[0].id).toBe('ko-balgeun');
  });

  it('falls back to the English voices for a language the service does not read', () => {
    expect(readAloudVoicesFor('th').map((voice) => voice.id)).toEqual(['buttery', 'airy', 'mellow', 'glassy', 'rounded']);
  });

  it('gives every voice the address of its sample', () => {
    for (const entry of READ_ALOUD_LANGUAGES) {
      for (const voice of entry.voices) expect(voice.previewUrl).toMatch(new RegExp(`^https://assets\\.claude\\.ai/voice/selection/${voice.id}-v\\d+\\.mp3$`));
    }
  });

  it('lists every language once, each with at least one voice', () => {
    const codes = READ_ALOUD_LANGUAGES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of READ_ALOUD_LANGUAGES) expect(entry.voices.length).toBeGreaterThan(0);
  });
});
