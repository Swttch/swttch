import { basename } from 'path';
import { loadActiveChain, type SessionMessage } from './loadSessionMessages';
import { base64ByteLength } from './collectSessionAssets';
import { sentFileKind, type SessionOutput, type SessionOutputRef } from '../../shared';

/** An Artifact page's address, as the CLI's result sentence prints it. */
const ARTIFACT_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/;

interface ImageSource {
  type?: string;
  data?: string;
  media_type?: string;
}

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

function contentOf(entry: SessionMessage): unknown[] {
  const message = entry.message as Record<string, unknown> | undefined;
  return Array.isArray(message?.content) ? (message.content as unknown[]) : [];
}

/** The calls the assistant made, by id, so a result can be traced back to the tool that produced it. */
function collectToolCalls(chain: SessionMessage[]): Map<string, ToolCall> {
  const calls = new Map<string, ToolCall>();
  for (const entry of chain) {
    if (entry.type !== 'assistant') continue;
    for (const block of contentOf(entry)) {
      const b = block as Record<string, unknown> | null;
      if (b && b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
        calls.set(b.id, { name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
      }
    }
  }
  return calls;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const p = part as Record<string, unknown> | null;
      return p && p.type === 'text' && typeof p.text === 'string' ? p.text : '';
    })
    .join('');
}

/** The pictures inside a tool result's content list, with their position in it. */
function imagesIn(content: unknown): { partIndex: number; source: ImageSource }[] {
  if (!Array.isArray(content)) return [];
  const found: { partIndex: number; source: ImageSource }[] = [];
  content.forEach((part, partIndex) => {
    const p = part as Record<string, unknown> | null;
    if (p && p.type === 'image') found.push({ partIndex, source: (p.source ?? {}) as ImageSource });
  });
  return found;
}

function attachmentsOf(entry: SessionMessage): Record<string, unknown>[] {
  const result = entry.toolUseResult as { attachments?: unknown } | undefined;
  return Array.isArray(result?.attachments) ? (result.attachments as Record<string, unknown>[]) : [];
}

/**
 * Index everything one session made or was handed back, oldest first: the
 * pictures tools returned (a `Read` of a png, a screenshot), the files Claude
 * sent with `SendUserFile` and the Artifact pages it published.
 *
 * The Assets screen already indexes what the USER attached. This is the other
 * half, kept as its own index so the viewer that steps through a message's
 * attachments keeps its coordinates. It returns no image bytes, for the same
 * reason: a session of screenshots weighs tens of megabytes.
 *
 * Reads through `loadActiveChain`, so a rewound or abandoned branch is not listed.
 */
export async function collectSessionOutputs(workingDir: string, sessionId: string): Promise<SessionOutput[]> {
  const chain = await loadActiveChain(workingDir, sessionId);
  const calls = collectToolCalls(chain);
  const outputs: SessionOutput[] = [];

  for (const entry of chain) {
    if (entry.type !== 'user') continue;
    const entryUuid = entry.uuid;
    if (typeof entryUuid !== 'string' || !entryUuid) continue;
    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null;

    contentOf(entry).forEach((block, blockIndex) => {
      const b = block as Record<string, unknown> | null;
      if (!b || b.type !== 'tool_result' || b.is_error === true) return;
      const call = typeof b.tool_use_id === 'string' ? calls.get(b.tool_use_id) : undefined;
      if (!call) return;

      if (call.name === 'SendUserFile') {
        attachmentsOf(entry).forEach((attachment, attachmentIndex) => {
          const path = attachment.path;
          if (typeof path !== 'string' || path === '') return;
          outputs.push({
            kind: 'file',
            entryUuid,
            blockIndex,
            attachmentIndex,
            path,
            name: basename(path),
            size: typeof attachment.size === 'number' ? attachment.size : undefined,
            // By extension, as Claude Desktop draws it, not the CLI's own narrower verdict.
            isImage: sentFileKind(path) === 'picture',
            timestamp,
          });
        });
        return;
      }

      if (call.name === 'Artifact') {
        const action = call.input.action;
        if (action !== undefined && action !== 'publish') return;
        const calledUrl = typeof call.input.url === 'string' ? ARTIFACT_URL.exec(call.input.url)?.[0] : undefined;
        const url = ARTIFACT_URL.exec(textOf(b.content))?.[0] ?? calledUrl;
        if (!url) return;
        const filePath = typeof call.input.file_path === 'string' ? call.input.file_path : '';
        const title =
          (typeof call.input.title === 'string' ? call.input.title : '') ||
          (filePath ? basename(filePath).replace(/\.[^.]+$/, '') : '');
        // A page published again moves to the end, and keeps its earlier title when this call names none.
        const earlier = outputs.findIndex((o) => o.kind === 'artifact' && o.url === url);
        const before = earlier === -1 ? undefined : (outputs.splice(earlier, 1)[0] as { title: string; filePath?: string; versionId?: string });
        const kept = before?.title ?? '';
        const keptPath = before?.filePath;
        const publishedPath = filePath || keptPath;
        // "(Version 2, version id 1792995944-6b05)": the id the account's list calls the page's `live` version.
        const versionId = /version id ([A-Za-z0-9_-]+)/.exec(textOf(b.content))?.[1] ?? before?.versionId;
        outputs.push({
          kind: 'artifact', entryUuid, blockIndex, url, title: title || kept,
          ...(publishedPath ? { filePath: publishedPath } : {}),
          ...(versionId ? { versionId } : {}),
          timestamp,
        });
        return;
      }

      for (const { partIndex, source } of imagesIn(b.content)) {
        outputs.push({
          kind: 'image',
          entryUuid,
          blockIndex,
          partIndex,
          mediaType: typeof source.media_type === 'string' ? source.media_type : 'image/png',
          byteSize: source.type === 'base64' ? base64ByteLength(source.data ?? '') : 0,
          timestamp,
          tool: call.name,
        });
      }
    });
  }

  return outputs;
}

/**
 * The `source` object of one tool-returned picture, passed through unedited, or
 * null when the coordinate no longer resolves (the session was rewound past it).
 */
export async function readSessionOutputImage(
  workingDir: string,
  sessionId: string,
  ref: SessionOutputRef,
): Promise<ImageSource | null> {
  const chain = await loadActiveChain(workingDir, sessionId);
  const entry = chain.find((e) => e.uuid === ref.entryUuid);
  if (!entry) return null;
  const block = contentOf(entry)[ref.blockIndex] as Record<string, unknown> | undefined;
  if (!block || block.type !== 'tool_result') return null;
  return imagesIn(block.content).find((i) => i.partIndex === ref.partIndex)?.source ?? null;
}
