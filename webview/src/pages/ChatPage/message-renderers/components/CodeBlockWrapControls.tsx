import {RefObject, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {Tooltip} from '@/components';
import {cn} from '@/utils/cn.ts';
import {useTranslation} from '@/i18n';
import {useSettingsOrNull} from '@/contexts/SettingsContext';
import {SettingKey} from '@/types/settings';
import {WrapIcon} from './WrapIcon';

/**
 * Per-block wrap buttons for the fenced code blocks inside an assistant message
 * (#179 follow-up).
 *
 * The other blocks get their button from useSoftWrapToggle, which hands the
 * caller a class and a button to place. A fenced block cannot: Streamdown owns
 * the whole
 * `code-block` subtree — header, copy button and all — and neither
 * `components` (it never reaches the code path; an override there only lands on
 * the pre-highlight fallback) nor `controls` (booleans that turn its own
 * buttons off) lets us add one. Re-implementing the subtree would mean owning
 * its copy button and language label forever.
 *
 * So the button is portalled into the header Streamdown already rendered, and
 * the fold is a class on the `code-block` element — the same `.soft-wrap` /
 * `.soft-wrap-off` pair every other block uses.
 */
export const CodeBlockWrapControls = ({containerRef, content}: {
  containerRef: RefObject<HTMLElement | null>;
  /** Re-scan when the message text changes — blocks appear as it streams in. */
  content: string;
}) => {
  const [headers, setHeaders] = useState<HTMLElement[]>([]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // Streamdown swaps the highlighted block in asynchronously, so the headers
    // are not there on the first pass after `content` changes.
    const scan = () => {
      const found = Array.from(
        root.querySelectorAll<HTMLElement>('[data-streamdown="code-block-header"]'),
      );
      setHeaders((prev) =>
        prev.length === found.length && prev.every((el, i) => el === found[i]) ? prev : found,
      );
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(root, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, [containerRef, content]);

  return (
    <>
      {headers.map((header, i) => (
        <CodeBlockWrapButton key={i} header={header} />
      ))}
    </>
  );
};

const CodeBlockWrapButton = ({header}: {header: HTMLElement}) => {
  const {t} = useTranslation('chatTools');
  const settings = useSettingsOrNull();
  const defaultWrapped = settings?.settings[SettingKey.SOFT_WRAP] === true;
  const [override, setOverride] = useState<boolean | null>(null);
  const wrapped = override ?? defaultWrapped;

  // The class goes on the `code-block` wrapper rather than the <pre>, so the
  // same descendant selectors the global setting uses apply unchanged.
  const block = header.closest<HTMLElement>('[data-streamdown="code-block"]');
  useEffect(() => {
    if (!block) return;
    block.classList.toggle('soft-wrap', wrapped);
    block.classList.toggle('soft-wrap-off', !wrapped);
    return () => {
      block.classList.remove('soft-wrap', 'soft-wrap-off');
    };
  }, [block, wrapped]);

  const label = wrapped ? t('tool.softWrap.unwrap') : t('tool.softWrap.wrap');

  // Into the header's button row, so it sits beside Copy instead of floating
  // over the code.
  const slot = header.lastElementChild ?? header;

  return createPortal(
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={wrapped}
        onClick={() => setOverride(!wrapped)}
        className={cn(
          // Same chip as the copy button it sits beside — see .wrap-toggle-button.
          'wrap-toggle-button opacity-0 transition-all',
          'group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <WrapIcon />
      </button>
    </Tooltip>,
    slot,
  );
};
