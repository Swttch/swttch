import { Square2StackIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { getAdapter } from '@/adapters';
import { relativeTime } from '@/components/FilePreviewPane/relativeTime';
import { Tooltip } from '@/components/Tooltip';
import { i18n, useTranslation } from '@/i18n';
import { useSessionArtifact } from '@/hooks/useSessionArtifact';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { usePageTitle } from '../ToolRenderers/pageTitle';

/**
 * An Artifact page's address inside a reply, drawn as Claude Desktop draws it: a
 * small chip with the page's name, in place of the address. Resting on it names
 * what it is and when it was made; pressing it opens the page beside the chat,
 * the way its card does. A page this session did not publish (or one published
 * from no file here) opens at its address instead.
 */
export function ArtifactChip({ url }: { url: string }) {
  const { t, i18n: i18next } = useTranslation('chat');
  const artifact = useSessionArtifact(url);
  const pageTitle = usePageTitle(artifact?.filePath);
  const title = pageTitle || artifact?.title || t('artifactChip.untitled');
  const when = artifact?.timestamp ? relativeTime(Date.parse(artifact.timestamp), Date.now(), i18next?.language ?? 'en') : undefined;

  const open = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (artifact?.filePath) {
      filePreviewPaneStore.open(artifact.filePath, url);
      return;
    }
    getAdapter()
      .openUrl(url)
      .catch(() => toast.error(i18n.t('chat:externalLink.openFailed')));
  };

  return (
    <Tooltip
      placement="bottom"
      content={
        <span className="flex min-w-[10rem] flex-col gap-1 text-start">
          <span className="flex items-center justify-between gap-6 text-[0.75rem] opacity-70">
            <span className="flex items-center gap-1">
              <Square2StackIcon className="h-3.5 w-3.5" />
              {t('artifactChip.label')}
            </span>
            {when && <span>{when}</span>}
          </span>
          <span className="text-[0.8125rem]">{title}</span>
        </span>
      }
    >
      <button
        type="button"
        onClick={open}
        className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-px align-baseline text-primary transition-colors hover:bg-primary/20"
      >
        <Square2StackIcon className="h-3.5 w-3.5 shrink-0" />
        <span dir="auto" className="truncate">{title}</span>
      </button>
    </Tooltip>
  );
}
