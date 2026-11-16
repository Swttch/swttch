import type { LoadedMessageDto } from '../../types';
import type { WindowEntry, WindowGap } from '../../utils/transcriptWindow';
import { gapIndex } from '../../utils/transcriptWindow';
import { groupIntoSendSections, type SendSection } from './groupIntoSendSections';

export interface SectionsWithGap {
  sections: SendSection[];
  /**
   * The index of the section the gap stands in front of, or null when what is
   * held is one run. The transcript draws its "newer messages" row there.
   */
  gapSectionIndex: number | null;
}

/**
 * Split the merged messages into send sections, starting a new section at the gap
 * (#680).
 *
 * The messages after the gap begin wherever the page boundary fell, which is
 * usually in the middle of a send's reply. Grouping the two sides together would
 * glue that tail of the reply onto the section that ends the history, and the
 * "newer messages" row would have no place to stand between them. So each side is
 * grouped on its own: the side after the gap opens with a section that has no head,
 * the same thing a page that opens mid-reply has always been.
 *
 * `held` is the raw messages the merged ones were made from. Which merged message
 * is the first one after the gap is read off them: the gap names the first entry
 * held after it, and that entry may have been folded into the message before it
 * (a tool result is), so the split is made after the last merged message that
 * belongs to the history rather than at the named entry.
 */
export function splitSectionsAtGap(
  merged: readonly LoadedMessageDto[],
  held: readonly WindowEntry[],
  gap: WindowGap | null,
): SectionsWithGap {
  const at = gapIndex(held, gap);
  if (!gap || at <= 0) return { sections: groupIntoSendSections([...merged]), gapSectionIndex: null };

  const history = new Set<string>();
  for (let i = 0; i < at; i++) {
    const uuid = held[i].uuid;
    if (typeof uuid === 'string') history.add(uuid);
  }
  let lastHistory = -1;
  for (let i = 0; i < merged.length; i++) {
    const uuid = merged[i].uuid;
    if (typeof uuid === 'string' && history.has(uuid)) lastHistory = i;
  }
  const split = lastHistory + 1;

  const before = groupIntoSendSections(merged.slice(0, split));
  // Keys are what React tells sections apart by; the fallback one counts from zero
  // in each grouping, so the second grouping's are renamed.
  const after = groupIntoSendSections(merged.slice(split)).map(section =>
    section.key.startsWith('section-') ? { ...section, key: `after-gap-${section.key}` } : section,
  );
  return { sections: [...before, ...after], gapSectionIndex: before.length };
}
