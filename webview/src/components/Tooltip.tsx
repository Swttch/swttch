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
}

export function Tooltip(props: Props) {
    const {content, children, placement = "top", interactive = false} = props;
    if (content === undefined || content === null || content === "") return children;

    return (
        <Tippy
            placement={placement}
            offset={[0, 4]}
            delay={[200, interactive ? 120 : 0]}
            interactive={interactive}
            appendTo={interactive ? () => document.body : undefined}
            render={(attrs) => (
                <div
                    className="max-w-[32rem] whitespace-pre-wrap break-all rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-xs text-text-primary shadow-lg z-50"
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
