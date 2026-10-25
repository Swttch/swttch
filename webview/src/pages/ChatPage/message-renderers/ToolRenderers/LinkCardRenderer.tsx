import {useEffect, useState} from "react";
import toast from "react-hot-toast";
import {EllipsisVerticalIcon} from "@heroicons/react/24/outline";
import {getAdapter} from "@/adapters";
import {getBridge} from "@/api/bridge/Bridge";
import {i18n, useTranslation} from "@/i18n";
import {MessageType} from "@/shared";
import {linkMenuStore} from "@/utils/linkMenuStore";
import {RendererProps, ToolWrapper} from "./common";

/** What the backend read of the page, all of it optional. */
interface LinkCard {
    host: string;
    title?: string;
    image?: string;
}

/** The address a browser tool was asked to open, or undefined when this call is not that. */
export function browserUrlOf(toolName: string, input: unknown): string | undefined {
    // The Claude Desktop browser tool that opens a page in its panel: `mcp__<server>__preview_start`.
    if (!/^mcp__.+__preview_start$/.test(toolName)) return undefined;
    const url = (input as {url?: unknown} | undefined)?.url;
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : undefined;
}

const cards = new Map<string, Promise<LinkCard>>();

function loadLinkCard(url: string): Promise<LinkCard> {
    const known = cards.get(url);
    if (known) return known;
    const hostOf = (): string => {
        try {
            return new URL(url).host.replace(/^www\./, '');
        } catch {
            return '';
        }
    };
    const pending = (getBridge().request(MessageType.GET_LINK_PREVIEW, {url}) as Promise<LinkCard | undefined>)
        .then((answer) => ({host: answer?.host || hostOf(), title: answer?.title, image: answer?.image}))
        .catch(() => {
            cards.delete(url);
            return {host: hostOf()};
        });
    cards.set(url, pending);
    return pending;
}

/** @internal test-only. */
export function _resetLinkCards(): void {
    cards.clear();
}

function openLink(url: string) {
    getAdapter()
        .openUrl(url)
        .catch(() => toast.error(i18n.t('chat:externalLink.openFailed')));
}

/**
 * The card for a page Claude opened in a browser panel, the way Claude Desktop
 * draws it: the page's picture on top, then its title with the site and where it
 * was opened, an Open button and a menu.
 *
 * Desktop's picture is a screenshot of its own panel. This chat has no panel, so
 * the picture is the page's Open Graph image, the one the site publishes for link
 * cards, and a page without one gets a card without a picture.
 */
export function LinkCardRenderer({url, ...props}: RendererProps & {url: string}) {
    const {t} = useTranslation('chat');
    const [card, setCard] = useState<LinkCard | null>(null);

    useEffect(() => {
        let alive = true;
        void loadLinkCard(url).then((loaded) => {
            if (alive) setCard(loaded);
        });
        return () => {
            alive = false;
        };
    }, [url]);

    const host = card?.host ?? '';
    return (
        <ToolWrapper message={props.message}>
            <div className="w-full max-w-[720px] overflow-hidden rounded-2xl border border-border-default bg-surface-hover/30">
                {/* Cropped from the top to a wide band, as Claude Desktop crops its screenshot. */}
                {card?.image && <img src={card.image} alt="" className="block aspect-[8/3] w-full object-cover object-top"/>}
                <div className="flex items-center gap-4 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                        <div dir="auto" className="truncate text-[1.0769rem] leading-6 text-text-primary">{card?.title || url}</div>
                        <div dir="ltr" className="mt-0.5 truncate text-[0.9231rem] leading-5 text-text-tertiary">
                            {host}{host && ' · '}{t('linkCard.openedInBrowser')}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => openLink(url)}
                        className="shrink-0 rounded-lg bg-surface-hover px-3.5 py-1.5 text-[0.9231rem] text-text-primary transition-colors hover:bg-surface-pressed"
                    >
                        {t('linkCard.open')}
                    </button>
                    <button
                        type="button"
                        aria-label={t('linkCard.more')}
                        onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            linkMenuStore.open({target: {kind: 'external', url}, x: rect.left, y: rect.bottom + 4});
                        }}
                        className="shrink-0 rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                    >
                        <EllipsisVerticalIcon className="h-5 w-5"/>
                    </button>
                </div>
            </div>
        </ToolWrapper>
    );
}
