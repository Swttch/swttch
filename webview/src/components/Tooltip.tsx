import {ReactElement, ReactNode, useRef} from "react";
import Tippy from "@tippyjs/react/headless";
import type {Instance} from "tippy.js";

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
 *
 * ★ ALWAYS CONSIDER THE UI ZOOM when anything here is placed or sized. `<html>` carries CSS
 * `zoom` (utils/zoom.ts, `--ui-zoom`), but Tippy measures the button in SCREEN pixels and writes
 * the tooltip's position back as `transform: translate(x, y)`. Inside the zoomed document that
 * translation is scaled a second time, so at 90% the tooltip drifted up and to the left of the
 * button by a tenth of its distance from the window's corner. This has come back more than once.
 * index.css cancels it for `[data-tippy-root]` (wrapper un-zoomed, tooltip box zoomed again);
 * keep that rule working, and test any new placement logic, `offset`, `appendTo` or popper
 * modifier at a zoom other than 100%, never only at 100%, where the error is zero.
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
     * Let the person drag across the tooltip's text to select it and copy it, for
     * a name or a path that does not fit where it is shown. Implies `interactive`.
     *
     * A drag that strays off the tooltip must not close it: the pointer leaves
     * the box long before the button is released, and a tooltip that vanishes
     * under a half-made selection takes the selection with it. The close waits
     * until the button is up.
     */
    selectable?: boolean;
    /**
     * Render the tooltip into <body> instead of next to the button. For a button
     * inside a positioned, shrink-to-fit box (a floating bar), where the tooltip
     * would otherwise be laid out as part of that box and land off to one side.
     */
    inBody?: boolean;
    /**
     * Draw it the way Claude Desktop's tooltips are drawn: a smaller, flatter box in a fixed dark
     * grey, with `shortcut` after the text in a fainter tone. Rendered into <body>, so it is placed
     * from the button and kept inside the window whatever box the button sits in.
     */
    desktop?: boolean;
    /** The keys that do the same thing, shown after the text of a `desktop` tooltip (`⌘\\`). */
    shortcut?: string;
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
    const {content, children, placement = "top", selectable = false, inBody = false, desktop = false, shortcut, onShow} = props;
    const interactive = props.interactive || selectable;

    const instance = useRef<Instance | null>(null);
    const pressing = useRef(false);
    const closeWaiting = useRef(false);
    const overTooltip = useRef(false);

    if (content === undefined || content === null || content === "") return children;

    const startPress = () => {
        pressing.current = true;
        const release = () => {
            document.removeEventListener("mouseup", release, true);
            pressing.current = false;
            if (!closeWaiting.current) return;
            closeWaiting.current = false;
            if (!overTooltip.current) instance.current?.hide();
        };
        document.addEventListener("mouseup", release, true);
    };

    return (
        <Tippy
            placement={placement}
            offset={[0, 4]}
            delay={[200, interactive ? 120 : 0]}
            interactive={interactive}
            onShow={(shown) => {
                instance.current = shown;
                onShow?.();
            }}
            onHide={() => {
                if (selectable && pressing.current) {
                    closeWaiting.current = true;
                    return false;
                }
                return undefined;
            }}
            appendTo={interactive || inBody || desktop ? () => document.body : undefined}
            render={(attrs) => (
                <div
                    // Never wider than the window. Tippy flips to the opposite
                    // side when a tooltip does not fit, but a tooltip wider than
                    // the viewport does not fit on EITHER side, so it gives up
                    // and leaves it hanging off the edge. Clamping the width is
                    // what gives flipping somewhere to go. No spacing token
                    // expresses "the smaller of 32rem and the window", hence the
                    // arbitrary value.
                    className={desktop
                        // Measured on Claude Desktop's own tooltip: #303030, 13px/18px, 3px 8px, radius 6px, a 1px
                        // inner ring and a soft drop shadow, text at 93% white.
                        ? "z-50 flex items-center gap-3 whitespace-nowrap rounded-md bg-[#303030] px-2 py-[3px] text-[0.8125rem] leading-[18px] text-white/90 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),0_1px_2px_rgba(11,11,11,0.06),0_2px_8px_rgba(0,0,0,0.24)]"
                        : `max-w-[min(32rem,calc(100vw-1rem))] whitespace-pre-wrap break-all rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-xs text-text-primary shadow-lg z-50${selectable ? " select-text cursor-text" : ""}`}
                    onMouseEnter={selectable ? () => { overTooltip.current = true; } : undefined}
                    onMouseLeave={selectable ? () => { overTooltip.current = false; } : undefined}
                    onMouseDown={selectable ? startPress : undefined}
                    {...attrs}
                >
                    {content}
                    {desktop && shortcut && <span className="text-white/50">{shortcut}</span>}
                </div>
            )}
        >
            {children}
        </Tippy>
    );
}
