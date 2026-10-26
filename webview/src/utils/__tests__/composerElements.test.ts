import { describe, expect, it } from 'vitest';
import { addElementToComposer, elementToken, expandElementTokens, subscribeComposerElements } from '../composerElements';
import { withInspector } from '@/components/FilePreviewPane/pageInspect';

describe('composerElements', () => {
  it('names the chip by tag and accessible name', () => {
    expect(elementToken('H1', ' image   page ')).toBe('<h1/> image page');
    expect(elementToken('div', '')).toBe('<div/>');
  });

  it('tells the composer and writes the element out after the message', () => {
    const seen: string[] = [];
    const off = subscribeComposerElements((token) => seen.push(token));
    addElementToComposer('<h1/> a', { selector: 'h1:nth-of-type(1)', html: '<h1>a</h1>', tag: 'h1', name: 'a', classes: [], attributes: {}, computedStyles: {}, boundingBox: { x: 0, y: 0, width: 1, height: 1 } });
    off();
    expect(seen).toEqual(['<h1/> a']);
    expect(expandElementTokens('look <h1/> a')).toContain('selector: h1:nth-of-type(1)');
    expect(expandElementTokens('nothing')).toBe('nothing');
  });

  it('injects an inspector script that parses', () => {
    const html = withInspector('<html><head></head></html>');
    const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
    expect(() => new Function(script)).not.toThrow();
  });
});
