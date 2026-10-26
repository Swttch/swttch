import { describe, expect, it } from 'vitest';
import { addElementToComposer, elementToken, expandElementTokens, getPendingElements, removePendingElement, subscribeComposerElements } from '../composerElements';
import { withInspector } from '@/components/FilePreviewPane/pageInspect';

describe('composerElements', () => {
  it('names the chip by tag and accessible name', () => {
    expect(elementToken('H1', ' image   page ')).toBe('<h1/> image page');
    expect(elementToken('div', '')).toBe('<div/>');
  });

  it('keeps a picked element as a chip, and writes it out after the message when sent', () => {
    const seen: string[] = [];
    const off = subscribeComposerElements((token) => seen.push(token));
    const element = { selector: 'h1:nth-of-type(1)', html: '<h1>a</h1>', tag: 'h1', name: 'a', classes: [], attributes: {}, computedStyles: {}, boundingBox: { x: 0, y: 0, width: 1, height: 1 } };
    addElementToComposer('<h1/> a', element);
    off();
    expect(seen).toEqual(['<h1/> a']);
    expect(getPendingElements().map((entry) => entry.token)).toEqual(['<h1/> a']);
    const sent = expandElementTokens('look');
    expect(sent).toContain('look');
    expect(sent).toContain('selector: h1:nth-of-type(1)');
    expect(getPendingElements()).toEqual([]);
    expect(expandElementTokens('nothing')).toBe('nothing');
  });

  it('lets a chip be taken out before sending', () => {
    const element = { selector: 'p', html: '<p/>', tag: 'p', name: '', classes: [], attributes: {}, computedStyles: {}, boundingBox: { x: 0, y: 0, width: 1, height: 1 } };
    addElementToComposer('<p/>', element);
    removePendingElement('<p/>');
    expect(expandElementTokens('x')).toBe('x');
  });

  it('injects an inspector script that parses', () => {
    const html = withInspector('<html><head></head></html>');
    const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
    expect(() => new Function(script)).not.toThrow();
  });
});
