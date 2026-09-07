import React from 'react';
import {
  Squares2X2Icon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  ArrowTopRightOnSquareIcon,
  DocumentDuplicateIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useTranslation } from '@/i18n';
import { isBrowser } from '@/config/environment';
import { copyImage, downloadImage, openImageInNewTab } from './imageActions';

interface LightboxPanelProps {
  /** The image on screen, or null while its bytes are still on the way. */
  src: string | null;
  index: number;
  total: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /**
   * Opens the Assets screen. Absent when the viewer was opened FROM that screen,
   * where the button would only lead back to where the user already is.
   */
  onOpenAssets?: () => void;
}

function PanelButton(props: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      disabled={props.disabled}
      title={props.label}
      aria-label={props.label}
      className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-default disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  );
}

/**
 * The viewer's bottom bar: what you can do with the image you are looking at.
 *
 * A panel rather than a right-click menu, deliberately. The browser's own
 * context menu already offers save / copy / open-in-new-tab, and replacing it
 * would take away behaviour people expect from an image; this adds a visible
 * place for the same actions without removing the familiar one.
 *
 * Laid out like a photo viewer: navigation-scale actions on the left, position
 * in the middle, save actions on the right.
 */
export function LightboxPanel(props: LightboxPanelProps) {
  const { src, index, total, onZoomIn, onZoomOut, canZoomIn, canZoomOut, onOpenAssets } = props;
  const { t } = useTranslation('chatTools');
  const { t: tChat } = useTranslation('chat');

  const handleCopy = () => {
    if (!src) return;
    void copyImage(src)
      .then(() => toast.success(t('attachments.lightbox.copied')))
      .catch(() => toast.error(t('attachments.lightbox.copyFailed')));
  };

  const handleDownload = () => {
    if (!src) return;
    void downloadImage(src, index).catch(() => toast.error(t('attachments.lightbox.downloadFailed')));
  };

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-surface-raised/95 border border-border-default shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {onOpenAssets && (
        <>
          <PanelButton onClick={onOpenAssets} label={tChat('assets.openScreen')}>
            <Squares2X2Icon className="w-4 h-4" />
          </PanelButton>
          <span className="w-px h-5 bg-border-default mx-1" />
        </>
      )}

      <PanelButton onClick={onZoomIn} label={t('attachments.lightbox.zoomIn')} disabled={!canZoomIn}>
        <MagnifyingGlassPlusIcon className="w-4 h-4" />
      </PanelButton>
      <PanelButton
        onClick={onZoomOut}
        label={t('attachments.lightbox.zoomOut')}
        disabled={!canZoomOut}
      >
        <MagnifyingGlassMinusIcon className="w-4 h-4" />
      </PanelButton>
      {/*
        A JCEF panel is not a browser tab strip — there is nowhere for a new tab
        to go — so this only appears where it can actually do something.
      */}
      {isBrowser() && (
        <PanelButton
          onClick={() => src && void openImageInNewTab(src)}
          label={t('attachments.lightbox.openInNewTab')}
          disabled={!src}
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
        </PanelButton>
      )}

      {/*
        A lone image has no position worth stating — "1 / 1" is noise. The rest
        of the panel stays, because copying and saving one image is as useful as
        copying one of twenty.
      */}
      {total > 1 && (
        <span className="px-3 text-xs text-text-secondary tabular-nums select-none">
          {index + 1} / {total}
        </span>
      )}

      <PanelButton onClick={handleCopy} label={t('attachments.lightbox.copy')} disabled={!src}>
        <DocumentDuplicateIcon className="w-4 h-4" />
      </PanelButton>
      <PanelButton
        onClick={handleDownload}
        label={t('attachments.lightbox.download')}
        disabled={!src}
      >
        <ArrowDownTrayIcon className="w-4 h-4" />
      </PanelButton>
    </div>
  );
}
