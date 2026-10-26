import type { PickedElement } from '@/components/FilePreviewPane/pageInspect';

/**
 * Things the reader picked or drew in the Browser pane, on their way into the chat (#593).
 *
 * Claude Desktop puts a chip such as `<h1/> image page` among the message box's attachments and sends Claude
 * the element with a picture of it. Here the chip is an entry in the list below, shown in the attachment row;
 * when the message is sent, what each chip stands for is written out after the text and the list is emptied.
 * The picture goes in as an image attachment.
 */
export type ComposerElement = PickedElement;

/** An element picked in the Browser pane, waiting in the message box's attachment row. */
export interface PendingElement {
  token: string;
  element: ComposerElement;
  /** File name of the picture of the element that travels as an image attachment, which the chip stands for too. */
  imageName?: string;
}

let pending: PendingElement[] = [];
const pendingListeners = new Set<() => void>();
type ElementListener = (token: string, element: ComposerElement, imageName: string | undefined) => void;
let pictureCount = 0;
const elementListeners = new Set<ElementListener>();
type ImageListener = (png: Blob, name: string) => void;
const imageListeners = new Set<ImageListener>();

function setPending(next: PendingElement[]): void {
  pending = next;
  pendingListeners.forEach((listener) => listener());
}

/** The chip text for an element: its tag, then its accessible name when it has one. */
export function elementToken(tag: string, name: string): string {
  const label = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  return label ? `<${tag.toLowerCase()}/> ${label}` : `<${tag.toLowerCase()}/>`;
}

/** Puts the element in the message box's attachment row. */
export function addElementToComposer(token: string, element: ComposerElement): void {
  const imageName = element.screenshot ? `element-${++pictureCount}.png` : undefined;
  setPending([...pending.filter((entry) => entry.token !== token), { token, element, imageName }]);
  elementListeners.forEach((listener) => listener(token, element, imageName));
}

/** Takes one chip out of the row. */
export function removePendingElement(token: string): void {
  setPending(pending.filter((entry) => entry.token !== token));
}

/** The chips in the attachment row, as `useSyncExternalStore` reads them. */
export function getPendingElements(): readonly PendingElement[] {
  return pending;
}

export function subscribePendingElements(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

/** Tells the composer an element was picked (it attaches the picture of it). */
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
  return `<picked-element>\n${lines.join('\n')}\n</picked-element>`;
}

/** The message with what each chip in the attachment row stands for written out after it; the row is emptied. */
export function expandElementTokens(text: string): string {
  if (pending.length === 0) return text;
  const described = pending.map(({ token, element }) => describe(token, element)).join('\n\n');
  setPending([]);
  return text ? `${text}\n\n${described}` : described;
}
