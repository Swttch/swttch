import { DocumentIcon, GlobeAltIcon, PresentationChartBarIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import { type SessionOutput } from '@/shared';
import { isPictureOutput } from '@/hooks/useSessionOutputs';
import { useTranslation } from '@/i18n';
import { AssetThumbnail } from './AssetThumbnail';

interface Props {
  output: SessionOutput;
  /** The picture's bytes once loaded; unused for a tile that is not a picture. */
  src: string | null;
  onNeeded: () => void;
  /** A picture opens the viewer. */
  onOpenPicture: () => void;
  /** Any other file, or a page, opens where a path or link in the chat opens. */
  onOpenOther: () => void;
}

function extensionBadge(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
}

/** One tile of the "made by Claude" part of the Assets timeline. */
export function OutputTile(props: Props) {
  const { output, src, onNeeded, onOpenPicture, onOpenOther } = props;
  const { t } = useTranslation('chat');

  if (isPictureOutput(output)) {
    return <AssetThumbnail src={src} onNeeded={onNeeded} onOpen={onOpenPicture} />;
  }

  const isArtifact = output.kind === 'artifact';
  const name = output.kind === 'file' ? output.name : output.kind === 'artifact' ? output.title || t('chatInput.artifacts.fallbackTitle') : '';
  const badge = output.kind === 'file' ? extensionBadge(output.name) : '';
  const Icon = isArtifact
    ? GlobeAltIcon
    : /^(PPTX|PPT|KEY)$/.test(badge)
      ? PresentationChartBarIcon
      : /^(CSV|TSV|XLSX|XLS)$/.test(badge)
        ? TableCellsIcon
        : DocumentIcon;

  return (
    <button
      type="button"
      onClick={onOpenOther}
      title={name}
      className="w-20 h-20 flex flex-col items-center justify-center gap-1 px-1 rounded-md border border-border-default bg-surface-hover hover:border-border-strong transition-colors"
      aria-label={t('assets.openAsset')}
    >
      <Icon className="w-6 h-6 text-text-secondary" />
      <span dir="auto" className="w-full truncate text-center text-[0.6923rem] text-text-secondary">{name}</span>
    </button>
  );
}
