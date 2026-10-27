import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Tippy from '@tippyjs/react/headless';
import type { Instance } from 'tippy.js';
import toast from 'react-hot-toast';
import {
  ArrowDownTrayIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, ArrowUpTrayIcon, CheckIcon, ChevronDownIcon,
  ChevronRightIcon, DocumentDuplicateIcon, FlagIcon, PencilIcon, Square2StackIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import { getAdapter } from '@/adapters';
import { Tooltip } from '@/components/Tooltip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { i18n, useTranslation } from '@/i18n';
import { useArtifactRecord, type FrameRecord, type RecordGap } from '@/hooks/useArtifactRecord';
import { useExtCapabilities, useRunExtApi } from '@/hooks/useExtApi';
import { useSessionArtifactList, type SessionArtifact } from '@/hooks/useSessionArtifact';
import { downloadSentFile } from '@/pages/ChatPage/message-renderers/ToolRenderers/sendUserFile';
import { usePageTitle } from '@/pages/ChatPage/message-renderers/ToolRenderers/pageTitle';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { htmlToMarkdown } from '@/utils/htmlToMarkdown';
import { PinIcon } from './PaneIcons';
import { relativeTime } from './relativeTime';

interface ArtifactMenuProps {
  /** What the pane shows as the page's name when nothing better is known. */
  heading: string;
  path: string;
  name: string;
  /** The page's own HTML, for copying it as Markdown. */
  source?: string;
  publishedUrl: string;
  onReload: () => void;
}

type Icon = ComponentType<{ className?: string }>;
type Gap = RecordGap | 'unsupported' | 'notOwner' | 'noCapability';

// A hovered row is filled with --surface-selected, as the command palette's and the model panel's are:
// --surface-hover differs from the menu's own surface by only 5 of 255 and cannot be seen.
const ROW = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[calc(3px/var(--ui-zoom,1))] text-start text-[0.8461rem] leading-[calc(18px/var(--ui-zoom,1))] transition-colors';
// Measured against Claude Desktop's menu: a row is 24px, the box has 4px of padding, and a rule has 4px above and below.
// Heights are in screen pixels, divided by the UI zoom, so the menu is as tall as Desktop's at any zoom.
const RULE = <div className="my-[calc(4px/var(--ui-zoom,1))] border-t-[calc(1px/var(--ui-zoom,1))] border-border-default" />;

function Row({ icon: IconComponent, children, onSelect, trailing, danger, off }: {
  icon: Icon; children: ReactNode; onSelect?: () => void; trailing?: ReactNode; danger?: boolean;
  /** Why the row cannot be used, in a sentence; the row is dimmed and says it on hover. */
  off?: string;
}) {
  const row = (
    <button
      type="button"
      role="menuitem"
      aria-disabled={off !== undefined}
      onClick={off !== undefined ? undefined : onSelect}
      className={`${ROW} ${danger ? 'text-red-400' : 'text-text-primary'} ${off !== undefined ? 'cursor-not-allowed opacity-40' : 'hover:bg-[var(--surface-selected)]'}`}
    >
      <IconComponent className={`h-4 w-4 shrink-0 ${danger ? '' : 'text-text-secondary'}`} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </button>
  );
  return off !== undefined ? <Tooltip desktop content={off} placement="bottom">{row}</Tooltip> : row;
}

/** The artifact pane's title and the menu under it, the way Claude Desktop's artifact pane has them. */
export function ArtifactMenu({ heading, path, name, source, publishedUrl, onReload }: ArtifactMenuProps) {
  const { t, i18n: i18next } = useTranslation('chat');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const listBox = useRef<Instance | null>(null);

  const artifacts = useSessionArtifactList(open);
  const current = artifacts.find((a) => a.url === publishedUrl);
  const pageTitle = usePageTitle(path);
  const { record, gap, refresh } = useArtifactRecord(current, pageTitle);
  const caps = useExtCapabilities(true);
  const run = useRunExtApi();
  const language = i18next?.language ?? 'en';

  // The name on the server wins once the account says it; before that the page's own.
  const title = record?.title || heading;

  useEffect(() => {
    if (!open) return;
    // Escape folds the menu; the pane closes only on an Escape pressed with no menu open.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    // A press inside the page's frame never reaches this document, so Tippy cannot see it; the
    // window losing focus to the frame is what says the pointer went elsewhere.
    const onBlur = () => setOpen(false);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [open]);

  /** What a row that needs the kit says when it cannot run, or undefined when it can. */
  const offFor = (capability: string, needsOwner = true): string | undefined => {
    if (!caps) return t('artifactMenu.checking');
    if (!caps.installed) return t('artifactMenu.kitMissing');
    if (!caps.capabilities.includes(capability)) return t('artifactMenu.kitTooOld');
    if (gap === 'loading') return t('artifactMenu.checking');
    if (gap) return t(`artifactMenu.${gap === 'kitMissing' ? 'kitMissing' : gap === 'kitTooOld' ? 'kitTooOld' : 'notLinked'}`);
    if (needsOwner && record && (record.rel !== 'mine' || record.renamable === false)) return t('artifactMenu.notOwner');
    return undefined;
  };
  const unsupported = t('artifactMenu.unsupported');

  const fail = (reason: string) => toast.error(reason);
  const call = async (callName: string, params: Record<string, string>, yes = false) => {
    const answer = await run('frame', callName, params, yes);
    if (!answer.ok) fail(answer.error.message || t('artifactMenu.failed'));
    return answer.ok;
  };

  const close = () => setOpen(false);
  const act = (action: () => unknown) => () => {
    close();
    try {
      void Promise.resolve(action()).catch((err) => {
        console.error('[ArtifactMenu] Action failed:', err);
        fail(t('artifactMenu.failed'));
      });
    } catch (err) {
      console.error('[ArtifactMenu] Action failed:', err);
      fail(t('artifactMenu.failed'));
    }
  };

  const rename = async (next: string) => {
    setEditing(false);
    const trimmed = next.trim();
    if (!record || trimmed === '' || trimmed === title) return;
    if (await call('retitle', { slug: record.slug, title: trimmed })) {
      await refresh();
      toast.success(t('artifactMenu.renamed'));
    }
  };

  const startEditing = () => {
    const off = offFor('api.frame.retitle');
    if (off !== undefined) {
      toast(off);
      return;
    }
    close();
    setEditing(true);
  };

  const updated = current?.timestamp ? relativeTime(Date.parse(current.timestamp), Date.now(), language) : record?.updatedAt ? relativeTime(Date.parse(record.updatedAt), Date.now(), language) : undefined;
  const starred = record?.starred === true;
  const pinOff = offFor(starred ? 'api.frame.unpin' : 'api.frame.pin');
  // Copying is open to whoever may see the page, not only its owner: the server says so per page (`duplicable`).
  const duplicateOff = offFor('api.frame.duplicate', false) ?? (record?.duplicable === false ? t('artifactMenu.cannotCopy') : undefined);

  return (
    <div className="relative min-w-0">
      {editing ? (
        <input
          autoFocus
          defaultValue={title}
          aria-label={t('artifactMenu.rename')}
          className="w-full min-w-[8rem] rounded-lg border border-primary bg-transparent px-2 py-1 text-[0.9231rem] font-medium outline-none"
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => void rename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
      ) : (
        <Tippy
          // Controlled: opened by a click, closed by a press elsewhere. Rendered into <body> so the pane's
          // rounded, overflow-hidden card never clips it, and flipped or shifted to stay inside the window.
          visible={open}
          onClickOutside={(_, event) => {
            // A press inside another Tippy box (the artifact list beside the menu) is not a press elsewhere.
            if (event.target instanceof Element && event.target.closest('[data-tippy-root]')) return;
            close();
          }}
          // The list beside the menu lives in its own box in <body>; it goes with the menu.
          onHide={() => listBox.current?.hide()}
          interactive
          placement="bottom-start"
          offset={[0, 6]}
          appendTo={() => document.body}
          render={(attrs) => (
            <div role="menu" className="z-50 w-60 rounded-xl border border-border-default bg-surface-overlay px-1 py-[calc(4px/var(--ui-zoom,1))] text-text-primary shadow-lg" {...attrs}>
          <Tippy
            // Hovering the row opens the list of this session's artifacts beside it, as Claude Desktop's does;
            // a click opens it too, for a pointer that does not hover.
            trigger="mouseenter focus click"
            onCreate={(instance) => { listBox.current = instance; }}
            interactive
            interactiveBorder={12}
            delay={[60, 160]}
            placement="right-start"
            offset={[-6, 4]}
            appendTo={() => document.body}
            render={(attrs) => (
              <div role="menu" className="z-50 w-60 rounded-xl border border-border-default bg-surface-overlay px-1 py-[calc(4px/var(--ui-zoom,1))] text-text-primary shadow-lg" {...attrs}>
                {artifacts.map((a) => (
                  <SwitchRow key={a.url} artifact={a} selected={a.url === publishedUrl} onSelect={() => {
                    close();
                    if (a.filePath) filePreviewPaneStore.open(a.filePath, a.url);
                    else getAdapter().openUrl(a.url).catch(() => toast.error(i18n.t('chat:externalLink.openFailed')));
                  }} />
                ))}
              </div>
            )}
          >
            <div>
              <Row
                icon={DocumentDuplicateIcon}
                trailing={
                  <span className="flex shrink-0 items-center gap-1 text-text-tertiary">
                    <span>{artifacts.length}</span>
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </span>
                }
              >
                {t('artifactMenu.switch')}
              </Row>
            </div>
          </Tippy>
          {RULE}
          <div className="px-2.5 py-[calc(6px/var(--ui-zoom,1))] text-[0.7692rem] leading-[calc(16px/var(--ui-zoom,1))] text-text-tertiary">
            <div>{t('artifactMenu.madeByMe')}</div>
            {updated && <div>{t('artifactMenu.updated', { when: updated })}</div>}
          </div>
          {RULE}
          <Row icon={ArrowDownTrayIcon} onSelect={act(async () => {
            if (!(await downloadSentFile(path, name))) toast.error(i18n.t('chat:sentFiles.downloadFailed'));
          })}>{t('filePreview.download')}</Row>
          <Row icon={Square2StackIcon} off={source === undefined ? t('artifactMenu.notLoaded') : undefined} onSelect={act(async () => {
            await navigator.clipboard.writeText(htmlToMarkdown(source ?? ''));
            toast.success(t('artifactMenu.markdownCopied'));
          })}>{t('artifactMenu.copyMarkdown')}</Row>
          {RULE}
          <Row icon={PencilIcon} off={offFor('api.frame.retitle')} onSelect={startEditing}>{t('artifactMenu.rename')}</Row>
          <Row icon={Square2StackIcon} off={duplicateOff} onSelect={act(async () => {
            if (!record) return;
            if (await call('duplicate', { slug: record.slug })) toast.success(t('artifactMenu.duplicated', { name: `${title} (Copy)` }));
          })}>{t('artifactMenu.duplicate')}</Row>
          <Row icon={ArrowUpTrayIcon} off={unsupported}>{t('artifactMenu.share')}</Row>
          {RULE}
          <Row icon={ArrowTopRightOnSquareIcon} onSelect={act(() => getAdapter().openUrl(publishedUrl))}>{t('artifactMenu.openOnWeb')}</Row>
          {RULE}
          <Row icon={ArrowPathIcon} onSelect={act(onReload)}>{t('filePreview.reload')}</Row>
          <Row icon={PinIcon} off={pinOff} onSelect={act(async () => {
            if (!record) return;
            if (await call(starred ? 'unpin' : 'pin', { slug: record.slug })) {
              await refresh();
              toast.success(t(starred ? 'artifactMenu.unpinned' : 'artifactMenu.pinned'));
            }
          })}>{t(starred ? 'artifactMenu.unpin' : 'artifactMenu.pin')}</Row>
          {RULE}
          <Row icon={FlagIcon} off={unsupported}>{t('artifactMenu.report')}</Row>
          {RULE}
          <Row icon={TrashIcon} danger off={offFor('api.frame.delete')} onSelect={() => { close(); setAsking(true); }}>{t('artifactMenu.delete')}</Row>
            </div>
          )}
        >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          onDoubleClick={startEditing}
          className="flex max-w-full items-center gap-1 rounded-lg px-[calc(6px/var(--ui-zoom,1))] py-1 text-[0.9231rem] font-medium transition-colors hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] aria-expanded:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
        >
          <span dir="ltr" className="truncate">{title}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
        </Tippy>
      )}

      {asking && (
        <ConfirmDialog
          title={t('artifactMenu.deleteTitle', { name: title })}
          message={t('artifactMenu.deleteMessage')}
          confirmLabel={t('artifactMenu.delete')}
          variant="danger"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            void (async () => {
              if (record && (await call('delete', { slug: record.slug }, true))) {
                toast.success(t('artifactMenu.deleted'));
                filePreviewPaneStore.close();
              }
            })();
          }}
        />
      )}
    </div>
  );
}

function SwitchRow({ artifact, selected, onSelect }: { artifact: SessionArtifact; selected: boolean; onSelect: () => void }) {
  const pageTitle = usePageTitle(artifact.filePath);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={`${ROW} text-text-primary hover:bg-[var(--surface-selected)]`}
    >
      <Square2StackIcon className="h-4 w-4 shrink-0 text-text-secondary" />
      <span dir="auto" className="min-w-0 flex-1 truncate">{pageTitle || artifact.title}</span>
      {selected && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

export type { FrameRecord, Gap };
