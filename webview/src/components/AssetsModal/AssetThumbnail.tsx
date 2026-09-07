import { useEffect, useRef } from 'react';
import { useTranslation } from '@/i18n';

interface Props {
  /** The bytes, once the loader has them. */
  src: string | null;
  /** Asks the loader for this image; called when the tile first comes into view. */
  onNeeded: () => void;
  onOpen: () => void;
}

/**
 * One tile in the Assets timeline, which fetches its image only when scrolled
 * into view.
 *
 * A session can hold dozens of attachments totalling ~20MB. Requesting them all
 * on open would spend that before the user has looked at anything, so each tile
 * asks for itself and only once it is actually on screen.
 */
export function AssetThumbnail(props: Props) {
  const { src, onNeeded, onOpen } = props;
  const { t } = useTranslation('chat');
  const ref = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (src || asked.current) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        asked.current = true;
        observer.disconnect();
        onNeeded();
      },
      // A little ahead of the viewport, so scrolling meets a loaded tile rather
      // than a placeholder that starts loading on arrival.
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src, onNeeded]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      className="w-20 h-20 rounded-md overflow-hidden border border-border-default bg-surface-hover hover:border-border-strong transition-colors"
      aria-label={t('assets.openImage')}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center text-[0.6923rem] text-text-tertiary">
          {t('assets.loading')}
        </span>
      )}
    </button>
  );
}
