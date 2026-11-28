import type {ComponentType, ReactNode, SVGProps} from "react";
import Tippy from "@tippyjs/react/headless";
import {useEscapeLayer} from "@/hooks/useEscapeLayer";

/** Where a context menu was asked for: the pointer, in the window's own coordinates. */
export interface MenuPoint {
    x: number;
    y: number;
}

/** The box a menu's rows are drawn in. */
export function MenuPanel({children}: {children: ReactNode}) {
    return (
        <div
            role="menu"
            className="w-max min-w-[12rem] max-w-[18rem] overflow-hidden rounded-md border border-border-default bg-surface-raised py-1 shadow-xl"
            // The menu is drawn into <body>, but a click still bubbles to the React tree it belongs to, where the
            // ancestors act on clicks (opening a file, logging the entry). Opening a menu asked for neither.
            onClick={(event) => event.stopPropagation()}
            // Pressing a row must leave the page's selected text as it is: "Copy" is about that text.
            onMouseDown={(event) => event.preventDefault()}
            // A right click on the menu itself must not open another one on what is underneath it.
            onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            {children}
        </div>
    );
}

export function MenuRow({icon: Glyph, onSelect, disabled = false, children}: {
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    onSelect: () => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onSelect}
            disabled={disabled}
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs text-text-primary transition-colors hover:bg-surface-hover cursor-pointer disabled:cursor-default disabled:text-text-tertiary disabled:hover:bg-transparent"
        >
            <Glyph className="h-4 w-4 shrink-0 text-text-secondary"/>
            <span className="min-w-0 truncate">{children}</span>
        </button>
    );
}

/** A menu opened where the pointer was. It closes on a click outside it and on Escape. */
export function PointMenu({point, onClose, children}: {point: MenuPoint; onClose: () => void; children: ReactNode}) {
    // Escape closes the menu and goes no further: the composer reads Escape as "stop the response".
    useEscapeLayer(() => {
        onClose();
        return true;
    });
    return (
        <Tippy
            visible
            interactive
            placement="bottom-start"
            offset={[0, 2]}
            appendTo={() => document.body}
            onClickOutside={onClose}
            render={(attrs) => <div {...attrs}>{children}</div>}
        >
            {/*
              The point the menu hangs from: nothing to see, only a place for Tippy to measure. The pointer's position is
              in screen pixels, and `<html>` carries CSS `zoom` (`--ui-zoom`), which scales a `fixed` length a second
              time: at 90% the point, and the menu with it, landed a tenth of its distance from the corner up and to the
              left of the click. Dividing by the zoom puts the point back under the pointer.
            */}
            <span
                aria-hidden
                style={{
                    position: "fixed",
                    left: `calc(${point.x}px / var(--ui-zoom, 1))`,
                    top: `calc(${point.y}px / var(--ui-zoom, 1))`,
                    width: 0,
                    height: 0,
                }}
            />
        </Tippy>
    );
}
