import {useMemo, useState} from "react";
import {DocumentIcon, GlobeAltIcon, PhotoIcon, PresentationChartBarIcon, TableCellsIcon} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {getAdapter} from "@/adapters";
import {ImageLightbox} from "@/components/ImageLightbox";
import {useChatStreamContext} from "@/contexts/ChatStreamContext";
import {useSponsorStatus} from "@/hooks/queries/useSponsorStatus";
import {isPictureOutput, outputKey, useSessionOutputs} from "@/hooks/useSessionOutputs";
import {useSessionPictureLoader, useSessionPictures} from "@/hooks/useSessionPictures";
import {MoreInSessionNotice, EdgeSponsorHint} from "@/components/ImageLightbox/SponsorGateNotice";
import {SponsorGateSurface} from "@/shared";
import {i18n, useTranslation} from "@/i18n";
import type {SessionOutput} from "@/shared";
import {openChatFile} from "@/utils/openChatFile";
import {toolLabel} from "@/utils/toolLabel";

/** How many rows show before "Show more": the same five Claude Desktop shows. */
export const OUTPUTS_SHOWN = 5;

function timeOf(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(i18n.language, {hour: 'numeric', minute: '2-digit'});
}

function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
}

function iconOf(output: SessionOutput) {
    if (output.kind === 'artifact') return GlobeAltIcon;
    if (isPictureOutput(output)) return PhotoIcon;
    const badge = output.kind === 'file' ? extensionOf(output.name) : '';
    if (/^(PPTX|PPT|KEY)$/.test(badge)) return PresentationChartBarIcon;
    return /^(CSV|TSV|XLSX|XLS)$/.test(badge) ? TableCellsIcon : DocumentIcon;
}

function openArtifact(url: string) {
    getAdapter()
        .openUrl(url)
        .catch(() => toast.error(i18n.t('chat:externalLink.openFailed')));
}

/**
 * What the session has made for the reader: published pages, files sent with
 * `SendUserFile` and pictures tools returned (#593). It is where the terminal's
 * `/artifacts` list lives in this panel.
 *
 * Read from the backend's index of the whole session, the one the Assets screen
 * shows too, so a long session lists what it made before the part the chat has
 * loaded. It asks again when the session gains a message.
 */
export function OutputsSection() {
    const {t} = useTranslation('chat');
    const {messages} = useChatStreamContext();
    const index = useSessionOutputs(true, messages.length);
    // The viewer steps through the pictures you attached and the ones Claude made, under the same
    // sponsor rule as the Assets screen.
    const {loaded, ensure} = useSessionPictureLoader();
    const {isSponsor} = useSponsorStatus();
    const [viewing, setViewing] = useState<string | null>(null);
    const sessionPictures = useSessionPictures(viewing !== null) ?? [];
    const [expanded, setExpanded] = useState(false);

    // Newest first, as the rail lists them.
    const outputs = useMemo(() => [...(index ?? [])].reverse(), [index]);
    const opened = sessionPictures.find((p) => p.key === viewing) ?? null;
    const scope = opened ? (isSponsor ? sessionPictures : sessionPictures.filter((p) => p.entryUuid === opened.entryUuid)) : [];
    const lockedCount = opened && !isSponsor ? sessionPictures.length - scope.length : 0;

    const openPicture = (output: SessionOutput) => setViewing(outputKey(output));

    const activate = (output: SessionOutput) => {
        if (isPictureOutput(output)) openPicture(output);
        else if (output.kind === 'artifact') openArtifact(output.url);
        else if (output.kind === 'file') openChatFile(output.path);
    };

    if (index === undefined) return <p className="py-1 text-[0.8462rem] text-text-tertiary">{t('sessionRail.contextLoading')}</p>;
    if (outputs.length === 0) return <p className="py-1 text-[0.8462rem] text-text-tertiary">{t('sessionRail.outputsEmpty')}</p>;

    const shown = expanded ? outputs : outputs.slice(0, OUTPUTS_SHOWN);

    return (
        <>
            <ul className="flex flex-col text-[0.8462rem]">
                {shown.map((output) => {
                    const Icon = iconOf(output);
                    const name = output.kind === 'file'
                        ? output.name
                        : output.kind === 'artifact'
                            ? (output.title || t('chatInput.artifacts.fallbackTitle'))
                            : t('sessionRail.toolImage', {tool: toolLabel(output.tool)});
                    const time = output.kind === 'artifact' ? '' : timeOf(output.timestamp);
                    return (
                        <li key={outputKey(output)}>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded px-1 py-1 text-start text-text-primary hover:bg-surface-hover"
                                onClick={() => activate(output)}
                            >
                                <Icon className="h-4 w-4 shrink-0 text-text-secondary"/>
                                <span className="min-w-0 flex-1 truncate" dir="auto">{name}</span>
                                {time && <span className="shrink-0 text-[0.7692rem] text-text-tertiary">{time}</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {!expanded && outputs.length > OUTPUTS_SHOWN && (
                <button
                    type="button"
                    className="mt-1 px-1 py-1 text-[0.8462rem] text-text-secondary hover:text-text-primary"
                    onClick={() => setExpanded(true)}
                >
                    {t('sessionRail.showMore')}
                </button>
            )}
            {opened && (
                <ImageLightbox
                    srcs={scope.map((p) => loaded[p.key] ?? null)}
                    initialIndex={Math.max(scope.findIndex((p) => p.key === viewing), 0)}
                    onClose={() => setViewing(null)}
                    onIndexChange={(i) => {
                        const picture = scope[i];
                        if (picture) ensure(picture);
                    }}
                    notice={lockedCount > 0 ? <MoreInSessionNotice count={lockedCount} onShowAll={() => setViewing(null)}/> : undefined}
                    edgeHint={lockedCount > 0 ? <EdgeSponsorHint from={SponsorGateSurface.Viewer}/> : undefined}
                />
            )}
        </>
    );
}
