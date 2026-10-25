import {useMemo, useState} from "react";
import {DocumentIcon, GlobeAltIcon, PhotoIcon, PresentationChartBarIcon, TableCellsIcon} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {getAdapter} from "@/adapters";
import {ImageLightbox} from "@/components/ImageLightbox";
import {useChatStreamContext} from "@/contexts/ChatStreamContext";
import {isPictureOutput, outputKey, useSessionOutputImages, useSessionOutputs} from "@/hooks/useSessionOutputs";
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
    const {loaded, ensure} = useSessionOutputImages();
    const [expanded, setExpanded] = useState(false);
    const [viewing, setViewing] = useState<string | null>(null);

    // Newest first, as the rail lists them.
    const outputs = useMemo(() => [...(index ?? [])].reverse(), [index]);
    const pictures = useMemo(() => outputs.filter(isPictureOutput), [outputs]);

    const openPicture = (output: SessionOutput) => {
        setViewing(outputKey(output));
        // The viewer steps through every picture of the list, so its neighbours are fetched too.
        pictures.forEach(ensure);
    };

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
            {viewing !== null && (
                <ImageLightbox
                    srcs={pictures.map((p) => loaded[outputKey(p)] ?? null)}
                    initialIndex={Math.max(pictures.findIndex((p) => outputKey(p) === viewing), 0)}
                    onClose={() => setViewing(null)}
                    onIndexChange={(i) => {
                        const output = pictures[i];
                        if (output) ensure(output);
                    }}
                />
            )}
        </>
    );
}
