import type { PickedElement } from '@/components/FilePreviewPane/pageInspect';

/**
 * Things the reader picked or drew in the Browser pane, on their way into the chat (#593).
 *
 * Claude Desktop puts a chip such as `<h1/> image page` in the message box and sends Claude the element
 * with a picture of it. The box here holds text, so the chip is a token in the text, and what the token
 * stands for is kept here until the message is sent, when it is written out after the text. The picture
 * goes in as an image attachment.
 */
export type ComposerElement = PickedElement;

const elements = new Map<string, ComposerElement>();
type ElementListener = (token: string, element: ComposerElement) => void;
const elementListeners = new Set<ElementListener>();
type ImageListener = (png: Blob, name: string) => void;
const imageListeners = new Set<ImageListener>();

/** The chip text for an element: its tag, then its accessible name when it has one. */
export function elementToken(tag: string, name: string): string {
  const label = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  return label ? `<${tag.toLowerCase()}/> ${label}` : `<${tag.toLowerCase()}/>`;
}

/** Puts the element in the message box. */
export function addElementToComposer(token: string, element: ComposerElement): void {
  elements.set(token, element);
  elementListeners.forEach((listener) => listener(token, element));
}

export function subscribeComposerElements(listener: ElementListener): () => void {
  elementListeners.add(listener);
  return () => elementListeners.delete(listener);
}

/** Attaches a picture (an annotated page) to the message. */
export function addImageToComposer(png: Blob, name: string): void {
  imageListeners.forEach((listener) => listener(png, name));
}

export function subscribeComposerImages(listener: ImageListener): () => void {
  imageListeners.add(listener);
  return () => imageListeners.delete(listener);
}

/** A base64 PNG as a Blob. */
export function pngFromBase64(base64: string): Blob {
  const bytes = atob(base64);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: 'image/png' });
}

function describe(token: string, e: ComposerElement): string {
  const lines = [`Element ${token}`, `selector: ${e.selector}`];
  if (e.id) lines.push(`id: ${e.id}`);
  if (e.classes.length > 0) lines.push(`classes: ${e.classes.join(' ')}`);
  const attributes = Object.entries(e.attributes);
  if (attributes.length > 0) lines.push(`attributes: ${attributes.map(([k, v]) => `${k}="${v}"`).join(' ')}`);
  if (e.action) lines.push(`action: ${e.action}`);
  if (e.parentPath) lines.push(`parents: ${e.parentPath}`);
  const styles = Object.entries(e.computedStyles).filter(([, v]) => v !== '');
  if (styles.length > 0) lines.push(`computed styles: ${styles.map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  const box = e.boundingBox;
  lines.push(`box: x=${Math.round(box.x)} y=${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`);
  if (e.innerText) lines.push(`text: ${e.innerText}`);
  lines.push(`html: ${e.html}`);
  if (e.siblingHTML) lines.push(`siblings:\n${e.siblingHTML}`);
  return lines.join('\n');
}

/** The message with what each element chip stands for written out after it. */
export function expandElementTokens(text: string): string {
  const used = [...elements.entries()].filter(([token]) => text.includes(token));
  if (used.length === 0) return text;
  return `${text}\n\n${used.map(([token, element]) => describe(token, element)).join('\n\n')}`;
}
