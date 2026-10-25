import {useMemo, useState} from "react";
import {DocumentIcon, GlobeAltIcon, PhotoIcon, PresentationChartBarIcon, TableCellsIcon} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {getAdapter} from "@/adapters";
import {ImageLightbox} from "@/components/ImageLightbox";
import {useChatStreamContext} from "@/contexts/ChatStreamContext";
import {i18n, useTranslation} from "@/i18n";
import {openChatFile} from "@/utils/openChatFile";
import {loadSentMedia} from "../message-renderers/ToolRenderers/sendUserFile";
import {collectSessionOutputs, toolLabel, type SessionOutput} from "./sessionOutputs";

/** How many rows show before "Show more": the same five Claude Desktop shows. */
export const OUTPUTS_SHOWN = 5;

function timeOf(iso: string | undefined): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(i18n.language, {hour: 'numeric', minute: '2-digit'});
}

function iconOf(output: SessionOutput) {
    if (output.kind === 'artifact') return GlobeAltIcon;
    if (output.kind === 'image' || output.isImage) return PhotoIcon;
    if (/^(PPTX|PPT|KEY)$/.test(output.badge)) return PresentationChartBarIcon;
    return /^(CSV|TSV|XLSX|XLS)$/.test(output.badge) ? TableCellsIcon : DocumentIcon;
}

/** A picture row opens the viewer; anything else opens where the transcript would open it. */
function isPicture(output: SessionOutput): boolean {
    return output.kind === 'image' || (output.kind === 'file' && output.isImage);
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
 */
export function OutputsSection() {
    const {t} = useTranslation('chat');
    const {messages} = useChatStreamContext();
    const outputs = useMemo(() => collectSessionOutputs(messages), [messages]);
    const [expanded, setExpanded] = useState(false);
    const [viewing, setViewing] = useState<number | null>(null);
    const [srcs, setSrcs] = useState<(string | null)[]>([]);

    const pictures = useMemo(() => outputs.filter(isPicture), [outputs]);

    const openPicture = (output: SessionOutput) => {
        const index = pictures.indexOf(output);
        setViewing(index);
        setSrcs(pictures.map((p) => (p.kind === 'image' ? p.src : null)));
        pictures.forEach((p, i) => {
            if (p.kind !== 'file') return;
            void loadSentMedia(p.path).then((src) => {
                setSrcs((current) => current.map((value, at) => (at === i ? src : value)));
            });
        });
    };

    const activate = (output: SessionOutput) => {
        if (isPicture(output)) openPicture(output);
        else if (output.kind === 'artifact') openArtifact(output.url);
        else if (output.kind === 'file') openChatFile(output.path);
    };

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
                    const time = output.kind === 'artifact' ? '' : timeOf(output.time);
                    return (
                        <li key={output.key}>
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
            {viewing !== null && viewing >= 0 && (
                <ImageLightbox srcs={srcs} initialIndex={viewing} onClose={() => setViewing(null)}/>
            )}
        </>
    );
}
