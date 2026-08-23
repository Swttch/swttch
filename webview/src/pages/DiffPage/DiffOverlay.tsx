import { useEffect } from 'react';
import { Portal } from '@/components/Portal';
import { isMobile } from '@/config/environment';
import { DiffPage } from '.';

interface Props {
  toolUseId: string;
  onClose: () => void;
}

/**
 * The diff page as a modal over the current session, for browsers set to review
 * that way.
 *
 * Built like SettingsOverlay — same portal, same scrim, same Escape and
 * click-outside — because it is the same gesture, and two overlays that dismiss
 * differently are two things to learn.
 *
 * Wider than the settings modal: a side-by-side diff splits its room in half, so
 * the same max width would push it into the stacked layout on screens that could
 * comfortably show both sides.
 *
 * Closing without answering is deliberate. The question stays open — it is the
 * approval prompt underneath that owns it — and the file name there opens this
 * again.
 */
export function DiffOverlay({ toolUseId, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={`flex w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border-default bg-surface-base shadow-2xl ${
            isMobile() ? 'h-full' : 'h-[85vh]'
          }`}
        >
          <DiffPage toolUseId={toolUseId} onClose={onClose} />
        </div>
      </div>
    </Portal>
  );
}
