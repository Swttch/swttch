import {ReactElement, ReactNode} from "react";
import Tippy from "@tippyjs/react/headless";

/**
 * Hover tooltip rendered in JS (Tippy headless), NOT the native HTML `title`
 * attribute. Native `title` tooltips do not render inside the JCEF WebView the
 * plugin embeds in JetBrains IDEs (Chromium-embedded, Linux/Wayland), so every
 * tooltip must go through this component to work in both the browser and the IDE.
 *
 * Tippy clones `children` to attach its ref (no wrapper DOM node), so the child's
 * own layout — `truncate`, flex, click handlers — is preserved. `children` must
 * therefore be a single ref-accepting element. When `content` is empty the child
 * is returned untouched, so callers can pass a maybe-undefined value.
 */
interface Props {
    content?: ReactNode;
    children: ReactElement;
    placement?: "top" | "bottom" | "left" | "right";
    /**
     * Keep the tooltip open while the pointer moves onto it (so it can hold
     * clickable content like a link). Adds a small close delay and renders into
     * <body> so it isn't clipped by an overflow ancestor.
     */
    interactive?: boolean;
    /**
     * Called when the tooltip actually becomes visible.
     *
     * Needed because mounting is NOT showing here: Tippy's headless `render`
     * commits the content while the tooltip is still closed, so a component
     * inside `content` cannot tell from its own lifecycle whether anyone has
     * seen it. Measured that way, an offer nobody hovered counts as an offer
     * shown.
     */
    onShow?: () => void;
}

export function Tooltip(props: Props) {
    const {content, children, placement = "top", interactive = false, onShow} = props;
    if (content === undefined || content === null || content === "") return children;

    return (
        <Tippy
            placement={placement}
            offset={[0, 4]}
            delay={[200, interactive ? 120 : 0]}
            interactive={interactive}
            onShow={onShow}
            appendTo={interactive ? () => document.body : undefined}
            render={(attrs) => (
                <div
                    // Never wider than the window. Tippy flips to the opposite
                    // side when a tooltip does not fit, but a tooltip wider than
                    // the viewport does not fit on EITHER side, so it gives up
                    // and leaves it hanging off the edge. Clamping the width is
                    // what gives flipping somewhere to go. No spacing token
                    // expresses "the smaller of 32rem and the window", hence the
                    // arbitrary value.
                    className="max-w-[min(32rem,calc(100vw-1rem))] whitespace-pre-wrap break-all rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-xs text-text-primary shadow-lg z-50"
                    {...attrs}
                >
                    {content}
                </div>
            )}
        >
            {children}
        </Tippy>
    );
}
