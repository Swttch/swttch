import { describe, it, expect } from 'vitest';
import type { SessionMetaDto } from '@/dto';
import { findArchiveChanges } from '../archiveChanges';

const row = (id: string, archivedAt = 0): SessionMetaDto =>
  ({ id, title: id, sessionMark: { id, archivedAt, desktopArchived: false } }) as unknown as SessionMetaDto;

describe('findArchiveChanges', () => {
  it('says nothing for rows seen for the first time, even archived ones', () => {
    const { archived, unarchived, snapshot } = findArchiveChanges(new Map(), [row('a', 5), row('b')]);
    expect(archived).toEqual([]);
    expect(unarchived).toEqual([]);
    expect(snapshot.get('a')).toBe(true);
    expect(snapshot.get('b')).toBe(false);
  });

  it('names a session whose row went from not archived to archived', () => {
    const first = findArchiveChanges(new Map(), [row('a'), row('b')]);
    const { archived } = findArchiveChanges(first.snapshot, [row('a', 9), row('b')]);
    expect(archived.map((s) => s.id)).toEqual(['a']);
  });

  it('still notices the change when the row is missing for a moment in between', () => {
    const first = findArchiveChanges(new Map(), [row('a')]);
    const gap = findArchiveChanges(first.snapshot, []);
    expect(findArchiveChanges(gap.snapshot, [row('a', 9)]).archived.map((s) => s.id)).toEqual(['a']);
  });

  it('does not name it again while it stays archived', () => {
    const first = findArchiveChanges(new Map(), [row('a')]);
    const second = findArchiveChanges(first.snapshot, [row('a', 9)]);
    const again = findArchiveChanges(second.snapshot, [row('a', 9)]);
    expect(again.archived).toEqual([]);
    expect(again.unarchived).toEqual([]);
  });

  it('names a session brought back, but not a row that appears already archived later', () => {
    const first = findArchiveChanges(new Map(), [row('a', 9)]);
    const { archived, unarchived } = findArchiveChanges(first.snapshot, [row('a', -1), row('late', 9)]);
    expect(unarchived.map((s) => s.id)).toEqual(['a']);
    expect(archived).toEqual([]);
  });

  it('counts the Claude desktop app archiving a session the MCP chose nothing for', () => {
    const first = findArchiveChanges(new Map(), [row('a')]);
    const desktop = { ...row('a'), sessionMark: { id: 'a', archivedAt: 0, desktopArchived: true } } as unknown as SessionMetaDto;
    expect(findArchiveChanges(first.snapshot, [desktop]).archived.map((s) => s.id)).toEqual(['a']);
  });
});
