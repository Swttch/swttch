import React, { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { Tooltip } from '@/components/Tooltip';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';
import { i18n } from '@/i18n';
import { linkMenuStore } from '@/utils/linkMenuStore';
import { resolveMarkdownFileLink } from '../utils/markdownFileLink';

// Streamdown's default link classes, re-applied because a custom component fully
// replaces the default renderer (and its styling).
const MARKDOWN_LINK_CLASS = 'wrap-anywhere font-medium text-primary underline';

/**
 * Assistant-markdown anchor renderer. A local file href (absolute or `./`/`../`,
 * optional `#Lnn`) renders as a clickable reference that opens the file in the IDE
 * at its line; anything else is a normal external link. Replaces Streamdown's
 * default link, whose modal would `window.open` a root-relative local href against
 * the webview origin (a dead localhost tab). `stopPropagation` keeps the click
 * from also toggling a surrounding container, as `MessagePathChip` / `PathRow` do.
 */
export const MarkdownFileLink: React.FC<{ href?: string; children?: ReactNode }> = ({ href, children }) => {
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? null;
  const link = href ? resolveMarkdownFileLink(href, workingDirectory) : null;

  if (link) {
    const open = (event: React.SyntheticEvent) => {
      event.preventDefault();
      event.stopPropagation();
      getAdapter()
        .openFile(link.path, link.line, link.column)
        .catch((err) => {
          console.error('[MarkdownFileLink] Failed to open file link:', err);
          toast.error(i18n.t('chat:fileOpenFailed', { path: link.path }));
        });
    };
    // The same right click an external link has: a menu with what the browser's own
    // does not offer. A middle click does what a click does, as it does on a web link.
    const openMenu = (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      linkMenuStore.open({
        target: { kind: 'file', path: link.path, line: link.line, column: link.column },
        x: event.clientX,
        y: event.clientY,
      });
    };
    return (
      <Tooltip content={link.path}>
        <span
          className={`${MARKDOWN_LINK_CLASS} cursor-pointer`}
          role="button"
          tabIndex={0}
          onClick={open}
          onAuxClick={(event) => {
            if (event.button === 1) open(event);
          }}
          onContextMenu={openMenu}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') open(event);
          }}
        >
          {children}
        </span>
      </Tooltip>
    );
  }

  // In-page anchor (footnotes, TOC): keep it same-tab.
  if (href && href.startsWith('#')) {
    return <a href={href} className={MARKDOWN_LINK_CLASS}>{children}</a>;
  }
  // Non-local: an external web link, unless it's a streaming placeholder href
  // (`streamdown:incomplete-link`), which stays plain text. The click goes through
  // the adapter rather than the anchor's own `target="_blank"`: in the IDE the
  // popup that target asks for is not reliably handed to the plugin (remote JCEF),
  // and the chat tab itself navigates to the URL instead. The adapter opens it in
  // the IDE's configured browser; in browser mode it is `window.open`, as before.
  // The anchor stays an anchor so the URL still shows on hover.
  if (href && !href.startsWith('streamdown:')) {
    const openExternal = (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      getAdapter()
        .openUrl(href)
        .catch((err) => {
          console.error('[MarkdownFileLink] Failed to open external link:', err);
          toast.error(i18n.t('chat:externalLink.openFailed'));
        });
    };
    return (
      <a href={href} target="_blank" rel="noreferrer" className={MARKDOWN_LINK_CLASS} onClick={openExternal}>
        {children}
      </a>
    );
  }
  return <span className={MARKDOWN_LINK_CLASS}>{children}</span>;
};

/** Streamdown `components` override that routes local file links to the IDE. */
export const MARKDOWN_COMPONENTS = { a: MarkdownFileLink };
